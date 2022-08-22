/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// todo: allow to increase the size of the tracks

import * as React from 'react';
import { InView } from 'react-intersection-observer';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import {
  getMarkerTrackLineFillColor,
  getMarkerTrackLineStrokeColor,
  getMarkerTrackLineWidth,
  getMarkerTrackConfigLineType,
  getMarkerTrackConfig,
  isMarkerTrackLinePreScaled,
} from 'firefox-profiler/profile-logic/tracks';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';

import type {
  Thread,
  ThreadIndex,
  Milliseconds,
  CssPixels,
  StartEndRange,
  IndexIntoSamplesTable,
  MarkerSchema,
  CollectedCustomMarkerSamples,
  MarkerTrackConfigLineType,
  MarkerIndex,
  Marker,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackCustomMarker.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerSchema: MarkerSchema,
  +markerSampleRanges: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  +collectedSamples: CollectedCustomMarkerSamples,
  +interval: Milliseconds,
  +width: CssPixels,
  +height: CssPixels,
|};

function _calculateUnitValue(
  type: MarkerTrackConfigLineType,
  minNumber: number,
  maxNumber: number,
  value: number,
  isPreScaled
) {
  let scaled = value;
  if (isPreScaled) {
    if (scaled < 0 || scaled > 1) {
      throw new Error(`${scaled} is not pre-scaled`);
    }
  } else {
    switch (type) {
      case 'line':
        scaled = (value - minNumber) / (maxNumber - minNumber);
        break;
      case 'bar':
        scaled = value / maxNumber;
        break;
      default:
        throw new Error('Unknown type ' + type);
    }
  }
  return scaled * 0.9;
}

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackCustomMarkerCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;
  _canvasState: {| renderScheduled: boolean, inView: boolean |} = {
    renderScheduled: false,
    inView: false,
  };

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      markerSchema,
      markerSampleRanges,
      collectedSamples,
      height,
      width,
      interval,
    } = this.props;
    if (width === 0) {
      // This is attempting to draw before the canvas was laid out.
      return;
    }

    const { name, trackConfig } = markerSchema;

    const ctx = canvas.getContext('2d');
    const devicePixelRatio = window.devicePixelRatio;
    const deviceWidth = width * devicePixelRatio;
    const deviceHeight = height * devicePixelRatio;
    const rangeLength = rangeEnd - rangeStart;
    const millisecondWidth = deviceWidth / rangeLength;
    const intervalWidth = interval * millisecondWidth;

    // Resize and clear the canvas.
    canvas.width = Math.round(deviceWidth);
    canvas.height = Math.round(deviceHeight);
    ctx.clearRect(0, 0, deviceWidth, deviceHeight);

    if (collectedSamples.numbersPerLine.length === 0) {
      // This is clearly an error made by the schema creator
      throw new Error('No lines for marker ' + name);
    }

    if (trackConfig === undefined) {
      throw new Error('No track config for marker');
    }

    const { minNumber, maxNumber } = collectedSamples;
    const [sampleStart, sampleEnd] = markerSampleRanges;

    {
      for (
        let lineIndex = 0;
        lineIndex < trackConfig.lines.length;
        lineIndex++
      ) {
        const type = getMarkerTrackConfigLineType(markerSchema, lineIndex);
        const samples = collectedSamples.numbersPerLine[lineIndex];
        const isPreScaled = isMarkerTrackLinePreScaled(markerSchema, lineIndex);
        // Draw the chart.
        //
        // Here the schematics for the line chart
        //
        //                 ...--`
        //  1 ...---```..--      `--. 2
        //    |_____________________|
        //  4                        3
        //
        // Start by drawing from 1 - 2. This will be the top of all the peaks of the
        // graph.
        const deviceLineWidth =
          getMarkerTrackLineWidth(markerSchema, lineIndex) * devicePixelRatio;
        const deviceLineHalfWidth = deviceLineWidth * 0.5;
        const innerDeviceHeight = deviceHeight;
        ctx.lineWidth = deviceLineWidth;
        ctx.strokeStyle = getMarkerTrackLineStrokeColor(
          markerSchema,
          lineIndex
        );
        ctx.fillStyle = getMarkerTrackLineFillColor(markerSchema, lineIndex);

        let x = 0;
        let y = 0;
        let firstX = 0;

        switch (type) {
          case 'line':
            ctx.beginPath();

            for (let i = sampleStart; i < sampleEnd; i++) {
              // Create a path for the top of the chart. This is the line that will have
              // a stroke applied to it.
              x = (collectedSamples.time[i] - rangeStart) * millisecondWidth;
              // Add on half the stroke's line width so that it won't be cut off the edge
              // of the graph.
              const unitValue = _calculateUnitValue(
                type,
                minNumber,
                maxNumber,
                samples[i],
                isPreScaled
              );
              y =
                innerDeviceHeight -
                innerDeviceHeight * unitValue +
                deviceLineHalfWidth;
              if (i === sampleStart) {
                // This is the first iteration, only move the line, do not draw it. Also
                // remember this first X, as the bottom of the graph will need to connect
                // back up to it.
                firstX = x;
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

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
            break;
          case 'bar':
            for (let i = sampleStart; i < sampleEnd; i++) {
              // Create a path for the top of the chart. This is the line that will have
              // a stroke applied to it.
              const x =
                (collectedSamples.time[i] - rangeStart) * millisecondWidth;
              // Add on half the stroke's line width so that it won't be cut off the edge
              // of the graph.
              const unitValue = _calculateUnitValue(
                type,
                minNumber,
                maxNumber,
                samples[i],
                isPreScaled
              );
              const y =
                innerDeviceHeight -
                innerDeviceHeight * unitValue +
                deviceLineHalfWidth;
              const zero = innerDeviceHeight + deviceLineHalfWidth;
              ctx.moveTo(x, zero);
              ctx.lineTo(x, y);
              ctx.stroke();
            }
            break;
          default:
            throw new Error('Unsupported type ' + type);
        }
      }
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
          className="timelineTrackCustomMarkerCanvas"
          ref={this._takeCanvasRef}
        />
      </InView>
    );
  }
}

type OwnProps = {|
  +threadIndex: ThreadIndex,
  +markerSchema: MarkerSchema,
  +graphHeight: CssPixels,
|};

type StateProps = {|
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +interval: Milliseconds,
  +filteredThread: Thread,
  +unfilteredSamplesRange: StartEndRange | null,
  +markerSchema: MarkerSchema,
  +markerSampleRanges: [IndexIntoSamplesTable, IndexIntoSamplesTable],
  +collectedSamples: CollectedCustomMarkerSamples,
  +getMarker: (MarkerIndex) => Marker,
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
 * The marker track graph takes information from markers, and renders it as a
 * graph in the timeline.
 */
class TrackCustomMarkerGraphImpl extends React.PureComponent<Props, State> {
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
      interval,
      markerSampleRanges,
      collectedSamples,
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;

    if (
      timeAtMouse < collectedSamples.time[0] ||
      timeAtMouse >
        collectedSamples.time[collectedSamples.time.length - 1] + interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredCounter: null });
    } else {
      // When the mouse pointer hovers between two points, select the point that's closer.
      let hoveredCounter;
      const [sampleStart, sampleEnd] = markerSampleRanges;
      const bisectionCounter = bisectionRight(
        collectedSamples.time,
        timeAtMouse,
        sampleStart,
        sampleEnd
      );
      if (
        bisectionCounter > 0 &&
        bisectionCounter < collectedSamples.time.length
      ) {
        const leftDistance =
          timeAtMouse - collectedSamples.time[bisectionCounter - 1];
        const rightDistance =
          collectedSamples.time[bisectionCounter] - timeAtMouse;
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

      if (hoveredCounter === collectedSamples.time.length) {
        // When hovering the last sample, it's possible the mouse is past the time.
        // In this case, hover over the last sample. This happens because of the
        // ` + interval` line in the `if` condition above.
        hoveredCounter = collectedSamples.time.length - 1;
      }

      this.setState({
        mouseX,
        mouseY,
        hoveredCounter,
      });
    }
  };

  _renderTooltip(counterIndex: number): React.Node {
    const {
      collectedSamples,
      rangeStart,
      rangeEnd,
      markerSchema,
      threadIndex,
      getMarker,
    } = this.props;
    const { mouseX, mouseY } = this.state;
    if (collectedSamples.length === 0) {
      throw new Error('No samples for marker ' + markerSchema.name);
    }
    const sampleTime = collectedSamples.time[counterIndex];
    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the tooltip if it will be rendered outside of the timeline.
      // This could happen when a sample time is outside of the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <TooltipMarker
          markerIndex={collectedSamples.indexes[counterIndex]}
          marker={getMarker(collectedSamples.indexes[counterIndex])}
          threadsKey={threadIndex}
          restrictHeightWidth={true}
        />
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderDot(counterIndex: number): React.Node {
    const {
      markerSchema,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      collectedSamples,
    } = this.props;

    const rangeLength = rangeEnd - rangeStart;
    const sampleTime = collectedSamples.time[counterIndex];

    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the dot if it will be rendered outside of the timeline.
      // This could happen when a sample time is outside of the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    const left = (width * (sampleTime - rangeStart)) / rangeLength;

    const { minNumber, maxNumber, numbersPerLine } = collectedSamples;

    const dots = [];

    for (
      let lineIndex = 0;
      lineIndex < getMarkerTrackConfig(markerSchema).lines.length;
      lineIndex++
    ) {
      const type = getMarkerTrackConfigLineType(markerSchema, lineIndex);
      const samples = numbersPerLine[lineIndex];
      const unitValue = _calculateUnitValue(
        type,
        minNumber,
        maxNumber,
        samples[counterIndex],
        isMarkerTrackLinePreScaled(markerSchema, lineIndex)
      );
      const lineWidth = getMarkerTrackLineWidth(markerSchema, lineIndex);
      const innerTrackHeight = graphHeight - lineWidth / 2;
      const top =
        innerTrackHeight - unitValue * innerTrackHeight + lineWidth / 2;
      dots.push(
        <div
          style={{ left, top }}
          key={lineIndex}
          className="timelineTrackCustomMarkerGraphDot"
        />
      );
    }

    return <>{dots}</>;
  }

  render() {
    const { hoveredCounter } = this.state;
    const {
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      unfilteredSamplesRange,
      markerSchema,
      markerSampleRanges,
      graphHeight,
      width,
      collectedSamples,
    } = this.props;

    return (
      <div
        className="timelineTrackCustomMarkerGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackCustomMarkerCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          markerSchema={markerSchema}
          markerSampleRanges={markerSampleRanges}
          height={graphHeight}
          width={width}
          interval={interval}
          collectedSamples={collectedSamples}
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

export const TrackCustomMarkerGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex, markerSchema } = ownProps;
    const { start, end } = getCommittedRange(state);
    const selectors = getThreadSelectors(threadIndex);
    const markerTrackSelectors = selectors.getMarkerTrackSelectors(
      markerSchema.name
    );
    return {
      threadIndex: threadIndex,
      markerSchema: markerSchema,
      markerSampleRanges:
        markerTrackSelectors.getCommittedRangeMarkerSampleRange(state),
      collectedSamples:
        markerTrackSelectors.getCollectedCustomMarkerSamples(state),
      rangeStart: start,
      rangeEnd: end,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      getMarker: selectors.getMarkerGetter(state),
    };
  },
  component: withSize<Props>(TrackCustomMarkerGraphImpl),
});
