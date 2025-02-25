/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import memoize from 'memoize-immutable';
import {
  withChartViewport,
  type WithChartViewport,
  type Viewport,
} from '../shared/chart/Viewport';
import { ChartCanvas } from '../shared/chart/Canvas';
import { FastFillStyle } from '../../utils';
import TextMeasurement from '../../utils/text-measurement';
import { mapCategoryColorNameToStackChartStyles } from '../../utils/colors';
import {
  formatCallNodeNumberWithUnit,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import { TooltipCallNode } from 'firefox-profiler/components/tooltip/CallNode';
import { getTimingsForCallNodeIndex } from 'firefox-profiler/profile-logic/profile-data';
import MixedTupleMap from 'mixedtuplemap';

import type {
  Thread,
  CategoryList,
  CssPixels,
  DevicePixels,
  Milliseconds,
  IndexIntoCallNodeTable,
  CallTreeSummaryStrategy,
  WeightType,
  SamplesLikeTable,
  InnerWindowID,
  Page,
} from 'firefox-profiler/types';

import type {
  FlameGraphTiming,
  FlameGraphDepth,
  IndexIntoFlameGraphTiming,
} from 'firefox-profiler/profile-logic/flame-graph';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type {
  CallTree,
  CallTreeTimingsNonInverted,
} from 'firefox-profiler/profile-logic/call-tree';

export type OwnProps = {|
  +thread: Thread,
  +weightType: WeightType,
  +innerWindowIDToPageMap: Map<InnerWindowID, Page> | null,
  +unfilteredThread: Thread,
  +ctssSampleIndexOffset: number,
  +maxStackDepthPlusOne: number,
  +flameGraphTiming: FlameGraphTiming,
  +callNodeInfo: CallNodeInfo,
  +callTree: CallTree,
  +stackFrameHeight: CssPixels,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
  +onRightClick: (IndexIntoCallNodeTable | null) => void,
  +onDoubleClick: (IndexIntoCallNodeTable | null) => void,
  +shouldDisplayTooltips: () => boolean,
  +scrollToSelectionGeneration: number,
  +categories: CategoryList,
  +interval: Milliseconds,
  +isInverted: boolean,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +ctssSamples: SamplesLikeTable,
  +unfilteredCtssSamples: SamplesLikeTable,
  +tracedTiming: CallTreeTimingsNonInverted | null,
  +displayStackType: boolean,
|};

type Props = {|
  ...OwnProps,
  // Bring in the viewport props from the higher order Viewport component.
  +viewport: Viewport,
|};

type HoveredStackTiming = {|
  +depth: FlameGraphDepth,
  +flameGraphTimingIndex: IndexIntoFlameGraphTiming,
|};

import './Canvas.css';

const ROW_HEIGHT = 16;
const TEXT_OFFSET_START = 3;
const TEXT_OFFSET_TOP = 11;
const FONT_SIZE = 10;

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

class FlameGraphCanvasImpl extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;
  _textMeasurementCssToDeviceScale: number = 1;

  componentDidUpdate(prevProps) {
    // If the stack depth changes (say, when changing the time range
    // selection or applying a transform), move the viewport
    // vertically so that its offset from the base of the flame graph
    // is maintained.
    if (prevProps.maxStackDepthPlusOne !== this.props.maxStackDepthPlusOne) {
      this.props.viewport.moveViewport(
        0,
        (prevProps.maxStackDepthPlusOne - this.props.maxStackDepthPlusOne) *
          ROW_HEIGHT
      );
    }

    // We want to scroll the selection into view when this component
    // is mounted, but using componentDidMount won't work here as the
    // viewport will not have completed setting its size by
    // then. Instead, look for when the viewport's isSizeSet prop
    // changes to true.
    const viewportDidMount =
      !prevProps.viewport.isSizeSet && this.props.viewport.isSizeSet;

    if (
      viewportDidMount ||
      this.props.scrollToSelectionGeneration >
        prevProps.scrollToSelectionGeneration
    ) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const { selectedCallNodeIndex, maxStackDepthPlusOne, callNodeInfo } =
      this.props;

    if (selectedCallNodeIndex === null) {
      return;
    }

    const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    const depth = callNodeTable.depth[selectedCallNodeIndex];
    const y = (maxStackDepthPlusOne - depth - 1) * ROW_HEIGHT;

    if (y < this.props.viewport.viewportTop) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportTop - y);
    } else if (y + ROW_HEIGHT > this.props.viewport.viewportBottom) {
      this.props.viewport.moveViewport(
        0,
        this.props.viewport.viewportBottom - (y + ROW_HEIGHT)
      );
    }
  };

  _drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<HoveredStackTiming>
  ) => {
    const {
      thread,
      flameGraphTiming,
      callNodeInfo,
      stackFrameHeight,
      maxStackDepthPlusOne,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      categories,
      viewport: {
        containerWidth,
        containerHeight,
        viewportTop,
        viewportBottom,
      },
    } = this.props;

    const { hoveredItem } = hoverInfo;

    const { cssToDeviceScale, cssToUserScale } = scale;
    if (cssToDeviceScale !== cssToUserScale) {
      throw new Error(
        'FlameGraphCanvasImpl sets scaleCtxToCssPixels={false}, so canvas user space units should be equal to device pixels.'
      );
    }

    const deviceContainerWidth = containerWidth * cssToDeviceScale;
    const deviceContainerHeight = containerHeight * cssToDeviceScale;

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

    const fastFillStyle = new FastFillStyle(ctx);
    const deviceHorizontalPadding: DevicePixels = Math.round(
      TEXT_OFFSET_START * cssToDeviceScale
    );

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, deviceContainerWidth, deviceContainerHeight);

    const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();

    const startDepth = Math.floor(
      maxStackDepthPlusOne - viewportBottom / stackFrameHeight
    );
    const endDepth = Math.ceil(
      maxStackDepthPlusOne - viewportTop / stackFrameHeight
    );

    // Only draw the stack frames that are vertically within view.
    // The graph is drawn from bottom to top, in order of increasing depth.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = flameGraphTiming[depth];

      if (!stackTiming) {
        continue;
      }

      const cssRowTop: CssPixels =
        (maxStackDepthPlusOne - depth - 1) * ROW_HEIGHT - viewportTop;
      const cssRowBottom: CssPixels =
        (maxStackDepthPlusOne - depth) * ROW_HEIGHT - viewportTop;
      const deviceRowTop: DevicePixels = snap(cssRowTop * cssToDeviceScale);
      const deviceRowBottom: DevicePixels =
        snap(cssRowBottom * cssToDeviceScale) - 1;
      const deviceRowHeight: DevicePixels = deviceRowBottom - deviceRowTop;

      const deviceTextTop =
        deviceRowTop + snap(TEXT_OFFSET_TOP * cssToDeviceScale);

      for (let i = 0; i < stackTiming.length; i++) {
        // For each box, snap the left and right edges to the nearest multiple
        // of two device pixels. If both edges snap to the same value, the box
        // becomes empty and is not drawn.
        //
        // Boxes which remain are at least two device pixels wide. We create a
        // translucent gap the end of each box by shifting the right edge to the
        // left by 0.8 device pixels, so that this gap pixel column is filled to
        // 20%.

        const boxLeftFraction = stackTiming.start[i];
        const boxRightFraction = stackTiming.end[i];
        const deviceBoxLeftUnsnapped = boxLeftFraction * deviceContainerWidth;
        const deviceBoxRightUnsnapped = boxRightFraction * deviceContainerWidth;

        const deviceBoxLeft: DevicePixels = snapValueToMultipleOf(
          deviceBoxLeftUnsnapped,
          2
        );
        const deviceBoxRight: DevicePixels =
          snapValueToMultipleOf(deviceBoxRightUnsnapped, 2) - 0.8;

        const deviceBoxWidth: DevicePixels = deviceBoxRight - deviceBoxLeft;
        if (deviceBoxWidth <= 0) {
          // Skip drawing boxes which snapped away to nothing.
          continue;
        }

        const callNodeIndex = stackTiming.callNode[i];
        const isSelected = selectedCallNodeIndex === callNodeIndex;
        const isRightClicked = rightClickedCallNodeIndex === callNodeIndex;
        const isHovered =
          hoveredItem &&
          depth === hoveredItem.depth &&
          i === hoveredItem.flameGraphTimingIndex;
        const isHighlighted = isSelected || isRightClicked || isHovered;

        const categoryIndex = callNodeTable.category[callNodeIndex];
        const category = categories[categoryIndex];
        const colorStyles = mapCategoryColorNameToStackChartStyles(
          category.color
        );

        const background = isHighlighted
          ? colorStyles.selectedFillStyle
          : colorStyles.unselectedFillStyle;

        fastFillStyle.set(background);
        ctx.fillRect(
          deviceBoxLeft,
          deviceRowTop,
          deviceBoxWidth,
          deviceRowHeight
        );

        const deviceTextLeft: DevicePixels =
          deviceBoxLeft + deviceHorizontalPadding;
        const deviceTextWidth: DevicePixels = deviceBoxRight - deviceTextLeft;
        if (deviceTextWidth > textMeasurement.minWidth) {
          const funcIndex = callNodeTable.func[callNodeIndex];
          const funcName = thread.stringTable.getString(
            thread.funcTable.name[funcIndex]
          );
          const fittedText = textMeasurement.getFittedText(
            funcName,
            deviceTextWidth
          );
          if (fittedText) {
            const foreground = isHighlighted
              ? colorStyles.selectedTextColor
              : '#000';
            fastFillStyle.set(foreground);
            // TODO - L10N RTL.
            ctx.fillText(fittedText, deviceTextLeft, deviceTextTop);
          }
        }
      }
    }
  };

  // Properly memoize this derived information for the Tooltip component.
  _getTimingsForCallNodeIndex = memoize(getTimingsForCallNodeIndex, {
    cache: new MixedTupleMap(),
  });

  _getHoveredStackInfo = ({
    depth,
    flameGraphTimingIndex,
  }: HoveredStackTiming): React.Node => {
    const {
      thread,
      unfilteredThread,
      ctssSampleIndexOffset,
      flameGraphTiming,
      callTree,
      callNodeInfo,
      shouldDisplayTooltips,
      categories,
      interval,
      callTreeSummaryStrategy,
      innerWindowIDToPageMap,
      weightType,
      ctssSamples,
      unfilteredCtssSamples,
      tracedTiming,
      displayStackType,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const stackTiming = flameGraphTiming[depth];
    if (!stackTiming) {
      return null;
    }
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    if (callNodeIndex === undefined) {
      return null;
    }

    const ratio =
      stackTiming.end[flameGraphTimingIndex] -
      stackTiming.start[flameGraphTimingIndex];

    let percentage = formatPercent(ratio);
    if (tracedTiming) {
      const time = formatCallNodeNumberWithUnit(
        'tracing-ms',
        false,
        tracedTiming.total[callNodeIndex]
      );
      percentage = `${time} (${percentage})`;
    }

    const shouldComputeTimings =
      // This is currently too slow for JS Tracer threads.
      !thread.isJsTracer &&
      // Only calculate this if our summary strategy is actually timing related.
      // This function could be made more generic to handle other summary
      // strategies, but it may not be worth implementing it.
      callTreeSummaryStrategy === 'timing';

    return (
      // Important! Only pass in props that have been properly memoized so this component
      // doesn't over-render.
      <TooltipCallNode
        thread={thread}
        weightType={weightType}
        innerWindowIDToPageMap={innerWindowIDToPageMap}
        interval={interval}
        callNodeIndex={callNodeIndex}
        callNodeInfo={callNodeInfo}
        categories={categories}
        durationText={percentage}
        displayData={callTree.getDisplayData(callNodeIndex)}
        callTreeSummaryStrategy={callTreeSummaryStrategy}
        timings={
          shouldComputeTimings
            ? this._getTimingsForCallNodeIndex(
                callNodeIndex,
                callNodeInfo,
                interval,
                unfilteredThread,
                ctssSampleIndexOffset,
                categories,
                ctssSamples,
                unfilteredCtssSamples
              )
            : undefined
        }
        displayStackType={displayStackType}
      />
    );
  };

  _getCallNodeIndexFromHoveredItem(
    hoveredItem: HoveredStackTiming | null
  ): IndexIntoCallNodeTable | null {
    if (hoveredItem === null) {
      return null;
    }

    const { depth, flameGraphTimingIndex } = hoveredItem;
    const { flameGraphTiming } = this.props;
    const stackTiming = flameGraphTiming[depth];
    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    return callNodeIndex;
  }

  _onSelectItem = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onSelectionChange(callNodeIndex);
  };

  _onRightClick = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onRightClick(callNodeIndex);
  };

  _onDoubleClick = (hoveredItem: HoveredStackTiming | null) => {
    const callNodeIndex = this._getCallNodeIndexFromHoveredItem(hoveredItem);
    this.props.onDoubleClick(callNodeIndex);
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      flameGraphTiming,
      maxStackDepthPlusOne,
      viewport: { viewportTop, containerWidth },
    } = this.props;
    const pos = x / containerWidth;
    const depth = Math.floor(
      maxStackDepthPlusOne - (y + viewportTop) / ROW_HEIGHT
    );
    const stackTiming = flameGraphTiming[depth];

    if (!stackTiming) {
      return null;
    }

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < pos && end > pos) {
        return { depth, flameGraphTimingIndex: i };
      }
    }

    return null;
  };

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="flameGraphCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        scaleCtxToCssPixels={false}
        onDoubleClickItem={this._onDoubleClick}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
        onSelectItem={this._onSelectItem}
        onRightClick={this._onRightClick}
        drawCanvasAfterRaf={false}
      />
    );
  }
}

export const FlameGraphCanvas = (withChartViewport: WithChartViewport<
  OwnProps,
  Props,
>)(FlameGraphCanvasImpl);
