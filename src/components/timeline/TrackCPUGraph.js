/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import { getCommittedRange, getProfileInterval } from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';
import { getCPUSamples } from '../../profile-logic/profile-data';
import { Tooltip } from '../tooltip/Tooltip';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import { bisectionRight } from 'firefox-profiler/utils/bisect';

import type {
  Thread,
  ThreadIndex,
  Milliseconds,
  CssPixels,
  StartEndRange,
  SamplesTable,
  CPUSamples,
} from 'firefox-profiler/types';

import type { SizeProps } from '../shared/WithSize';
import type { ConnectedProps } from '../../utils/connect';

import './TrackCPU.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {|
  +samples: SamplesTable,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +interval: Milliseconds,
  +width: CssPixels,
  +height: CssPixels,
  +lineWidth: CssPixels,
  +cpuSamples: CPUSamples,
|};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackCPUCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      samples,
      height,
      width,
      lineWidth,
      interval,
      cpuSamples,
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
    ctx.lineJoin = 'round';

    if (samples.length === 0) {
      // There's no reason to draw the samples, there are none.
      return;
    }

    const { threadCPUCycles, threadKernelTime, threadUserTime } = cpuSamples;

    // Take the sample information, and convert it into chart coordinates. Use a slightly
    // smaller space than the deviceHeight, so that the stroke will be fully visible
    // both at the top and bottom of the chart.
    if (
      threadCPUCycles.samples.length === 0 ||
      threadKernelTime.samples.length === 0 ||
      threadUserTime.samples.length === 0
    ) {
      throw new Error('No sample found for CPU usage');
    }

    for (const cpuProp in cpuSamples) {
      const cpuSampleItem = cpuSamples[cpuProp];
      if (typeof cpuSampleItem !== 'object') {
        // todo: explain
        continue;
      }

      const {
        samples: samplesItem,
        strokeStyle,
        fillStyle,
        stack,
        min,
        range,
      } = cpuSampleItem;

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
      ctx.strokeStyle = strokeStyle;
      ctx.fillStyle = fillStyle;

      ctx.beginPath();

      // The x and y are used after the loop.
      let x = 0;
      let y = 0;
      let firstX = 0;
      for (let i = 0; i < samples.length; i++) {
        // Create a path for the top of the chart. This is the line that will have
        // a stroke applied to it.
        x = (samples.time[i] - rangeStart) * millisecondWidth;
        // Add on half the stroke's line width so that it won't be cut off the edge
        // of the graph.
        const samplesItemCount =
          stack !== undefined
            ? samplesItem[i] + cpuSamples[stack].samples[i]
            : samplesItem[i];
        const unitGraphCount = (samplesItemCount - min) / range;
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
  +threadIndex: ThreadIndex,
  +lineWidth: CssPixels,
  +graphHeight: CssPixels,
|};

type StateProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +interval: Milliseconds,
  +filteredThread: Thread,
  +unfilteredSamplesRange: StartEndRange | null,
  +cpuSamples: CPUSamples,
|};

type DispatchProps = {||};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
|};

type State = {|
  hoveredSample: null | number,
  mouseX: CssPixels,
  mouseY: CssPixels,
|};

/**
 * The memory track graph takes memory information from counters, and renders it as a
 * graph in the timeline.
 */
class TrackCPUGraphImpl extends React.PureComponent<Props, State> {
  state = {
    hoveredSample: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    this.setState({ hoveredSample: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    // Get the offset from here, and apply it to the time lookup.
    const { left } = event.currentTarget.getBoundingClientRect();
    const {
      width,
      rangeStart,
      rangeEnd,
      filteredThread,
      interval,
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;
    const { samples } = filteredThread;
    if (samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample group found for CPU counter');
    }
    if (
      timeAtMouse < samples.time[0] ||
      timeAtMouse > samples.time[samples.length - 1] + interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredSample: null });
    } else {
      // When the mouse pointer hovers between two points, select the point that's closer.
      let hoveredSample;
      const bisectionCounter = bisectionRight(samples.time, timeAtMouse);
      if (bisectionCounter > 0 && bisectionCounter < samples.time.length) {
        const leftDistance = timeAtMouse - samples.time[bisectionCounter - 1];
        const rightDistance = samples.time[bisectionCounter] - timeAtMouse;
        if (leftDistance < rightDistance) {
          // Left point is closer
          hoveredSample = bisectionCounter - 1;
        } else {
          // Right point is closer
          hoveredSample = bisectionCounter;
        }
      } else {
        hoveredSample = bisectionCounter;
      }
      if (hoveredSample === samples.length) {
        // When hovering the last sample, it's possible the mouse is past the time.
        // In this case, hover over the last sample. This happens because of the
        // ` + interval` line in the `if` condition above.
        hoveredSample = samples.time.length - 1;
      }
      this.setState({
        mouseX,
        mouseY,
        hoveredSample,
      });
    }
  };

  _renderTooltip(sampleIndex: number): React.Node {
    if (this.props.filteredThread.samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No accumulated sample found for memory counter');
    }
    const { cpuSamples } = this.props;
    const tooltip = [];

    for (const cpuProp in cpuSamples) {
      const cpuSampleItem = cpuSamples[cpuProp];
      if (typeof cpuSampleItem !== 'object') {
        // todo: explain
        continue;
      }
      const { samples: samplesItem, strokeStyle } = cpuSampleItem;

      const sample = samplesItem[sampleIndex];
      tooltip.push(
        <div
          className="timelineTrackMemoryTooltip"
          style={{ color: strokeStyle }}
        >
          <div className="timelineTrackMemoryTooltipLine">
            <span className="timelineTrackMemoryTooltipNumber">{sample}</span>
            {' ' + cpuProp}
          </div>
          {/* <div className="timelineTrackMemoryTooltipLine">
            <span className="timelineTrackMemoryTooltipNumber">
              {formatBytes(countRange)}
            </span>
            {' memory range in graph'}
          </div> */}
        </div>
      );
    }
    return tooltip;
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderCPUDots(counterIndex: number): React.Node {
    const {
      filteredThread,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      cpuSamples,
    } = this.props;
    if (filteredThread.samples.length === 0) {
      // Gecko failed to capture samples for some reason and it shouldn't happen for
      // malloc counter. Print an error and bail out early.
      throw new Error('No sample group found for memory counter');
    }
    const dots = [];

    for (const cpuProp in cpuSamples) {
      const cpuSampleItem = cpuSamples[cpuProp];
      if (typeof cpuSampleItem !== 'object') {
        // todo: explain
        continue;
      }

      const {
        samples: samplesItem,
        strokeStyle,
        stack,
        min,
        range,
      } = cpuSampleItem;
      const { samples } = filteredThread;
      const rangeLength = rangeEnd - rangeStart;
      const left =
        (width * (samples.time[counterIndex] - rangeStart)) / rangeLength;

      const samplesItemCount =
        stack !== undefined
          ? samplesItem[counterIndex] + cpuSamples[stack].samples[counterIndex]
          : samplesItem[counterIndex];
      const unitSampleCount = (samplesItemCount - min) / range;
      const innerTrackHeight = graphHeight - lineWidth / 2;
      const top =
        innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;

      console.log(
        'canova',
        cpuProp,
        stack,
        top,
        samplesItemCount,
        samplesItem[counterIndex],
        unitSampleCount,
        innerTrackHeight
      );

      dots.push(
        <div
          style={{ left, top, backgroundColor: strokeStyle }}
          className="timelineTrackMemoryGraphDot"
        />
      );
    }

    return dots;
  }

  render() {
    const { hoveredSample, mouseX, mouseY } = this.state;
    const {
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      unfilteredSamplesRange,
      graphHeight,
      width,
      lineWidth,
      cpuSamples,
    } = this.props;

    return (
      <div
        className="timelineTrackMemoryGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackCPUCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          samples={filteredThread.samples}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          cpuSamples={cpuSamples}
        />
        {hoveredSample === null ? null : (
          <>
            {this._renderCPUDots(hoveredSample)}
            <Tooltip mouseX={mouseX} mouseY={mouseY}>
              {this._renderTooltip(hoveredSample)}
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

export const TrackCPUGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const { start, end } = getCommittedRange(state);
    const selectors = getThreadSelectors(threadIndex);
    const filteredThread = selectors.getTabFilteredThread(state);
    console.log('thread index: ', threadIndex);
    return {
      rangeStart: start,
      rangeEnd: end,
      interval: getProfileInterval(state),
      filteredThread: filteredThread,
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      cpuSamples: getCPUSamples(filteredThread.samples),
    };
  },
  component: withSize<Props>(TrackCPUGraphImpl),
});
