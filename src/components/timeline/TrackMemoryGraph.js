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
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';
import { TRACK_MEMORY_DEFAULT_COLOR } from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  Counter,
  Thread,
  ThreadIndex,
  AccumulatedCounterSamples,
  Milliseconds,
  CssPixels,
  StartEndRange,
  IndexIntoSamplesTable,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackMemory.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +counter: Counter,
  +counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  +accumulatedSamples: AccumulatedCounterSamples,
  +interval: Milliseconds,
  +width: CssPixels,
  +height: CssPixels,
  +lineWidth: CssPixels,
};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackMemoryCanvas extends React.PureComponent<CanvasProps> {
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
      accumulatedSamples,
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
    const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
    const [sampleStart, sampleEnd] = counterSampleRange;

    {
      // Draw the chart.
      //
      //                 ...--`
      //  1 ...---```..--      `--. 2
      //    |_____________________|
      //  4                        3
      //
      // Start by drawing from 1 - 2. This will be the top of all the peaks of the
      // memory graph.

      ctx.lineWidth = deviceLineWidth;
      ctx.lineJoin = 'bevel';
      ctx.strokeStyle = getStrokeColor(
        counter.color || TRACK_MEMORY_DEFAULT_COLOR
      );
      ctx.fillStyle = getFillColor(counter.color || TRACK_MEMORY_DEFAULT_COLOR);
      ctx.beginPath();

      // The x and y are used after the loop.
      let x = 0;
      let y = 0;
      let firstX = 0;
      for (let i = sampleStart; i < sampleEnd; i++) {
        // Create a path for the top of the chart. This is the line that will have
        // a stroke applied to it.
        x = (samples.time[i] - rangeStart) * millisecondWidth;
        // Add on half the stroke's line width so that it won't be cut off the edge
        // of the graph.
        const unitGraphCount = (accumulatedCounts[i] - minCount) / countRange;
        y =
          innerDeviceHeight -
          innerDeviceHeight * unitGraphCount +
          deviceLineHalfWidth;
        if (i === 0) {
          // This is the first iteration, only move the line, do not draw it. Also
          // remember this first X, as the bottom of the graph will need to connect
          // back up to it.
          firstX = x;
          ctx.moveTo(x, y);
        } else {
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
          className="timelineTrackMemoryCanvas"
          ref={this._takeCanvasRef}
        />
      </InView>
    );
  }
}

type OwnProps = {
  +counterIndex: CounterIndex,
  +lineWidth: CssPixels,
  +graphHeight: CssPixels,
};

type StateProps = {
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +counter: Counter,
  +counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  +accumulatedSamples: AccumulatedCounterSamples,
  +interval: Milliseconds,
  +filteredThread: Thread,
  +unfilteredSamplesRange: StartEndRange | null,
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
 * The memory track graph takes memory information from counters, and renders it as a
 * graph in the timeline.
 */
class TrackMemoryGraphImpl extends React.PureComponent<Props, State> {
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
      throw new Error('No sample group found for memory counter');
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

  _renderTooltip(counterIndex: number): React.Node {
    const { accumulatedSamples, counter, rangeStart, rangeEnd } = this.props;
    const { mouseX, mouseY } = this.state;
    const { samples } = counter;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for memory counter');
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
    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <div className="timelineTrackMemoryTooltip">
          <div className="timelineTrackMemoryTooltipLine">
            <span className="timelineTrackMemoryTooltipNumber">
              {formatBytes(bytes)}
            </span>
            <Localized id="TrackMemoryGraph--relative-memory-at-this-time">
              relative memory at this time
            </Localized>
          </div>

          <div className="timelineTrackMemoryTooltipLine">
            <span className="timelineTrackMemoryTooltipNumber">
              {formatBytes(countRange)}
            </span>
            <Localized id="TrackMemoryGraph--memory-range-in-graph">
              memory range in graph
            </Localized>
          </div>
          {operations !== null ? (
            <div className="timelineTrackMemoryTooltipLine">
              <span className="timelineTrackMemoryTooltipNumber">
                {formatNumber(operations, 2, 0)}
              </span>
              <Localized id="TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample">
                allocations and deallocations since the previous sample
              </Localized>
            </div>
          ) : null}
        </div>
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderMemoryDot(counterIndex: number): React.Node {
    const {
      counter,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      accumulatedSamples,
    } = this.props;

    const { samples } = counter;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample found for memory counter');
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

    const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
    const unitSampleCount =
      (accumulatedCounts[counterIndex] - minCount) / countRange;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    const top =
      innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;

    return (
      <div
        style={{
          left,
          top,
          backgroundColor: getDotColor(
            counter.color || TRACK_MEMORY_DEFAULT_COLOR
          ),
        }}
        className="timelineTrackMemoryGraphDot"
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
    } = this.props;

    return (
      <div
        className="timelineTrackMemoryGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackMemoryCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          counter={counter}
          counterSampleRange={counterSampleRange}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          accumulatedSamples={accumulatedSamples}
        />
        {hoveredCounter === null ? null : (
          <>
            {this._renderMemoryDot(hoveredCounter)}
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

export const TrackMemoryGraph = explicitConnect<
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
      accumulatedSamples: counterSelectors.getAccumulateCounterSamples(state),
      rangeStart: start,
      rangeEnd: end,
      counterSampleRange,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
    };
  },
  component: withSize<Props>(TrackMemoryGraphImpl),
});
