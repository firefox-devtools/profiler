/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_30 } from 'photon-colors';
import * as React from 'react';
import memoize from 'memoize-immutable';
import { TIMELINE_MARGIN_RIGHT } from '../../app-logic/constants';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import { FastFillStyle } from '../../utils';
import TextMeasurement from '../../utils/text-measurement';
import { formatMilliseconds } from '../../utils/format-numbers';
import { updatePreviewSelection } from '../../actions/profile-view';
import { mapCategoryColorNameToStackChartStyles } from '../../utils/colors';
import { TooltipCallNode } from '../tooltip/CallNode';
import { TooltipMarker } from '../tooltip/Marker';

import type {
  Thread,
  CategoryList,
  PageList,
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
} from 'firefox-profiler/types';

import type {
  StackTimingDepth,
  IndexIntoStackTiming,
} from '../../profile-logic/stack-timing';
import type { Viewport } from '../shared/chart/Viewport';
import type { WrapFunctionInDispatch } from '../../utils/connect';

type OwnProps = {|
  +thread: Thread,
  +pages: PageList | null,
  +threadsKey: ThreadsKey,
  +interval: Milliseconds,
  +weightType: WeightType,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +combinedTimingRows: CombinedTimingRows,
  +stackFrameHeight: CssPixels,
  +updatePreviewSelection: WrapFunctionInDispatch<
    typeof updatePreviewSelection
  >,
  +getMarker: Function,
  +categories: CategoryList,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
  +onRightClick: (IndexIntoCallNodeTable | null) => void,
  +shouldDisplayTooltips: () => boolean,
  +scrollToSelectionGeneration: number,
  +marginLeft: CssPixels,
|};

type Props = $ReadOnly<{|
  ...OwnProps,
  +viewport: Viewport,
|}>;

type HoveredStackTiming = {|
  +depth: StackTimingDepth,
  +stackTimingIndex: IndexIntoStackTiming,
|};

require('./Canvas.css');

const ROW_CSS_PIXELS_HEIGHT = 16;
const TEXT_CSS_PIXELS_OFFSET_START = 3;
const TEXT_CSS_PIXELS_OFFSET_TOP = 11;
const FONT_SIZE = 10;
const BORDER_OPACITY = 0.4;

class StackChartCanvasImpl extends React.PureComponent<Props> {
  _leftMarginGradient: null | CanvasGradient = null;
  _rightMarginGradient: null | CanvasGradient = null;

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
    const {
      selectedCallNodeIndex,
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) {
      return;
    }

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
    hoveredItem: HoveredStackTiming | null
  ) => {
    const {
      thread,
      rangeStart,
      rangeEnd,
      combinedTimingRows,
      stackFrameHeight,
      selectedCallNodeIndex,
      categories,
      callNodeInfo: { callNodeTable },
      getMarker,
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

    const { devicePixelRatio } = window;

    // Set the font size before creating a text measurer.
    ctx.font = `${FONT_SIZE * devicePixelRatio}px sans-serif`;
    const textMeasurement = new TextMeasurement(ctx);

    const devicePixelsWidth = containerWidth * devicePixelRatio;
    const devicePixelsHeight = containerHeight * devicePixelRatio;

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, devicePixelsWidth, devicePixelsHeight);

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const viewportDevicePixelsTop = viewportTop * devicePixelRatio;

    // Convert CssPixels to Stack Depth
    const startDepth = Math.floor(viewportTop / stackFrameHeight);
    const endDepth = Math.ceil(viewportBottom / stackFrameHeight);

    const innerContainerWidth =
      containerWidth - marginLeft - TIMELINE_MARGIN_RIGHT;
    const innerDevicePixelsWidth = innerContainerWidth * devicePixelRatio;

    const pixelAtViewportPosition = (
      viewportPosition: UnitIntervalOfProfileRange
    ): DevicePixels =>
      devicePixelRatio *
      // The right hand side of this formula is all in CSS pixels.
      (marginLeft +
        ((viewportPosition - viewportLeft) * innerContainerWidth) /
          viewportLength);

    // Apply the device pixel ratio to various CssPixel constants.
    const rowDevicePixelsHeight = ROW_CSS_PIXELS_HEIGHT * devicePixelRatio;
    const oneCssPixelInDevicePixels = 1 * devicePixelRatio;
    const textDevicePixelsOffsetStart =
      TEXT_CSS_PIXELS_OFFSET_START * devicePixelRatio;
    const textDevicePixelsOffsetTop =
      TEXT_CSS_PIXELS_OFFSET_TOP * devicePixelRatio;

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = combinedTimingRows[depth];

      if (!stackTiming) {
        continue;
      }
      /*
       * TODO - Do an O(log n) binary search to find the only samples in range rather than
       * linear O(n) search for loops. Profile the results to see if this helps at all.
       *
       * const startSampleIndex = binarySearch(stackTiming.start, rangeStart + rangeLength * viewportLeft);
       * const endSampleIndex = binarySearch(stackTiming.end, rangeStart + rangeLength * viewportRight);
       */

      const pixelsInViewport = viewportLength * innerDevicePixelsWidth;
      const timePerPixel = rangeLength / pixelsInViewport;

      // Decide which samples to actually draw
      const timeAtStart: Milliseconds =
        rangeStart + rangeLength * viewportLeft - timePerPixel * marginLeft;
      const timeAtEnd: Milliseconds = rangeStart + rangeLength * viewportRight;

      let lastDrawnPixelX = 0;
      for (let i = 0; i < stackTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          stackTiming.end[i] > timeAtStart &&
          stackTiming.start[i] < timeAtEnd
        ) {
          // Draw a box, but increase the size by a small portion in order to draw
          // a single pixel at the end with a slight opacity.
          //
          // Legend:
          // |======|  A stack frame's timing.
          // |O|       A single fully opaque pixel.
          // |.|       A slightly transparent pixel.
          // | |       A fully transparent pixel.
          //
          // Drawing strategy:
          //
          // Frame timing   |=====||========|    |=====|    |=|     |=|=|=|=|
          // Device Pixels  |O|O|.|O|O|O|O|.| | |O|O|O|.| | |O|.| | |O|.|O|.|
          // CSS Pixels     |   |   |   |   |   |   |   |   |   |   |   |   |

          // First compute the left and right sides of the box.
          const viewportAtStartTime: UnitIntervalOfProfileRange =
            (stackTiming.start[i] - rangeStart) / rangeLength;
          const viewportAtEndTime: UnitIntervalOfProfileRange =
            (stackTiming.end[i] - rangeStart) / rangeLength;
          const floatX = pixelAtViewportPosition(viewportAtStartTime);
          const floatW: DevicePixels =
            ((viewportAtEndTime - viewportAtStartTime) *
              innerDevicePixelsWidth) /
              viewportLength -
            1;

          // Determine if there is enough pixel space to draw this box, and snap the
          // box to the pixels.
          let snappedFloatX = floatX;
          let snappedFloatW = floatW;
          let skipDraw = true;
          if (floatX >= lastDrawnPixelX) {
            // The x value is past the last lastDrawnPixelX, so it can be drawn.
            skipDraw = false;
          } else if (floatX + floatW > lastDrawnPixelX) {
            // The left side of the box is before the lastDrawnPixelX value, but the
            // right hand side is within a range to be drawn. Truncate the box a little
            // bit in order to draw it to the screen in the free space.
            snappedFloatW = floatW - (lastDrawnPixelX - floatX);
            snappedFloatX = lastDrawnPixelX;
            skipDraw = false;
          }

          if (skipDraw) {
            // This box didn't satisfy the constraints in the above if checks, so skip it.
            continue;
          }

          // Convert or compute all of the integer values for drawing the box.
          // Note, this should all be Math.round instead of floor and ceil, but some
          // off by one errors appear to be creating gaps where there shouldn't be any.
          const intX = Math.floor(snappedFloatX);
          const intY = Math.round(
            depth * rowDevicePixelsHeight - viewportDevicePixelsTop
          );
          const intW = Math.ceil(Math.max(1, snappedFloatW));
          const intH = Math.round(
            rowDevicePixelsHeight - oneCssPixelInDevicePixels
          );

          // Look up information about this stack frame.
          let text, category, isSelected;
          if (stackTiming.callNode) {
            const callNodeIndex = stackTiming.callNode[i];
            const funcIndex = callNodeTable.func[callNodeIndex];
            const funcNameIndex = thread.funcTable.name[funcIndex];
            text = thread.stringTable.getString(funcNameIndex);
            const categoryIndex = callNodeTable.category[callNodeIndex];
            category = categories[categoryIndex];
            isSelected = selectedCallNodeIndex === callNodeIndex;
          } else {
            const markerIndex = stackTiming.index[i];
            const markerPayload = ((getMarker(markerIndex)
              .data: any): UserTimingMarkerPayload);
            text = markerPayload.name;
            const categoryIndex = 0;
            category = categories[categoryIndex];
            isSelected = selectedCallNodeIndex === markerIndex;
          }

          const isHovered =
            hoveredItem &&
            depth === hoveredItem.depth &&
            i === hoveredItem.stackTimingIndex;

          const colorStyles = this._mapCategoryColorNameToStyles(
            category.color
          );
          // Draw the box.
          fastFillStyle.set(
            isHovered || isSelected
              ? colorStyles.selectedFillStyle
              : colorStyles.unselectedFillStyle
          );
          ctx.fillRect(
            intX,
            intY,
            // Add on a bit of BORDER_OPACITY to the end of the width, to draw a partial
            // pixel. This will effectively draw a transparent version of the fill color
            // without having to change the fill color. At the time of this writing it
            // was the same performance cost as only providing integer values here.
            intW + BORDER_OPACITY,
            intH
          );
          lastDrawnPixelX =
            intX +
            intW +
            // The border on the right is 1 device pixel wide.
            1;

          // Draw the text label if it fits. Use the original float values here so that
          // the text doesn't snap around when moving. Only the boxes should snap.
          const textX: DevicePixels =
            // Constrain the x coordinate to the leftmost area.
            Math.max(floatX, 0) + textDevicePixelsOffsetStart;
          const textW: DevicePixels = Math.max(0, floatW - (textX - floatX));

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

  // Provide a memoized function that maps the category color names to specific color
  // choices that are used across this project's charts.
  _mapCategoryColorNameToStyles = memoize(
    mapCategoryColorNameToStackChartStyles,
    {
      // Memoize every color that is seen.
      limit: Infinity,
    }
  );

  _getHoveredStackInfo = ({
    depth,
    stackTimingIndex,
  }: HoveredStackTiming): React.Node | null => {
    const {
      thread,
      weightType,
      threadsKey,
      combinedTimingRows,
      categories,
      callNodeInfo,
      getMarker,
      shouldDisplayTooltips,
      interval,
      pages,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const timing = combinedTimingRows[depth];

    if (timing.index) {
      const markerIndex = timing.index[stackTimingIndex];

      return (
        <TooltipMarker
          markerIndex={markerIndex}
          marker={getMarker(markerIndex)}
          threadsKey={threadsKey}
          restrictHeightWidth={true}
        />
      );
    }

    const callNodeIndex = timing.callNode[stackTimingIndex];
    const duration =
      timing.end[stackTimingIndex] - timing.start[stackTimingIndex];

    return (
      <TooltipCallNode
        thread={thread}
        weightType={weightType}
        pages={pages}
        interval={interval}
        callNodeIndex={callNodeIndex}
        callNodeInfo={callNodeInfo}
        categories={categories}
        // The stack chart doesn't support other call tree summary types.
        callTreeSummaryStrategy="timing"
        durationText={formatMilliseconds(duration)}
      />
    );
  };

  _onDoubleClickStack = (hoveredItem: HoveredStackTiming | null) => {
    if (hoveredItem === null) {
      return;
    }
    const { depth, stackTimingIndex } = hoveredItem;
    const { combinedTimingRows, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: combinedTimingRows[depth].start[stackTimingIndex],
      selectionEnd: combinedTimingRows[depth].end[stackTimingIndex],
    });
  };

  _getCallNodeIndexOrMarkerIndexFromHoveredItem(
    hoveredItem: HoveredStackTiming | null
  ): {| index: number, type: 'marker' | 'call-node' |} | null {
    if (hoveredItem === null) {
      return null;
    }

    const { depth, stackTimingIndex } = hoveredItem;
    const { combinedTimingRows } = this.props;

    if (combinedTimingRows[depth].callNode) {
      const callNodeIndex =
        combinedTimingRows[depth].callNode[stackTimingIndex];
      return { index: callNodeIndex, type: 'call-node' };
    }

    const index = combinedTimingRows[depth].index[stackTimingIndex];
    return { index, type: 'marker' };
  }

  _onSelectItem = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const result = this._getCallNodeIndexOrMarkerIndexFromHoveredItem(
      hoveredItem
    );

    if (!result) {
      this.props.onSelectionChange(null);
    }

    // TODO implement selecting user timing markers #2355
    if (result && result.type === 'call-node') {
      this.props.onSelectionChange(result.index);
    }
  };

  _onRightClick = (hoveredItem: HoveredStackTiming | null) => {
    const result = this._getCallNodeIndexOrMarkerIndexFromHoveredItem(
      hoveredItem
    );

    // TODO implement right clicking user timing markers #2354
    if (result && result.type === 'call-node') {
      this.props.onRightClick(result.index);
    }
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      rangeStart,
      rangeEnd,
      combinedTimingRows,
      marginLeft,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;

    const innerDevicePixelsWidth =
      containerWidth - marginLeft - TIMELINE_MARGIN_RIGHT;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft +
      viewportLength * ((x - marginLeft) / innerDevicePixelsWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const depth = Math.floor((y + viewportTop) / ROW_CSS_PIXELS_HEIGHT);
    const stackTiming = combinedTimingRows[depth];

    if (!stackTiming) {
      return null;
    }

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < time && end > time) {
        return { depth, stackTimingIndex: i };
      }
    }

    return null;
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
        onSelectItem={this._onSelectItem}
        onRightClick={this._onRightClick}
      />
    );
  }
}

export const StackChartCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props
>)(StackChartCanvasImpl);
