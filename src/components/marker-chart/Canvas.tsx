/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  GREY_20,
  GREY_30,
  GREY_60,
  GREY_90,
  BLUE_60,
  BLUE_80,
  GREY_70,
} from 'photon-colors';
import { getForegroundColor, getBackgroundColor } from '../../utils/colors';
import { isDarkMode, lightDark } from '../../utils/dark-mode';
import * as React from 'react';
import {
  withChartViewport,
  type Viewport,
} from 'firefox-profiler/components/shared/chart/Viewport';
import { ChartCanvas } from 'firefox-profiler/components/shared/chart/Canvas';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import TextMeasurement from 'firefox-profiler/utils/text-measurement';
import { bisectionLeft, bisectionRight } from 'firefox-profiler/utils/bisect';
import { snap } from 'firefox-profiler/utils/device-pixels';
import memoize from 'memoize-immutable';
import type {
  updatePreviewSelection,
  changeRightClickedMarker,
  changeMouseTimePosition,
  changeSelectedMarker,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';

type UpdatePreviewSelection = typeof updatePreviewSelection;
type ChangeRightClickedMarker = typeof changeRightClickedMarker;
type ChangeMouseTimePosition = typeof changeMouseTimePosition;
type ChangeSelectedMarker = typeof changeSelectedMarker;
import { TIMELINE_MARGIN_LEFT } from 'firefox-profiler/app-logic/constants';
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
  MarkerSchemaByName,
  GraphColor,
  Thread,
  IndexIntoStackTable,
} from 'firefox-profiler/types';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';
import { getStartEndRangeForMarker } from 'firefox-profiler/utils';
import {
  getStrokeColor,
  getFillColor,
  getDotColor,
  getTextColor,
  isValidGraphColor,
} from 'firefox-profiler/profile-logic/graph-color';
import { getSchemaFromMarker } from 'firefox-profiler/profile-logic/marker-schema';
import { getBottomBoxInfoForStackFrame } from 'firefox-profiler/profile-logic/bottom-box';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type { WrapFunctionInDispatch } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly markerTimingAndBuckets: MarkerTimingAndBuckets;
  readonly rowHeight: CssPixels;
  readonly getMarker: (param: MarkerIndex) => Marker;
  readonly getMarkerLabel: (param: MarkerIndex) => string;
  readonly markerSchemaByName: MarkerSchemaByName;
  readonly markerListLength: number;
  readonly threadsKey: ThreadsKey;
  readonly updatePreviewSelection: WrapFunctionInDispatch<UpdatePreviewSelection>;
  readonly changeMouseTimePosition: ChangeMouseTimePosition;
  readonly changeSelectedMarker: ChangeSelectedMarker;
  readonly changeRightClickedMarker: ChangeRightClickedMarker;
  readonly marginLeft: CssPixels;
  readonly marginRight: CssPixels;
  readonly selectedMarkerIndex: MarkerIndex | null;
  readonly rightClickedMarkerIndex: MarkerIndex | null;
  readonly shouldDisplayTooltips: () => boolean;
  readonly thread: Thread;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly selectedTab: TabSlug;
};

type Props = OwnProps & {
  // Bring in the viewport props from the higher order Viewport component.
  readonly viewport: Viewport;
};

const TEXT_OFFSET_TOP = 11;
const TEXT_OFFSET_START = 3;
const MARKER_DOT_RADIUS = 0.25;
const LABEL_PADDING = 5;
const MARKER_BORDER_COLOR = '#2c77d1';
const DEFAULT_FILL_COLOR = '#8ac4ff'; // Light blue for non-highlighted
const FONT_SIZE = 10;

/**
 * The chart geometry in device pixels. It's computed once per drawCanvas call
 * and shared by the functions that draw the individual rows.
 */
type DeviceCoordinates = {
  readonly cssToDeviceScale: number;
  readonly containerWidth: DevicePixels;
  readonly containerHeight: DevicePixels;
  // The left edge of the area in which markers are drawn. The marker names are
  // drawn to the left of it.
  readonly marginLeft: DevicePixels;
  // The right edge of the separators and of the bucket headers.
  readonly separatorRight: DevicePixels;
  // The times at marginLeft and at the right edge of the container.
  readonly timeAtMarginLeft: Milliseconds;
  readonly timeAtContainerRight: Milliseconds;
  readonly devicePixelsPerMs: number;
  readonly viewportTop: DevicePixels;
  // This is not snapped to an integer. See _getRowTop.
  readonly rowHeight: DevicePixels;
  // One CSS pixel, rounded to whole device pixels.
  readonly lineWidth: DevicePixels;
};

function getSeparatorColor() {
  return lightDark(GREY_20, GREY_70);
}

function getBucketBackgroundColor() {
  return lightDark(GREY_20, GREY_70);
}

function getBucketBorderColor() {
  return lightDark(GREY_30, GREY_60);
}

function getHighlightRowBackgroundColor() {
  return 'rgba(40, 122, 169, 0.2)';
}

function getDefaultMarkerColors(isHighlighted: boolean) {
  if (isDarkMode()) {
    return {
      fillColor: isHighlighted ? 'hsl(208, 81%, 52%)' : 'hsl(208, 88%, 32%)',
      strokeColor: isHighlighted ? 'hsl(208, 82%, 58%)' : 'hsl(208, 71%, 40%)',
      textColor: isHighlighted ? GREY_90 : GREY_20,
    };
  }
  return {
    fillColor: isHighlighted ? BLUE_60 : DEFAULT_FILL_COLOR,
    strokeColor: isHighlighted ? BLUE_80 : MARKER_BORDER_COLOR,
    textColor: isHighlighted ? 'white' : 'black', // White text on dark blue, black text on light blue
  };
}

class MarkerChartCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: TextMeasurement | null = null;
  _textMeasurementCssToDeviceScale: number = 1;

  override componentDidUpdate(prevProps: Props) {
    const viewportDidMount =
      !prevProps.viewport.isSizeSet && this.props.viewport.isSizeSet;
    const viewportResized =
      this.props.viewport.isSizeSet &&
      this.props.viewport.containerHeight !==
        prevProps.viewport.containerHeight;
    const selectedMarkerChanged =
      this.props.selectedMarkerIndex !== prevProps.selectedMarkerIndex;

    if (viewportDidMount || viewportResized || selectedMarkerChanged) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const { selectedMarkerIndex, markerTimingAndBuckets, rowHeight, viewport } =
      this.props;

    if (selectedMarkerIndex === null) {
      return;
    }

    const markerIndexToTimingRow = this._getMarkerIndexToTimingRow(
      markerTimingAndBuckets
    );
    const rowIndex = markerIndexToTimingRow[selectedMarkerIndex];

    if (rowIndex === undefined) {
      return;
    }

    const y: CssPixels = rowIndex * rowHeight;
    const { viewportTop, viewportBottom } = viewport;

    if (y < viewportTop || y + rowHeight > viewportBottom) {
      // Scroll the marker to the vertical center of the viewport.
      const viewportHeight = viewportBottom - viewportTop;
      const targetViewportTop = y + rowHeight / 2 - viewportHeight / 2;
      viewport.moveViewport(0, viewportTop - targetViewportTop);
    }
  };

  /**
   * Get the fill, stroke, and text colors for a marker based on its schema and data.
   * If the marker schema has a colorField, use that field's value.
   * Otherwise use the marker schema's color.
   * Fall back to default blue if no color is specified.
   */
  _getMarkerColors(
    markerIndex: MarkerIndex,
    isHighlighted: boolean
  ): {
    fillColor: string;
    strokeColor: string;
    textColor: string;
  } {
    const { getMarker, markerSchemaByName } = this.props;
    const marker = getMarker(markerIndex);

    let color: GraphColor | null = null;

    // Try to get color from the marker schema's colorField
    const schema = getSchemaFromMarker(markerSchemaByName, marker.data);

    if (
      schema &&
      schema.colorField &&
      marker.data &&
      typeof marker.data === 'object'
    ) {
      // Use type assertion to safely access dynamic property
      const fieldValue = (marker.data as any)[schema.colorField];
      // Validate that the field value is a valid GraphColor
      if (typeof fieldValue === 'string' && isValidGraphColor(fieldValue)) {
        color = fieldValue as GraphColor;
      }
    }

    if (
      color === null &&
      schema?.color !== undefined &&
      isValidGraphColor(schema.color)
    ) {
      color = schema.color;
    }

    if (color) {
      if (isHighlighted) {
        return {
          fillColor: getStrokeColor(color),
          strokeColor: getDotColor(color),
          textColor: getTextColor(color), // Use appropriate contrast color when highlighted
        };
      }
      return {
        fillColor: getFillColor(color),
        strokeColor: getStrokeColor(color),
        textColor: getForegroundColor(), // Always use black/white text for unselected markers
      };
    }
    // Fall back to default blue colors
    return getDefaultMarkerColors(isHighlighted);
  }

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<MarkerIndex>
  ) => {
    const { markerTimingAndBuckets, rightClickedMarkerIndex } = this.props;
    const {
      hoveredItem: hoveredMarker,
      prevHoveredItem: prevHoveredMarker,
      isHoveredOnlyDifferent,
    } = hoverInfo;

    const { cssToDeviceScale, cssToUserScale } = scale;
    if (cssToDeviceScale !== cssToUserScale) {
      throw new Error(
        'MarkerChartCanvasImpl sets scaleCtxToCssPixels={false}, so canvas user space units should be equal to device pixels.'
      );
    }

    // The font property resets automatically whenever the canvas size is
    // changed, so we set it on every call.
    ctx.font = `${FONT_SIZE * cssToDeviceScale}px sans-serif`;

    const coords = this._getDeviceCoordinates(cssToDeviceScale);
    const markerIndexToTimingRow = this._getMarkerIndexToTimingRow(
      markerTimingAndBuckets
    );
    const hoveredRow =
      hoveredMarker === null ? null : markerIndexToTimingRow[hoveredMarker];
    const rightClickedRow =
      rightClickedMarkerIndex === null
        ? null
        : markerIndexToTimingRow[rightClickedMarkerIndex];

    if (isHoveredOnlyDifferent) {
      // Only the hover state changed. Redraw just the rows of the previously
      // and the newly hovered markers.
      const prevHoveredRow =
        prevHoveredMarker === null
          ? null
          : markerIndexToTimingRow[prevHoveredMarker];
      if (hoveredRow !== null) {
        this._drawRow(
          ctx,
          coords,
          hoveredRow,
          hoveredMarker,
          hoveredRow,
          rightClickedRow
        );
      }
      if (prevHoveredRow !== null && prevHoveredRow !== hoveredRow) {
        this._drawRow(
          ctx,
          coords,
          prevHoveredRow,
          hoveredMarker,
          hoveredRow,
          rightClickedRow
        );
      }
      return;
    }

    const { containerWidth, containerHeight, rowHeight, viewportTop } = coords;
    ctx.fillStyle = getBackgroundColor();
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    const rowCount = markerTimingAndBuckets.length;
    const startRow = Math.max(0, Math.floor(viewportTop / rowHeight));
    const endRow = Math.min(
      Math.ceil((viewportTop + containerHeight) / rowHeight) + 1,
      rowCount
    );
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      this._drawRow(
        ctx,
        coords,
        rowIndex,
        hoveredMarker,
        hoveredRow,
        rightClickedRow
      );
    }

    // Continue the vertical separator between the labels and the markers
    // below the last row.
    const rowsBottom = Math.max(0, this._getRowTop(coords, rowCount));
    if (rowsBottom < containerHeight) {
      const { marginLeft, lineWidth } = coords;
      ctx.fillStyle = getSeparatorColor();
      ctx.fillRect(
        marginLeft - lineWidth,
        rowsBottom,
        lineWidth,
        containerHeight - rowsBottom
      );
    }
  };

  _getDeviceCoordinates(cssToDeviceScale: number): DeviceCoordinates {
    const {
      rangeStart,
      rangeEnd,
      rowHeight,
      marginLeft,
      marginRight,
      viewport: {
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
        viewportTop,
      },
    } = this.props;

    // Round the same way as ChartCanvas does when it sizes the canvas.
    const deviceContainerWidth = Math.floor(containerWidth * cssToDeviceScale);
    const deviceContainerHeight = Math.floor(
      containerHeight * cssToDeviceScale
    );
    const deviceMarginLeft = snap(marginLeft * cssToDeviceScale);
    const deviceMarginRight = snap(marginRight * cssToDeviceScale);
    const deviceInnerWidth =
      deviceContainerWidth - deviceMarginLeft - deviceMarginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const timeAtMarginLeft: Milliseconds =
      rangeStart + rangeLength * viewportLeft;
    const viewportDuration: Milliseconds =
      rangeLength * (viewportRight - viewportLeft);
    const devicePixelsPerMs =
      viewportDuration > 0 ? deviceInnerWidth / viewportDuration : 0;
    const timeAtContainerRight: Milliseconds =
      devicePixelsPerMs > 0
        ? timeAtMarginLeft +
          (deviceContainerWidth - deviceMarginLeft) / devicePixelsPerMs
        : timeAtMarginLeft;

    return {
      cssToDeviceScale,
      containerWidth: deviceContainerWidth,
      containerHeight: deviceContainerHeight,
      marginLeft: deviceMarginLeft,
      separatorRight: deviceContainerWidth - deviceMarginRight,
      timeAtMarginLeft,
      timeAtContainerRight,
      devicePixelsPerMs,
      viewportTop: snap(viewportTop * cssToDeviceScale),
      rowHeight: rowHeight * cssToDeviceScale,
      lineWidth: Math.max(1, snap(cssToDeviceScale)),
    };
  }

  /**
   * Rows are snapped to device pixels individually, relative to the top of the
   * chart, so that each row keeps its height while scrolling.
   */
  _getRowTop(coords: DeviceCoordinates, rowIndex: number): DevicePixels {
    return snap(rowIndex * coords.rowHeight) - coords.viewportTop;
  }

  /**
   * Draw everything inside the row's area: the background, the markers, the
   * label and the separators. This fully covers what was drawn there before,
   * so a single row can be redrawn when only the hover state changes.
   *
   * Each row draws the separator at its bottom edge. The separator at the top
   * edge of the first row is drawn using CSS.
   */
  _drawRow(
    ctx: CanvasRenderingContext2D,
    coords: DeviceCoordinates,
    rowIndex: number,
    hoveredMarker: MarkerIndex | null,
    hoveredRow: number | null,
    rightClickedRow: number | null
  ) {
    const { markerTimingAndBuckets } = this.props;
    const { containerWidth, marginLeft, separatorRight, lineWidth } = coords;
    const rowTop = this._getRowTop(coords, rowIndex);
    const separatorTop = this._getRowTop(coords, rowIndex + 1) - lineWidth;
    const contentHeight = separatorTop - rowTop;
    const textTop = rowTop + snap(TEXT_OFFSET_TOP * coords.cssToDeviceScale);
    const labelPadding = snap(LABEL_PADDING * coords.cssToDeviceScale);

    const row = markerTimingAndBuckets[rowIndex];
    if (typeof row === 'string') {
      // This is a bucket header. Its top border is the separator of the
      // previous row.
      ctx.fillStyle = getBucketBackgroundColor();
      ctx.fillRect(0, rowTop, separatorRight, contentHeight);
      ctx.fillStyle = getBucketBorderColor();
      ctx.fillRect(0, separatorTop, separatorRight, lineWidth);
      ctx.fillStyle = getForegroundColor();
      ctx.fillText(row, marginLeft + labelPadding, textTop);
      return;
    }

    ctx.fillStyle = getBackgroundColor();
    ctx.fillRect(0, rowTop, containerWidth, contentHeight);
    if (rowIndex === hoveredRow || rowIndex === rightClickedRow) {
      ctx.fillStyle = getHighlightRowBackgroundColor();
      ctx.fillRect(0, rowTop, containerWidth, contentHeight);
    }

    // The clip operation forbids drawing in the label zone.
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginLeft, rowTop, containerWidth - marginLeft, contentHeight);
    ctx.clip();
    this._drawMarkersInRow(
      ctx,
      coords,
      row,
      rowTop,
      contentHeight,
      hoveredMarker
    );
    ctx.restore();

    // Draw the separators. If the next row is a bucket header, this separator
    // is the header's top border.
    ctx.fillStyle = getSeparatorColor();
    ctx.fillRect(marginLeft - lineWidth, rowTop, lineWidth, contentHeight);
    const nextRow = markerTimingAndBuckets[rowIndex + 1];
    ctx.fillStyle =
      typeof nextRow === 'string'
        ? getBucketBorderColor()
        : getSeparatorColor();
    ctx.fillRect(0, separatorTop, separatorRight, lineWidth);

    // Draw the marker name in the left margin, for the first row of each name.
    const prevRow = rowIndex > 0 ? markerTimingAndBuckets[rowIndex - 1] : null;
    if (
      prevRow === null ||
      typeof prevRow === 'string' ||
      prevRow.name !== row.name
    ) {
      const textMeasurement = this._getTextMeasurement(
        ctx,
        coords.cssToDeviceScale
      );
      const countString =
        rowIndex === hoveredRow
          ? ` (${this.countMarkersInBucketStartingAtRow(rowIndex)})`
          : '';
      const maxLabelWidth =
        snap(TIMELINE_MARGIN_LEFT * coords.cssToDeviceScale) -
        labelPadding -
        (countString ? textMeasurement.getTextWidth(countString) : 0);
      const fittedText =
        textMeasurement.getFittedText(row.name, maxLabelWidth) + countString;
      ctx.fillStyle = getForegroundColor();
      ctx.fillText(fittedText, labelPadding, textTop);
    }
  }

  _drawMarkersInRow(
    ctx: CanvasRenderingContext2D,
    coords: DeviceCoordinates,
    markerTiming: MarkerTiming,
    rowTop: DevicePixels,
    contentHeight: DevicePixels,
    hoveredMarker: MarkerIndex | null
  ) {
    const { rightClickedMarkerIndex, selectedMarkerIndex } = this.props;
    const {
      marginLeft,
      timeAtMarginLeft,
      timeAtContainerRight,
      devicePixelsPerMs,
    } = coords;

    // Only draw the markers that are horizontally within view. The markers in
    // a row don't overlap, so both the start and the end times are sorted.
    // Instant markers are drawn as diamonds that extend beyond their timestamp,
    // so include markers that are up to half a diamond width out of view.
    const diamondHalfWidthInTime =
      devicePixelsPerMs > 0 ? contentHeight / 4 / devicePixelsPerMs : 0;
    const startIndex = bisectionLeft(
      markerTiming.end,
      timeAtMarginLeft - diamondHalfWidthInTime
    );
    const endIndex = bisectionLeft(
      markerTiming.start,
      timeAtContainerRight + diamondHalfWidthInTime
    );

    // Track the last drawn positions, so that we can avoid drawing markers
    // which would be completely covered by the previous marker.
    let prevInstantMarkerX: DevicePixels | null = null;
    let prevIntervalMarkerRight: DevicePixels = -Infinity;
    const highlightedMarkerTimingIndexes = [];

    for (let i = startIndex; i < endIndex; i++) {
      const markerIndex = markerTiming.index[i];
      if (
        markerIndex === hoveredMarker ||
        markerIndex === selectedMarkerIndex ||
        markerIndex === rightClickedMarkerIndex
      ) {
        // Draw highlighted markers after the normal markers so that they stand
        // out more.
        highlightedMarkerTimingIndexes.push(i);
        continue;
      }

      const startTime = markerTiming.start[i];
      const endTime = markerTiming.end[i];
      const left = snap(
        marginLeft + (startTime - timeAtMarginLeft) * devicePixelsPerMs
      );
      if (startTime === endTime) {
        if (left === prevInstantMarkerX) {
          continue;
        }
        prevInstantMarkerX = left;
        this._drawInstantMarker(
          ctx,
          coords,
          left,
          rowTop,
          contentHeight,
          markerIndex,
          false
        );
      } else {
        const right = Math.max(
          left + 1,
          snap(marginLeft + (endTime - timeAtMarginLeft) * devicePixelsPerMs)
        );
        if (right <= prevIntervalMarkerRight) {
          continue;
        }
        prevIntervalMarkerRight = right;
        this._drawIntervalMarker(
          ctx,
          coords,
          left,
          right,
          rowTop,
          contentHeight,
          markerIndex,
          false
        );
      }
    }

    for (const i of highlightedMarkerTimingIndexes) {
      const startTime = markerTiming.start[i];
      const endTime = markerTiming.end[i];
      const markerIndex = markerTiming.index[i];
      const left = snap(
        marginLeft + (startTime - timeAtMarginLeft) * devicePixelsPerMs
      );
      if (startTime === endTime) {
        this._drawInstantMarker(
          ctx,
          coords,
          left,
          rowTop,
          contentHeight,
          markerIndex,
          true
        );
      } else {
        const right = Math.max(
          left + 1,
          snap(marginLeft + (endTime - timeAtMarginLeft) * devicePixelsPerMs)
        );
        this._drawIntervalMarker(
          ctx,
          coords,
          left,
          right,
          rowTop,
          contentHeight,
          markerIndex,
          true
        );
      }
    }
  }

  // Note: we used a long argument list instead of an object parameter on
  // purpose, to reduce GC pressure while drawing.
  _drawIntervalMarker(
    ctx: CanvasRenderingContext2D,
    coords: DeviceCoordinates,
    left: DevicePixels,
    right: DevicePixels,
    rowTop: DevicePixels,
    contentHeight: DevicePixels,
    markerIndex: MarkerIndex,
    isHighlighted: boolean
  ) {
    const { marginLeft, lineWidth, cssToDeviceScale } = coords;
    const { fillColor, strokeColor, textColor } = this._getMarkerColors(
      markerIndex,
      isHighlighted
    );

    // Leave a gap of one line width above and below the marker.
    const top = rowTop + lineWidth;
    const height = contentHeight - 2 * lineWidth;
    const width = right - left;

    if (width <= 2 * lineWidth) {
      // This marker is too narrow to have an inside part: with a border on
      // both sides, it would be only border. So draw it as a solid rect in
      // the border color.
      ctx.fillStyle = strokeColor;
      ctx.fillRect(left, top, width, height);
      return;
    }

    // The fill color can be translucent, so don't let the fill and the border
    // overlap. The stroke is centered on the path, so inset the path by half
    // the line width to make the border cover whole device pixels.
    ctx.fillStyle = fillColor;
    ctx.fillRect(
      left + lineWidth,
      top + lineWidth,
      width - 2 * lineWidth,
      height - 2 * lineWidth
    );
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(
      left + lineWidth / 2,
      top + lineWidth / 2,
      width - lineWidth,
      height - lineWidth
    );

    // Draw the text label, constrained to the visible part of the marker.
    // TODO - L10N RTL.
    const visibleLeft = Math.max(left, marginLeft);
    const textPadding = snap(TEXT_OFFSET_START * cssToDeviceScale);
    const textWidth = right - visibleLeft - 2 * textPadding;
    const textMeasurement = this._getTextMeasurement(ctx, cssToDeviceScale);
    if (textWidth > textMeasurement.minWidth) {
      const fittedText = textMeasurement.getFittedText(
        this.props.getMarkerLabel(markerIndex),
        textWidth
      );
      if (fittedText) {
        ctx.fillStyle = textColor;
        ctx.fillText(
          fittedText,
          visibleLeft + textPadding,
          rowTop + snap(TEXT_OFFSET_TOP * cssToDeviceScale)
        );
      }
    }
  }

  // x indicates the center of this marker
  // rowTop indicates the top of the row
  // contentHeight indicates the available height in the row
  _drawInstantMarker(
    ctx: CanvasRenderingContext2D,
    coords: DeviceCoordinates,
    x: DevicePixels,
    rowTop: DevicePixels,
    contentHeight: DevicePixels,
    markerIndex: MarkerIndex,
    isHighlighted: boolean
  ) {
    const { fillColor, strokeColor } = this._getMarkerColors(
      markerIndex,
      isHighlighted
    );
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = coords.cssToDeviceScale;

    // We're drawing a diamond shape, whose height is about contentHeight - 3
    // CSS pixels, and whose width is contentHeight / 2.
    const verticalInset = 1.5 * coords.cssToDeviceScale;
    const h = contentHeight;
    ctx.beginPath();
    ctx.moveTo(x - h / 4, rowTop + h / 2);
    ctx.lineTo(x, rowTop + verticalInset);
    ctx.lineTo(x + h / 4, rowTop + h / 2);
    ctx.lineTo(x, rowTop + h - verticalInset);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * When re-drawing markers, it's helpful to isolate the operations to a single row
   * in order to make the drawing faster. This memoized function computes the map
   * of a marker index to its row in the marker timing.
   */
  _getMarkerIndexToTimingRow = memoize(
    (
      markerTimingAndBuckets: MarkerTimingAndBuckets
    ): Uint32Array /* like Map<MarkerIndex, RowIndex> */ => {
      const markerIndexToTimingRow = new Uint32Array(
        this.props.markerListLength
      );
      for (
        let rowIndex = 0;
        rowIndex < markerTimingAndBuckets.length;
        rowIndex++
      ) {
        const markerTiming = markerTimingAndBuckets[rowIndex];
        if (typeof markerTiming === 'string') {
          continue;
        }
        for (
          let timingIndex = 0;
          timingIndex < markerTiming.length;
          timingIndex++
        ) {
          markerIndexToTimingRow[markerTiming.index[timingIndex]] = rowIndex;
        }
      }
      return markerIndexToTimingRow;
    },
    { cache: new WeakMap() }
  );

  /**
   * Lazily create the text measurement tool, as a valid 2d rendering context must
   * exist before it is created. We also need to recreate it when the scale
   * changes, because we are working with device coordinates.
   */
  _getTextMeasurement(
    ctx: CanvasRenderingContext2D,
    cssToDeviceScale: number
  ): TextMeasurement {
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

    // Note: we may want to increase this value to hit markers that are farther.
    const dotRadius: CssPixels = MARKER_DOT_RADIUS * rowHeight;
    if (x < marginLeft - dotRadius) {
      return null;
    }

    let markerIndex = null;
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
    const isMarkerTimingInDotRadius = (index: number) =>
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

    return markerIndex;
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

  onDoubleClickMarker = (markerIndex: MarkerIndex | null) => {
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
      isModifying: false,
      selectionStart: start,
      selectionEnd: end,
    });
  };

  onSelectItem = (markerIndex: MarkerIndex | null) => {
    const { changeSelectedMarker, threadsKey } = this.props;
    changeSelectedMarker(threadsKey, markerIndex, { source: 'pointer' });
  };

  onRightClickMarker = (markerIndex: MarkerIndex | null) => {
    const { changeRightClickedMarker, threadsKey } = this.props;
    changeRightClickedMarker(threadsKey, markerIndex);
  };

  _onStackFrameClick = (stackIndex: IndexIntoStackTable) => {
    const { thread, selectedTab, updateBottomBoxContentsAndMaybeOpen } =
      this.props;
    const bottomBoxInfo = getBottomBoxInfoForStackFrame(stackIndex, thread);
    updateBottomBoxContentsAndMaybeOpen(selectedTab, bottomBoxInfo);
  };

  isMarkerVisible = (markerIndex: MarkerIndex): boolean => {
    const { markerTimingAndBuckets } = this.props;
    // Check if the marker appears in the visible marker timing data
    for (const markerTiming of markerTimingAndBuckets) {
      if (typeof markerTiming === 'string') {
        continue;
      }
      if (markerTiming.index.includes(markerIndex)) {
        return true;
      }
    }
    return false;
  };

  getHoveredMarkerInfo = (markerIndex: MarkerIndex): React.ReactNode => {
    if (!this.props.shouldDisplayTooltips() || markerIndex === null) {
      return null;
    }

    // Check if the marker is visible (not filtered out)
    if (!this.isMarkerVisible(markerIndex)) {
      return null;
    }

    const marker = this.props.getMarker(markerIndex);
    return (
      <TooltipMarker
        markerIndex={markerIndex}
        marker={marker}
        threadsKey={this.props.threadsKey}
        restrictHeightWidth={true}
        onStackFrameClick={this._onStackFrameClick}
      />
    );
  };

  /**
   * Compute canvas-relative tooltip offset for the selected marker.
   * Returns null if the marker can't be located in the timing data or
   * is outside the visible viewport.
   */
  _getSelectedItemTooltipOffset(): {
    offsetX: CssPixels;
    offsetY: CssPixels;
  } | null {
    const { selectedMarkerIndex } = this.props;
    if (selectedMarkerIndex === null) {
      return null;
    }

    const {
      rangeStart,
      rangeEnd,
      markerTimingAndBuckets,
      rowHeight,
      marginLeft,
      marginRight,
      viewport: {
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
        viewportTop,
      },
    } = this.props;

    // Step 1: Find which row this marker is displayed in
    const markerIndexToTimingRow = this._getMarkerIndexToTimingRow(
      markerTimingAndBuckets
    );
    const rowIndex = markerIndexToTimingRow[selectedMarkerIndex];

    // Step 2: Get the timing data for all markers in this row
    const markerTiming = markerTimingAndBuckets[rowIndex];
    if (!markerTiming || typeof markerTiming === 'string') {
      // Row is empty or is a bucket label (string), not actual marker data
      return null;
    }

    // Step 3: Find the position of our specific marker within this row's data
    let markerTimingIndex = -1;
    for (let i = 0; i < markerTiming.length; i++) {
      if (markerTiming.index[i] === selectedMarkerIndex) {
        markerTimingIndex = i;
        break;
      }
    }

    if (markerTimingIndex === -1) {
      return null;
    }

    // Step 4: Calculate horizontal (X) position
    const startTimestamp = markerTiming.start[markerTimingIndex];
    const endTimestamp = markerTiming.end[markerTimingIndex];

    const markerContainerWidth = containerWidth - marginLeft - marginRight;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const startTime: UnitIntervalOfProfileRange =
      (startTimestamp - rangeStart) / rangeLength;
    const endTime: UnitIntervalOfProfileRange =
      (endTimestamp - rangeStart) / rangeLength;

    const x: CssPixels =
      ((startTime - viewportLeft) * markerContainerWidth) / viewportLength +
      marginLeft;
    const w: CssPixels =
      ((endTime - startTime) * markerContainerWidth) / viewportLength;

    // For instant markers (start === end), use the center point.
    // For interval markers, use a point 1/3 into the marker (or 30px, whichever is smaller).
    const isInstantMarker = startTimestamp === endTimestamp;
    const offsetX = isInstantMarker ? x : x + Math.min(w / 3, 30);

    // Step 5: Calculate vertical (Y) position
    // + 5 offsets the tooltip slightly below the row's top edge.
    const offsetY: CssPixels = rowIndex * rowHeight - viewportTop + 5;

    if (offsetY < 0 || offsetY > containerHeight) {
      return null;
    }

    return { offsetX, offsetY };
  }

  override render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;
    const { selectedMarkerIndex } = this.props;

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
        selectedItem={selectedMarkerIndex}
        selectedItemTooltipOffset={this._getSelectedItemTooltipOffset()}
      />
    );
  }
}

export const MarkerChartCanvas = withChartViewport<OwnProps>(
  MarkerChartCanvasImpl
);
