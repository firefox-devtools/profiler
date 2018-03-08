/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import colors from 'photon-colors';
import { interpolateRgb } from 'd3-interpolate';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import TextMeasurement from '../../utils/text-measurement';
import { getStackType } from '../../profile-logic/transforms';

import type { Thread } from '../../types/profile';
import type { CssPixels } from '../../types/units';
import type {
  FlameGraphTiming,
  FlameGraphDepth,
  IndexIntoFlameGraphTiming,
} from '../../profile-logic/flame-graph';

import type { CallNodeInfo, StackType } from '../../types/profile-derived';
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

/* Return the background and foreground colors used to paint a box in
 * the flame graph. The passed stack type determines the hue while the
 * self time determines the lightness of the color. Darker colors
 * indicate higher self times. */
export function getColors(
  stackType: StackType,
  selfTimeRelative: number
): {| background: string, foreground: string |} {
  /* The background colors below are defined as a range where the
   * starting color is the color shown when the function has no self
   * time at all, and the ending color is when all available self time
   * (the total time) in the flame graph is assigned to a single
   * function. This latter case occurs when there's only a single box
   * at the top, stretching over all horizontal space in the graph,
   * covering all boxes below it. When the self time lies in between
   * these two extremes, the color is an interpolated value lying
   * between the starting and ending colors in the range.
   *
   * The interpolated color is derived from `selfTimeRelative`, which
   * is the self time of the frame relative to all available self time
   * possibly represented in the flame graph. However, using this
   * value to interpolate to a color linearly will require the value
   * to be relatively big in order to be able to see the shift in
   * color, and such large self times would be visually apparent from
   * the shape of the flame graph anyway. We are better off if we can
   * discern also small values of self time from the color, and this
   * is accomplished by changing the linear interpolation to a
   * logarithmic one instead, with a steep increase in the beginning.
   *
   * Below we use the transformation y(x) = log(c * x + 1) / log(c + 1),
   * where c is a constant. It has the property that y(0) = 0 and
   * y(1) = 1. The constant has been chosen by visual inspection of
   * the graph. */

  let backgroundRange: [string, string];
  let foreground: string;

  const t = Math.log(5000 * selfTimeRelative + 1) / Math.log(5001);

  switch (stackType) {
    case 'native':
      backgroundRange = [colors.BLUE_40, colors.BLUE_70];
      foreground = t > 0.25 ? '#ffffff' : colors.BLUE_90;
      break;
    case 'js':
      backgroundRange = [colors.ORANGE_50, colors.ORANGE_70];
      foreground = t > 0.33 ? '#ffffff' : colors.ORANGE_90;
      break;
    case 'unsymbolicated':
      backgroundRange = [colors.GREY_30, colors.GREY_50];
      foreground = t > 0.33 ? '#ffffff' : colors.GREY_90;
      break;
    default:
      throw new Error(`Unknown stack type case "${(stackType: empty)}".`);
  }
  return { background: interpolateRgb(...backgroundRange)(t), foreground };
}

class FlameGraphCanvas extends React.PureComponent<Props> {
  _textMeasurement: null | TextMeasurement;

  constructor(props: Props) {
    super(props);
    (this: any)._getHoveredStackInfo = this._getHoveredStackInfo.bind(this);
    (this: any)._drawCanvas = this._drawCanvas.bind(this);
    (this: any)._hitTest = this._hitTest.bind(this);
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

        const stackType = getStackType(thread, funcIndex);
        const { background, foreground } = getColors(
          stackType,
          stackTiming.selfTimeRelative[i]
        );

        ctx.fillStyle = isHovered ? 'Highlight' : background;
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
            ctx.fillStyle = isHovered ? 'HighlightText' : foreground;
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

    const stackType = getStackType(thread, funcIndex);
    const { background } = getColors(
      stackType,
      stackTiming.selfTimeRelative[flameGraphTimingIndex]
    );

    let stackTypeLabel;
    switch (stackType) {
      case 'native':
        stackTypeLabel = 'Native';
        break;
      case 'js':
        stackTypeLabel = 'JavaScript';
        break;
      case 'unsymbolicated':
        stackTypeLabel = 'Unsymbolicated Native';
        break;
      default:
        throw new Error(`Unknown stack type case "${stackType}".`);
    }
    const { totalTime, selfTime } = stackTiming.display[flameGraphTimingIndex];

    return (
      <div className="flameGraphCanvasTooltip">
        <div className="tooltipOneLine tooltipHeader">
          <div className="tooltipTiming">{(100 * duration).toFixed(2)}%</div>
          <div className="tooltipTitle">{funcName}</div>
        </div>
        <div className="tooltipDetails">
          <div className="tooltipLabel">Stack Type:</div>
          <div>
            <div
              className="tooltipSwatch"
              style={{ backgroundColor: background }}
            />
            {stackTypeLabel}
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
