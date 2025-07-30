/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { InView } from 'react-intersection-observer';
import { Localized } from '@fluent/react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import {
  getStrokeColor,
  getFillColor,
  getDotColor,
} from 'firefox-profiler/profile-logic/graph-color';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  formatBytes,
  formatNumber,
} from 'firefox-profiler/utils/format-numbers';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getCounterSelectors,
  getPreviewSelection,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import {
  TooltipDetails,
  TooltipDetail,
  TooltipDetailSeparator,
} from 'firefox-profiler/components/tooltip/TooltipDetails';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';
import { TRACK_BANDWIDTH_DEFAULT_COLOR } from 'firefox-profiler/app-logic/constants';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';
import { co2 } from '@tgwf/co2';

import type {
  CounterIndex,
  Counter,
  Thread,
  ThreadIndex,
  AccumulatedCounterSamples,
  Milliseconds,
  PreviewSelection,
  CssPixels,
  StartEndRange,
  IndexIntoSamplesTable,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackBandwidth.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  readonly rangeStart: Milliseconds,
  readonly rangeEnd: Milliseconds,
  readonly counter: Counter,
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  readonly accumulatedSamples: AccumulatedCounterSamples,
  readonly maxCounterSampleCountPerMs: number,
  readonly interval: Milliseconds,
  readonly width: CssPixels,
  readonly height: CssPixels,
  readonly lineWidth: CssPixels,
};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackBandwidthCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;
  _canvasState: { renderScheduled: boolean, inView: boolean } = {
    renderScheduled: false,
    inView: false,
  };

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      counter,
      height,
      width,
      lineWidth,
      interval,
      maxCounterSampleCountPerMs,
      counterSampleRange,
    } = this.props;
    if (width === 0) {
      // This is attempting to draw before the canvas was laid out.
      return;
    }

    const ctx = canvas.getContext('2d');
    const devicePixelRatio = window.devicePixelRatio;
    const deviceWidth = width * devicePixelRatio;
    const deviceHeight = height * devicePixelRatio;
    const deviceLineWidth = lineWidth * devicePixelRatio;
    const deviceLineHalfWidth = deviceLineWidth * 0.5;
    const innerDeviceHeight = deviceHeight - deviceLineWidth;
    const rangeLength = rangeEnd - rangeStart;
    const millisecondWidth = deviceWidth / rangeLength;
    const intervalWidth = interval * millisecondWidth;

    // Resize and clear the canvas.
    canvas.width = Math.round(deviceWidth);
    canvas.height = Math.round(deviceHeight);
    ctx.clearRect(0, 0, deviceWidth, deviceHeight);

    const samples = counter.samples;
    if (samples.length === 0) {
      // There's no reason to draw the samples, there are none.
      return;
    }

    // Take the sample information, and convert it into chart coordinates. Use a slightly
    // smaller space than the deviceHeight, so that the stroke will be fully visible
    // both at the top and bottom of the chart.
    const [sampleStart, sampleEnd] = counterSampleRange;
    const countRangePerMs = maxCounterSampleCountPerMs;

    {
      // Draw the chart.
      //
      //                 ...--`
      //  1 ...---```..--      `--. 2
      //    |_____________________|
      //  4                        3
      //
      // Start by drawing from 1 - 2. This will be the top of all the peaks of the
      // bandwidth graph.

      ctx.lineWidth = deviceLineWidth;
      ctx.lineJoin = 'bevel';
      ctx.strokeStyle = getStrokeColor(
        counter.color || TRACK_BANDWIDTH_DEFAULT_COLOR
      );
      ctx.fillStyle = getFillColor(
        counter.color || TRACK_BANDWIDTH_DEFAULT_COLOR
      );
      ctx.beginPath();

      const getX = (i) =>
        Math.round((samples.time[i] - rangeStart) * millisecondWidth);
      const getY = (i) => {
        const rawY = samples.count[i];
        if (!rawY) {
          // Make the 0 values invisible so that 'almost 0' is noticeable.
          return deviceHeight + deviceLineHalfWidth;
        }

        const sampleTimeDeltaInMs =
          i === 0 ? interval : samples.time[i] - samples.time[i - 1];
        const unitGraphCount = rawY / sampleTimeDeltaInMs / countRangePerMs;
        return (
          innerDeviceHeight -
          innerDeviceHeight * unitGraphCount +
          // Add on half the stroke's line width so that it won't be cut off the edge
          // of the graph.
          deviceLineHalfWidth
        );
      };

      // The x and y are used after the loop.
      const firstX = getX(sampleStart);
      let x = firstX;
      let y = getY(sampleStart);

      // For the first sample, only move the line, do not draw it. Also
      // remember this first X, as the bottom of the graph will need to connect
      // back up to it.
      ctx.moveTo(x, y);

      // Create a path for the top of the chart. This is the line that will have
      // a stroke applied to it.
      for (let i = sampleStart + 1; i < sampleEnd; i++) {
        x = getX(i);
        y = getY(i);
        ctx.lineTo(x, y);

        // If we have multiple samples to draw on the same horizontal pixel,
        // we process all of them together with a max-min decimation algorithm
        // to save time:
        // - We draw the first and last samples to ensure the display is
        //   correct if there are sampling gaps.
        // - For the values in between, we only draw the min and max values,
        //   to draw a vertical line covering all the other sample values.
        const values = [y];
        while (i + 1 < sampleEnd && getX(i + 1) === x) {
          values.push(getY(++i));
        }

        // Looking for the min and max only makes sense if we have more than 2
        // samples to draw.
        if (values.length > 2) {
          const maxY = Math.max(...values);
          if (maxY !== y) {
            y = maxY;
            ctx.lineTo(x, y);
          }
          const minY = Math.min(...values);
          if (minY !== y) {
            y = minY;
            ctx.lineTo(x, y);
          }
        }

        const lastY = values[values.length - 1];
        if (lastY !== y) {
          y = lastY;
          ctx.lineTo(x, y);
        }
      }

      // The samples range ends at the time of the last sample, plus the interval.
      // Draw this last bit.
      ctx.lineTo(x + intervalWidth, y);

      // Don't do the fill yet, just stroke the top line. This will draw a line from
      // point 1 to 2 in the diagram above.
      ctx.stroke();

      // After doing the stroke, continue the path to complete the fill to the bottom
      // of the canvas. This continues the path to point 3 and then 4.

      // Create a line from 2 to 3.
      ctx.lineTo(x + intervalWidth, deviceHeight);

      // Create a line from 3 to 4.
      ctx.lineTo(firstX, deviceHeight);

      // The line from 4 to 1 will be implicitly filled in.
      ctx.fill();
    }
  }

  _scheduleDraw() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas;
        if (canvas) {
          this.drawCanvas(canvas);
        }
      });
    }
  }

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  _observerCallback = (inView: boolean, _entry: IntersectionObserverEntry) => {
    this._canvasState.inView = inView;
    if (!this._canvasState.renderScheduled) {
      // Skip if render is not scheduled.
      return;
    }

    this._scheduleDraw();
  };

  componentDidMount() {
    this._scheduleDraw();
  }

  componentDidUpdate() {
    this._scheduleDraw();
  }

  render() {
    return (
      <InView onChange={this._observerCallback}>
        <canvas
          className="timelineTrackBandwidthCanvas"
          ref={this._takeCanvasRef}
        />
      </InView>
    );
  }
}

type OwnProps = {
  readonly counterIndex: CounterIndex,
  readonly lineWidth: CssPixels,
  readonly graphHeight: CssPixels,
};

type StateProps = {
  readonly threadIndex: ThreadIndex,
  readonly rangeStart: Milliseconds,
  readonly rangeEnd: Milliseconds,
  readonly counter: Counter,
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  readonly accumulatedSamples: AccumulatedCounterSamples,
  readonly maxCounterSampleCountPerMs: number,
  readonly interval: Milliseconds,
  readonly filteredThread: Thread,
  readonly unfilteredSamplesRange: StartEndRange | null,
  readonly previewSelection: PreviewSelection,
};

type DispatchProps = {};

type Props = {
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
};

type State = {
  hoveredCounter: null | number,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

/**
 * The bandwidth track graph takes bandwidth information from counters, and renders it as a
 * graph in the timeline.
 */
class TrackBandwidthGraphImpl extends React.PureComponent<Props, State> {
  state = {
    hoveredCounter: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    // This persistTooltips property is part of the web console API. It helps
    // in being able to inspect and debug tooltips.
    if (window.persistTooltips) {
      return;
    }

    this.setState({ hoveredCounter: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    // Get the offset from here, and apply it to the time lookup.
    const { left } = event.currentTarget.getBoundingClientRect();
    const {
      width,
      rangeStart,
      rangeEnd,
      counter,
      interval,
      counterSampleRange,
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;

    if (counter.samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample group found for bandwidth counter');
    }
    const { samples } = counter;

    if (
      timeAtMouse < samples.time[0] ||
      timeAtMouse > samples.time[samples.length - 1] + interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredCounter: null });
    } else {
      // When the mouse pointer hovers between two points, select the point that's closer.
      let hoveredCounter;
      const [sampleStart, sampleEnd] = counterSampleRange;
      const bisectionCounter = bisectionRight(
        samples.time,
        timeAtMouse,
        sampleStart,
        sampleEnd
      );
      if (bisectionCounter > 0 && bisectionCounter < samples.time.length) {
        const leftDistance = timeAtMouse - samples.time[bisectionCounter - 1];
        const rightDistance = samples.time[bisectionCounter] - timeAtMouse;
        if (leftDistance < rightDistance) {
          // Left point is closer
          hoveredCounter = bisectionCounter - 1;
        } else {
          // Right point is closer
          hoveredCounter = bisectionCounter;
        }

        // If there are samples before or after hoveredCounter that fall
        // horizontally on the same pixel, move hoveredCounter to the sample
        // with the highest power value.
        const mouseAtTime = (t) =>
          Math.round(((t - rangeStart) / rangeLength) * width + left);
        for (
          let currentIndex = hoveredCounter - 1;
          mouseAtTime(samples.time[currentIndex]) === mouseX &&
          currentIndex > 0;
          --currentIndex
        ) {
          if (samples.count[currentIndex] > samples.count[hoveredCounter]) {
            hoveredCounter = currentIndex;
          }
        }
        for (
          let currentIndex = hoveredCounter + 1;
          mouseAtTime(samples.time[currentIndex]) === mouseX &&
          currentIndex < samples.time.length;
          ++currentIndex
        ) {
          if (samples.count[currentIndex] > samples.count[hoveredCounter]) {
            hoveredCounter = currentIndex;
          }
        }
      } else {
        hoveredCounter = bisectionCounter;
      }

      if (hoveredCounter === samples.length) {
        // When hovering the last sample, it's possible the mouse is past the time.
        // In this case, hover over the last sample. This happens because of the
        // ` + interval` line in the `if` condition above.
        hoveredCounter = samples.time.length - 1;
      }

      this.setState({
        mouseX,
        mouseY,
        hoveredCounter,
      });
    }
  };

  _co2 = null;
  _formatDataTransferValue(bytes: number, l10nId: string) {
    if (!this._co2) {
      this._co2 = new co2();
    }
    // By default when estimating emissions per byte, co2.js takes into account
    // emissions for the user device, the data center and the network.
    // Because we already have power tracks showing the power use and estimated
    // emissions of the device, set the 'device' grid intensity to 0 to avoid
    // double counting.
    const co2eq = this._co2.perByteTrace(bytes, false, {
      gridIntensity: { device: 0 },
    });
    const carbonValue = formatNumber(co2eq.co2);
    const value = formatBytes(bytes);
    return (
      <Localized
        id={l10nId}
        vars={{ value, carbonValue }}
        attrs={{ label: true }}
      >
        <TooltipDetail label="">{value}</TooltipDetail>
      </Localized>
    );
  }

  _renderTooltip(counterIndex: number): React.Node {
    const {
      accumulatedSamples,
      counter,
      rangeStart,
      rangeEnd,
      interval,
      previewSelection,
    } = this.props;
    const { mouseX, mouseY } = this.state;
    const { samples } = counter;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for bandwidth counter');
    }

    const sampleTime = samples.time[counterIndex];
    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the tooltip if it will be rendered outside of the timeline.
      // This could happen when a sample time is outside of the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
    const bytes = accumulatedCounts[counterIndex] - minCount;
    const operations =
      samples.number !== undefined ? samples.number[counterIndex] : null;

    const sampleTimeDeltaInMs =
      counterIndex === 0
        ? interval
        : samples.time[counterIndex] - samples.time[counterIndex - 1];
    const unitGraphCount = samples.count[counterIndex] / sampleTimeDeltaInMs;

    let rangeTotal = 0;
    if (previewSelection.hasSelection) {
      const [beginIndex, endIndex] = getSampleIndexRangeForSelection(
        samples,
        previewSelection.selectionStart,
        previewSelection.selectionEnd
      );

      for (
        let counterSampleIndex = beginIndex;
        counterSampleIndex < endIndex;
        counterSampleIndex++
      ) {
        rangeTotal += samples.count[counterSampleIndex];
      }
    }

    let ops;
    if (operations !== null) {
      ops = formatNumber(operations, 2, 0);
    }

    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <div className="timelineTrackBandwidthTooltip">
          <TooltipDetails>
            {this._formatDataTransferValue(
              unitGraphCount * 1000 /* ms -> s */,
              'TrackBandwidthGraph--speed'
            )}
            {operations !== null ? (
              <Localized
                id="TrackBandwidthGraph--read-write-operations-since-the-previous-sample"
                vars={{ value: ops }}
                attrs={{ label: true }}
              >
                <TooltipDetail label="">{ops}</TooltipDetail>
              </Localized>
            ) : null}
            <TooltipDetailSeparator />
            {this._formatDataTransferValue(
              bytes,
              'TrackBandwidthGraph--cumulative-bandwidth-at-this-time'
            )}
            {this._formatDataTransferValue(
              countRange,
              'TrackBandwidthGraph--total-bandwidth-in-graph'
            )}
            {previewSelection.hasSelection
              ? this._formatDataTransferValue(
                  rangeTotal,
                  'TrackBandwidthGraph--total-bandwidth-in-range'
                )
              : null}
          </TooltipDetails>
        </div>
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderBandwidthDot(counterIndex: number): React.Node {
    const {
      counter,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      maxCounterSampleCountPerMs,
      interval,
    } = this.props;

    const { samples } = counter;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample found for bandwidth counter');
    }
    const rangeLength = rangeEnd - rangeStart;
    const sampleTime = samples.time[counterIndex];

    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the dot if it will be rendered outside of the timeline.
      // This could happen when a sample time is outside of the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    const left = (width * (sampleTime - rangeStart)) / rangeLength;
    const countRangePerMs = maxCounterSampleCountPerMs;
    const sampleTimeDeltaInMs =
      counterIndex === 0
        ? interval
        : samples.time[counterIndex] - samples.time[counterIndex - 1];
    const unitSampleCount =
      samples.count[counterIndex] / sampleTimeDeltaInMs / countRangePerMs;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    const top =
      innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;

    return (
      <div
        style={{
          left,
          top,
          backgroundColor: getDotColor(
            counter.color || TRACK_BANDWIDTH_DEFAULT_COLOR
          ),
        }}
        className="timelineTrackBandwidthGraphDot"
      />
    );
  }

  render() {
    const { hoveredCounter } = this.state;
    const {
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      unfilteredSamplesRange,
      counter,
      counterSampleRange,
      graphHeight,
      width,
      lineWidth,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
    } = this.props;

    return (
      <div
        className="timelineTrackBandwidthGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackBandwidthCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          counter={counter}
          counterSampleRange={counterSampleRange}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          accumulatedSamples={accumulatedSamples}
          maxCounterSampleCountPerMs={maxCounterSampleCountPerMs}
        />
        {hoveredCounter === null ? null : (
          <>
            {this._renderBandwidthDot(hoveredCounter)}
            {this._renderTooltip(hoveredCounter)}
          </>
        )}
        <EmptyThreadIndicator
          thread={filteredThread}
          interval={interval}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          unfilteredSamplesRange={unfilteredSamplesRange}
        />
      </div>
    );
  }
}

export const TrackBandwidthGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, ownProps) => {
    const { counterIndex } = ownProps;
    const counterSelectors = getCounterSelectors(counterIndex);
    const counter = counterSelectors.getCounter(state);
    const { start, end } = getCommittedRange(state);
    const counterSampleRange =
      counterSelectors.getCommittedRangeCounterSampleRange(state);
    const selectors = getThreadSelectors(counter.mainThreadIndex);
    return {
      counter,
      threadIndex: counter.mainThreadIndex,
      maxCounterSampleCountPerMs:
        counterSelectors.getMaxRangeCounterSampleCountPerMs(state),
      accumulatedSamples: counterSelectors.getAccumulateCounterSamples(state),
      rangeStart: start,
      rangeEnd: end,
      counterSampleRange,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  component: withSize<Props>(TrackBandwidthGraphImpl),
});
