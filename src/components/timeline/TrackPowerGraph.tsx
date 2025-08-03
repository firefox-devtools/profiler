/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { InView } from 'react-intersection-observer';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import {
  getStrokeColor,
  getFillColor,
  getDotColor,
} from 'firefox-profiler/profile-logic/graph-color';
import explicitConnect from 'firefox-profiler/utils/connect';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getCounterSelectors,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { TooltipTrackPower } from 'firefox-profiler/components/tooltip/TrackPower';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';
import { TRACK_POWER_DEFAULT_COLOR } from 'firefox-profiler/app-logic/constants';

import {
  CounterIndex,
  Counter,
  Thread,
  ThreadIndex,
  Milliseconds,
  CssPixels,
  StartEndRange,
  IndexIntoSamplesTable,
} from 'firefox-profiler/types';

import { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import { ConnectedProps } from 'firefox-profiler/utils/connect';
import { timeCode } from 'firefox-profiler/utils/time-code';

import './TrackPower.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly counter: Counter;
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable];
  readonly maxCounterSampleCountPerMs: number;
  readonly interval: Milliseconds;
  readonly width: CssPixels;
  readonly height: CssPixels;
  readonly lineWidth: CssPixels;
};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackPowerCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _canvasState: { renderScheduled: boolean; inView: boolean } = {
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

    const ctx = canvas.getContext('2d')!;
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
      // power graph.

      ctx.lineWidth = deviceLineWidth;
      ctx.lineJoin = 'bevel';
      ctx.strokeStyle = getStrokeColor(
        counter.color || TRACK_POWER_DEFAULT_COLOR
      );
      ctx.fillStyle = getFillColor(counter.color || TRACK_POWER_DEFAULT_COLOR);
      ctx.beginPath();

      const getX = (i: number) =>
        Math.round((samples.time[i] - rangeStart) * millisecondWidth);
      const getPower = (i: number) => {
        const sampleTimeDeltaInMs =
          i === 0 ? interval : samples.time[i] - samples.time[i - 1];
        return samples.count[i] / sampleTimeDeltaInMs;
      };
      const getY = (rawY: number) => {
        if (!rawY) {
          // Make the 0 values invisible so that 'almost 0' is noticeable.
          return deviceHeight + deviceLineHalfWidth;
        }

        const unitGraphCount = rawY / countRangePerMs;
        // Add on half the stroke's line width so that it won't be cut off the edge
        // of the graph.
        return Math.round(
          innerDeviceHeight -
            innerDeviceHeight * unitGraphCount +
            deviceLineHalfWidth
        );
      };

      // The x and y are used after the loop.
      const firstX = getX(sampleStart);
      let x = firstX;
      let y = getY(getPower(sampleStart));

      // For the first sample, only move the line, do not draw it. Also
      // remember this first X, as the bottom of the graph will need to connect
      // back up to it.
      ctx.moveTo(x, y);

      // Create a path for the top of the chart. This is the line that will have
      // a stroke applied to it.
      for (let i = sampleStart + 1; i < sampleEnd; i++) {
        const powerValues = [getPower(i)];
        x = getX(i);
        y = getY(powerValues[0]);
        ctx.lineTo(x, y);

        // If we have multiple samples to draw on the same horizontal pixel,
        // we process all of them together with a max-min decimation algorithm
        // to save time:
        // - We draw the first and last samples to ensure the display is
        //   correct if there are sampling gaps.
        // - For the values in between, we only draw the min and max values,
        //   to draw a vertical line covering all the other sample values.
        while (i + 1 < sampleEnd && getX(i + 1) === x) {
          powerValues.push(getPower(++i));
        }

        // Looking for the min and max only makes sense if we have more than 2
        // samples to draw.
        if (powerValues.length > 2) {
          const minY = getY(Math.min(...powerValues));
          if (minY !== y) {
            y = minY;
            ctx.lineTo(x, y);
          }
          const maxY = getY(Math.max(...powerValues));
          if (maxY !== y) {
            y = maxY;
            ctx.lineTo(x, y);
          }
        }

        const lastY = getY(powerValues[powerValues.length - 1]);
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

  _renderCanvas() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

    const canvas = this._canvas;
    if (canvas) {
      timeCode('TrackPowerCanvas render', () => {
        this.drawCanvas(canvas);
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

    this._renderCanvas();
  };

  override render() {
    this._renderCanvas();

    return (
      <InView onChange={this._observerCallback}>
        <canvas
          className="timelineTrackPowerCanvas"
          ref={this._takeCanvasRef}
        />
      </InView>
    );
  }
}

type OwnProps = {
  readonly counterIndex: CounterIndex;
  readonly lineWidth: CssPixels;
  readonly graphHeight: CssPixels;
};

type StateProps = {
  readonly threadIndex: ThreadIndex;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly counter: Counter;
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable];
  readonly maxCounterSampleCountPerMs: number;
  readonly interval: Milliseconds;
  readonly filteredThread: Thread;
  readonly unfilteredSamplesRange: StartEndRange | null;
};

type DispatchProps = {};

type Props = SizeProps & ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  hoveredCounter: null | number;
  mouseX: CssPixels;
  mouseY: CssPixels;
};

/**
 * The power track graph takes power use information from counters, and renders it as a
 * graph in the timeline.
 */
class TrackPowerGraphImpl extends React.PureComponent<Props, State> {
  override state = {
    hoveredCounter: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    this.setState({ hoveredCounter: null });
  };

  _onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
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
        const mouseAtTime = (t: number) =>
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

  _renderTooltip(counterSampleIndex: number): React.ReactNode {
    const { counter, rangeStart, rangeEnd } = this.props;
    const { mouseX, mouseY } = this.state;

    const { samples } = counter;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample found for power counter');
    }

    const sampleTime = samples.time[counterSampleIndex];
    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the tooltip if it will be rendered outside of the timeline.
      // This could happen when a sample time is outside of the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <TooltipTrackPower
          counter={counter}
          counterSampleIndex={counterSampleIndex}
        />
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderDot(counterIndex: number): React.ReactNode {
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

    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // power counter. Print an error and bail out early.
      throw new Error('No sample found for power counter');
    }
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
            counter.color || TRACK_POWER_DEFAULT_COLOR
          ),
        }}
        className="timelineTrackPowerGraphDot"
      />
    );
  }

  override render() {
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
      maxCounterSampleCountPerMs,
    } = this.props;

    return (
      <div
        className="timelineTrackPowerGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackPowerCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          counter={counter}
          counterSampleRange={counterSampleRange}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          maxCounterSampleCountPerMs={maxCounterSampleCountPerMs}
        />
        {hoveredCounter === null ? null : (
          <>
            {this._renderDot(hoveredCounter)}
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

export const TrackPowerGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
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
      rangeStart: start,
      rangeEnd: end,
      counterSampleRange,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
    };
  },
  component: withSize<Props>(TrackPowerGraphImpl),
});
