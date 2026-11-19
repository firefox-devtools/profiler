/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { GREY_20, GREY_30, GREY_60, BLUE_60, GREY_70 } from 'photon-colors';
import {
  getForegroundColor,
  getBackgroundColor,
  getContrastingTextColor,
} from '../../utils/colors';
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
import {
  snap,
  snapValueToMultipleOf,
} from 'firefox-profiler/utils/device-pixels';
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
const DEFAULT_FILL_COLOR = '#5aaaf8'; // Medium blue for non-highlighted
// The gap at the right edge of interval markers, in device pixels.
const MARKER_GAP = 0.8;
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

export function getHighlightRowBackgroundColor() {
  return '#287aa933';
}

function getMarkerFillColor(
  color: GraphColor | null,
  isHighlighted: boolean
): string {
  if (color !== null) {
    // Markers have no border, so use a more opaque fill than getFillColor,
    // which the timeline graphs use.
    return isHighlighted ? getStrokeColor(color) : getStrokeColor(color) + 'bb';
  }
  if (isDarkMode()) {
    return isHighlighted ? '#218be8' : '#1366ae';
  }
  return isHighlighted ? BLUE_60 : DEFAULT_FILL_COLOR;
}

/**
 * Instant markers are drawn as diamonds that are about half as wide as they
 * are high. The width is odd, so that the diamond's middle column can be
 * centered on the marker's timestamp.
 */
function getInstantMarkerDiamondWidth(
  contentHeight: DevicePixels
): DevicePixels {
  return 2 * Math.floor(contentHeight / 4) + 1;
}

// Maps "fillColor backgroundColor" to the text color for this combination.
const _textColorCache: Map<string, string> = new Map();

/**
 * Get the fill and text colors for a marker. `color` is the marker's color
 * from its schema's colorField, or null for the default blue. The text is
 * black or white, whichever has the higher contrast with the fill.
 */
export function getMarkerColors(
  color: GraphColor | null,
  isHighlighted: boolean
): { fillColor: string; textColor: string } {
  const fillColor = getMarkerFillColor(color, isHighlighted);
  const backgroundColor = getBackgroundColor();
  const key = fillColor + ' ' + backgroundColor;
  let textColor = _textColorCache.get(key);
  if (textColor === undefined) {
    textColor = getContrastingTextColor(fillColor, backgroundColor);
    _textColorCache.set(key, textColor);
  }
  return { fillColor, textColor };
}

class MarkerChartCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: TextMeasurement | null = null;
  _textMeasurementCssToDeviceScale: number = 1;
  // Pre-rendered instant marker diamonds, see _getInstantMarkerImage.
  _instantMarkerImages: Map<string, HTMLCanvasElement> = new Map();

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
   * Get the fill and text colors for a marker based on its schema and data.
   * If the marker schema has a colorField, use that field's value.
   * Otherwise use the marker schema's color.
   * Fall back to default blue if no color is specified.
   */
  _getMarkerColors(
    markerIndex: MarkerIndex,
    isHighlighted: boolean
  ): {
    fillColor: string;
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

    return getMarkerColors(color, isHighlighted);
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
    // Instant markers can be drawn as diamonds that extend beyond their
    // timestamp, so include markers that are up to half a diamond width out of
    // view.
    const diamondWidth = getInstantMarkerDiamondWidth(contentHeight);
    const diamondHalfWidthInTime =
      devicePixelsPerMs > 0 ? diamondWidth / 2 / devicePixelsPerMs : 0;
    const startIndex = bisectionLeft(
      markerTiming.end,
      timeAtMarginLeft - diamondHalfWidthInTime
    );
    const endIndex = bisectionLeft(
      markerTiming.start,
      timeAtContainerRight + diamondHalfWidthInTime
    );

    // Track the right edge of the last drawn marker, so that we can avoid
    // drawing markers which would be completely covered by the previous one.
    let prevMarkerRight: DevicePixels = -Infinity;
    // Highlighted markers are drawn after the normal markers so that they
    // stand out more. This stores [timing index, left, right] triples.
    const highlightedMarkers: number[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const markerIndex = markerTiming.index[i];
      const isHighlighted =
        markerIndex === hoveredMarker ||
        markerIndex === selectedMarkerIndex ||
        markerIndex === rightClickedMarkerIndex;
      const startTime = markerTiming.start[i];
      const endTime = markerTiming.end[i];
      const leftUnsnapped =
        marginLeft + (startTime - timeAtMarginLeft) * devicePixelsPerMs;

      if (startTime === endTime) {
        // This is an instant marker. It's drawn as a diamond centered on x.
        const x = snap(leftUnsnapped);
        const diamondLeft = x - (diamondWidth - 1) / 2;
        const diamondRight = diamondLeft + diamondWidth;
        if (isHighlighted) {
          // Highlighted instant markers are always drawn as whole diamonds,
          // so that they stand out even in a dense cluster.
          highlightedMarkers.push(i, diamondLeft, diamondRight);
          continue;
        }

        // Clip the diamond so that it doesn't overlap its neighbors, because
        // overlapping diamonds fuse into a blob. The clip edges are aligned
        // like the edges of interval markers.
        let left = diamondLeft;
        let right = diamondRight;
        let hasGap = false;
        if (i > 0) {
          left = Math.max(
            left,
            snapValueToMultipleOf(
              this._getBoundaryBetweenMarkers(markerTiming, i - 1, coords),
              2
            )
          );
        }
        if (i + 1 < markerTiming.length) {
          const boundary = snapValueToMultipleOf(
            this._getBoundaryBetweenMarkers(markerTiming, i, coords),
            2
          );
          if (boundary < right) {
            right = boundary;
            hasGap = true;
          }
        }
        if (right <= left) {
          // The neighbors are so close that nothing is left of the diamond.
          // Keep a slice that's two device pixels wide, so that it stays
          // visible.
          right = left + 2;
          hasGap = true;
        }

        if (right <= prevMarkerRight) {
          continue;
        }
        left = Math.max(left, prevMarkerRight);
        prevMarkerRight = right;
        this._drawInstantMarker(
          ctx,
          coords,
          x,
          left,
          hasGap ? right - MARKER_GAP : right,
          rowTop,
          contentHeight,
          markerIndex,
          false
        );
        continue;
      }

      // Snap the left and right edges to the nearest multiple of two device
      // pixels, like the flame graph does. If both edges snap to the same
      // value, make the box two device pixels wide, so that short markers stay
      // visible.
      let left = snapValueToMultipleOf(leftUnsnapped, 2);
      let right = snapValueToMultipleOf(
        marginLeft + (endTime - timeAtMarginLeft) * devicePixelsPerMs,
        2
      );
      if (right === left) {
        right = left + 2;
      }

      if (isHighlighted) {
        highlightedMarkers.push(i, left, right);
        continue;
      }

      // Markers which got enlarged by the snapping can overlap the next
      // marker. Let the earlier marker win, and skip markers which are
      // entirely covered.
      if (right <= prevMarkerRight) {
        continue;
      }
      left = Math.max(left, prevMarkerRight);
      prevMarkerRight = right;
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

    for (let j = 0; j < highlightedMarkers.length; j += 3) {
      const i = highlightedMarkers[j];
      const left = highlightedMarkers[j + 1];
      const right = highlightedMarkers[j + 2];
      const markerIndex = markerTiming.index[i];
      if (markerTiming.start[i] === markerTiming.end[i]) {
        this._drawInstantMarker(
          ctx,
          coords,
          (left + right - 1) / 2,
          left,
          right,
          rowTop,
          contentHeight,
          markerIndex,
          true
        );
      } else {
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
    const { marginLeft, cssToDeviceScale } = coords;
    const { fillColor, textColor } = this._getMarkerColors(
      markerIndex,
      isHighlighted
    );

    // Markers are drawn as flat boxes without a border. Leave a small gap at
    // the right edge, so that adjacent markers can be told apart.
    ctx.fillStyle = fillColor;
    ctx.fillRect(left, rowTop, right - left - MARKER_GAP, contentHeight);

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

  /**
   * Return the position, in unsnapped device pixels, of the boundary between
   * the marker at `index` and the next marker in the row. Instant markers are
   * clipped at this boundary. Between two instant markers, it's halfway
   * between them. Next to an interval marker, it's the interval marker's edge.
   */
  _getBoundaryBetweenMarkers(
    markerTiming: MarkerTiming,
    index: number,
    coords: DeviceCoordinates
  ): DevicePixels {
    const { marginLeft, timeAtMarginLeft, devicePixelsPerMs } = coords;
    const prevStart = markerTiming.start[index];
    const prevEnd = markerTiming.end[index];
    const nextStart = markerTiming.start[index + 1];
    const nextEnd = markerTiming.end[index + 1];
    let boundaryTime;
    if (prevStart === prevEnd && nextStart === nextEnd) {
      boundaryTime = (prevStart + nextStart) / 2;
    } else if (prevStart === prevEnd) {
      boundaryTime = nextStart;
    } else {
      boundaryTime = prevEnd;
    }
    return marginLeft + (boundaryTime - timeAtMarginLeft) * devicePixelsPerMs;
  }

  // x indicates the center of this marker. Only the part of the diamond
  // between clipLeft and clipRight is drawn.
  // rowTop indicates the top of the row
  // contentHeight indicates the available height in the row
  _drawInstantMarker(
    ctx: CanvasRenderingContext2D,
    coords: DeviceCoordinates,
    x: DevicePixels,
    clipLeft: DevicePixels,
    clipRight: DevicePixels,
    rowTop: DevicePixels,
    contentHeight: DevicePixels,
    markerIndex: MarkerIndex,
    isHighlighted: boolean
  ) {
    const { fillColor } = this._getMarkerColors(markerIndex, isHighlighted);
    const image = this._getInstantMarkerImage(
      fillColor,
      contentHeight,
      coords.lineWidth
    );
    // The image has an odd width, so its middle column is at x.
    const imageLeft = x - (image.width - 1) / 2;
    const width = clipRight - clipLeft;
    ctx.drawImage(
      image,
      clipLeft - imageLeft,
      0,
      width,
      contentHeight,
      clipLeft,
      rowTop,
      width,
      contentHeight
    );
  }

  /**
   * Drawing diamonds as paths is slow when there are many of them, so render
   * each diamond once into a small canvas and copy it with drawImage.
   */
  _getInstantMarkerImage(
    fillColor: string,
    contentHeight: DevicePixels,
    lineWidth: DevicePixels
  ): HTMLCanvasElement {
    const key = `${fillColor} ${contentHeight} ${lineWidth}`;
    let image = this._instantMarkerImages.get(key);
    if (image === undefined) {
      image = document.createElement('canvas');
      const width = getInstantMarkerDiamondWidth(contentHeight);
      image.width = width;
      image.height = contentHeight;
      const ctx = image.getContext('2d')!;
      // Leave a gap of one line width above and below the diamond.
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(0, contentHeight / 2);
      ctx.lineTo(width / 2, lineWidth);
      ctx.lineTo(width, contentHeight / 2);
      ctx.lineTo(width / 2, contentHeight - lineWidth);
      ctx.closePath();
      ctx.fill();
      this._instantMarkerImages.set(key, image);
    }
    return image;
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
