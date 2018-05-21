/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';
import photonColors from 'photon-colors';

import type { Thread, CategoryList } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';

function createDiagonalRepeatGradient(ctx, color) {
  const c = document.createElement('canvas');
  const dpr = Math.round(window.devicePixelRatio);
  c.width = 4 * dpr;
  c.height = 4 * dpr;
  const cctx = c.getContext('2d');
  cctx.scale(dpr, dpr);
  const linear = cctx.createLinearGradient(0, 0, 4, 4);
  linear.addColorStop(0, color);
  linear.addColorStop(0.25, color);
  linear.addColorStop(0.25, 'transparent');
  linear.addColorStop(0.5, 'transparent');
  linear.addColorStop(0.5, color);
  linear.addColorStop(0.75, color);
  linear.addColorStop(0.75, 'transparent');
  linear.addColorStop(1, 'transparent');
  cctx.fillStyle = linear;
  cctx.fillRect(0, 0, 4, 4);
  return ctx.createPattern(c, 'repeat');
}

type Props = {|
  +thread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +className: string,
  +onStackClick: (time: Milliseconds) => void,
  +categories: CategoryList,
|};

class ThreadActivityGraph extends PureComponent<Props> {
  _canvas: null | HTMLCanvasElement;
  _requestedAnimationFrame: boolean;
  _resizeListener: () => void;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) =>
    (this._canvas = canvas);

  constructor(props: Props) {
    super(props);
    this._resizeListener = () => this.forceUpdate();
    this._requestedAnimationFrame = false;
    this._canvas = null;
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas;
        if (canvas) {
          timeCode('ThreadActivityGraph render', () => {
            this.drawCanvas(canvas);
          });
        }
      });
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      categories,
      thread,
      interval,
      rangeStart,
      rangeEnd,
      // callNodeInfo,
      // selectedCallNodeIndex,
    } = this.props;
    const { samples, stackTable } = thread;

    const rangeLength = rangeEnd - rangeStart;

    const devicePixelRatio = canvas.ownerDocument
      ? canvas.ownerDocument.defaultView.devicePixelRatio
      : 1;
    const r = canvas.getBoundingClientRect();
    const pixelWidth = Math.round(r.width * devicePixelRatio);
    const pixelHeight = Math.round(r.height * devicePixelRatio);
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    const xPixelsPerMs = pixelWidth / rangeLength;

    const colorMap = {
      transparent: { fillStyle: 'transparent', gravity: 0 },
      purple: { fillStyle: photonColors.PURPLE_50, gravity: 5 },
      green: { fillStyle: photonColors.GREEN_60, gravity: 4 },
      orange: { fillStyle: photonColors.ORANGE_60, gravity: 2 },
      yellow: { fillStyle: photonColors.YELLOW_60, gravity: 6 },
      lightblue: { fillStyle: photonColors.BLUE_40, gravity: 1 },
      grey: { fillStyle: photonColors.GREY_40, gravity: 8 },
      blue: { fillStyle: photonColors.BLUE_60, gravity: 3 },
      brown: { fillStyle: photonColors.MAGENTA_60, gravity: 7 },
    };

    const categoryInfos = categories.map(({ color: colorName }) => {
      const { fillStyle, gravity } = colorMap[colorName];
      return {
        gravity,
        activeFillStyle: fillStyle,
        inactiveFillStyle: createDiagonalRepeatGradient(ctx, fillStyle),
        activePercentageAtPixel: new Float32Array(pixelWidth),
        inactivePercentageAtPixel: new Float32Array(pixelWidth),
      };
    });

    const greyCategoryIndex =
      categories.findIndex(c => c.color === 'grey') || 0;

    function accumulateIntoCategory(
      category,
      sampleIndex,
      prevSampleTime,
      sampleTime,
      nextSampleTime
    ) {
      if (sampleTime < rangeStart || sampleTime >= rangeEnd) {
        return;
      }

      const categoryInfo = categoryInfos[category];
      if (categoryInfo.activeFillStyle === 'transparent') {
        return;
      }

      const sampleStart = (prevSampleTime + sampleTime) / 2;
      const sampleEnd = (sampleTime + nextSampleTime) / 2;
      let pixelStart = (sampleStart - rangeStart) * xPixelsPerMs;
      let pixelEnd = (sampleEnd - rangeStart) * xPixelsPerMs;
      pixelStart = Math.max(0, pixelStart);
      pixelEnd = Math.min(pixelWidth - 1, pixelEnd);
      const intPixelStart = pixelStart | 0;
      const intPixelEnd = pixelEnd | 0;

      const thisSampleWasFilteredOut = false;
      //filteredSampleStacks[sampleIndex] === null;
      const categoryArray = thisSampleWasFilteredOut
        ? categoryInfo.inactivePercentageAtPixel
        : categoryInfo.activePercentageAtPixel;
      for (let i = intPixelStart; i <= intPixelEnd; i++) {
        categoryArray[i] += 1;
      }
      categoryArray[intPixelStart] -= pixelStart - intPixelStart;
      categoryArray[intPixelEnd] -= 1 - (pixelEnd - intPixelEnd);
    }

    let prevSampleTime = samples.time[0] - interval;
    let sampleTime = samples.time[0];
    for (let i = 0; i < samples.length - 1; i++) {
      const nextSampleTime = samples.time[i + 1];
      const stackIndex = samples.stack[i];
      const category =
        stackIndex !== null
          ? stackTable.category[stackIndex]
          : greyCategoryIndex;
      accumulateIntoCategory(
        category,
        i,
        prevSampleTime,
        sampleTime,
        nextSampleTime
      );
      prevSampleTime = sampleTime;
      sampleTime = nextSampleTime;
    }
    const lastSampleStack = samples.stack[samples.length - 1];
    const lastSampleCategory =
      lastSampleStack !== null
        ? stackTable.category[lastSampleStack]
        : greyCategoryIndex;
    accumulateIntoCategory(
      lastSampleCategory,
      samples.length - 1,
      prevSampleTime,
      sampleTime,
      sampleTime + interval
    );

    function boxBlur1D(srcArray, destArray, radius) {
      if (srcArray.length < radius) {
        destArray.set(srcArray);
        return;
      }

      // We treat values outside the range as zero.
      let total = 0;
      for (let kx = 0; kx <= radius; ++kx) {
        total += srcArray[kx];
      }
      destArray[0] = total / (radius * 2 + 1);

      for (let x = 1; x < radius + 1; ++x) {
        total += srcArray[x + radius];
        destArray[x] = total / (radius * 2 + 1);
      }
      for (let x = radius + 1; x < pixelWidth - radius; ++x) {
        total -= srcArray[x - radius - 1];
        total += srcArray[x + radius];
        destArray[x] = total / (radius * 2 + 1);
      }
      for (let x = pixelWidth - radius; x < pixelWidth; ++x) {
        total -= srcArray[x - radius - 1];
        destArray[x] = total / (radius * 2 + 1);
      }
    }

    let scratchArray = new Float32Array(pixelWidth);
    function gaussianBlur1D(srcArray) {
      const destArray = scratchArray;
      boxBlur1D(srcArray, destArray, 3);
      boxBlur1D(destArray, srcArray, 2);
      boxBlur1D(srcArray, destArray, 2);
      scratchArray = srcArray;
      return destArray;
    }

    categoryInfos.sort((a, b) => b.gravity - a.gravity);

    const individualBuckets = [].concat(
      ...categoryInfos.map(categoryInfo => [
        {
          fillStyle: categoryInfo.activeFillStyle,
          array: gaussianBlur1D(categoryInfo.activePercentageAtPixel),
        },
        {
          fillStyle: categoryInfo.inactiveFillStyle,
          array: gaussianBlur1D(categoryInfo.inactivePercentageAtPixel),
        },
      ])
    );

    let lastCumulativeArray = individualBuckets[0].array;
    for (const { array } of individualBuckets.slice(1)) {
      for (let i = 0; i < pixelWidth; i++) {
        array[i] += lastCumulativeArray[i];
      }
      lastCumulativeArray = array;
    }

    // Draw adjacent filled paths using Operator ADD and disjoint paths.
    // This avoids any bleeding and seams.
    // lighter === OP_ADD
    ctx.globalCompositeOperation = 'lighter';
    lastCumulativeArray = new Float32Array(pixelWidth);
    for (const { fillStyle, array } of individualBuckets) {
      const cumulativeArray = array;
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(0, (1 - lastCumulativeArray[0]) * pixelHeight);
      for (let i = 1; i < pixelWidth; i++) {
        ctx.lineTo(i, (1 - lastCumulativeArray[i]) * pixelHeight);
      }
      for (let i = pixelWidth - 1; i >= 0; i--) {
        ctx.lineTo(i, (1 - cumulativeArray[i]) * pixelHeight);
      }
      ctx.closePath();
      ctx.fill();
      lastCumulativeArray = cumulativeArray;
    }
  }

  _onMouseUp = (e: SyntheticMouseEvent<>) => {
    const canvas = this._canvas;
    if (canvas) {
      const { rangeStart, rangeEnd } = this.props;
      const r = canvas.getBoundingClientRect();

      const x = e.pageX - r.left;
      const time = rangeStart + x / r.width * (rangeEnd - rangeStart);
      this.props.onStackClick(time);
    }
  };

  render() {
    this._scheduleDraw();
    return (
      <div className={this.props.className}>
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadStackGraphCanvas'
          )}
          ref={this._takeCanvasRef}
          onMouseUp={this._onMouseUp}
        />
      </div>
    );
  }
}

export default ThreadActivityGraph;
