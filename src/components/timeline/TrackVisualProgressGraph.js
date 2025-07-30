/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { formatPercent } from 'firefox-profiler/utils/format-numbers';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { BLUE_50, BLUE_60 } from 'photon-colors';

import type {
  ProgressGraphData,
  Milliseconds,
  CssPixels,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackVisualProgress.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +progressGraphData: ProgressGraphData[],
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
class TrackVisualProgressCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      progressGraphData,
      height,
      width,
      lineWidth,
      interval,
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

    if (progressGraphData.length === 0) {
      // There's no reason to draw the samples, there are none.
      return;
    }

    // Take the sample information, and convert it into chart coordinates. Use a slightly
    // smaller space than the deviceHeight, so that the stroke will be fully visible
    // both at the top and bottom of the chart.

    {
      // Draw the chart.
      const rangeLength = rangeEnd - rangeStart;
      ctx.lineWidth = deviceLineWidth;
      ctx.strokeStyle = BLUE_50;
      ctx.fillStyle = '#0a84ff88'; // Blue 50 with transparency.
      ctx.beginPath();

      // The x and y are used after the loop.
      let x = 0;
      let y = 0;
      let yOld = 0;
      for (let i = 0; i < progressGraphData.length; i++) {
        // Create a path for the top of the chart. This is the line that will have
        // a stroke applied to it.
        x =
          (deviceWidth * ((progressGraphData[i].timestamp ?? 0) - rangeStart)) /
          rangeLength;
        // Add on half the stroke's line width so that it won't be cut off the edge
        // of the graph.
        const unitGraphCount = progressGraphData[i].percent / 100;
        y =
          innerDeviceHeight -
          innerDeviceHeight * unitGraphCount +
          deviceLineHalfWidth;
        if (i === 0) {
          // This is the first iteration, only move the line.
          ctx.moveTo(x, y);
        } else {
          // Plot an extra point to generate a step-wise graph
          ctx.lineTo(x, yOld);
          ctx.lineTo(x, y);
        }
        yOld = y;
      }
      // The samples range ends at the time of the last sample, plus the interval.
      // Draw this last bit.
      x = (deviceWidth * (rangeEnd - rangeStart)) / rangeLength;
      ctx.lineTo(x, y);

      // Don't do the fill yet, just stroke the top line.
      ctx.stroke();

      // After doing the stroke, continue the path to complete the fill to the bottom
      // of the canvas.
      ctx.lineTo(x + interval, deviceHeight);
      ctx.lineTo(
        (deviceWidth * ((progressGraphData[0].timestamp ?? 0) - rangeStart)) /
          rangeLength +
          interval,
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
      <canvas
        className="timelineTrackVisualProgressCanvas"
        ref={this._takeCanvasRef}
      />
    );
  }
}

type OwnProps = {
  +progressGraphData: ProgressGraphData[],
  +lineWidth: CssPixels,
  +graphHeight: CssPixels,
  +graphDotTooltipText: string,
};

type StateProps = {
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +interval: Milliseconds,
};

type DispatchProps = {};

type Props = {
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
};

type State = {
  hoveredVisualProgress: null | number,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

/**
 * The visual progress track graph takes visual progress information from visual metrics, and renders it as a
 * graph in the timeline.
 */
class TrackVisualProgressGraphImpl extends React.PureComponent<Props, State> {
  state = {
    hoveredVisualProgress: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    this.setState({ hoveredVisualProgress: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    // Get the offset from here, and apply it to the time lookup.
    const { left } = event.currentTarget.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, progressGraphData, interval } =
      this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;
    if (
      timeAtMouse < (progressGraphData[0].timestamp ?? 0) ||
      timeAtMouse >
        (progressGraphData[progressGraphData.length - 1].timestamp ?? 0) +
          interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredVisualProgress: null });
    } else {
      const graphTimestamps = progressGraphData.map(
        ({ timestamp }) => timestamp ?? 0
      );
      let hoveredVisualProgress = bisectionRight(graphTimestamps, timeAtMouse);
      if (hoveredVisualProgress === progressGraphData.length) {
        // When hovering the last sample, it's possible the mouse is past the time.
        // In this case, hover over the last sample. This happens because of the
        // ` + interval` line in the `if` condition above.
        hoveredVisualProgress = progressGraphData.length - 1;
      }

      this.setState({
        mouseX,
        mouseY,
        hoveredVisualProgress,
      });
    }
  };

  _renderTooltip(graphDataIndex: number): React.Node {
    const { progressGraphData, graphDotTooltipText } = this.props;
    const percentage = progressGraphData[graphDataIndex].percent / 100;
    return (
      <div className="timelineTrackVisualProgressTooltip">
        <div className="timelineTrackVisualProgressTooltipLine">
          <span className="timelineTrackVisualProgressTooltipNumber">
            {formatPercent(percentage)}
          </span>
          {graphDotTooltipText}
        </div>
      </div>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderVisualProgressDot(graphDataIndex: number): React.Node {
    const {
      progressGraphData,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const left =
      (width *
        ((progressGraphData[graphDataIndex].timestamp ?? 0) - rangeStart)) /
      rangeLength;

    const unitSampleCount = progressGraphData[graphDataIndex].percent / 100;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    const top =
      innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;

    return (
      <div
        style={{ left, top, '--dot-color': BLUE_60 }}
        className="timelineTrackVisualProgressGraphDot"
      />
    );
  }

  render() {
    const { hoveredVisualProgress, mouseX, mouseY } = this.state;
    const {
      interval,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      progressGraphData,
    } = this.props;

    return (
      <div
        className="timelineTrackVisualProgressGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackVisualProgressCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          progressGraphData={progressGraphData}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
        />
        {hoveredVisualProgress === null ? null : (
          <>
            {this._renderVisualProgressDot(hoveredVisualProgress)}
            <Tooltip mouseX={mouseX} mouseY={mouseY}>
              {this._renderTooltip(hoveredVisualProgress)}
            </Tooltip>
          </>
        )}
      </div>
    );
  }
}

export const TrackVisualProgressGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => {
    const { start, end } = getCommittedRange(state);
    return {
      rangeStart: start,
      rangeEnd: end,
      interval: getProfileInterval(state),
    };
  },
  component: withSize<Props>(TrackVisualProgressGraphImpl),
});
