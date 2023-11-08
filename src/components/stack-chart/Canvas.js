/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_30 } from 'photon-colors';
import * as React from 'react';
import { TIMELINE_MARGIN_RIGHT } from '../../app-logic/constants';
import { getStackTimingByDepth } from '../../profile-logic/stack-timing';
import {
  withChartViewport,
  type WithChartViewport,
  type Viewport,
} from '../shared/chart/Viewport';
import { ChartCanvas } from '../shared/chart/Canvas';
import { FastFillStyle } from '../../utils';
import TextMeasurement from '../../utils/text-measurement';
import { ensureExists, assertExhaustiveCheck } from '../../utils/flow';
import { snapValueToMultipleOfTwo } from '../../utils/coordinates';
import { bisectionRight } from '../../utils/bisect';
import {
  updatePreviewSelection,
  typeof changeMouseTimePosition as ChangeMouseTimePosition,
} from '../../actions/profile-view';
import { mapCategoryColorNameToStackChartStyles } from '../../utils/colors';
import { TooltipCallNode } from '../tooltip/CallNode';
import { TooltipMarker } from '../tooltip/Marker';

import type {
  Thread,
  CategoryList,
  ThreadsKey,
  MarkerTiming,
  WeightType,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  Milliseconds,
  CssPixels,
  DevicePixels,
  UnitIntervalOfProfileRange,
  MarkerIndex,
  Marker,
  InnerWindowID,
  IndexIntoCategoryList,
  Page,
} from 'firefox-profiler/types';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type {
  StackTimingDepth,
  StackTimingByDepth,
  IndexIntoStackTiming,
} from '../../profile-logic/stack-timing';
import type { WrapFunctionInDispatch } from '../../utils/connect';

type OwnProps = {|
  +thread: Thread,
  +innerWindowIDToPageMap: Map<InnerWindowID, Page> | null,
  +threadsKey: ThreadsKey,
  +interval: Milliseconds,
  +weightType: WeightType,
  +maxDepth: StackTimingDepth,
  +defaultCategory: IndexIntoCategoryList,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +updatePreviewSelection: WrapFunctionInDispatch<
    typeof updatePreviewSelection,
  >,
  +changeMouseTimePosition: ChangeMouseTimePosition,
  +getMarker: (MarkerIndex) => Marker,
  +userTimingRows: MarkerTiming[] | null,
  +categories: CategoryList,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
  +onRightClick: (IndexIntoCallNodeTable | null) => void,
  +shouldDisplayTooltips: () => boolean,
  +scrollToSelectionGeneration: number,
  +marginLeft: CssPixels,
  +displayStackType: boolean,
|};

type Props = $ReadOnly<{|
  ...OwnProps,
  +viewport: Viewport,
|}>;

type HoveredStackTiming =
  | {|
      type: 'STACK',
      depth: StackTimingDepth,
      stackTimingIndex: IndexIntoStackTiming,
    |}
  | {|
      type: 'USER_TIMING',
      rowIndex: number,
      marker: IndexIntoStackTiming,
    |};

type HoveredPosition = {|
  +x: CssPixels,
  +y: CssPixels,
|};

type DrawInfo = {|
  stackTimingRows: StackTimingByDepth,
  cssToDeviceScale: number,
  viewportTopDev: DevicePixels,
  rowHeightDev: DevicePixels,
  userTimingHeaderHeightDev: DevicePixels,
  userTimingRows: MarkerTiming[] | null,
  timeAtOuterStart: Milliseconds,
  devPxPerMs: number,
|};

import './Canvas.css';

const ROW_CSS_PIXELS_HEIGHT = 16;
const GAP_HEIGHT_AFTER_USER_TIMING = 8;
const TEXT_CSS_PIXELS_OFFSET_START = 3;
const TEXT_CSS_PIXELS_OFFSET_TOP = 11;
const FONT_SIZE = 10;
const BORDER_OPACITY = 0.8;

class StackChartCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;
  _textMeasurementCssToDeviceScale: number = 1;
  _lastDrawInfo: DrawInfo | null = null;

  componentDidUpdate(prevProps) {
    // We want to scroll the selection into view when this component
    // is mounted, but using componentDidMount won't work here as the
    // viewport will not have completed setting its size by
    // then. Instead, look for when the viewport's isSizeSet prop
    // changes to true.
    if (!this.props.viewport.isSizeSet) {
      return;
    }
    const viewportDidMount = !prevProps.viewport.isSizeSet;

    if (
      viewportDidMount ||
      this.props.scrollToSelectionGeneration >
        prevProps.scrollToSelectionGeneration
    ) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const { selectedCallNodeIndex, callNodeInfo } = this.props;

    if (selectedCallNodeIndex === null) {
      return;
    }

    const callNodeTable = callNodeInfo.getCallNodeTable();
    const depth = callNodeTable.depth[selectedCallNodeIndex];
    const y = depth * ROW_CSS_PIXELS_HEIGHT;

    if (y < this.props.viewport.viewportTop) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportTop - y);
    } else if (y + ROW_CSS_PIXELS_HEIGHT > this.props.viewport.viewportBottom) {
      this.props.viewport.moveViewport(
        0,
        this.props.viewport.viewportBottom - (y + ROW_CSS_PIXELS_HEIGHT)
      );
    }
  };

  /**
   * Draw the canvas.
   *
   * Note that most of the units are not absolute values, but unit intervals ranged from
   * 0 - 1. This was done to make the calculations easier for computing various zoomed
   * and translated views independent of any particular scale. See
   * src/components/shared/chart/Viewport.js for a diagram detailing the various
   * components of this set-up.
   */
  _drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<HoveredPosition>
  ) => {
    const {
      thread,
      userTimingRows,
      rangeStart,
      rangeEnd,
      selectedCallNodeIndex,
      categories,
      callNodeInfo,
      interval,
      maxDepth,
      defaultCategory,
      marginLeft,
      viewport: {
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
        viewportTop,
        viewportBottom,
      },
    } = this.props;

    const fastFillStyle = new FastFillStyle(ctx);

    const { cssToDeviceScale, cssToUserScale } = scale;
    if (cssToDeviceScale !== cssToUserScale) {
      throw new Error(
        'StackChartCanvasImpl sets scaleCtxToCssPixels={false}, so canvas user space units should be equal to device pixels.'
      );
    }

    // Set the font before creating the text renderer. The font property resets
    // automatically whenever the canvas size is changed, so we set it on every
    // call.
    ctx.font = `${FONT_SIZE * cssToDeviceScale}px sans-serif`;

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

    const textMeasurement = this._textMeasurement;

    const canvasWidthDev = containerWidth * cssToDeviceScale;
    const canvasHeightDev = containerHeight * cssToDeviceScale;

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, canvasWidthDev, canvasHeightDev);

    // Length of the committed range
    const rangeLength: Milliseconds = rangeEnd - rangeStart;

    // Fraction of the committed range that's currently in the viewport
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    const innerContainerWidth: CssPixels =
      containerWidth - marginLeft - TIMELINE_MARGIN_RIGHT;
    const outerViewportLeft =
      (-marginLeft * viewportLength) / innerContainerWidth + viewportLeft;
    const outerViewportRight =
      ((innerContainerWidth + TIMELINE_MARGIN_RIGHT) * viewportLength) /
        innerContainerWidth +
      viewportLeft;
    const timeAtOuterStart = rangeStart + outerViewportLeft * rangeLength;
    const timeAtOuterEnd = rangeStart + outerViewportRight * rangeLength;

    const stackTimingRows = getStackTimingByDepth(
      thread.samples,
      thread.stackTable,
      callNodeInfo,
      maxDepth,
      timeAtOuterStart,
      timeAtOuterEnd,
      canvasWidthDev,
      selectedCallNodeIndex,
      defaultCategory,
      interval
    );

    const rowHeightDev = Math.round(ROW_CSS_PIXELS_HEIGHT * cssToDeviceScale);

    const userTimingHeaderHeightDev =
      userTimingRows === null
        ? 0
        : userTimingRows.length * rowHeightDev +
          Math.round(GAP_HEIGHT_AFTER_USER_TIMING * cssToDeviceScale);

    const viewportTopDev = viewportTop * cssToDeviceScale;
    const viewportBottomDev = viewportBottom * cssToDeviceScale;
    const devPxPerMs = canvasWidthDev / (timeAtOuterEnd - timeAtOuterStart);

    this._lastDrawInfo = {
      stackTimingRows,
      cssToDeviceScale,
      viewportTopDev,
      rowHeightDev,
      userTimingHeaderHeightDev,
      userTimingRows,
      timeAtOuterStart,
      devPxPerMs,
    };

    const textDevicePixelsOffsetStart =
      TEXT_CSS_PIXELS_OFFSET_START * cssToDeviceScale;
    const textDevicePixelsOffsetTop =
      TEXT_CSS_PIXELS_OFFSET_TOP * cssToDeviceScale;
    let categoryForUserTiming = categories.findIndex(
      (category) => category.name === 'JavaScript'
    );
    if (categoryForUserTiming === -1) {
      // Default to the first item in the categories list.
      categoryForUserTiming = 0;
    }

    const { hoveredItem: hoveredPosition } = hoverInfo;
    const hoveredItem =
      hoveredPosition !== null
        ? this._itemAtPosition(hoveredPosition.x, hoveredPosition.y)
        : null;
    const [hoveredDepth, hoveredIndex] =
      hoveredItem !== null && hoveredItem.type === 'STACK'
        ? [hoveredItem.depth, hoveredItem.stackTimingIndex]
        : [null, null];

    if (userTimingRows !== null) {
      const startRowIndex = Math.max(
        0,
        Math.floor(viewportTopDev / rowHeightDev)
      );
      const endRowIndex = Math.min(
        userTimingRows.length,
        Math.ceil(viewportBottomDev / rowHeightDev)
      );
      const [hoveredRowIndex, hoveredMarker] =
        hoveredItem !== null && hoveredItem.type === 'USER_TIMING'
          ? [hoveredItem.rowIndex, hoveredItem.marker]
          : [null, null];
      for (let rowIndex = startRowIndex; rowIndex < endRowIndex; rowIndex++) {
        const row = userTimingRows[rowIndex];
        const isHoveredRow = rowIndex === hoveredRowIndex;

        const intY = rowIndex * rowHeightDev - viewportTopDev;
        const intH = rowHeightDev - 1;

        for (let i = 0; i < row.length; i++) {
          const leftDevFloat = (row.start[i] - timeAtOuterStart) * devPxPerMs;
          const rightDevFloat = (row.end[i] - timeAtOuterStart) * devPxPerMs;
          const leftDevInt = snapValueToMultipleOfTwo(leftDevFloat);
          const rightDevInt = snapValueToMultipleOfTwo(rightDevFloat);
          if (leftDevInt >= rightDevInt) {
            continue;
          }
          const intX = leftDevInt;
          const intW = rightDevInt - leftDevInt;
          const isSelected = false;
          const isHovered = isHoveredRow && i === hoveredMarker;

          const colorStyles = mapCategoryColorNameToStackChartStyles(
            categories[categoryForUserTiming].color
          );
          // Draw the box.
          fastFillStyle.set(
            isHovered || isSelected
              ? colorStyles.selectedFillStyle
              : colorStyles.unselectedFillStyle
          );
          ctx.fillRect(intX, intY, intW - BORDER_OPACITY, intH);

          const textX: DevicePixels = intX + textDevicePixelsOffsetStart;
          const textW: DevicePixels = Math.max(
            0,
            intW - textDevicePixelsOffsetStart
          );

          if (textW > textMeasurement.minWidth) {
            const text = row.label[i];
            const fittedText = textMeasurement.getFittedText(text, textW);
            if (fittedText) {
              fastFillStyle.set(
                isHovered || isSelected
                  ? colorStyles.selectedTextColor
                  : '#000000'
              );
              ctx.fillText(fittedText, textX, intY + textDevicePixelsOffsetTop);
            }
          }
        }
      }
    }

    // Only draw the stack frames that are vertically within view.
    const startDepth = Math.floor(
      (viewportTopDev - userTimingHeaderHeightDev) / rowHeightDev
    );
    const endDepth = Math.ceil(
      (viewportBottomDev - userTimingHeaderHeightDev) / rowHeightDev
    );

    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = stackTimingRows[depth];

      if (!stackTiming) {
        continue;
      }

      const isHoveredDepth = hoveredDepth === depth;

      const intY =
        userTimingHeaderHeightDev + depth * rowHeightDev - viewportTopDev;
      const intH = rowHeightDev - 1;

      for (let i = 0; i < stackTiming.length; i++) {
        const intX = stackTiming.start[i];
        const intW = stackTiming.end[i] - intX;
        const funcIndex = stackTiming.func[i];
        const funcNameIndex = thread.funcTable.name[funcIndex];
        const text = thread.stringTable.getString(funcNameIndex);
        const categoryIndex = stackTiming.category[i];
        const category = categories[categoryIndex];
        const isSelected = stackTiming.isSelectedPath[i];
        const isHovered = isHoveredDepth && i === hoveredIndex;

        const colorStyles = mapCategoryColorNameToStackChartStyles(
          category.color
        );
        // Draw the box.
        fastFillStyle.set(
          isHovered || isSelected
            ? colorStyles.selectedFillStyle
            : colorStyles.unselectedFillStyle
        );
        ctx.fillRect(stackTiming.start[i], intY, intW - BORDER_OPACITY, intH);

        const textX: DevicePixels = intX + textDevicePixelsOffsetStart;
        const textW: DevicePixels = Math.max(
          0,
          intW - textDevicePixelsOffsetStart
        );

        if (textW > textMeasurement.minWidth) {
          const fittedText = textMeasurement.getFittedText(text, textW);
          if (fittedText) {
            fastFillStyle.set(
              isHovered || isSelected
                ? colorStyles.selectedTextColor
                : '#000000'
            );
            ctx.fillText(fittedText, textX, intY + textDevicePixelsOffsetTop);
          }
        }
      }
    }

    // Draw the borders on the left and right.
    fastFillStyle.set(GREY_30);
    const oneCssPixelInDevicePixels = 1 * cssToDeviceScale;
    ctx.fillRect(
      cssToDeviceScale *
        (marginLeft - (viewportLeft * innerContainerWidth) / viewportLength),
      0,
      oneCssPixelInDevicePixels,
      canvasHeightDev
    );
    ctx.fillRect(
      cssToDeviceScale *
        (marginLeft +
          ((1 - viewportLeft) * innerContainerWidth) / viewportLength),
      0,
      oneCssPixelInDevicePixels,
      canvasHeightDev
    );
  };

  _getHoveredStackInfo = (
    hoveredPosition: HoveredPosition
  ): React.Node | null => {
    const {
      thread,
      weightType,
      categories,
      callNodeInfo,
      shouldDisplayTooltips,
      interval,
      innerWindowIDToPageMap,
      displayStackType,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const result =
      this._getCallNodeIndexOrMarkerIndexFromHoveredItem(hoveredPosition);
    if (!result) {
      return null;
    }

    switch (result.type) {
      case 'call-node': {
        const callNodeIndex = result.index;

        const durationText = 'duration text'; // TODO
        return (
          <TooltipCallNode
            thread={thread}
            weightType={weightType}
            innerWindowIDToPageMap={innerWindowIDToPageMap}
            interval={interval}
            callNodeIndex={callNodeIndex}
            callNodeInfo={callNodeInfo}
            categories={categories}
            // The stack chart doesn't support other call tree summary types.
            callTreeSummaryStrategy="timing"
            durationText={durationText}
            displayStackType={displayStackType}
          />
        );
      }
      case 'marker': {
        const markerIndex = result.index;

        return (
          <TooltipMarker
            markerIndex={markerIndex}
            marker={this.props.getMarker(markerIndex)}
            threadsKey={this.props.threadsKey}
            restrictHeightWidth={true}
          />
        );
      }
      default:
        return null;
    }
  };

  _onDoubleClick = (position: HoveredPosition | null) => {
    if (position === null) {
      return;
    }

    const item = this._itemAtPosition(position.x, position.y);
    const lastDrawInfo = this._lastDrawInfo;
    if (item === null || item.type !== 'STACK' || lastDrawInfo === null) {
      return;
    }

    const { depth, stackTimingIndex } = item;
    const { stackTimingRows } = lastDrawInfo;

    const { updatePreviewSelection } = this.props;
    // TODO: Store milliseconds on stack timing info
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      // XXX this gets devpx and interprets as milliseconds
      selectionStart: stackTimingRows[depth].start[stackTimingIndex],
      selectionEnd: stackTimingRows[depth].end[stackTimingIndex],
    });
  };

  _getCallNodeIndexOrMarkerIndexFromHoveredItem(
    hoveredPosition: HoveredPosition | null
  ): {| index: number, type: 'marker' | 'call-node' |} | null {
    if (hoveredPosition === null) {
      return null;
    }

    const hoveredItem = this._itemAtPosition(
      hoveredPosition.x,
      hoveredPosition.y
    );
    const lastDrawInfo = this._lastDrawInfo;
    if (hoveredItem === null || lastDrawInfo === null) {
      return null;
    }

    switch (hoveredItem.type) {
      case 'STACK': {
        const { depth, stackTimingIndex } = hoveredItem;
        const { stackTimingRows } = lastDrawInfo;
        const { callNodeInfo } = this.props;

        const callPath = [];
        let currentIndex = stackTimingIndex;
        for (let currentDepth = depth; currentDepth >= 0; currentDepth--) {
          const currentRow = stackTimingRows[currentDepth];
          callPath.push(currentRow.func[currentIndex]);
          currentIndex = currentRow.parentIndexInPreviousRow[currentIndex];
        }
        callPath.reverse();

        const callNodeIndex = ensureExists(
          callNodeInfo.getCallNodeIndexFromPath(callPath)
        );
        return { index: callNodeIndex, type: 'call-node' };
      }
      case 'USER_TIMING': {
        const userTimingRows = ensureExists(lastDrawInfo.userTimingRows);
        const index =
          userTimingRows[hoveredItem.rowIndex].index[hoveredItem.marker];
        return { index, type: 'marker' };
      }
      default:
        throw assertExhaustiveCheck(hoveredItem.type);
    }
  }

  _onSelectItem = (hoveredItem: HoveredPosition | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const result =
      this._getCallNodeIndexOrMarkerIndexFromHoveredItem(hoveredItem);
    if (!result) {
      this.props.onSelectionChange(null);
      return;
    }

    // TODO implement selecting user timing markers #2355
    if (result.type === 'call-node') {
      this.props.onSelectionChange(result.index);
    }
  };

  _onRightClick = (hoveredItem: HoveredPosition | null) => {
    const result =
      this._getCallNodeIndexOrMarkerIndexFromHoveredItem(hoveredItem);
    // TODO implement right clicking user timing markers #2354
    if (result && result.type === 'call-node') {
      this.props.onRightClick(result.index);
    }
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredPosition | null => {
    return { x, y };
  };

  _itemAtPosition = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const lastDrawInfo = this._lastDrawInfo;
    if (lastDrawInfo === null) {
      return null;
    }

    const {
      stackTimingRows,
      cssToDeviceScale,
      viewportTopDev,
      userTimingHeaderHeightDev,
      rowHeightDev,
      userTimingRows,
      timeAtOuterStart,
      devPxPerMs,
    } = lastDrawInfo;

    const xDev = x * cssToDeviceScale;
    const yDev = viewportTopDev + y * cssToDeviceScale;

    if (yDev < userTimingHeaderHeightDev) {
      if (userTimingRows !== null) {
        const rowIndex = Math.floor(yDev / rowHeightDev);
        if (rowIndex < 0 || rowIndex >= userTimingRows.length) {
          return null;
        }
        const xMillis = timeAtOuterStart + xDev / devPxPerMs;
        const row = userTimingRows[rowIndex];
        for (let i = 0; i < row.length; i++) {
          if (xMillis >= row.start[i] && xMillis < row.end[i]) {
            console.log({xMillis, rowIndex, row, i});
            return { type: 'USER_TIMING', rowIndex, marker: i };
          }
        }
      }
      return null;
    }

    const depth = Math.floor((yDev - userTimingHeaderHeightDev) / rowHeightDev);
    if (depth >= stackTimingRows.length) {
      return null;
    }

    const hoveredRow = stackTimingRows[depth];
    const stackTimingIndex = bisectionRight(hoveredRow.start, xDev) - 1;
    if (stackTimingIndex < 0 || hoveredRow.end[stackTimingIndex] <= xDev) {
      return null;
    }

    return { type: 'STACK', depth, stackTimingIndex };
  };

  onMouseMove = (event: { nativeEvent: MouseEvent }) => {
    const {
      changeMouseTimePosition,
      rangeStart,
      rangeEnd,
      marginLeft,
      viewport: { viewportLeft, viewportRight, containerWidth },
    } = this.props;
    const innerDevicePixelsWidth =
      containerWidth - marginLeft - TIMELINE_MARGIN_RIGHT;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft +
      viewportLength *
        ((event.nativeEvent.offsetX - marginLeft) / innerDevicePixelsWidth);
    if (unitIntervalTime < 0 || unitIntervalTime > 1) {
      changeMouseTimePosition(null);
    } else {
      const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
      changeMouseTimePosition(time);
    }
  };

  onMouseLeave = () => {
    this.props.changeMouseTimePosition(null);
  };

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        scaleCtxToCssPixels={false}
        className="stackChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this._onDoubleClick}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
        onMouseMove={this.onMouseMove}
        onMouseLeave={this.onMouseLeave}
        onSelectItem={this._onSelectItem}
        onRightClick={this._onRightClick}
      />
    );
  }
}

export const StackChartCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props,
>)(StackChartCanvasImpl);
