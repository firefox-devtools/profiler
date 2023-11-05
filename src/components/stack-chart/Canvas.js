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
import { ensureExists } from '../../utils/flow';
import { formatMilliseconds } from '../../utils/format-numbers';
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
  UserTimingMarkerPayload,
  WeightType,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CombinedTimingRows,
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
  +stackFrameHeight: CssPixels,
  +updatePreviewSelection: WrapFunctionInDispatch<
    typeof updatePreviewSelection,
  >,
  +changeMouseTimePosition: ChangeMouseTimePosition,
  +getMarker: (MarkerIndex) => Marker,
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

type HoveredStackTiming = {|
  +depth: StackTimingDepth,
  +stackTimingIndex: IndexIntoStackTiming,
|};

type HoveredPosition = {|
  +x: CssPixels,
  +y: CssPixels,
|};

type DrawInfo = {|
  stackTimingRows: StackTimingByDepth,
  cssToDeviceScale: number,
  viewportDevicePixelsTop: DevicePixels,
  rowDevicePixelsHeight: DevicePixels,
|};

import './Canvas.css';

const ROW_CSS_PIXELS_HEIGHT = 16;
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
      rangeStart,
      rangeEnd,
      stackFrameHeight,
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

    const devicePixelsWidth = containerWidth * cssToDeviceScale;
    const devicePixelsHeight = containerHeight * cssToDeviceScale;

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, devicePixelsWidth, devicePixelsHeight);

    // Length of the committed range
    const rangeLength: Milliseconds = rangeEnd - rangeStart;

    // Fraction of the committed range that's currently in the viewport
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    // function mapAffine(x1, y1, x2, y2, x3) {
    //   const m = (y2 - y1) / (x2 - x1);
    //   return m * (x3 - x1) + y1;
    // }

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
      devicePixelsWidth,
      selectedCallNodeIndex,
      defaultCategory,
      interval
    );

    const viewportDevicePixelsTop = viewportTop * cssToDeviceScale;

    // Convert CssPixels to Stack Depth
    const startDepth = Math.floor(viewportTop / stackFrameHeight);
    const endDepth = Math.ceil(viewportBottom / stackFrameHeight);

    const pixelAtViewportPosition = (
      viewportPosition: UnitIntervalOfProfileRange
    ): DevicePixels =>
      cssToDeviceScale *
      // The right hand side of this formula is all in CSS pixels.
      (marginLeft +
        ((viewportPosition - viewportLeft) * innerContainerWidth) /
          viewportLength);

    // Apply the device pixel ratio to various CssPixel constants.
    const rowDevicePixelsHeight = Math.round(
      ROW_CSS_PIXELS_HEIGHT * cssToDeviceScale
    );
    this._lastDrawInfo = {
      stackTimingRows,
      cssToDeviceScale,
      viewportDevicePixelsTop,
      rowDevicePixelsHeight,
    };

    const oneCssPixelInDevicePixels = 1 * cssToDeviceScale;
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
    const hoveredDepth = hoveredItem !== null ? hoveredItem.depth : null;
    const hoveredIndex =
      hoveredItem !== null ? hoveredItem.stackTimingIndex : null;

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = stackTimingRows[depth];

      if (!stackTiming) {
        continue;
      }

      const isHoveredDepth = hoveredDepth === depth;

      const intY = depth * rowDevicePixelsHeight - viewportDevicePixelsTop;
      const intH = rowDevicePixelsHeight - 1;

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
    ctx.fillRect(
      pixelAtViewportPosition(0),
      0,
      oneCssPixelInDevicePixels,
      devicePixelsHeight
    );
    ctx.fillRect(
      pixelAtViewportPosition(1),
      0,
      oneCssPixelInDevicePixels,
      devicePixelsHeight
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

    // const timing = combinedTimingRows[depth];

    // if (timing.index) {
    //   const markerIndex = timing.index[stackTimingIndex];

    //   return (
    //     <TooltipMarker
    //       markerIndex={markerIndex}
    //       marker={getMarker(markerIndex)}
    //       threadsKey={threadsKey}
    //       restrictHeightWidth={true}
    //     />
    //   );
    // }

    // const callNodeIndex = timing.callNode[stackTimingIndex];
    // const duration =
    //   timing.end[stackTimingIndex] - timing.start[stackTimingIndex];

    // return (
    //   <TooltipCallNode
    //     thread={thread}
    //     weightType={weightType}
    //     innerWindowIDToPageMap={innerWindowIDToPageMap}
    //     interval={interval}
    //     callNodeIndex={callNodeIndex}
    //     callNodeInfo={callNodeInfo}
    //     categories={categories}
    //     // The stack chart doesn't support other call tree summary types.
    //     callTreeSummaryStrategy="timing"
    //     durationText={formatMilliseconds(duration)}
    //     displayStackType={displayStackType}
    //   />
    // );
  };

  _onDoubleClickStack = (hoveredPosition: HoveredPosition | null) => {
    if (hoveredPosition === null) {
      return;
    }

    const hoveredItem = this._itemAtPosition(
      hoveredPosition.x,
      hoveredPosition.y
    );
    const lastDrawInfo = this._lastDrawInfo;
    if (hoveredItem === null || lastDrawInfo === null) {
      return;
    }

    const { depth, stackTimingIndex } = hoveredItem;
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

    // const index = combinedTimingRows[depth].index[stackTimingIndex];
    // return { index, type: 'marker' };
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
      viewportDevicePixelsTop,
      rowDevicePixelsHeight,
    } = lastDrawInfo;

    const xDev = x * cssToDeviceScale;
    const yDev = y * cssToDeviceScale;

    // TODO: Consider extra UserTiming row
    const depth = Math.floor(
      (yDev + viewportDevicePixelsTop) / rowDevicePixelsHeight
    );
    if (depth >= stackTimingRows.length) {
      return null;
    }

    const hoveredRow = stackTimingRows[depth];
    const stackTimingIndex = bisectionRight(hoveredRow.start, xDev) - 1;
    if (stackTimingIndex < 0 || hoveredRow.end[stackTimingIndex] <= xDev) {
      return null;
    }

    return { depth, stackTimingIndex };
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
        onDoubleClickItem={this._onDoubleClickStack}
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
