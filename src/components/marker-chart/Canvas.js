/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_20, GREY_30 } from 'photon-colors';
import * as React from 'react';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import { TooltipMarker } from '../tooltip/Marker';
import TextMeasurement from '../../utils/text-measurement';
import {
  typeof updatePreviewSelection as UpdatePreviewSelection,
  typeof changeRightClickedMarker as ChangeRightClickedMarker,
} from '../../actions/profile-view';
import { BLUE_40 } from '../../utils/colors';
import { TIMELINE_MARGIN_LEFT } from '../../app-logic/constants';
import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type {
  Marker,
  MarkerTimingAndBuckets,
  MarkerIndex,
} from '../../types/profile-derived';
import type { Viewport } from '../shared/chart/Viewport';
import type { WrapFunctionInDispatch } from '../../utils/connect';

type MarkerDrawingInformation = {
  x: CssPixels,
  y: CssPixels,
  w: CssPixels,
  h: CssPixels,
  uncutWidth: CssPixels,
  text: string,
};

type OwnProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerTimingAndBuckets: MarkerTimingAndBuckets,
  +rowHeight: CssPixels,
  +getMarker: MarkerIndex => Marker,
  +threadIndex: ThreadIndex,
  +updatePreviewSelection: WrapFunctionInDispatch<UpdatePreviewSelection>,
  +changeRightClickedMarker: ChangeRightClickedMarker,
  +marginLeft: CssPixels,
  +marginRight: CssPixels,
  +rightClickedMarker: MarkerIndex | null,
  +shouldDisplayTooltips: () => boolean,
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
    hoveredItem: MarkerIndex | null
  ) => {
    const {
      rowHeight,
      markerTimingAndBuckets,
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
      markerTimingAndBuckets.length
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
    hoveredItem: MarkerIndex | null,
    startRow: number,
    endRow: number
  ) {
    const {
      rangeStart,
      rangeEnd,
      markerTimingAndBuckets,
      rowHeight,
      marginLeft,
      marginRight,
      rightClickedMarker,
      viewport: { containerWidth, viewportLeft, viewportRight, viewportTop },
    } = this.props;

    const { devicePixelRatio } = window;
    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    ctx.lineWidth = 1;

    // Decide which samples to actually draw
    const timeAtViewportLeft: Milliseconds =
      rangeStart + rangeLength * viewportLeft;
    const timeAtViewportRightPlusMargin: Milliseconds =
      rangeStart +
      rangeLength * viewportRight +
      // This represents the amount of seconds in the right margin:
      marginRight * ((viewportLength * rangeLength) / markerContainerWidth);

    const highlightedMarkers: MarkerDrawingInformation[] = [];

    // Only draw the stack frames that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const markerTiming = markerTimingAndBuckets[rowIndex];

      if (!markerTiming || typeof markerTiming === 'string') {
        // This marker timing either didn't exist, or was a bucket.
        continue;
      }

      let previousDrawnPixel: number | null = null;

      for (let i = 0; i < markerTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          markerTiming.end[i] >= timeAtViewportLeft &&
          markerTiming.start[i] < timeAtViewportRightPlusMargin
        ) {
          const startTime: UnitIntervalOfProfileRange =
            (markerTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange =
            (markerTiming.end[i] - rangeStart) / rangeLength;

          let x: CssPixels =
            ((startTime - viewportLeft) * markerContainerWidth) /
              viewportLength +
            marginLeft;
          const y: CssPixels = rowIndex * rowHeight - viewportTop;
          const uncutWidth: CssPixels =
            ((endTime - startTime) * markerContainerWidth) / viewportLength;
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

          x = Math.round(x * devicePixelRatio) / devicePixelRatio;

          const text = markerTiming.label[i];
          const markerIndex = markerTiming.index[i];

          const isHighlighted =
            rightClickedMarker === markerIndex || hoveredItem === markerIndex;

          if (isHighlighted) {
            highlightedMarkers.push({ x, y, w, h, uncutWidth, text });
          } else if (x !== previousDrawnPixel || uncutWidth > 0) {
            // We avoid to draw several dot markers in the same place.
            previousDrawnPixel = x;
            this.drawOneMarker(ctx, x, y, w, h, uncutWidth, text);
          }
        }
      }
    }

    // We draw highlighted markers after the normal markers so that they stand
    // out more.
    highlightedMarkers.forEach(highlightedMarker => {
      this.drawOneMarker(
        ctx,
        highlightedMarker.x,
        highlightedMarker.y,
        highlightedMarker.w,
        highlightedMarker.h,
        highlightedMarker.uncutWidth,
        highlightedMarker.text,
        'Highlight', //    background color
        'HighlightText' // foreground color
      );
    });
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
      markerTimingAndBuckets,
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

    // Draw the marker names in the left margin.
    ctx.fillStyle = '#000000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const markerTiming = markerTimingAndBuckets[rowIndex];
      if (typeof markerTiming === 'string') {
        continue;
      }
      // Draw the marker name.
      const { name } = markerTiming;
      if (rowIndex > 0 && name === markerTimingAndBuckets[rowIndex - 1].name) {
        continue;
      }

      const y = rowIndex * rowHeight - viewportTop;
      const fittedText = textMeasurement.getFittedText(
        name,
        TIMELINE_MARGIN_LEFT
      );
      ctx.fillText(fittedText, 5, y + TEXT_OFFSET_TOP);
    }

    // Draw the bucket names.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const bucketName = markerTimingAndBuckets[rowIndex];
      if (typeof bucketName !== 'string') {
        continue;
      }
      const y = rowIndex * rowHeight - viewportTop;

      // Draw the backgound.
      ctx.fillStyle = GREY_20;
      ctx.fillRect(0, y, containerWidth, rowHeight);

      // Draw the borders.
      ctx.fillStyle = GREY_30;
      ctx.fillRect(0, y - 1, containerWidth, 1);
      ctx.fillRect(0, y + rowHeight, containerWidth, 1);

      // Draw the text.
      ctx.fillStyle = '#000000';
      ctx.fillText(bucketName, 5 + TIMELINE_MARGIN_LEFT, y + TEXT_OFFSET_TOP);
    }
  }

  hitTest = (x: CssPixels, y: CssPixels): MarkerIndex | null => {
    const {
      rangeStart,
      rangeEnd,
      markerTimingAndBuckets,
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
      ((rowHeight * 2 * MARKER_DOT_RADIUS) / markerContainerWidth);
    const markerTiming = markerTimingAndBuckets[rowIndex];

    if (!markerTiming || typeof markerTiming === 'string') {
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

  onDoubleClickMarker = (markerIndex: MarkerIndex | null) => {
    if (markerIndex === null) {
      return;
    }
    const { getMarker, updatePreviewSelection } = this.props;
    const marker = getMarker(markerIndex);
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.start + marker.dur,
    });
  };

  onRightClickMarker = (markerIndex: MarkerIndex | null) => {
    const { changeRightClickedMarker, threadIndex } = this.props;
    changeRightClickedMarker(threadIndex, markerIndex);
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

  getHoveredMarkerInfo = (markerIndex: MarkerIndex): React.Node => {
    if (!this.props.shouldDisplayTooltips()) {
      return null;
    }

    const marker = this.props.getMarker(markerIndex);
    return (
      <TooltipMarker marker={marker} threadIndex={this.props.threadIndex} />
    );
  };

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="markerChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        scaleCtxToCssPixels={true}
        onDoubleClickItem={this.onDoubleClickMarker}
        onRightClick={this.onRightClickMarker}
        getHoveredItemInfo={this.getHoveredMarkerInfo}
        drawCanvas={this.drawCanvas}
        hitTest={this.hitTest}
      />
    );
  }
}

export default (withChartViewport: WithChartViewport<OwnProps, Props>)(
  MarkerChartCanvas
);
