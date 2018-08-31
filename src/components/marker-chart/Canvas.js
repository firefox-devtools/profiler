/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
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
  IndexIntoTracingMarkers,
} from '../../types/profile-derived';
import type { Viewport } from '../shared/chart/Viewport';

type HoveredItem = {|
  +markerIndex: IndexIntoTracingMarkers,
  +rowIndex: number,
  +indexInRow: number,
|};

type OwnProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerTimingRows: MarkerTimingRows,
  +rowHeight: CssPixels,
  +markers: TracingMarker[],
  +threadIndex: ThreadIndex,
  +updatePreviewSelection: typeof updatePreviewSelection,
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
const MARKER_LABEL_MAX_LENGTH = 150;

class MarkerChartCanvas extends React.PureComponent<Props, State> {
  _textMeasurement: null | TextMeasurement;
  _previousRowWithHoveredItem: number | null = null;
  _drawOnce: boolean = false;

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    hoveredItem: HoveredItem | null
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

    if (this._drawOnce) {
      if (this._previousRowWithHoveredItem !== null) {
        this.drawMarkers(
          ctx,
          this._previousRowWithHoveredItem,
          this._previousRowWithHoveredItem + 1
        );
      }
      if (hoveredItem) {
        this.drawMarkers(ctx, hoveredItem.rowIndex, hoveredItem.rowIndex + 1);
        this.drawHoveredItem(ctx, hoveredItem);
        this._previousRowWithHoveredItem = hoveredItem.rowIndex;
      } else {
        this._previousRowWithHoveredItem = null;
      }
      this.drawSeparatorsAndLabels(ctx, startRow, endRow);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, containerWidth, containerHeight);

      this.drawMarkers(ctx, startRow, endRow);
      if (hoveredItem) {
        this.drawHoveredItem(ctx, hoveredItem);
        this._previousRowWithHoveredItem = hoveredItem.rowIndex;
      }
      this.drawSeparatorsAndLabels(ctx, startRow, endRow);
      this._drawOnce = true;
    }
  };

  // Note: we used a long argument list instead of an object parameter on
  // purpose, to reduce GC pressure while drawing.
  drawOneMarker(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    w: CssPixels,
    h: CssPixels,
    text: string,
    backgroundColor: string = BLUE_40,
    foregroundColor: string = 'white'
  ) {
    ctx.fillStyle = backgroundColor;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;

    if (w >= h) {
      // We want the rectangle to have a clear margin, that's why we increment y
      // and decrement h (twice, for both margins).
      this.drawRoundedRect(ctx, x, y + 1, w, h - 2, 1);

      // Draw the text label
      // TODO - L10N RTL.
      // Constrain the x coordinate to the leftmost area.
      const x2: CssPixels = Math.max(x, 0) + TEXT_OFFSET_START;
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

  drawMarkers(ctx: CanvasRenderingContext2D, startRow: number, endRow: number) {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      rowHeight,
      viewport: { containerWidth, viewportLeft, viewportRight, viewportTop },
    } = this.props;

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
      const timeAtViewportRight: Milliseconds =
        rangeStart + rangeLength * viewportRight;

      for (let i = 0; i < markerTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          markerTiming.end[i] > timeAtViewportLeft &&
          markerTiming.start[i] < timeAtViewportRight
        ) {
          const startTime: UnitIntervalOfProfileRange =
            (markerTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange =
            (markerTiming.end[i] - rangeStart) / rangeLength;

          const x: CssPixels =
            (startTime - viewportLeft) * containerWidth / viewportLength;
          const y: CssPixels = rowIndex * rowHeight - viewportTop;
          const w: CssPixels = Math.max(
            10,
            (endTime - startTime) * containerWidth / viewportLength
          );
          const h: CssPixels = rowHeight - 1;
          const text = markerTiming.label[i];

          this.drawOneMarker(ctx, x, y, w, h, text);
        }
      }
    }
  }

  drawHoveredItem(
    ctx: CanvasRenderingContext2D,
    { rowIndex, indexInRow }: HoveredItem
  ): void {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      rowHeight,
      viewport: { containerWidth, viewportLeft, viewportRight, viewportTop },
    } = this.props;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    const markerTiming = markerTimingRows[rowIndex];
    const startTime: UnitIntervalOfProfileRange =
      (markerTiming.start[indexInRow] - rangeStart) / rangeLength;
    const endTime: UnitIntervalOfProfileRange =
      (markerTiming.end[indexInRow] - rangeStart) / rangeLength;

    const x: CssPixels =
      (startTime - viewportLeft) * containerWidth / viewportLength;
    const y: CssPixels = rowIndex * rowHeight - viewportTop;
    const w: CssPixels = Math.max(
      10,
      (endTime - startTime) * containerWidth / viewportLength
    );
    const h: CssPixels = rowHeight - 1;
    const text = markerTiming.label[indexInRow];

    this.drawOneMarker(
      ctx,
      x,
      y,
      w,
      h,
      text,
      'Highlight', //    background color
      'HighlightText' // foreground color
    );
  }

  drawSeparatorsAndLabels(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number
  ) {
    const {
      markerTimingRows,
      rowHeight,
      viewport: { viewportTop, containerWidth },
    } = this.props;

    // Draw separators
    ctx.fillStyle = '#eee';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // `- 1` at the end, because the top separator is not drawn in the canvas,
      // it's drawn using CSS' border property. And canvas positioning is 0-based.
      const y = (rowIndex + 1) * rowHeight - viewportTop - 1;
      ctx.fillRect(0, y, containerWidth, 1);
    }

    // Fill in behind text
    const gradient = ctx.createLinearGradient(0, 0, 150, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = gradient;
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const y = rowIndex * rowHeight - viewportTop;
      // `-1` because we only want to cover the row's inner surface.
      ctx.fillRect(0, y, 150, rowHeight - 1);
    }

    // Draw the text
    ctx.fillStyle = '#000000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const { name } = markerTimingRows[rowIndex];
      if (rowIndex > 0 && name === markerTimingRows[rowIndex - 1].name) {
        continue;
      }
      const displayedName =
        name.length < MARKER_LABEL_MAX_LENGTH
          ? name
          : name.slice(0, MARKER_LABEL_MAX_LENGTH) + '…';
      const y = rowIndex * rowHeight - viewportTop;
      ctx.fillText(displayedName, 5, y + TEXT_OFFSET_TOP);
    }
  }

  hitTest = (x: CssPixels, y: CssPixels): HoveredItem | null => {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      rowHeight,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * (x / containerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const rowIndex = Math.floor((y + viewportTop) / rowHeight);
    const minDuration =
      rangeLength *
      viewportLength *
      (rowHeight * 2 * MARKER_DOT_RADIUS / containerWidth);
    const markerTiming = markerTimingRows[rowIndex];

    if (!markerTiming) {
      return null;
    }

    for (let i = 0; i < markerTiming.length; i++) {
      const start = markerTiming.start[i];
      // Ensure that really small markers are hoverable with a minDuration.
      const end = Math.max(start + minDuration, markerTiming.end[i]);
      if (start < time && end > time) {
        return {
          markerIndex: markerTiming.index[i],
          rowIndex,
          indexInRow: i,
        };
      }
    }
    return null;
  };

  onDoubleClickMarker = (hoveredItem: HoveredItem | null) => {
    if (hoveredItem === null) {
      return;
    }
    const { markers, updatePreviewSelection } = this.props;
    const marker = markers[hoveredItem.markerIndex];
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

  getHoveredMarkerInfo = ({ markerIndex }: HoveredItem): React.Node => {
    const marker = this.props.markers[markerIndex];
    return (
      <MarkerTooltipContents
        marker={marker}
        threadIndex={this.props.threadIndex}
      />
    );
  };

  componentDidUpdate() {
    this._drawOnce = false;
    this._previousRowWithHoveredItem = null;
  }

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="markerChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this.onDoubleClickMarker}
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
