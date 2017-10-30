/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import withChartViewport from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import TextMeasurement from '../../utils/text-measurement';
import { formatNumber } from '../../utils/format-numbers';

import type { Thread } from '../../types/profile';
import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type {
  StackTimingByDepth,
  StackTimingDepth,
  IndexIntoStackTiming,
} from '../../profile-logic/stack-timing';
import type { GetCategory } from '../../profile-logic/color-categories';
import type { GetLabel } from '../../profile-logic/labeling-strategies';
import type { Action, ProfileSelection } from '../../types/actions';

type Props = {
  thread: Thread,
  interval: Milliseconds,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  containerWidth: CssPixels,
  containerHeight: CssPixels,
  viewportLeft: UnitIntervalOfProfileRange,
  viewportRight: UnitIntervalOfProfileRange,
  viewportTop: CssPixels,
  viewportBottom: CssPixels,
  stackTimingByDepth: StackTimingByDepth,
  stackFrameHeight: CssPixels,
  getCategory: GetCategory,
  getLabel: GetLabel,
  updateProfileSelection: ProfileSelection => Action,
  isDragging: boolean,
  isRowExpanded: boolean,
};

type HoveredStackTiming = {
  depth: StackTimingDepth,
  stackTableIndex: IndexIntoStackTiming,
};

require('./Canvas.css');

const ROW_HEIGHT = 16;
const TEXT_OFFSET_START = 3;
const TEXT_OFFSET_TOP = 11;

class StackChartCanvas extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;

  constructor(props: Props) {
    super(props);
    (this: any)._onDoubleClickStack = this._onDoubleClickStack.bind(this);
    (this: any)._getHoveredStackInfo = this._getHoveredStackInfo.bind(this);
    (this: any)._drawCanvas = this._drawCanvas.bind(this);
    (this: any)._hitTest = this._hitTest.bind(this);
  }

  /**
   * Draw the canvas.
   *
   * Note that most of the units are not absolute values, but unit intervals ranged from
   * 0 - 1. This was done to make the calculations easier for computing various zoomed
   * and translated views independent of any particular scale. See
   * src/components/shared/chart/Viewport.js for a diagram detailing the various
   * components of this set-up.
   */
  _drawCanvas(
    ctx: CanvasRenderingContext2D,
    hoveredItem: HoveredStackTiming | null
  ) {
    const {
      thread,
      rangeStart,
      rangeEnd,
      containerWidth,
      getLabel,
      containerHeight,
      stackTimingByDepth,
      stackFrameHeight,
      getCategory,
      viewportLeft,
      viewportRight,
      viewportTop,
      viewportBottom,
    } = this.props;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // Convert CssPixels to Stack Depth
    const startDepth = Math.floor(viewportTop / stackFrameHeight);
    const endDepth = Math.ceil(viewportBottom / stackFrameHeight);

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = stackTimingByDepth[depth];

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

      // Decide which samples to actually draw
      const timeAtViewportLeft: Milliseconds =
        rangeStart + rangeLength * viewportLeft;
      const timeAtViewportRight: Milliseconds =
        rangeStart + rangeLength * viewportRight;

      for (let i = 0; i < stackTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          stackTiming.end[i] > timeAtViewportLeft &&
          stackTiming.start[i] < timeAtViewportRight
        ) {
          const startTime: UnitIntervalOfProfileRange =
            (stackTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange =
            (stackTiming.end[i] - rangeStart) / rangeLength;

          const x: CssPixels =
            (startTime - viewportLeft) * containerWidth / viewportLength;
          const y: CssPixels = depth * ROW_HEIGHT - viewportTop;
          const w: CssPixels =
            (endTime - startTime) * containerWidth / viewportLength;
          const h: CssPixels = ROW_HEIGHT - 1;

          if (w < 2) {
            // Skip sending draw calls for sufficiently small boxes.
            continue;
          }

          const stackIndex = stackTiming.stack[i];
          const frameIndex = thread.stackTable.frame[stackIndex];
          const text = getLabel(thread, stackIndex);
          const category = getCategory(thread, frameIndex);
          const isHovered =
            hoveredItem &&
            depth === hoveredItem.depth &&
            i === hoveredItem.stackTableIndex;

          ctx.fillStyle = isHovered ? 'Highlight' : category.color;
          ctx.fillRect(x, y, w, h);
          // Ensure spacing between blocks.
          ctx.clearRect(x, y, 1, h);

          // TODO - L10N RTL.
          // Constrain the x coordinate to the leftmost area.
          const x2: CssPixels = Math.max(x, 0) + TEXT_OFFSET_START;
          const w2: CssPixels = Math.max(0, w - (x2 - x));

          if (w2 > textMeasurement.minWidth) {
            const fittedText = textMeasurement.getFittedText(text, w2);
            if (fittedText) {
              ctx.fillStyle = isHovered ? 'HighlightText' : '#000000';
              ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
            }
          }
        }
      }
    }
  }

  _getHoveredStackInfo({
    depth,
    stackTableIndex,
  }: HoveredStackTiming): React.Node {
    const {
      thread,
      getLabel,
      getCategory,
      stackTimingByDepth,
      isRowExpanded,
    } = this.props;
    const stackTiming = stackTimingByDepth[depth];

    const duration =
      stackTiming.end[stackTableIndex] - stackTiming.start[stackTableIndex];

    const stackIndex = stackTiming.stack[stackTableIndex];
    const frameIndex = thread.stackTable.frame[stackIndex];
    const label = getLabel(thread, stackIndex);
    const category = getCategory(thread, frameIndex);
    const funcIndex = thread.frameTable.func[frameIndex];

    let resourceOrFileName = null;
    // Only show resources or filenames if the chart is expanded, as collapsed stacks
    // would show incorrect details about a group of stacks.
    if (isRowExpanded) {
      // Only JavaScript functions have a filename.
      const fileNameIndex = thread.funcTable.fileName[funcIndex];
      if (fileNameIndex !== null) {
        // Because of our use of Grid Layout, all our elements need to be direct
        // children of the grid parent. That's why we use arrays here, to add
        // the elements as direct children.
        resourceOrFileName = [
          <div className="tooltipLabel" key="file">
            File:
          </div>,
          thread.stringTable.getString(fileNameIndex),
        ];
      } else {
        const resourceIndex = thread.funcTable.resource[funcIndex];
        if (resourceIndex !== -1) {
          const resourceNameIndex = thread.resourceTable.name[resourceIndex];
          if (resourceNameIndex !== -1) {
            // Because of our use of Grid Layout, all our elements need to be direct
            // children of the grid parent. That's why we use arrays here, to add
            // the elements as direct children.
            resourceOrFileName = [
              <div className="tooltipLabel" key="resource">
                Resource:
              </div>,
              thread.stringTable.getString(resourceNameIndex),
            ];
          }
        }
      }
    }

    return (
      <div className="stackChartCanvasTooltip">
        <div className="tooltipOneLine tooltipHeader">
          <div className="tooltipTiming">
            {formatNumber(duration)}ms
          </div>
          <div className="tooltipTitle">
            {label}
          </div>
        </div>
        <div className="tooltipDetails">
          <div className="tooltipLabel">Category:</div>
          <div>
            <div
              className="tooltipSwatch"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </div>
          {resourceOrFileName}
        </div>
      </div>
    );
  }

  _onDoubleClickStack(hoveredItem: HoveredStackTiming | null) {
    if (hoveredItem === null) {
      return;
    }
    const { depth, stackTableIndex } = hoveredItem;
    const { stackTimingByDepth, updateProfileSelection } = this.props;
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: stackTimingByDepth[depth].start[stackTableIndex],
      selectionEnd: stackTimingByDepth[depth].end[stackTableIndex],
    });
  }

  _hitTest(x: CssPixels, y: CssPixels): HoveredStackTiming | null {
    const {
      rangeStart,
      rangeEnd,
      viewportLeft,
      viewportRight,
      viewportTop,
      containerWidth,
      stackTimingByDepth,
    } = this.props;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * (x / containerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const depth = Math.floor((y + viewportTop) / ROW_HEIGHT);
    const stackTiming = stackTimingByDepth[depth];

    if (!stackTiming) {
      return null;
    }

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < time && end > time) {
        return { depth, stackTableIndex: i };
      }
    }

    return null;
  }

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props;

    return (
      <ChartCanvas
        className="stackChartCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this._onDoubleClickStack}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
      />
    );
  }
}

export default withChartViewport(StackChartCanvas);
