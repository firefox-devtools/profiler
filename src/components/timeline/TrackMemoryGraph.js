/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import { formatBytes } from '../../utils/format-numbers';
import {
  getCommittedRange,
  getCounterSelectors,
  getProfileInterval,
} from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';
import { ORANGE_50 } from 'photon-colors';
import Tooltip from '../tooltip/Tooltip';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import bisection from 'bisection';

import type {
  CounterIndex,
  Counter,
  Thread,
  ThreadIndex,
  AccumulatedCounterSamples,
  Milliseconds,
  CssPixels,
  StartEndRange,
} from 'firefox-profiler/types';

import type { SizeProps } from '../shared/WithSize';
import type { ConnectedProps } from '../../utils/connect';

import './TrackMemory.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +counter: Counter,
  +accumulatedSamples: AccumulatedCounterSamples[],
  +interval: Milliseconds,
  +width: CssPixels,
  +height: CssPixels,
  +lineWidth: CssPixels,
|};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackMemoryCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;

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

    // Resize and clear the canvas.
    canvas.width = Math.round(deviceWidth);
    canvas.height = Math.round(deviceHeight);
    ctx.clearRect(0, 0, deviceWidth, deviceHeight);

    const sampleGroups = counter.sampleGroups;
    if (sampleGroups.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and do not draw anything.
      throw new Error('No sample group found for memory counter');
    }

    const samples = counter.sampleGroups[0].samples;
    if (samples.length === 0) {
      // There's no reason to draw the samples, there are none.
      return;
    }

    // Take the sample information, and convert it into chart coordinates. Use a slightly
    // smaller space than the deviceHeight, so that the stroke will be fully visible
    // both at the top and bottom of the chart.
    if (accumulatedSamples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for memory counter');
    }
    const { minCount, countRange, accumulatedCounts } = accumulatedSamples[0];

    {
      // Draw the chart.
      const rangeLength = rangeEnd - rangeStart;
      ctx.lineWidth = deviceLineWidth;
      ctx.strokeStyle = ORANGE_50;
      ctx.fillStyle = '#ff940088'; // Orange 50 with transparency.
      ctx.beginPath();

      // The x and y are used after the loop.
      let x = 0;
      let y = 0;
      for (let i = 0; i < samples.length; i++) {
        // Create a path for the top of the chart. This is the line that will have
        // a stroke applied to it.
        x = (deviceWidth * (samples.time[i] - rangeStart)) / rangeLength;
        // Add on half the stroke's line width so that it won't be cut off the edge
        // of the graph.
        const unitGraphCount = (accumulatedCounts[i] - minCount) / countRange;
        y =
          innerDeviceHeight -
          innerDeviceHeight * unitGraphCount +
          deviceLineHalfWidth;
        if (i === 0) {
          // This is the first iteration, only move the line.
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      // The samples range ends at the time of the last sample, plus the interval.
      // Draw this last bit.
      ctx.lineTo(x + interval, y);

      // Don't do the fill yet, just stroke the top line.
      ctx.stroke();

      // After doing the stroke, continue the path to complete the fill to the bottom
      // of the canvas.
      ctx.lineTo(x + interval, deviceHeight);
      ctx.lineTo(
        (deviceWidth * (samples.time[0] - rangeStart)) / rangeLength + interval,
        deviceHeight
      );
      ctx.fill();
    }
  }

  _scheduleDraw() {
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

  render() {
    this._scheduleDraw();

    return (
      <canvas className="timelineTrackMemoryCanvas" ref={this._takeCanvasRef} />
    );
  }
}

type OwnProps = {|
  +counterIndex: CounterIndex,
  +lineWidth: CssPixels,
  +graphHeight: CssPixels,
|};

type StateProps = {|
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +counter: Counter,
  +accumulatedSamples: AccumulatedCounterSamples[],
  +interval: Milliseconds,
  +filteredThread: Thread,
  +unfilteredSamplesRange: StartEndRange | null,
|};

type DispatchProps = {||};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
|};

type State = {|
  hoveredCounter: null | number,
  mouseX: CssPixels,
  mouseY: CssPixels,
|};

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
    this.setState({ hoveredCounter: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    // Get the offset from here, and apply it to the time lookup.
    const { left } = event.currentTarget.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, counter, interval } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;

    if (counter.sampleGroups.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample group found for memory counter');
    }
    const { samples } = counter.sampleGroups[0];

    if (
      timeAtMouse < samples.time[0] ||
      timeAtMouse > samples.time[samples.length - 1] + interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredCounter: null });
    } else {
      let hoveredCounter = bisection.right(samples.time, timeAtMouse);
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
    if (this.props.accumulatedSamples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for memory counter');
    }
    const {
      minCount,
      countRange,
      accumulatedCounts,
    } = this.props.accumulatedSamples[0];
    const bytes = accumulatedCounts[counterIndex] - minCount;
    return (
      <div className="timelineTrackMemoryTooltip">
        <div className="timelineTrackMemoryTooltipLine">
          <span className="timelineTrackMemoryTooltipNumber">
            {formatBytes(bytes)}
          </span>
          {' relative memory at this time'}
        </div>
        <div className="timelineTrackMemoryTooltipLine">
          <span className="timelineTrackMemoryTooltipNumber">
            {formatBytes(countRange)}
          </span>
          {' memory range in graph'}
        </div>
      </div>
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

    if (counter.sampleGroups.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample group found for memory counter');
    }
    const { samples } = counter.sampleGroups[0];
    const rangeLength = rangeEnd - rangeStart;
    const left =
      (width * (samples.time[counterIndex] - rangeStart)) / rangeLength;

    if (accumulatedSamples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for memory counter');
    }
    const { minCount, countRange, accumulatedCounts } = accumulatedSamples[0];
    const unitSampleCount =
      (accumulatedCounts[counterIndex] - minCount) / countRange;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    const top =
      innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;

    return (
      <div style={{ left, top }} className="timelineTrackMemoryGraphDot" />
    );
  }

  render() {
    const { hoveredCounter, mouseX, mouseY } = this.state;
    const {
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      unfilteredSamplesRange,
      counter,
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
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          accumulatedSamples={accumulatedSamples}
        />
        {hoveredCounter === null ? null : (
          <>
            {this._renderMemoryDot(hoveredCounter)}
            <Tooltip mouseX={mouseX} mouseY={mouseY}>
              {this._renderTooltip(hoveredCounter)}
            </Tooltip>
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
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { counterIndex } = ownProps;
    const counterSelectors = getCounterSelectors(counterIndex);
    const counter = counterSelectors.getCommittedRangeFilteredCounter(state);
    const { start, end } = getCommittedRange(state);
    const selectors = getThreadSelectors(counter.mainThreadIndex);
    return {
      counter,
      threadIndex: counter.mainThreadIndex,
      accumulatedSamples: counterSelectors.getAccumulateCounterSamples(state),
      rangeStart: start,
      rangeEnd: end,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
    };
  },
  component: withSize<Props>(TrackMemoryGraphImpl),
});
