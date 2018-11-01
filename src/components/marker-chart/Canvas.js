/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_20 } from 'photon-colors';
import * as React from 'react';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import TextMeasurement from '../../utils/text-measurement';
import { updatePreviewSelection } from '../../actions/profile-view';
import { BLUE_40 } from '../../utils/colors';

import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type {
  TracingMarker,
  MarkerTimingRows,
  IndexIntoMarkerTiming,
  IndexIntoTracingMarkers,
} from '../../types/profile-derived';
import type { Viewport } from '../shared/chart/Viewport';
import { typeof viewTooltip, typeof dismissTooltip } from '../../actions/app';

type MarkerDrawingInformation = {
  x: CssPixels,
  y: CssPixels,
  w: CssPixels,
  h: CssPixels,
  uncutWidth: CssPixels,
  text: string,
};

type OwnProps = {|
  +dismissTooltip: dismissTooltip,
  +viewTooltip: viewTooltip,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerTimingRows: MarkerTimingRows,
  +rowHeight: CssPixels,
  +markers: TracingMarker[],
  +threadIndex: ThreadIndex,
  +updatePreviewSelection: typeof updatePreviewSelection,
  +marginLeft: CssPixels,
  +marginRight: CssPixels,
|};

type Props = {|
  ...OwnProps,
  // Bring in the viewport props from the higher order Viewport component.
  +viewport: Viewport,
|};

type State = {|
  hoveredItem: null | number,
|};

const TEXT_OFFSET_TOP = 11;
const TWO_PI = Math.PI * 2;
const MARKER_DOT_RADIUS = 0.25;
const TEXT_OFFSET_START = 3;

class MarkerChartCanvas extends React.PureComponent<Props, State> {
  _textMeasurement: null | TextMeasurement;

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    hoveredItem: IndexIntoMarkerTiming | null
  ) => {
    const {
      rowHeight,
      markerTimingRows,
      viewport: {
        viewportTop,
        viewportBottom,
        containerWidth,
        containerHeight,
      },
    } = this.props;
    // Convert CssPixels to Stack Depth
    const startRow = Math.floor(viewportTop / rowHeight);
    const endRow = Math.min(
      Math.ceil(viewportBottom / rowHeight),
      markerTimingRows.length
    );

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    this.drawMarkers(ctx, hoveredItem, startRow, endRow);
    this.drawSeparatorsAndLabels(ctx, startRow, endRow);
  };

  // Note: we used a long argument list instead of an object parameter on
  // purpose, to reduce GC pressure while drawing.
  drawOneMarker(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    w: CssPixels,
    h: CssPixels,
    uncutWidth: CssPixels,
    text: string,
    backgroundColor: string = BLUE_40,
    foregroundColor: string = 'white'
  ) {
    ctx.fillStyle = backgroundColor;

    const textMeasurement = this._getTextMeasurement(ctx);

    if (uncutWidth >= h) {
      // We want the rectangle to have a clear margin, that's why we increment y
      // and decrement h (twice, for both margins).
      this.drawRoundedRect(ctx, x, y + 1, w, h - 2, 1);

      // Draw the text label
      // TODO - L10N RTL.
      // Constrain the x coordinate to the leftmost area.
      const x2: CssPixels = x + TEXT_OFFSET_START;
      const w2: CssPixels = Math.max(0, w - (x2 - x));

      if (w2 > textMeasurement.minWidth) {
        const fittedText = textMeasurement.getFittedText(text, w2);
        if (fittedText) {
          ctx.fillStyle = foregroundColor;
          ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
        }
      }
    } else {
      ctx.beginPath();
      ctx.arc(
        x + w / 2, // x
        y + h / 2, // y
        h * MARKER_DOT_RADIUS, // radius
        0, // arc start
        TWO_PI // arc end
      );
      ctx.fill();
    }
  }

  drawMarkers(
    ctx: CanvasRenderingContext2D,
    hoveredItem: IndexIntoMarkerTiming | null,
    startRow: number,
    endRow: number
  ) {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      rowHeight,
      marginLeft,
      marginRight,
      viewport: { containerWidth, viewportLeft, viewportRight, viewportTop },
    } = this.props;

    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    ctx.lineWidth = 1;

    // Only draw the stack frames that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const markerTiming = markerTimingRows[rowIndex];

      if (!markerTiming) {
        continue;
      }

      // Decide which samples to actually draw
      const timeAtViewportLeft: Milliseconds =
        rangeStart + rangeLength * viewportLeft;
      const timeAtViewportRightPlusMargin: Milliseconds =
        rangeStart +
        rangeLength * viewportRight +
        // This represents the amount of seconds in the right margin:
        marginRight * (viewportLength * rangeLength / markerContainerWidth);

      let hoveredElement: MarkerDrawingInformation | null = null;
      for (let i = 0; i < markerTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          markerTiming.end[i] > timeAtViewportLeft &&
          markerTiming.start[i] < timeAtViewportRightPlusMargin
        ) {
          const startTime: UnitIntervalOfProfileRange =
            (markerTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange =
            (markerTiming.end[i] - rangeStart) / rangeLength;

          let x: CssPixels =
            (startTime - viewportLeft) * markerContainerWidth / viewportLength +
            marginLeft;
          const y: CssPixels = rowIndex * rowHeight - viewportTop;
          const uncutWidth: CssPixels =
            (endTime - startTime) * markerContainerWidth / viewportLength;
          const h: CssPixels = rowHeight - 1;

          let w = uncutWidth;
          if (x < marginLeft) {
            // Adjust markers that are before the left margin.
            w = w - marginLeft + x;
            x = marginLeft;
          }
          if (uncutWidth < 10) {
            // Ensure that small durations render as a dot, but markers cut by the margins
            // are rendered as squares.
            w = 10;
          }

          const tracingMarkerIndex = markerTiming.index[i];
          const isHovered = hoveredItem === tracingMarkerIndex;
          const text = markerTiming.label[i];
          if (isHovered) {
            hoveredElement = { x, y, w, h, uncutWidth, text };
          } else {
            this.drawOneMarker(ctx, x, y, w, h, uncutWidth, text);
          }
        }
      }
      if (hoveredElement) {
        this.drawOneMarker(
          ctx,
          hoveredElement.x,
          hoveredElement.y,
          hoveredElement.w,
          hoveredElement.h,
          hoveredElement.uncutWidth,
          hoveredElement.text,
          'Highlight', //    background color
          'HighlightText' // foreground color
        );
      }
    }
  }

  /**
   * Lazily create the text measurement tool, as a valid 2d rendering context must
   * exist before it is created.
   */
  _getTextMeasurement(ctx: CanvasRenderingContext2D): TextMeasurement {
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    return this._textMeasurement;
  }

  drawSeparatorsAndLabels(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number
  ) {
    const {
      markerTimingRows,
      rowHeight,
      marginLeft,
      viewport: { viewportTop, containerWidth, containerHeight },
    } = this.props;

    // Draw separators
    ctx.fillStyle = GREY_20;
    ctx.fillRect(marginLeft - 1, 0, 1, containerHeight);
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // `- 1` at the end, because the top separator is not drawn in the canvas,
      // it's drawn using CSS' border property. And canvas positioning is 0-based.
      const y = (rowIndex + 1) * rowHeight - viewportTop - 1;
      ctx.fillRect(0, y, containerWidth, 1);
    }

    const textMeasurement = this._getTextMeasurement(ctx);

    // Draw the text
    ctx.fillStyle = '#000000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const { name } = markerTimingRows[rowIndex];
      if (rowIndex > 0 && name === markerTimingRows[rowIndex - 1].name) {
        continue;
      }
      const fittedText = textMeasurement.getFittedText(name, marginLeft);
      const y = rowIndex * rowHeight - viewportTop;
      ctx.fillText(fittedText, 5, y + TEXT_OFFSET_TOP);
    }
  }

  hitTest = (x: CssPixels, y: CssPixels): IndexIntoMarkerTiming | null => {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      rowHeight,
      marginLeft,
      marginRight,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;
    if (x < marginLeft - MARKER_DOT_RADIUS) {
      return null;
    }
    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * ((x - marginLeft) / markerContainerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const rowIndex = Math.floor((y + viewportTop) / rowHeight);
    const minDuration =
      rangeLength *
      viewportLength *
      (rowHeight * 2 * MARKER_DOT_RADIUS / markerContainerWidth);
    const markerTiming = markerTimingRows[rowIndex];

    if (!markerTiming) {
      return null;
    }

    for (let i = 0; i < markerTiming.length; i++) {
      const start = markerTiming.start[i];
      // Ensure that really small markers are hoverable with a minDuration.
      const end = Math.max(start + minDuration, markerTiming.end[i]);
      if (start < time && end > time) {
        return markerTiming.index[i];
      }
    }
    return null;
  };

  onDoubleClickMarker = (markerIndex: IndexIntoMarkerTiming | null) => {
    if (markerIndex === null) {
      return;
    }
    const { markers, updatePreviewSelection } = this.props;
    const marker = markers[markerIndex];
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.start + marker.dur,
    });
  };

  drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    width: CssPixels,
    height: CssPixels,
    cornerSize: CssPixels
  ) {
    // Cut out c x c -sized squares in the corners.
    const c = Math.min(width / 2, height / 2, cornerSize);
    const bottom = y + height;
    ctx.fillRect(x + c, y, width - 2 * c, c);
    ctx.fillRect(x, y + c, width, height - 2 * c);
    ctx.fillRect(x + c, bottom - c, width - 2 * c, c);
  }

  _onHoverChange = (
    x: CssPixels,
    y: CssPixels,
    tracingMarkerIndex: IndexIntoTracingMarkers | null
  ): void => {
    const { dismissTooltip, viewTooltip, threadIndex } = this.props;
    if (tracingMarkerIndex === null) {
      dismissTooltip();
    } else {
      viewTooltip(x, y, {
        type: 'tracing-marker',
        threadIndex,
        tracingMarkerIndex,
      });
    }
  };

  /**
   * The hovered item is a marker index, which can be used to uniquely identify the
   * hovered item, which is used as a React node's key for the tooltip.
   */

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="markerChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onHoverChange={this._onHoverChange}
        onDoubleClickItem={this.onDoubleClickMarker}
        drawCanvas={this.drawCanvas}
        hitTest={this.hitTest}
      />
    );
  }
}

export default (withChartViewport: WithChartViewport<OwnProps, Props>)(
  MarkerChartCanvas
);
