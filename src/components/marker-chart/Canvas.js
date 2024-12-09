/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_20, GREY_30, BLUE_60, BLUE_80 } from 'photon-colors';
import * as React from 'react';
import {
  withChartViewport,
  type WithChartViewport,
  type Viewport,
} from 'firefox-profiler/components/shared/chart/Viewport';
import { ChartCanvas } from 'firefox-profiler/components/shared/chart/Canvas';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import TextMeasurement from 'firefox-profiler/utils/text-measurement';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  typeof updatePreviewSelection as UpdatePreviewSelection,
  typeof changeRightClickedMarker as ChangeRightClickedMarker,
  typeof changeMouseTimePosition as ChangeMouseTimePosition,
  typeof changeSelectedMarker as ChangeSelectedMarker,
} from 'firefox-profiler/actions/profile-view';
import type {
  Milliseconds,
  CssPixels,
  DevicePixels,
  UnitIntervalOfProfileRange,
  ThreadsKey,
  Marker,
  MarkerTiming,
  MarkerTimingAndBuckets,
  MarkerIndex,
  TimelineTrackOrganization,
} from 'firefox-profiler/types';
import { getStartEndRangeForMarker } from 'firefox-profiler/utils';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type { WrapFunctionInDispatch } from 'firefox-profiler/utils/connect';

// We can hover over multiple items with Marker chart when we are in the active
// tab view. Usually on other charts, we only have one selected item at a time.
// But in here, we can hover over both markers and marker labels.
// Also, they can be hovered at the same time. That's why we keep both of their
// state in a two value tuple.
// So if we take a look at all the possible states, we can have:
//    [Hovered Marker Index, Hovered label row]
// 1. [123                 , null             ]
// 2. [null                , 12               ] (for active tab only)
// 3. [123                 , 12               ] (for active tab only)
// 4. [null                , null             ] (not used, we use primitive null
//                                              to make shared canvas happy)
// First state is the most common case, which is the only one available for the
// full view. We have second and third cases for active tab view where we can
// also see the hovered labels. 4th case is not used. We use primitive `null`
// instead when both of the states are null, because that's what our shared
// canvas component require.
type RowIndex = number;

type MarkerLocationInChart = {|
  rowIndex: RowIndex,
  markerIndex: MarkerIndex,
|};

type HoveredMarkerChartItems = {|
  marker: MarkerLocationInChart | null,
  labelRow: RowIndex | null,
|};

type OwnProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerTimingAndBuckets: MarkerTimingAndBuckets,
  +rowHeight: CssPixels,
  +getMarker: (MarkerIndex) => Marker,
  +getMarkerLabel: (MarkerIndex) => string,
  +markerListLength: number,
  +threadsKey: ThreadsKey,
  +updatePreviewSelection: WrapFunctionInDispatch<UpdatePreviewSelection>,
  +changeMouseTimePosition: ChangeMouseTimePosition,
  +changeSelectedMarker: ChangeSelectedMarker,
  +changeRightClickedMarker: ChangeRightClickedMarker,
  +marginLeft: CssPixels,
  +marginRight: CssPixels,
  +selectedMarkerIndex: MarkerIndex | null,
  +rightClickedMarkerIndex: MarkerIndex | null,
  +shouldDisplayTooltips: () => boolean,
  +timelineTrackOrganization: TimelineTrackOrganization,
|};

type Props = {|
  ...OwnProps,
  // Bring in the viewport props from the higher order Viewport component.
  +viewport: Viewport,
|};

const TEXT_OFFSET_TOP_CSS = 11;
const TEXT_OFFSET_START_CSS = 3;
const MARKER_DOT_RADIUS_CSS = 0.25;
const LABEL_PADDING_CSS = 5;
const MARKER_BORDER_COLOR = '#2c77d1';
const FONT_SIZE_CSS = 10;

type ViewportCoordinates = {|
  outerWidthDevPx: DevicePixels,
  outerHeightDevPx: DevicePixels,

  cssToDeviceScale: number,

  insetLeftTimestamp: Milliseconds,
  insetLeftDevPx: DevicePixels,
  devPxPerMs: number,
  outerRightTimestamp: Milliseconds,
  viewportRightDevPx: DevicePixels,

  viewportTopDevPx: DevicePixels,
  rowHeightFractDevPx: DevicePixels,

  visibleRowsStart: RowIndex,
  visibleRowsEnd: RowIndex,
|};

type RowCoordinates = {|
  rowTopDevPx: DevicePixels,
  rowBottomDevPx: DevicePixels,
  rowHeightDevPx: DevicePixels,
  rowContentHeightDevPx: DevicePixels,
|};

// type DeviceRect = {|
//   left: number,
//   top: number,
//   right: number,
//   bottom: number,
//   width: number,
//   height: number,
// |};

/**
 * Round the given value to integers, consistently rounding x.5 towards positive infinity.
 * This is different from Math.round: Math.round rounds 0.5 to the right (to 1), and -0.5
 * to the left (to -1).
 * snap should be preferred over Math.round for rounding coordinates which might
 * be negative, so that there is no discontinuity when a box moves past zero.
 */
function snap(floatDeviceValue: DevicePixels): DevicePixels {
  return Math.floor(floatDeviceValue + 0.5);
}

/**
 * Round the given value to a multiple of `integerFactor`.
 */
function snapValueToMultipleOf(
  floatDeviceValue: DevicePixels,
  integerFactor: number
): DevicePixels {
  return snap(floatDeviceValue / integerFactor) * integerFactor;
}

class MarkerChartCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;
  _textMeasurementCssToDeviceScale: number = 1;

  _computeDirtyRows(
    coordinates: ViewportCoordinates,
    hoverInfo: ChartCanvasHoverInfo<HoveredMarkerChartItems>
  ): Set<RowIndex | null> | null {
    const {
      hoveredItem: hoveredItems,
      prevHoveredItem: prevHoveredItems,
      isHoveredOnlyDifferent,
    } = hoverInfo;

    // const { rowHeightFractDevPx, viewportTopDevPx, outerWidthDevPx, outerHeightDevPx } = coordinates;

    if (!isHoveredOnlyDifferent) {
      return null;
      // const allRows = new Set();
      // for ()
      // const width = outerWidthDevPx;
      // const right = width;
      // const height = outerHeightDevPx;
      // const bottom = height;
      // return [{ left: 0, top: 0, right, bottom, width, height }];
    }

    const invalidRows = new Set();

    const hoveredMarker = hoveredItems ? hoveredItems.marker : null;
    const hoveredMarkerIndex = hoveredMarker ? hoveredMarker.markerIndex : null;
    const prevHoveredMarker = prevHoveredItems ? prevHoveredItems.marker : null;
    const prevHoveredMarkerIndex = prevHoveredMarker
      ? prevHoveredMarker.markerIndex
      : null;

    if (hoveredMarkerIndex !== prevHoveredMarkerIndex) {
      invalidRows.add(hoveredMarker ? hoveredMarker.rowIndex : null);
      invalidRows.add(prevHoveredMarker ? prevHoveredMarker.rowIndex : null);
    }

    const hoveredLabelRow = hoveredItems ? hoveredItems.labelRow : null;
    const prevHoveredLabelRow = prevHoveredItems
      ? prevHoveredItems.labelRow
      : null;
    if (hoveredLabelRow !== prevHoveredLabelRow) {
      invalidRows.add(hoveredLabelRow);
      invalidRows.add(prevHoveredLabelRow);
    }

    return invalidRows;

    // const invalidRects = [];
    // for (const rowIndex of invalidRows) {
    //   if (rowIndex === null) {
    //     continue;
    //   }

    //   const top = Math.round(rowIndex * rowHeightFractDevPx - viewportTopDevPx);
    //   const bottom = Math.round((rowIndex + 1) * rowHeightFractDevPx - viewportTopDevPx);
    //   const height = bottom - top;
    //   const left = 0;
    //   const width = outerWidthDevPx;
    //   const right = width;
    //   invalidRects.push({ left, top, right, bottom, width, height });
    // }

    // return invalidRects;
  }

  _getViewportCoordinates(cssToDeviceScale: number): ViewportCoordinates {
    const {
      marginLeft: insetLeftCssPx,
      marginRight: insetRightCssPx,
      rangeStart: committedRangeStartTimestamp,
      rangeEnd: committedRangeEndTimestamp,
      rowHeight: rowHeightCssPx,
      viewport: {
        containerWidth: outerWidthCssPx,
        containerHeight: outerHeightCssPx,
        viewportLeft: viewportLeftFraction,
        viewportRight: viewportRightFraction,
        viewportTop: viewportTopCssPx,
      },
    } = this.props;

    const outerWidthDevPx = Math.round(outerWidthCssPx * cssToDeviceScale);
    const insetLeftDevPx = Math.round(insetLeftCssPx * cssToDeviceScale);
    const insetRightDevPx = Math.round(insetRightCssPx * cssToDeviceScale);
    const viewportWidthDevPx =
      outerWidthDevPx - insetLeftDevPx - insetRightDevPx;

    const committedRangeTimeDuration =
      committedRangeEndTimestamp - committedRangeStartTimestamp;
    const viewportWidthFraction = viewportRightFraction - viewportLeftFraction;
    const viewportWidthTimeDuration =
      committedRangeTimeDuration * viewportWidthFraction;

    const insetLeftTimestamp =
      committedRangeStartTimestamp +
      viewportLeftFraction * committedRangeTimeDuration;
    const devPxPerMs =
      viewportWidthTimeDuration !== 0
        ? viewportWidthDevPx / viewportWidthTimeDuration
        : 0;
    const outerRightTimestamp =
      insetLeftTimestamp +
      (devPxPerMs !== 0
        ? (viewportWidthDevPx + insetRightDevPx) / devPxPerMs
        : 0);
    const viewportRightDevPx = insetLeftDevPx + viewportWidthDevPx;

    const viewportTopDevPx = Math.round(viewportTopCssPx * cssToDeviceScale);
    const outerHeightDevPx = Math.round(outerHeightCssPx * cssToDeviceScale);
    const rowHeightFractDevPx = rowHeightCssPx * cssToDeviceScale;

    const rowCount = this.props.markerTimingAndBuckets.length;

    const visibleRowsStart = Math.floor(viewportTopDevPx / rowHeightFractDevPx);
    const visibleRowsEnd = Math.min(
      Math.ceil((viewportTopDevPx + outerHeightDevPx) / rowHeightFractDevPx) +
        1,
      rowCount
    );

    return {
      outerWidthDevPx,
      outerHeightDevPx,

      cssToDeviceScale,

      insetLeftTimestamp,
      insetLeftDevPx,
      devPxPerMs,
      outerRightTimestamp,
      viewportRightDevPx,

      viewportTopDevPx,
      rowHeightFractDevPx,

      visibleRowsStart,
      visibleRowsEnd,
    };
  }

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<HoveredMarkerChartItems>
  ) => {
    const { cssToDeviceScale, cssToUserScale } = scale;
    if (cssToDeviceScale !== cssToUserScale) {
      throw new Error(
        'MarkerChartCanvasImpl sets scaleCtxToCssPixels={false}, so canvas user space units should be equal to device pixels.'
      );
    }

    // Set the font before creating the text renderer. The font property resets
    // automatically whenever the canvas size is changed, so we set it on every
    // call.
    ctx.font = `${FONT_SIZE_CSS * cssToDeviceScale}px sans-serif`;

    const coordinates = this._getViewportCoordinates(cssToDeviceScale);
    const dirtyRows = this._computeDirtyRows(coordinates, hoverInfo);

    // Convert CssPixels to Stack Depth
    const startRow = coordinates.visibleRowsStart;
    const endRow = coordinates.visibleRowsEnd;

    // Common properties that won't be changed later.
    ctx.lineWidth = 1 * cssToDeviceScale;

    if (dirtyRows === null) {
      // All rows need to be redrawn.
      const { outerWidthDevPx, outerHeightDevPx } = coordinates;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outerWidthDevPx, outerHeightDevPx);
    }

    const { hoveredItem } = hoverInfo;
    const hoveredMarker = hoveredItem ? hoveredItem.marker : null;
    const hoveredMarkerIndex = hoveredMarker ? hoveredMarker.markerIndex : null;
    const hoveredMarkerRow = hoveredMarker ? hoveredMarker.rowIndex : null;

    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      if (dirtyRows !== null && !dirtyRows.has(rowIndex)) {
        continue;
      }
      const hasHoveredMarker = rowIndex === hoveredMarkerRow;
      this.drawRow(
        ctx,
        coordinates,
        rowIndex,
        hasHoveredMarker ? hoveredMarkerIndex : null
      );
    }
  };

  drawRow(
    ctx: CanvasRenderingContext2D,
    coordinates: ViewportCoordinates,
    rowIndex: RowIndex,
    hoveredMarkerIndex: MarkerIndex | null
  ) {
    const {
      outerWidthDevPx,
      cssToDeviceScale,
      insetLeftDevPx,
      viewportRightDevPx,
      viewportTopDevPx,
      rowHeightFractDevPx,
    } = coordinates;

    const separatorThicknessDevPx = Math.round(1 * cssToDeviceScale);

    const rowTopDevPx = Math.round(
      rowIndex * rowHeightFractDevPx - viewportTopDevPx
    );
    const rowBottomDevPx = Math.round(
      (rowIndex + 1) * rowHeightFractDevPx - viewportTopDevPx
    );
    const rowHeightDevPx = rowBottomDevPx - rowTopDevPx;
    const rowContentHeightDevPx = rowHeightDevPx - separatorThicknessDevPx;
    const bottomSeparatorY = rowTopDevPx + rowContentHeightDevPx;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, rowTopDevPx, outerWidthDevPx, rowHeightDevPx);
    if (hoveredMarkerIndex !== null) {
      ctx.fillStyle = 'rgba(40, 122, 169, 0.2)';
      ctx.fillRect(0, rowTopDevPx, outerWidthDevPx, rowHeightDevPx);
    }

    const rowCoordinates = {
      rowTopDevPx,
      rowBottomDevPx,
      rowHeightDevPx,
      rowContentHeightDevPx,
    };

    const row = this.props.markerTimingAndBuckets[rowIndex];

    if (typeof row === 'string') {
      this._drawBucketHeader(ctx, coordinates, rowCoordinates, row);
      return;
    }

    if (row.isFirstRowOfName) {
      let markerCount = null;
      if (hoveredMarkerIndex !== null) {
        // This row is hovered. Draw the marker count.
        markerCount = this.countMarkersInBucketStartingAtRow(rowIndex);
      }
      this._drawRowLabel(ctx, coordinates, rowCoordinates, row, markerCount);
    }

    // Draw separators
    ctx.fillStyle = GREY_20;
    // draw vertical separator
    // if (timelineTrackOrganization.type !== 'active-tab') {
    // Don't draw the separator on the right side if we are in the active tab.
    ctx.fillRect(
      insetLeftDevPx - separatorThicknessDevPx,
      rowTopDevPx,
      separatorThicknessDevPx,
      rowHeightDevPx
    );
    // }

    // draw bottom border
    ctx.fillRect(
      0,
      bottomSeparatorY,
      viewportRightDevPx,
      separatorThicknessDevPx
    );

    // draw markers

    // The clip operation forbids drawing in the label zone.
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      insetLeftDevPx,
      rowTopDevPx,
      outerWidthDevPx - insetLeftDevPx,
      rowHeightDevPx
    );
    ctx.clip();

    if (row.instantOnly) {
      this._drawInstantMarkersInRow(
        ctx,
        coordinates,
        rowCoordinates,
        row,
        hoveredMarkerIndex
      );
    } else {
      this._drawIntervalMarkersInRow(
        ctx,
        coordinates,
        rowCoordinates,
        row,
        hoveredMarkerIndex
      );
    }

    ctx.restore();
  }

  _drawIntervalMarkersInRow(
    ctx: CanvasRenderingContext2D,
    coordinates: ViewportCoordinates,
    rowCoordinates: RowCoordinates,
    row: MarkerTiming,
    hoveredMarkerIndex: MarkerIndex | null
  ) {
    const { rightClickedMarkerIndex, selectedMarkerIndex, getMarkerLabel } = this.props;
    const {
      insetLeftTimestamp,
      devPxPerMs,
      outerRightTimestamp,
      cssToDeviceScale,
      insetLeftDevPx,
    } = coordinates;
    const { rowTopDevPx: y, rowContentHeightDevPx: h } = rowCoordinates;

    const textOffsetXDevPx = Math.round(
      TEXT_OFFSET_START_CSS * cssToDeviceScale
    );
    const textOffsetYDevPx = Math.round(TEXT_OFFSET_TOP_CSS * cssToDeviceScale);
    const textMeasurement = this._getTextMeasurement(ctx, cssToDeviceScale);

    let prevMarkerRightDevPx = 0;
    for (let i = 0; i < row.length; i++) {
      const startTimestamp = row.start[i];
      const endTimestamp = row.end[i];
      if (
        endTimestamp <= insetLeftTimestamp ||
        startTimestamp >= outerRightTimestamp
      ) {
        continue;
      }

      const boxLeftFractDevPx =
        insetLeftDevPx + (startTimestamp - insetLeftTimestamp) * devPxPerMs;
      const boxRightFractDevPx =
        insetLeftDevPx + (endTimestamp - insetLeftTimestamp) * devPxPerMs;
      let boxLeftDevPx = snapValueToMultipleOf(boxLeftFractDevPx, 2);
      let boxRightDevPx = snapValueToMultipleOf(boxRightFractDevPx, 2);

      if (boxRightDevPx === boxLeftDevPx) {
        boxRightDevPx = boxLeftDevPx + 2;
      }

      if (boxLeftDevPx < prevMarkerRightDevPx) {
        boxLeftDevPx = prevMarkerRightDevPx
      }
      if (boxRightDevPx <= prevMarkerRightDevPx) {
        continue;
      }
      prevMarkerRightDevPx = boxRightDevPx;

      const markerIndex = row.index[i];
      const isHighlighted =
        markerIndex === hoveredMarkerIndex ||
        markerIndex === selectedMarkerIndex ||
        markerIndex === rightClickedMarkerIndex;

      const boxWidthDevPx = boxRightDevPx - boxLeftDevPx;
      const x = boxLeftDevPx;
      const w = boxWidthDevPx - 0.8;

      ctx.fillStyle = isHighlighted ? BLUE_60 : '#8ac4ff';
      ctx.fillRect(x, y, w, h);

      const visibleX = Math.max(x, insetLeftDevPx);
      const visibleWidth = boxRightDevPx - visibleX;
      const x2 = x + textOffsetXDevPx;
      const w2 = visibleWidth - 2 * textOffsetXDevPx;

      if (w2 > textMeasurement.minWidth) {
        const label = getMarkerLabel(markerIndex);
        const fittedText = textMeasurement.getFittedText(label, w2);
        if (fittedText) {
          ctx.fillStyle = isHighlighted ? 'white' : 'black';
          ctx.fillText(fittedText, x2, y + textOffsetYDevPx);
        }
      }
    }
  }

  _drawInstantMarkersInRow(
    ctx: CanvasRenderingContext2D,
    coordinates: ViewportCoordinates,
    rowCoordinates: RowCoordinates,
    row: MarkerTiming,
    hoveredMarkerIndex: MarkerIndex | null
  ) {
    const { rightClickedMarkerIndex, selectedMarkerIndex } = this.props;
    const {
      insetLeftTimestamp,
      devPxPerMs,
      outerRightTimestamp,
      insetLeftDevPx,
    } = coordinates;
    const { rowTopDevPx: y, rowContentHeightDevPx: h } = rowCoordinates;

    const highlightedMarkers = [];
    for (let i = 0; i < row.length; i++) {
      const timestamp = row.start[i];
      if (timestamp < insetLeftTimestamp || timestamp >= outerRightTimestamp) {
        continue;
      }

      const markerIndex = row.index[i];
      const isHighlighted =
        markerIndex === hoveredMarkerIndex ||
        markerIndex === selectedMarkerIndex ||
        markerIndex === rightClickedMarkerIndex;
      const x = insetLeftDevPx + (timestamp - insetLeftTimestamp) * devPxPerMs;
      if (isHighlighted) {
        highlightedMarkers.push(x);
      } else {
        this._drawOneInstantMarker(ctx, x, y, h, false);
      }
    }
    for (const x of highlightedMarkers) {
      this._drawOneInstantMarker(ctx, x, y, h, true);
    }
  }

  // x indicates the center of this marker
  // y indicates the top of the row
  // h indicates the available height in the row
  _drawOneInstantMarker(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    h: CssPixels,
    isHighlighted: boolean
  ) {
    ctx.fillStyle = isHighlighted ? BLUE_60 : '#8ac4ff';
    ctx.strokeStyle = isHighlighted ? BLUE_80 : MARKER_BORDER_COLOR;

    // We're drawing a diamond shape, whose height is h - 2, and width is h / 2.
    ctx.beginPath();
    ctx.moveTo(x - h / 4, y + h / 2);
    ctx.lineTo(x, y + 1.5);
    ctx.lineTo(x + h / 4, y + h / 2);
    ctx.lineTo(x, y + h - 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Lazily create the text measurement tool, as a valid 2d rendering context must
   * exist before it is created.
   */
  _getTextMeasurement(
    ctx: CanvasRenderingContext2D,
    cssToDeviceScale: number
  ): TextMeasurement {
    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx. We also need to recreate it when the scale
    // changes because we are working with device coordinates.
    if (
      !this._textMeasurement ||
      this._textMeasurementCssToDeviceScale !== cssToDeviceScale
    ) {
      this._textMeasurement = new TextMeasurement(ctx);
      this._textMeasurementCssToDeviceScale = cssToDeviceScale;
    }

    return this._textMeasurement;
  }

  countMarkersInBucketStartingAtRow(rowIndex: number): number {
    const {
      rangeStart,
      rangeEnd,
      markerTimingAndBuckets,
      marginLeft,
      marginRight,
      viewport: { containerWidth, viewportLeft, viewportRight },
    } = this.props;
    // Decide the time range for which markers should be counted.
    const markerContainerWidth = containerWidth - marginLeft - marginRight;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const timeAtViewportLeft: Milliseconds =
      rangeStart + rangeLength * viewportLeft;
    const timeAtViewportRightPlusMargin: Milliseconds =
      rangeStart +
      rangeLength * viewportRight +
      // This represents the amount of seconds in the right margin:
      marginRight * ((viewportLength * rangeLength) / markerContainerWidth);

    const markerTiming = markerTimingAndBuckets[rowIndex];
    if (typeof markerTiming === 'string') {
      return 0;
    }

    const { name } = markerTiming;
    function countMarkersInRange(markerTiming: MarkerTiming): number {
      let count: number = 0;
      for (let i = 0; i < markerTiming.length; i++) {
        if (
          markerTiming.end[i] >= timeAtViewportLeft &&
          markerTiming.start[i] < timeAtViewportRightPlusMargin
        ) {
          ++count;
        }
      }

      return count;
    }
    let count = countMarkersInRange(markerTiming);
    for (let row = rowIndex + 1; row < markerTimingAndBuckets.length; ++row) {
      const markerTiming = markerTimingAndBuckets[row];
      if (typeof markerTiming === 'string' || markerTiming.name !== name) {
        break;
      }
      count += countMarkersInRange(markerTiming);
    }
    return count;
  }

  _drawBucketHeader(
    ctx: CanvasRenderingContext2D,
    coordinates: ViewportCoordinates,
    rowCoordinates: RowCoordinates,
    bucketName: string
  ) {
    const { viewportRightDevPx, insetLeftDevPx, cssToDeviceScale } =
      coordinates;
    const { rowTopDevPx, rowBottomDevPx, rowHeightDevPx } = rowCoordinates;
    const separatorThicknessDevPx = Math.round(1 * cssToDeviceScale);
    // Draw the backgound.
    ctx.fillStyle = GREY_20;
    ctx.fillRect(0, rowTopDevPx, viewportRightDevPx, rowHeightDevPx);

    // Draw the borders.
    ctx.fillStyle = GREY_30;
    const bottomSeparatorY = rowBottomDevPx - separatorThicknessDevPx;
    const prevRowBottomSeparatorY = rowTopDevPx - separatorThicknessDevPx;
    ctx.fillRect(
      0,
      prevRowBottomSeparatorY,
      viewportRightDevPx,
      separatorThicknessDevPx
    );
    ctx.fillRect(
      0,
      bottomSeparatorY,
      viewportRightDevPx,
      separatorThicknessDevPx
    );

    // Draw the text.
    ctx.fillStyle = '#000000';
    const labelPaddingDevPx = Math.round(LABEL_PADDING_CSS * cssToDeviceScale);
    const textOffsetYDevPx = Math.round(TEXT_OFFSET_TOP_CSS * cssToDeviceScale);
    ctx.fillText(
      bucketName,
      insetLeftDevPx + labelPaddingDevPx,
      rowTopDevPx + textOffsetYDevPx
    );
  }

  _drawRowLabel(
    ctx: CanvasRenderingContext2D,
    coordinates: ViewportCoordinates,
    rowCoordinates: RowCoordinates,
    row: MarkerTiming,
    markerCountIfShouldBeDrawn: number | null
  ) {
    const { insetLeftDevPx, cssToDeviceScale } = coordinates;
    const { rowTopDevPx: y } = rowCoordinates;
    const countString =
      markerCountIfShouldBeDrawn !== null
        ? ` (${markerCountIfShouldBeDrawn})`
        : '';
    const textMeasurement = this._getTextMeasurement(ctx, cssToDeviceScale);
    const countStringWidthDevPx = countString
      ? textMeasurement.getTextWidth(countString)
      : 0;
    const labelPaddingDevPx = Math.round(LABEL_PADDING_CSS * cssToDeviceScale);
    const textOffsetYDevPx = Math.round(TEXT_OFFSET_TOP_CSS * cssToDeviceScale);

    const name = row.name;
    const fittedLabel = textMeasurement.getFittedText(
      name,
      insetLeftDevPx - labelPaddingDevPx - countStringWidthDevPx
    );
    const fittedLabelAndCount = fittedLabel + countString;

    // if (timelineTrackOrganization.type === 'active-tab') {
    //   // Draw the text backgound for active tab.
    //   ctx.fillStyle = '#ffffffbf'; // white with 75% opacity
    //   const textWidth = textMeasurement.getTextWidth(fittedText);
    //   ctx.fillRect(0, y, textWidth + LABEL_PADDING * 2, rowHeight);
    // }

    ctx.fillStyle = '#000000';
    ctx.fillText(fittedLabelAndCount, labelPaddingDevPx, y + textOffsetYDevPx);
  }

  hitTest = (x: CssPixels, y: CssPixels): HoveredMarkerChartItems | null => {
    const {
      rangeStart,
      rangeEnd,
      markerTimingAndBuckets,
      rowHeight,
      marginLeft,
      marginRight,
      timelineTrackOrganization,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;

    // Note: we may want to increase this value to hit markers that are farther.
    const dotRadius: CssPixels = MARKER_DOT_RADIUS_CSS * rowHeight;
    if (x < marginLeft - dotRadius) {
      return null;
    }

    let markerIndex = null;
    let labelRow = null;
    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;

    // Reminder: this is a value between 0 and 1, and represents a percentage of
    // the full time range.
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // This is the x position in terms of unit interval (so, between 0 and 1).
    const xInUnitInterval: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * ((x - marginLeft) / markerContainerWidth);

    const dotRadiusInTime =
      (dotRadius / markerContainerWidth) * viewportLength * rangeLength;

    const xInTime: Milliseconds = rangeStart + xInUnitInterval * rangeLength;
    const rowIndex = Math.floor((y + viewportTop) / rowHeight);

    const markerTiming = markerTimingAndBuckets[rowIndex];

    if (
      !markerTiming ||
      typeof markerTiming === 'string' ||
      !markerTiming.length
    ) {
      return null;
    }

    // This is a small utility function to define if some marker timing is in
    // our hit test range.
    const isMarkerTimingInDotRadius = (index) =>
      markerTiming.start[index] < xInTime + dotRadiusInTime &&
      markerTiming.end[index] > xInTime - dotRadiusInTime;

    // A markerTiming line is ordered.
    // 1. Let's find a marker reasonably close to our mouse cursor.
    // The result of this bisection gives the first marker that starts _after_
    // our mouse cursor. Our result will be either this marker, or the previous
    // one.
    const nextStartIndex = bisectionRight(markerTiming.start, xInTime);

    if (nextStartIndex > 0 && nextStartIndex < markerTiming.length) {
      // 2. This is the common case: 2 markers are candidates. Then we measure
      // the distance between them and the mouse cursor and chose the smallest
      // distance.
      const prevStartIndex = nextStartIndex - 1;

      // Note that these values can be negative if the cursor is _inside_ a
      // marker. There should be one at most in this case, and we'll want it. So
      // NO Math.abs here.
      const distanceToNext = markerTiming.start[nextStartIndex] - xInTime;
      const distanceToPrev = xInTime - markerTiming.end[prevStartIndex];

      const closest =
        distanceToPrev < distanceToNext ? prevStartIndex : nextStartIndex;

      // 3. When we found the closest, we still have to check if it's in close
      // enough!
      if (isMarkerTimingInDotRadius(closest)) {
        markerIndex = markerTiming.index[closest];
      }
    } else if (nextStartIndex === 0) {
      // 4. Special case 1: the mouse cursor is at the left of all markers in
      // this line. Then, we have only 1 candidate, we can check if it's inside
      // our hit test range right away.
      if (isMarkerTimingInDotRadius(nextStartIndex)) {
        markerIndex = markerTiming.index[nextStartIndex];
      }
    } else {
      // 5. Special case 2: the mouse cursor is at the right of all markers in
      // this line. Then we only have 1 candidate as well, let's check if it's
      // inside our hit test range.
      if (isMarkerTimingInDotRadius(nextStartIndex - 1)) {
        markerIndex = markerTiming.index[nextStartIndex - 1];
      }
    }

    if (timelineTrackOrganization.type === 'active-tab') {
      // We can also hover over a marker label on active tab view. That's why we
      // also need to hit test for the labels. On active tab view, markers and
      // labels can overlap with each other. Because of that, we need to hide
      // the texts if we are hovering them to make the markers more visible.
      const prevMarkerTiming = markerTimingAndBuckets[rowIndex - 1];
      if (
        // Only the first row of a marker type has label, so we are checking
        // if we changed the marker type.
        prevMarkerTiming.name !== markerTiming.name &&
        // We don't have the canvas context in this function, but if we are doing
        // the hit testing, that means we already rendered the chart and therefore
        // we initialized `this._textMeasurement`. But we are checking it just in case.
        this._textMeasurement
      ) {
        const textWidth = this._textMeasurement.getTextWidth(markerTiming.name);
        if (x < textWidth + LABEL_PADDING_CSS * 2) {
          labelRow = rowIndex;
        }
      }
    }

    if (markerIndex === null && labelRow === null) {
      // If both of them are null, return a null instead of `[null, null]`.
      // That's because shared canvas component only understands that.
      return null;
    }

    const marker = markerIndex !== null ? { markerIndex, rowIndex } : null;

    // Yes, we are returning a new object all the time when we do the hit testing.
    // I can hear you say "How does equality check work for old and new hovered
    // items then?". Well, on the shared canvas component we have a function
    // called `hoveredItemsAreEqual` that shallowly checks for equality of
    // objects and arrays. So it's safe to return a new object all the time.
    return { marker, labelRow };
  };

  onMouseMove = (event: { nativeEvent: MouseEvent }) => {
    const {
      changeMouseTimePosition,
      rangeStart,
      rangeEnd,
      marginLeft,
      marginRight,
      viewport: { viewportLeft, viewportRight, containerWidth },
    } = this.props;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const markerContainerWidth = containerWidth - marginLeft - marginRight;
    // This is the x position in terms of unit interval (so, between 0 and 1).
    const xInUnitInterval: UnitIntervalOfProfileRange =
      viewportLeft +
      viewportLength *
        ((event.nativeEvent.offsetX - marginLeft) / markerContainerWidth);

    if (xInUnitInterval < 0 || xInUnitInterval > 1) {
      changeMouseTimePosition(null);
    } else {
      const rangeLength: Milliseconds = rangeEnd - rangeStart;
      const xInTime: Milliseconds = rangeStart + xInUnitInterval * rangeLength;
      changeMouseTimePosition(xInTime);
    }
  };

  onMouseLeave = () => {
    this.props.changeMouseTimePosition(null);
  };

  onDoubleClickMarker = (hoveredItems: HoveredMarkerChartItems | null) => {
    const markerIndex =
      hoveredItems === null ? null : (hoveredItems.marker?.markerIndex ?? null);
    if (markerIndex === null) {
      return;
    }
    const { getMarker, updatePreviewSelection, rangeStart, rangeEnd } =
      this.props;
    const marker = getMarker(markerIndex);
    const { start, end } = getStartEndRangeForMarker(
      rangeStart,
      rangeEnd,
      marker
    );

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: start,
      selectionEnd: end,
    });
  };

  onSelectItem = (hoveredItems: HoveredMarkerChartItems | null) => {
    const markerIndex =
      hoveredItems === null ? null : (hoveredItems.marker?.markerIndex ?? null);
    const { changeSelectedMarker, threadsKey } = this.props;
    changeSelectedMarker(threadsKey, markerIndex, { source: 'pointer' });
  };

  onRightClickMarker = (hoveredItems: HoveredMarkerChartItems | null) => {
    const markerIndex =
      hoveredItems === null ? null : (hoveredItems.marker?.markerIndex ?? null);
    const { changeRightClickedMarker, threadsKey } = this.props;
    changeRightClickedMarker(threadsKey, markerIndex);
  };

  getHoveredMarkerInfo = (
    hoveredItems: HoveredMarkerChartItems
  ): React.Node => {
    if (!this.props.shouldDisplayTooltips() || hoveredItems.marker === null) {
      return null;
    }

    const markerIndex = hoveredItems.marker.markerIndex;
    const marker = this.props.getMarker(markerIndex);
    return (
      <TooltipMarker
        markerIndex={markerIndex}
        marker={marker}
        threadsKey={this.props.threadsKey}
        restrictHeightWidth={true}
      />
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
        scaleCtxToCssPixels={false}
        onSelectItem={this.onSelectItem}
        onDoubleClickItem={this.onDoubleClickMarker}
        onRightClick={this.onRightClickMarker}
        getHoveredItemInfo={this.getHoveredMarkerInfo}
        drawCanvas={this.drawCanvas}
        hitTest={this.hitTest}
        onMouseMove={this.onMouseMove}
        onMouseLeave={this.onMouseLeave}
        stickyTooltips={true}
      />
    );
  }
}

export const MarkerChartCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props,
>)(MarkerChartCanvasImpl);
