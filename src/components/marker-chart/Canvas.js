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
import memoize from 'memoize-immutable';
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
  ThreadsKey,
  Marker,
  MarkerTimingAndBuckets,
  MarkerIndex,
  TimelineTrackOrganization,
} from 'firefox-profiler/types';
import { getStartEndRangeForMarker } from 'firefox-profiler/utils';

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
type IndexIntoHoveredLabelRow = number;
type HoveredMarkerChartItems = {|
  markerIndex: MarkerIndex | null,
  rowIndexOfLabel: IndexIntoHoveredLabelRow | null,
|};

type OwnProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +markerTimingAndBuckets: MarkerTimingAndBuckets,
  +rowHeight: CssPixels,
  +getMarker: MarkerIndex => Marker,
  +threadsKey: ThreadsKey,
  +updatePreviewSelection: WrapFunctionInDispatch<UpdatePreviewSelection>,
  +changeRightClickedMarker: ChangeRightClickedMarker,
  +marginLeft: CssPixels,
  +marginRight: CssPixels,
  +rightClickedMarkerIndex: MarkerIndex | null,
  +shouldDisplayTooltips: () => boolean,
  +timelineTrackOrganization: TimelineTrackOrganization,
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
const DOT_WIDTH = 10;
const LABEL_PADDING = 5;

class MarkerChartCanvasImpl extends React.PureComponent<Props, State> {
  _textMeasurement: null | TextMeasurement;

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    hoveredItems: HoveredMarkerChartItems | null,
    prevHoveredItems: HoveredMarkerChartItems | null,
    isHoveredOnlyDifferent: boolean
  ) => {
    const {
      rowHeight,
      markerTimingAndBuckets,
      rightClickedMarkerIndex,
      timelineTrackOrganization,
      viewport: {
        viewportTop,
        viewportBottom,
        containerWidth,
        containerHeight,
      },
    } = this.props;
    let hoveredMarker = null;
    let hoveredLabel = null;
    let prevHoveredMarker = null;
    let prevHoveredLabel = null;

    if (hoveredItems) {
      hoveredMarker = hoveredItems.markerIndex;
      hoveredLabel = hoveredItems.rowIndexOfLabel;
    }
    if (prevHoveredItems) {
      prevHoveredMarker = prevHoveredItems.markerIndex;
      prevHoveredLabel = prevHoveredItems.rowIndexOfLabel;
    }

    // Convert CssPixels to Stack Depth
    const startRow = Math.floor(viewportTop / rowHeight);
    const endRow = Math.min(
      Math.ceil(viewportBottom / rowHeight),
      markerTimingAndBuckets.length
    );
    const markerIndexToTimingRow = this._getMarkerIndexToTimingRow(
      markerTimingAndBuckets
    );
    const rightClickedRow: number | void =
      rightClickedMarkerIndex === null
        ? undefined
        : markerIndexToTimingRow.get(rightClickedMarkerIndex);
    let newRow: number | void =
      hoveredMarker === null
        ? undefined
        : markerIndexToTimingRow.get(hoveredMarker);
    if (
      timelineTrackOrganization.type === 'active-tab' &&
      newRow === undefined &&
      hoveredLabel !== null
    ) {
      // If it's active tab view and we don't know the row yet, assign
      // `hoveredLabel` if it's non-null. This is needed because we can hover
      // the label and not the marker. That way we are making sure that we
      // select the correct row.
      newRow = hoveredLabel;
    }

    if (isHoveredOnlyDifferent) {
      // Only re-draw the rows that have been updated if only the hovering information
      // is different.
      let oldRow: number | void =
        prevHoveredMarker === null
          ? undefined
          : markerIndexToTimingRow.get(prevHoveredMarker);
      if (
        timelineTrackOrganization.type === 'active-tab' &&
        oldRow === undefined &&
        prevHoveredLabel !== null
      ) {
        // If it's active tab view and we don't know the row yet, assign
        // `prevHoveredLabel` if it's non-null. This is needed because we can
        // hover the label and not the marker. That way we are making sure that
        // previous hovered row is correct.
        oldRow = prevHoveredLabel;
      }

      if (newRow !== undefined) {
        this.clearRow(ctx, newRow);
        this.highlightRow(ctx, newRow);
        this.drawMarkers(ctx, hoveredMarker, newRow, newRow + 1);
        if (hoveredLabel === null) {
          this.drawSeparatorsAndLabels(ctx, newRow, newRow + 1);
        }
      }
      if (oldRow !== undefined && oldRow !== newRow) {
        if (oldRow !== rightClickedRow) {
          this.clearRow(ctx, oldRow);
        }
        this.drawMarkers(ctx, hoveredMarker, oldRow, oldRow + 1);
        this.drawSeparatorsAndLabels(ctx, oldRow, oldRow + 1);
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, containerWidth, containerHeight);
      if (rightClickedRow !== undefined) {
        this.highlightRow(ctx, rightClickedRow);
      } else if (newRow !== undefined) {
        this.highlightRow(ctx, newRow);
      }
      this.drawMarkers(ctx, hoveredMarker, startRow, endRow);
      this.drawSeparatorsAndLabels(ctx, startRow, endRow);
    }
  };

  highlightRow = (ctx, row) => {
    const {
      rowHeight,
      viewport: { viewportTop, containerWidth },
    } = this.props;

    ctx.fillStyle = 'rgba(40, 122, 169, 0.2)';
    ctx.fillRect(
      0, // To include the labels also
      row * rowHeight - viewportTop,
      containerWidth,
      rowHeight - 1 // Subtract 1 for borders.
    );
  };

  /**
   * When re-drawing markers, it's helpful to isolate the operations to a single row
   * in order to make the drawing faster. This memoized function computes the map
   * of a marker index to its row in the marker timing.
   */
  _getMarkerIndexToTimingRow = memoize(
    (
      markerTimingAndBuckets: MarkerTimingAndBuckets
    ): Map<MarkerIndex, number> => {
      const markerIndexToTimingRow = new Map();
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
          markerIndexToTimingRow.set(markerTiming.index[timingIndex], rowIndex);
        }
      }
      return markerIndexToTimingRow;
    },
    { cache: new WeakMap() }
  );

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
      rightClickedMarkerIndex,
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

      // Track the last drawn marker X position, so that we can avoid overdrawing.
      let previousMarkerDrawnAtX: number | null = null;

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
          if (uncutWidth < DOT_WIDTH) {
            // Ensure that small durations render as a dot, but markers cut by the margins
            // are rendered as squares.
            w = DOT_WIDTH;
          }

          x = Math.round(x * devicePixelRatio) / devicePixelRatio;

          const text = markerTiming.label[i];
          const markerIndex = markerTiming.index[i];

          const isHighlighted =
            rightClickedMarkerIndex === markerIndex ||
            hoveredItem === markerIndex;

          if (isHighlighted) {
            highlightedMarkers.push({ x, y, w, h, uncutWidth, text });
          } else if (
            // Always render non-dot markers.
            uncutWidth > DOT_WIDTH ||
            // Do not render dot markers that occupy the same pixel, as this can take
            // a lot of time, and not change the visual display of the chart.
            x !== previousMarkerDrawnAtX
          ) {
            previousMarkerDrawnAtX = x;
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

  clearRow(ctx: CanvasRenderingContext2D, rowIndex: number) {
    const {
      rowHeight,
      viewport: { viewportTop, containerWidth },
    } = this.props;

    ctx.fillStyle = '#fff';
    ctx.fillRect(
      0,
      rowIndex * rowHeight - viewportTop,
      containerWidth,
      rowHeight - 1 // Subtract 1 for borders.
    );
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
      timelineTrackOrganization,
      viewport: { viewportTop, containerWidth, containerHeight },
    } = this.props;

    // Draw separators
    ctx.fillStyle = GREY_20;
    if (timelineTrackOrganization.type !== 'active-tab') {
      // Don't draw the separator on the right side if we are in the active tab.
      ctx.fillRect(marginLeft - 1, 0, 1, containerHeight);
    }
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
      // Even though it's on active tab view, have a hard cap on the text length.
      const fittedText = textMeasurement.getFittedText(
        name,
        TIMELINE_MARGIN_LEFT
      );

      if (timelineTrackOrganization.type === 'active-tab') {
        // Draw the text backgound for active tab.
        ctx.fillStyle = '#ffffffbf'; // white with 75% opacity
        const textWidth = textMeasurement.getTextWidth(fittedText);
        ctx.fillRect(0, y, textWidth + LABEL_PADDING * 2, rowHeight);

        // Set the fill style back for text.
        ctx.fillStyle = '#000000';
      }

      ctx.fillText(fittedText, LABEL_PADDING, y + TEXT_OFFSET_TOP);
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
      ctx.fillText(bucketName, LABEL_PADDING + marginLeft, y + TEXT_OFFSET_TOP);
    }
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
    if (x < marginLeft - MARKER_DOT_RADIUS) {
      return null;
    }
    let markerIndex = null;
    let rowIndexOfLabel = null;
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
        markerIndex = markerTiming.index[i];
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
        if (x < textWidth + LABEL_PADDING * 2) {
          rowIndexOfLabel = rowIndex;
        }
      }
    }

    if (markerIndex === null && rowIndexOfLabel === null) {
      // If both of them are null, return a null instead of `[null, null]`.
      // That's because shared canvas component only understands that.
      return null;
    }

    // Yes, we are returning a new array all the time when we do the hit testing.
    // I can hear you say "How does equality check work for old and new hovered
    // items then?". Well, on the shared canvas component we have a function
    // called `hoveredItemsAreEqual` that shallowly checks for equality of
    // objects and arrays. So it's safe to return a new array all the time.
    return { markerIndex, rowIndexOfLabel };
  };

  onDoubleClickMarker = (hoveredItems: HoveredMarkerChartItems | null) => {
    const markerIndex = hoveredItems === null ? null : hoveredItems.markerIndex;
    if (markerIndex === null) {
      return;
    }
    const {
      getMarker,
      updatePreviewSelection,
      rangeStart,
      rangeEnd,
    } = this.props;
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

  onRightClickMarker = (hoveredItems: HoveredMarkerChartItems | null) => {
    const markerIndex = hoveredItems === null ? null : hoveredItems.markerIndex;
    const { changeRightClickedMarker, threadsKey } = this.props;
    changeRightClickedMarker(threadsKey, markerIndex);
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

  getHoveredMarkerInfo = ({
    markerIndex,
  }: HoveredMarkerChartItems): React.Node => {
    if (!this.props.shouldDisplayTooltips() || markerIndex === null) {
      return null;
    }

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

export const MarkerChartCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props
>)(MarkerChartCanvasImpl);
