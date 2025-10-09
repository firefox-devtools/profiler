/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_20, BLUE_60, BLUE_80 } from 'photon-colors';
import * as React from 'react';
import memoize from 'memoize-immutable';
import {
  withChartViewport,
  type Viewport,
} from 'firefox-profiler/components/shared/chart/Viewport';
import { ChartCanvas } from 'firefox-profiler/components/shared/chart/Canvas';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import { FlowGapTooltip } from 'firefox-profiler/components/tooltip/FlowGap';
import TextMeasurement from 'firefox-profiler/utils/text-measurement';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import type {
  updatePreviewSelection,
  changeMouseTimePosition,
  changeActiveFlows,
} from 'firefox-profiler/actions/profile-view';
import { TIMELINE_MARGIN_LEFT } from 'firefox-profiler/app-logic/constants';
import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
  Marker,
  MarkerIndex,
  FlowTiming,
  ThreadIndex,
  IndexIntoFlowTable,
  FlowTimingRow,
  FlowTimingArrow,
} from 'firefox-profiler/types';
import {
  ensureExists,
  assertExhaustiveCheck,
} from 'firefox-profiler/utils/types';
import { computeArrowsRelatedToMarker } from 'firefox-profiler/profile-logic/marker-data';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type { WrapFunctionInDispatch } from 'firefox-profiler/utils/connect';

type FlowPanelHoverInfo = {
  rowIndex: number | null;
  flowIndex: IndexIntoFlowTable | null;
  hoveredItem: HoveredFlowPanelItem | null;
};

type HoveredFlowPanelItem =
  | {
      type: 'SINGLE_MARKER';
      hoveredMarker: HoveredFlowMarker;
    }
  | {
      type: 'BETWEEN_MARKERS';
      markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable: number;
      markerBeforeHoveredGap: HoveredFlowMarker;
      markerAfterHoveredGap: HoveredFlowMarker;
    };

type HoveredFlowMarker = {
  indexInFlowMarkers: number; // index into flows[flowIndex].flowMarkers
  threadIndex: ThreadIndex;
  markerIndex: MarkerIndex;
  flowMarkerIndex: number;
};

type OwnProps = {
  rangeStart: Milliseconds;
  rangeEnd: Milliseconds;
  flowTiming: FlowTiming;
  rowHeight: CssPixels;
  fullMarkerListPerThread: Marker[][];
  markerLabelGetterPerThread: Array<(marker: MarkerIndex) => string>;
  updatePreviewSelection: WrapFunctionInDispatch<typeof updatePreviewSelection>;
  changeMouseTimePosition: WrapFunctionInDispatch<
    typeof changeMouseTimePosition
  >;
  changeActiveFlows: WrapFunctionInDispatch<typeof changeActiveFlows>;
  marginLeft: CssPixels;
  marginRight: CssPixels;
  shouldDisplayTooltips: () => boolean;
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

class FlowPanelCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement = null;

  _memoizedGetArrows = memoize((threadIndex, flowMarkerIndex, flowTiming) =>
    computeArrowsRelatedToMarker(threadIndex, flowMarkerIndex, flowTiming)
  );

  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<FlowPanelHoverInfo>
  ) => {
    const {
      rowHeight,
      flowTiming,
      viewport: {
        viewportTop,
        viewportBottom,
        containerWidth,
        containerHeight,
      },
    } = this.props;
    const { cssToUserScale } = scale;
    if (cssToUserScale !== 1) {
      throw new Error(
        'StackChartCanvasImpl sets scaleCtxToCssPixels={true}, so canvas user space units should be equal to CSS pixels.'
      );
    }

    const { hoveredItem } = hoverInfo;

    // Convert CssPixels to Stack Depth
    const rowCount = flowTiming.rows.length;
    const startRow = Math.floor(viewportTop / rowHeight);
    const endRow = Math.min(Math.ceil(viewportBottom / rowHeight), rowCount);

    // Common properties that won't be changed later.
    ctx.lineWidth = 1;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, containerWidth, containerHeight);
    this.drawRowHighlights(ctx, startRow, endRow);
    this.drawRowContents(ctx, null, startRow, endRow, hoveredItem);
    this.drawSeparatorsAndLabels(ctx, startRow, endRow);

    const hoveredMarker =
      hoveredItem !== null &&
      hoveredItem.hoveredItem &&
      hoveredItem.hoveredItem.type === 'SINGLE_MARKER'
        ? hoveredItem.hoveredItem.hoveredMarker
        : null;

    if (hoveredMarker !== null) {
      const { threadIndex, flowMarkerIndex } = hoveredMarker;
      if (threadIndex !== null && flowMarkerIndex !== null) {
        const arrows = this._memoizedGetArrows(
          threadIndex,
          flowMarkerIndex,
          flowTiming
        );
        this.drawArrows(ctx, arrows, startRow, endRow);
      }
    }
  };

  drawRowHighlights(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number
  ) {
    const { flowTiming } = this.props;
    const { rows } = flowTiming;
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const rowType = rows[rowIndex].rowType;
      if (rowType === 'ACTIVE') {
        this.drawRowHighlight(ctx, rowIndex);
      }
    }
  }

  drawRowHighlight(ctx: CanvasRenderingContext2D, rowIndex: number) {
    const {
      rowHeight,
      viewport: { viewportTop, containerWidth },
    } = this.props;

    ctx.fillStyle = 'rgba(40, 122, 169, 0.2)';
    ctx.fillRect(
      0, // To include the labels also
      rowIndex * rowHeight - viewportTop,
      containerWidth,
      rowHeight - 1 // Subtract 1 for borders.
    );
  }

  drawFlowRectangle(
    ctx: CanvasRenderingContext2D,
    rowIndex: number,
    timeAtViewportLeft: number,
    timeAtViewportRightPlusMargin: number,
    rangeStart: number,
    rangeLength: number,
    viewportLeft: number,
    markerContainerWidth: number,
    viewportLength: number,
    marginLeft: number
  ) {
    const {
      rowHeight,
      flowTiming,
      viewport: { viewportTop },
    } = this.props;
    const { rows } = flowTiming;
    const { devicePixelRatio } = window;

    const row = rows[rowIndex];
    const startTimestamp = row.flowStart;
    const endTimestamp = row.flowEnd;

    const y: CssPixels = rowIndex * rowHeight - viewportTop;
    const h: CssPixels = rowHeight - 1;

    // Only draw samples that are in bounds.
    if (
      !(
        endTimestamp >= timeAtViewportLeft &&
        startTimestamp < timeAtViewportRightPlusMargin
      )
    ) {
      return;
    }
    const startTime: UnitIntervalOfProfileRange =
      (startTimestamp - rangeStart) / rangeLength;
    const endTime: UnitIntervalOfProfileRange =
      (endTimestamp - rangeStart) / rangeLength;

    let x: CssPixels =
      ((startTime - viewportLeft) * markerContainerWidth) / viewportLength +
      marginLeft;
    let w: CssPixels =
      ((endTime - startTime) * markerContainerWidth) / viewportLength;

    x = Math.round(x * devicePixelRatio) / devicePixelRatio;
    w = Math.round(w * devicePixelRatio) / devicePixelRatio;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();

    // We want the rectangle to have a clear margin, that's why we increment y
    // and decrement h (twice, for both margins).
    // We also add "0.5" more so that the stroke is properly on a pixel.
    // Indeed strokes are drawn on both sides equally, so half a pixel on each
    // side in this case.
    ctx.rect(
      x + 0.5, // + 0.5 for the stroke
      y + 1 + 0.5, // + 1 for the top margin, + 0.5 for the stroke
      w - 1, // - 1 to account for left and right strokes.
      h - 2 - 1 // + 2 accounts for top and bottom margins, + 1 accounts for top and bottom strokes
    );
    ctx.stroke();
  }

  // Note: we used a long argument list instead of an object parameter on
  // purpose, to reduce GC pressure while drawing.
  drawOneMarker(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    w: CssPixels,
    h: CssPixels,
    isInstantMarker: boolean,
    markerIndex: MarkerIndex,
    threadIndex: number,
    isHighlighted: boolean
  ) {
    if (isInstantMarker) {
      w = 1;
    }
    this.drawOneIntervalMarker(
      ctx,
      x,
      y,
      w,
      h,
      markerIndex,
      threadIndex,
      isHighlighted
    );
  }

  drawOneIntervalMarker(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    w: CssPixels,
    h: CssPixels,
    markerIndex: MarkerIndex,
    threadIndex: number,
    isHighlighted: boolean
  ) {
    const { marginLeft, markerLabelGetterPerThread } = this.props;

    if (w <= 2) {
      // This is an interval marker small enough that if we drew it as a
      // rectangle, we wouldn't see any inside part. With a width of 2 pixels,
      // the rectangle-with-borders would only be borders. With less than 2
      // pixels, the borders would collapse.
      // So let's draw it directly as a rect.
      ctx.fillStyle = isHighlighted ? BLUE_80 : MARKER_BORDER_COLOR;

      // w is rounded in the caller, but let's make sure it's at least 1.
      w = Math.max(w, 1);
      ctx.fillRect(x, y + 1, w, h - 2);
    } else {
      // This is a bigger interval marker.
      const textMeasurement = this._getTextMeasurement(ctx);

      ctx.fillStyle = isHighlighted ? BLUE_60 : '#8ac4ff';
      ctx.strokeStyle = isHighlighted ? BLUE_80 : MARKER_BORDER_COLOR;

      ctx.beginPath();

      // We want the rectangle to have a clear margin, that's why we increment y
      // and decrement h (twice, for both margins).
      // We also add "0.5" more so that the stroke is properly on a pixel.
      // Indeed strokes are drawn on both sides equally, so half a pixel on each
      // side in this case.
      ctx.rect(
        x + 0.5, // + 0.5 for the stroke
        y + 1 + 0.5, // + 1 for the top margin, + 0.5 for the stroke
        w - 1, // - 1 to account for left and right strokes.
        h - 2 - 1 // + 2 accounts for top and bottom margins, + 1 accounts for top and bottom strokes
      );
      ctx.fill();
      ctx.stroke();

      // Draw the text label
      // TODO - L10N RTL.
      // Constrain the x coordinate to the leftmost area.
      const x2: CssPixels =
        x < marginLeft ? marginLeft + TEXT_OFFSET_START : x + TEXT_OFFSET_START;
      const visibleWidth = x < marginLeft ? w - marginLeft + x : w;
      const w2: CssPixels = visibleWidth - 2 * TEXT_OFFSET_START;

      if (w2 > textMeasurement.minWidth) {
        const fittedText = textMeasurement.getFittedText(
          markerLabelGetterPerThread[threadIndex](markerIndex),
          w2
        );
        if (fittedText) {
          ctx.fillStyle = isHighlighted ? 'white' : 'black';
          ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
        }
      }
    }
  }
  /*
  // x indicates the center of this marker
  // y indicates the top of the row
  // h indicates the available height in the row
  drawOneInstantMarker(
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
*/
  drawMarkersForRow(
    ctx: CanvasRenderingContext2D,
    rowIndex: number,
    flowTimingRow: FlowTimingRow,
    timeAtViewportLeft: number,
    timeAtViewportRightPlusMargin: number,
    rangeStart: Milliseconds,
    rangeLength: Milliseconds,
    viewportLeft: CssPixels,
    viewportLength: CssPixels,
    rowHeight: CssPixels,
    viewportTop: CssPixels,
    markerContainerWidth: CssPixels,
    marginLeft: CssPixels,
    hoveredMarker: HoveredFlowMarker | null
  ) {
    const { devicePixelRatio } = window;

    const { markers } = flowTimingRow;

    const y: CssPixels = rowIndex * rowHeight - viewportTop;
    const h: CssPixels = rowHeight - 1;

    // Track the last drawn marker X position, so that we can avoid overdrawing.
    let previousMarkerDrawnAtX: number | null = null;

    for (let i = 0; i < markers.length; i++) {
      const startTimestamp = markers.startTime[i];
      const endTimestamp = markers.endTime[i];
      const isInstantMarker = markers.isInstant[i] === 1;

      // Only draw samples that are in bounds.
      if (
        endTimestamp >= timeAtViewportLeft &&
        startTimestamp < timeAtViewportRightPlusMargin
      ) {
        const startTime: UnitIntervalOfProfileRange =
          (startTimestamp - rangeStart) / rangeLength;
        const endTime: UnitIntervalOfProfileRange =
          (endTimestamp - rangeStart) / rangeLength;

        let x: CssPixels =
          ((startTime - viewportLeft) * markerContainerWidth) / viewportLength +
          marginLeft;
        let w: CssPixels =
          ((endTime - startTime) * markerContainerWidth) / viewportLength;

        x = Math.round(x * devicePixelRatio) / devicePixelRatio;
        w = Math.round(w * devicePixelRatio) / devicePixelRatio;

        const markerIndex = markers.markerIndex[i];
        const threadIndex = markers.threadIndex[i];
        const isHovered =
          hoveredMarker !== null &&
          threadIndex === hoveredMarker.threadIndex &&
          markerIndex === hoveredMarker.markerIndex;

        if (
          isInstantMarker ||
          // Always render non-dot markers and markers that are larger than
          // one pixel.
          w > 1 ||
          // Do not render dot markers that occupy the same pixel, as this can take
          // a lot of time, and not change the visual display of the chart.
          x !== previousMarkerDrawnAtX
        ) {
          previousMarkerDrawnAtX = x;
          this.drawOneMarker(
            ctx,
            x,
            y,
            w,
            h,
            isInstantMarker,
            markerIndex,
            threadIndex,
            isHovered
          );
        }
      }
    }
  }

  drawHoveredGapIndicator(
    ctx: CanvasRenderingContext2D,
    rowIndex: number,
    flowTimingRow: FlowTimingRow,
    timeAtViewportLeft: number,
    timeAtViewportRightPlusMargin: number,
    rangeStart: Milliseconds,
    rangeLength: Milliseconds,
    viewportLeft: CssPixels,
    viewportLength: CssPixels,
    rowHeight: CssPixels,
    viewportTop: CssPixels,
    markerContainerWidth: CssPixels,
    marginLeft: CssPixels,
    markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable: number
  ) {
    const { devicePixelRatio } = window;

    const { markers } = flowTimingRow;

    const y: CssPixels = rowIndex * rowHeight - viewportTop;
    const h: CssPixels = rowHeight - 1;

    const gapStart =
      markers.endTime[
        markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable
      ];
    const gapEnd =
      markers.startTime[
        markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable + 1
      ];

    // Only draw gap indicators that are in bounds.
    if (
      gapEnd >= timeAtViewportLeft &&
      gapStart < timeAtViewportRightPlusMargin
    ) {
      const startTime: UnitIntervalOfProfileRange =
        (gapStart - rangeStart) / rangeLength;
      const endTime: UnitIntervalOfProfileRange =
        (gapEnd - rangeStart) / rangeLength;

      let x: CssPixels =
        ((startTime - viewportLeft) * markerContainerWidth) / viewportLength +
        marginLeft;
      let w: CssPixels =
        ((endTime - startTime) * markerContainerWidth) / viewportLength;

      x = Math.round(x * devicePixelRatio) / devicePixelRatio;
      w = Math.round(w * devicePixelRatio) / devicePixelRatio;

      if (w > 1) {
        ctx.fillStyle = '#666';
        ctx.fillRect(x, y + 1 + 4, w, h - 2 - 4 * 2);
      }
    }
  }

  drawRowContents(
    ctx: CanvasRenderingContext2D,
    hoveredItem: MarkerIndex | null,
    startRow: number,
    endRow: number,
    hoverInfo: FlowPanelHoverInfo | null
  ) {
    const {
      rangeStart,
      rangeEnd,
      flowTiming,
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

    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // Decide which samples to actually draw
    const timeAtViewportLeft: Milliseconds =
      rangeStart + rangeLength * viewportLeft;
    const timeAtViewportRightPlusMargin: Milliseconds =
      rangeStart +
      rangeLength * viewportRight +
      // This represents the amount of seconds in the right margin:
      marginRight * ((viewportLength * rangeLength) / markerContainerWidth);

    // We'll restore the context at the end, so that the clip region will be
    // removed.
    ctx.save();
    // The clip operation forbids drawing in the label zone.
    ctx.beginPath();
    ctx.rect(marginLeft, 0, markerContainerWidth, containerHeight);
    ctx.clip();

    // Only draw the stack frames that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const flowTimingRow = flowTiming.rows[rowIndex];
      const flowIndex = flowTimingRow.flowIndex;
      this.drawFlowRectangle(
        ctx,
        rowIndex,
        timeAtViewportLeft,
        timeAtViewportRightPlusMargin,
        rangeStart,
        rangeLength,
        viewportLeft,
        markerContainerWidth,
        viewportLength,
        marginLeft
      );
      const hoveredItemInThisRow =
        hoverInfo !== null &&
        hoverInfo.flowIndex === flowIndex &&
        hoverInfo.hoveredItem !== null
          ? hoverInfo.hoveredItem
          : null;
      const hoveredMarkerInThisRow =
        hoveredItemInThisRow !== null &&
        hoveredItemInThisRow.type === 'SINGLE_MARKER'
          ? hoveredItemInThisRow.hoveredMarker
          : null;
      this.drawMarkersForRow(
        ctx,
        rowIndex,
        flowTimingRow,
        timeAtViewportLeft,
        timeAtViewportRightPlusMargin,
        rangeStart,
        rangeLength,
        viewportLeft,
        viewportLength,
        rowHeight,
        viewportTop,
        markerContainerWidth,
        marginLeft,
        hoveredMarkerInThisRow
      );
      if (
        hoveredItemInThisRow !== null &&
        hoveredItemInThisRow.type === 'BETWEEN_MARKERS'
      ) {
        this.drawHoveredGapIndicator(
          ctx,
          rowIndex,
          flowTimingRow,
          timeAtViewportLeft,
          timeAtViewportRightPlusMargin,
          rangeStart,
          rangeLength,
          viewportLeft,
          viewportLength,
          rowHeight,
          viewportTop,
          markerContainerWidth,
          marginLeft,
          hoveredItemInThisRow.markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable
        );
      }
    }

    ctx.restore();
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
      flowTiming,
      rowHeight,
      marginLeft,
      marginRight,
      viewport: { viewportTop, containerWidth, containerHeight },
    } = this.props;

    const usefulContainerWidth = containerWidth - marginRight;

    // Draw separators
    ctx.fillStyle = GREY_20;
    ctx.fillRect(marginLeft - 1, 0, 1, containerHeight);
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // `- 1` at the end, because the top separator is not drawn in the canvas,
      // it's drawn using CSS' border property. And canvas positioning is 0-based.
      const y = (rowIndex + 1) * rowHeight - viewportTop - 1;
      ctx.fillRect(0, y, usefulContainerWidth, 1);
    }

    const textMeasurement = this._getTextMeasurement(ctx);

    // Draw the marker names in the left margin.
    ctx.fillStyle = '#000000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const markerTimingRow = flowTiming.rows[rowIndex];
      // Draw the marker name.
      const { label } = markerTimingRow;

      const y = rowIndex * rowHeight - viewportTop;

      // Even when it's on active tab view, have a hard cap on the text length.
      const fittedText = textMeasurement.getFittedText(
        label,
        TIMELINE_MARGIN_LEFT - LABEL_PADDING
      );

      ctx.fillText(fittedText, LABEL_PADDING, y + TEXT_OFFSET_TOP);
    }
  }

  drawArrows(
    ctx: CanvasRenderingContext2D,
    arrows: FlowTimingArrow[],
    startRow: number,
    endRow: number
  ) {
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

    const markerContainerWidth = containerWidth - marginLeft - marginRight;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // Decide which samples to actually draw
    const timeAtViewportLeft: Milliseconds =
      rangeStart + rangeLength * viewportLeft;
    const timeAtViewportRightPlusMargin: Milliseconds =
      rangeStart +
      rangeLength * viewportRight +
      // This represents the amount of seconds in the right margin:
      marginRight * ((viewportLength * rangeLength) / markerContainerWidth);

    // We'll restore the context at the end, so that the clip region will be
    // removed.
    ctx.save();
    // The clip operation forbids drawing in the label zone.
    ctx.beginPath();
    ctx.rect(marginLeft, 0, markerContainerWidth, containerHeight);
    ctx.clip();

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'black';

    for (const arrow of arrows) {
      const { time, rowIndexesFrom, rowIndexesTo, minRowIndex, maxRowIndex } =
        arrow;
      if (
        maxRowIndex < startRow ||
        minRowIndex > endRow ||
        time < timeAtViewportLeft ||
        time > timeAtViewportRightPlusMargin
      ) {
        continue;
      }
      const minY: CssPixels =
        minRowIndex * rowHeight - viewportTop + rowHeight / 2 + 2;
      const maxY: CssPixels =
        maxRowIndex * rowHeight - viewportTop + rowHeight / 2 - 2;
      const timeAsUnit: UnitIntervalOfProfileRange =
        (time - rangeStart) / rangeLength;
      const x: CssPixels =
        ((timeAsUnit - viewportLeft) * markerContainerWidth) / viewportLength +
        marginLeft;

      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();

      const minFrom = Math.min(...rowIndexesFrom);
      const maxFrom = Math.max(...rowIndexesFrom);
      for (const rowIndex of rowIndexesFrom) {
        const y = rowIndex * rowHeight - viewportTop + rowHeight / 2;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      for (const rowIndex of rowIndexesTo) {
        const y = rowIndex * rowHeight - viewportTop + rowHeight / 2;
        if (minFrom < rowIndex) {
          // Draw arrow from top to bottom (aimed at rowIndex)
          ctx.beginPath();
          ctx.moveTo(x - 3.5, y - 8);
          ctx.lineTo(x + 3.5, y - 8);
          ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fill();
        }
        if (maxFrom > rowIndex) {
          // Draw arrow from bottom to top (aimed at rowIndex)
          ctx.beginPath();
          ctx.moveTo(x + 3.5, y + 8);
          ctx.lineTo(x - 3.5, y + 8);
          ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  hitTest = (x: CssPixels, y: CssPixels): FlowPanelHoverInfo | null => {
    const {
      rangeStart,
      rangeEnd,
      flowTiming,
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

    if (rowIndex < 0 || rowIndex >= flowTiming.rows.length) {
      return null;
    }

    const row = flowTiming.rows[rowIndex];
    const flowIndex = row.flowIndex;
    const markerTiming = row.markers;

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
      markerTiming.startTime[index] < xInTime + dotRadiusInTime &&
      markerTiming.endTime[index] > xInTime - dotRadiusInTime;

    // A markerTiming line is ordered.
    // 1. Let's find a marker reasonably close to our mouse cursor.
    // The result of this bisection gives the first marker that starts _after_
    // our mouse cursor. Our result will be either this marker, or the previous
    // one.
    const nextStartIndex = bisectionRight(markerTiming.startTime, xInTime);

    if (nextStartIndex > 0 && nextStartIndex < markerTiming.length) {
      // 2. This is the common case: 2 markers are candidates. Then we measure
      // the distance between them and the mouse cursor and chose the smallest
      // distance.
      const prevStartIndex = nextStartIndex - 1;

      // Note that these values can be negative if the cursor is _inside_ a
      // marker. There should be one at most in this case, and we'll want it. So
      // NO Math.abs here.
      const distanceToNext = markerTiming.startTime[nextStartIndex] - xInTime;
      const distanceToPrev = xInTime - markerTiming.endTime[prevStartIndex];

      const closest =
        distanceToPrev < distanceToNext ? prevStartIndex : nextStartIndex;

      // 3. When we found the closest, we still have to check if it's in close
      // enough!
      if (isMarkerTimingInDotRadius(closest)) {
        return {
          rowIndex,
          flowIndex,
          hoveredItem: {
            type: 'SINGLE_MARKER',
            hoveredMarker: {
              markerIndex: markerTiming.markerIndex[closest],
              flowMarkerIndex: markerTiming.flowMarkerIndex[closest],
              threadIndex: markerTiming.threadIndex[closest],
              indexInFlowMarkers: closest,
            },
          },
        };
      }

      // The cursor is between two markers.
      return {
        rowIndex,
        flowIndex,
        hoveredItem: {
          type: 'BETWEEN_MARKERS',
          markerBeforeHoveredGapAsIndexIntoFlowTimingRowMarkerTable:
            prevStartIndex,
          markerBeforeHoveredGap: {
            markerIndex: markerTiming.markerIndex[prevStartIndex],
            flowMarkerIndex: markerTiming.flowMarkerIndex[prevStartIndex],
            threadIndex: markerTiming.threadIndex[prevStartIndex],
            indexInFlowMarkers: prevStartIndex,
          },
          markerAfterHoveredGap: {
            markerIndex: markerTiming.markerIndex[nextStartIndex],
            flowMarkerIndex: markerTiming.flowMarkerIndex[nextStartIndex],
            threadIndex: markerTiming.threadIndex[nextStartIndex],
            indexInFlowMarkers: nextStartIndex,
          },
        },
      };
    } else if (nextStartIndex === 0) {
      // 4. Special case 1: the mouse cursor is at the left of all markers in
      // this line. Then, we have only 1 candidate, we can check if it's inside
      // our hit test range right away.
      if (isMarkerTimingInDotRadius(nextStartIndex)) {
        return {
          rowIndex,
          flowIndex,
          hoveredItem: {
            type: 'SINGLE_MARKER',
            hoveredMarker: {
              markerIndex: markerTiming.markerIndex[nextStartIndex],
              flowMarkerIndex: markerTiming.flowMarkerIndex[nextStartIndex],
              threadIndex: markerTiming.threadIndex[nextStartIndex],
              indexInFlowMarkers: nextStartIndex,
            },
          },
        };
      }
    } else {
      // 5. Special case 2: the mouse cursor is at the right of all markers in
      // this line. Then we only have 1 candidate as well, let's check if it's
      // inside our hit test range.
      if (isMarkerTimingInDotRadius(nextStartIndex - 1)) {
        return {
          rowIndex,
          flowIndex,
          hoveredItem: {
            type: 'SINGLE_MARKER',
            hoveredMarker: {
              markerIndex: markerTiming.markerIndex[nextStartIndex - 1],
              flowMarkerIndex: markerTiming.flowMarkerIndex[nextStartIndex - 1],
              threadIndex: markerTiming.threadIndex[nextStartIndex - 1],
              indexInFlowMarkers: nextStartIndex - 1,
            },
          },
        };
      }
    }

    return {
      rowIndex,
      flowIndex,
      hoveredItem: null,
    };
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

  onDoubleClickMarker = (_hoveredItems: FlowPanelHoverInfo | null) => {};

  onSelectItem = (hoveredItems: FlowPanelHoverInfo | null) => {
    const flowIndex = hoveredItems === null ? null : hoveredItems.flowIndex;
    if (flowIndex === null) {
      return;
    }

    const { changeActiveFlows } = this.props;
    changeActiveFlows([flowIndex]);
  };

  onRightClickMarker = (_hoveredItems: FlowPanelHoverInfo | null) => {
    // const markerIndex = hoveredItems === null ? null : hoveredItems.markerIndex;
    // const { changeRightClickedMarker, threadsKey } = this.props;
    // changeRightClickedMarker(threadsKey, markerIndex);
  };

  getHoveredMarkerInfo = (hoverInfo: FlowPanelHoverInfo): React.ReactNode => {
    if (!this.props.shouldDisplayTooltips() || hoverInfo.hoveredItem === null) {
      return null;
    }

    const { hoveredItem } = hoverInfo;

    switch (hoveredItem.type) {
      case 'SINGLE_MARKER': {
        const { threadIndex, markerIndex } = hoveredItem.hoveredMarker;

        const marker = ensureExists(
          this.props.fullMarkerListPerThread[threadIndex][markerIndex]
        );
        return (
          <TooltipMarker
            markerIndex={markerIndex}
            marker={marker}
            threadsKey={threadIndex}
            restrictHeightWidth={true}
          />
        );
      }
      case 'BETWEEN_MARKERS': {
        const { markerBeforeHoveredGap, markerAfterHoveredGap } = hoveredItem;
        const beforeGapMarker = ensureExists(
          this.props.fullMarkerListPerThread[
            markerBeforeHoveredGap.threadIndex
          ][markerBeforeHoveredGap.markerIndex]
        );
        const afterGapMarker = ensureExists(
          this.props.fullMarkerListPerThread[markerAfterHoveredGap.threadIndex][
            markerAfterHoveredGap.markerIndex
          ]
        );
        return (
          <FlowGapTooltip
            beforeGapMarkerIndex={markerBeforeHoveredGap.markerIndex}
            beforeGapMarker={beforeGapMarker}
            beforeGapThreadIndex={markerBeforeHoveredGap.threadIndex}
            afterGapMarkerIndex={markerAfterHoveredGap.markerIndex}
            afterGapMarker={afterGapMarker}
            afterGapThreadIndex={markerAfterHoveredGap.threadIndex}
          />
        );
      }
      default: {
        throw assertExhaustiveCheck(
          hoveredItem,
          'Unhandled HoveredFlowPanelItem type.'
        );
      }
    }
  };

  override render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="markerChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        scaleCtxToCssPixels={true}
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

export const FlowPanelCanvas = withChartViewport<OwnProps>(FlowPanelCanvasImpl);
