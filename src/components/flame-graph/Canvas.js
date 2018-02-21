/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import TextMeasurement from '../../utils/text-measurement';
import { funcToImplementation } from '../../profile-logic/transforms';

import type { Thread } from '../../types/profile';
import type { CssPixels } from '../../types/units';
import type {
  FlameGraphTiming,
  FlameGraphDepth,
  IndexIntoFlameGraphTiming,
} from '../../profile-logic/flame-graph';

import type { CallNodeInfo, Implementation } from '../../types/profile-derived';
import type { Viewport } from '../shared/chart/Viewport';

export type OwnProps = {|
  +thread: Thread,
  +maxStackDepth: number,
  +flameGraphTiming: FlameGraphTiming,
  +callNodeInfo: CallNodeInfo,
  +stackFrameHeight: CssPixels,
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

require('./Canvas.css');

const ROW_HEIGHT = 16;
const TEXT_OFFSET_START = 3;
const TEXT_OFFSET_TOP = 11;

class FlameGraphCanvas extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;

  constructor(props: Props) {
    super(props);
    (this: any)._getHoveredStackInfo = this._getHoveredStackInfo.bind(this);
    (this: any)._drawCanvas = this._drawCanvas.bind(this);
    (this: any)._hitTest = this._hitTest.bind(this);
  }

  getColor(implementation: Implementation, selfTimeRelative: number): string {
    let h, s, l;
    // The more self time a function has, the darker the color
    // returned.  Do this by subtracting a lightness value from a base
    // color for a particular implementation.  `a` and `b` are factors
    // used in calcuating how much ligthness to subtract.  `limit` is
    // the lower limit of the lightness.
    let a, b, limit;

    if (implementation === 'cpp') {
      [h, s, l] = [358, 98, 82];
      a = 4;
      b = 5;
      limit = 55;
    } else if (implementation === 'js') {
      [h, s, l] = [188, 53, 71];
      a = 8;
      b = 6;
      limit = 40;
    } else {
      // Unknown implementation
      [h, s, l] = [77, 70, 71];
      a = 10;
      b = 10;
      limit = 40;
    }

    l -= a * Math.log(b * selfTimeRelative * 100 + 1);
    l = Math.max(l, limit);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  _drawCanvas(
    ctx: CanvasRenderingContext2D,
    hoveredItem: HoveredStackTiming | null
  ) {
    const {
      thread,
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
      stackFrameHeight,
      maxStackDepth,
      viewport: {
        containerWidth,
        containerHeight,
        viewportTop,
        viewportBottom,
      },
    } = this.props;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const startDepth = Math.floor(
      maxStackDepth - viewportBottom / stackFrameHeight
    );
    const endDepth = Math.ceil(maxStackDepth - viewportTop / stackFrameHeight);

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = flameGraphTiming[depth];

      if (!stackTiming) {
        continue;
      }

      for (let i = 0; i < stackTiming.length; i++) {
        const startTime = stackTiming.start[i];
        const endTime = stackTiming.end[i];

        const x: CssPixels = startTime * containerWidth;
        const y: CssPixels =
          (maxStackDepth - depth - 1) * ROW_HEIGHT - viewportTop;
        const w: CssPixels = (endTime - startTime) * containerWidth;
        const h: CssPixels = ROW_HEIGHT - 1;

        if (w < 2) {
          // Skip sending draw calls for sufficiently small boxes.
          continue;
        }

        const callNodeIndex = stackTiming.callNode[i];
        const funcIndex = callNodeTable.func[callNodeIndex];
        const funcName = thread.stringTable.getString(
          thread.funcTable.name[funcIndex]
        );

        const isHovered =
          hoveredItem &&
          depth === hoveredItem.depth &&
          i === hoveredItem.flameGraphTimingIndex;

        const implementation = funcToImplementation(thread, funcIndex);
        const color = this.getColor(
          implementation,
          stackTiming.selfTimeRelative[i]
        );

        ctx.fillStyle = isHovered ? 'Highlight' : color;
        ctx.fillRect(x, y, w, h);
        // Ensure spacing between blocks.
        ctx.clearRect(x, y, 1, h);

        // TODO - L10N RTL.
        // Constrain the x coordinate to the leftmost area.
        const x2: CssPixels = Math.max(x, 0) + TEXT_OFFSET_START;
        const w2: CssPixels = Math.max(0, w - (x2 - x));

        if (w2 > textMeasurement.minWidth) {
          const fittedText = textMeasurement.getFittedText(funcName, w2);
          if (fittedText) {
            ctx.fillStyle = isHovered ? 'HighlightText' : '#000000';
            ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
          }
        }
      }
    }
  }

  _getHoveredStackInfo({
    depth,
    flameGraphTimingIndex,
  }: HoveredStackTiming): React.Node {
    const {
      thread,
      flameGraphTiming,
      callNodeInfo: { callNodeTable },
    } = this.props;
    const stackTiming = flameGraphTiming[depth];

    const duration =
      stackTiming.end[flameGraphTimingIndex] -
      stackTiming.start[flameGraphTimingIndex];

    const callNodeIndex = stackTiming.callNode[flameGraphTimingIndex];
    const funcIndex = callNodeTable.func[callNodeIndex];
    const funcName = thread.stringTable.getString(
      thread.funcTable.name[funcIndex]
    );

    const implementation = funcToImplementation(thread, funcIndex);
    const color = this.getColor(
      implementation,
      stackTiming.selfTimeRelative[flameGraphTimingIndex]
    );

    let implementationLabel = 'Unknown';
    if (implementation === 'js') {
      implementationLabel = 'JS';
    } else if (implementation === 'cpp') {
      implementationLabel = 'C++';
    }
    const { totalTime, selfTime } = stackTiming.display[flameGraphTimingIndex];

    return (
      <div className="flameGraphCanvasTooltip">
        <div className="tooltipOneLine tooltipHeader">
          <div className="tooltipTiming">{(100 * duration).toFixed(2)}%</div>
          <div className="tooltipTitle">{funcName}</div>
        </div>
        <div className="tooltipDetails">
          <div className="tooltipLabel">Implementation:</div>
          <div>
            <div className="tooltipSwatch" style={{ backgroundColor: color }} />
            {implementationLabel}
          </div>
          <div className="tooltipLabel">Running Time (ms):</div>
          <div>{totalTime}</div>
          <div className="tooltipLabel">Self (ms):</div>
          <div>{selfTime}</div>
        </div>
      </div>
    );
  }

  _hitTest(x: CssPixels, y: CssPixels): HoveredStackTiming | null {
    const {
      flameGraphTiming,
      maxStackDepth,
      viewport: { viewportTop, containerWidth },
    } = this.props;
    const pos = x / containerWidth;
    const depth = Math.floor(maxStackDepth - (y + viewportTop) / ROW_HEIGHT);
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
  }

  _noOp = () => {};

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <ChartCanvas
        className="flameGraphCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this._noOp}
        getHoveredItemInfo={this._getHoveredStackInfo}
        drawCanvas={this._drawCanvas}
        hitTest={this._hitTest}
      />
    );
  }
}

export default (withChartViewport: WithChartViewport<OwnProps, Props>)(
  FlameGraphCanvas
);
