/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * */
import * as React from 'react';
import { InView } from 'react-intersection-observer';
import type {
  ActivityFillGraphQuerier, CategoryDrawStyles } from './ActivityGraphFills';
import {
  computeActivityGraphFills,
} from './ActivityGraphFills';
import { timeCode } from 'firefox-profiler/utils/time-code';
import { mapCategoryColorNameToStyles } from 'firefox-profiler/utils/colors';

import type {
  Thread,
  Milliseconds,
  SelectedState,
  IndexIntoSamplesTable,
  CategoryList,
} from 'firefox-profiler/types';
import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';


type CanvasProps = {
  readonly className: string;
  readonly trackName: string;
  readonly fullThread: Thread;
  readonly rangeFilteredThread: Thread;
  readonly interval: Milliseconds;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly sampleIndexOffset: number;
  readonly samplesSelectedStates: null | SelectedState[];
  readonly treeOrderSampleComparator: (
    a: IndexIntoSamplesTable,
    b: IndexIntoSamplesTable
  ) => number;
  readonly categories: CategoryList;
  readonly passFillsQuerier: (param: ActivityFillGraphQuerier) => void;
  readonly onClick: (param: React.MouseEvent<HTMLCanvasElement>) => void;
  readonly enableCPUUsage: boolean;
} & SizeProps;

export class ActivityGraphCanvas extends React.PureComponent<CanvasProps> {
  _canvas: { current: null | HTMLCanvasElement } = React.createRef();
  _categoryDrawStyles: null | CategoryDrawStyles = null;
  _canvasState: { renderScheduled: boolean; inView: boolean } = {
    renderScheduled: false,
    inView: false,
  };

  _renderCanvas() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

    const canvas = this._canvas.current;
    if (canvas !== null) {
      timeCode('ThreadActivityGraph render', () => {
        this.drawCanvas(canvas);
      });
    }
  }

  /**
   * Get or lazily create the category info. It requires the 2d ctx to exist in order
   * to create the fill patterns.
   */
  _getCategoryDrawStyles(ctx: CanvasRenderingContext2D): CategoryDrawStyles {
    if (this._categoryDrawStyles === null) {
      // Lazily initialize this list.
      this._categoryDrawStyles = this.props.categories.map(
        ({ color: colorName }, categoryIndex) => {
          const styles = mapCategoryColorNameToStyles(colorName);
          return {
            ...styles,
            category: categoryIndex,
            filteredOutByTransformFillStyle: _createDiagonalStripePattern(
              ctx,
              styles.unselectedFillStyle
            ),
          };
        }
      );
    }

    return this._categoryDrawStyles;
  }

  _observerCallback = (inView: boolean, _entry: IntersectionObserverEntry) => {
    this._canvasState.inView = inView;
    if (!this._canvasState.renderScheduled) {
      // Skip if render is not scheduled.
      return;
    }

    this._renderCanvas();
  };

  override componentDidMount() {
    this._renderCanvas();
  }

  override componentDidUpdate() {
    this._renderCanvas();
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      fullThread,
      rangeFilteredThread,
      interval,
      rangeStart,
      rangeEnd,
      sampleIndexOffset,
      samplesSelectedStates,
      treeOrderSampleComparator,
      categories,
      enableCPUUsage,
      width,
      height,
    } = this.props;

    const ctx = canvas.getContext('2d')!;
    const canvasPixelWidth = Math.round(width * window.devicePixelRatio);
    const canvasPixelHeight = Math.round(height * window.devicePixelRatio);
    canvas.width = canvasPixelWidth;
    canvas.height = canvasPixelHeight;

    const { fills, fillsQuerier } = computeActivityGraphFills({
      canvasPixelWidth,
      canvasPixelHeight,
      fullThread,
      rangeFilteredThread,
      interval,
      rangeStart,
      rangeEnd,
      sampleIndexOffset,
      samplesSelectedStates,
      enableCPUUsage,
      xPixelsPerMs: canvasPixelWidth / (rangeEnd - rangeStart),
      treeOrderSampleComparator,
      greyCategoryIndex: categories.findIndex((c) => c.color === 'grey') || 0,
      categoryDrawStyles: this._getCategoryDrawStyles(ctx!),
    });

    // The value in fillsQuerier is needed in ActivityGraph but is computed in this method
    // The value had to be passed through the passFillsQuerier custom prop and received in ActivityGraph by a setter function
    this.props.passFillsQuerier(fillsQuerier);

    // Draw adjacent filled paths using Operator ADD and disjoint paths.
    // This avoids any bleeding and seams.
    // lighter === OP_ADD
    ctx.globalCompositeOperation = 'lighter';

    // The previousUpperEdge keeps track of where the "mountain ridge" is after the
    // previous fill.
    let previousUpperEdge = new Float32Array(canvasPixelWidth);
    for (const { fillStyle, accumulatedUpperEdge } of fills) {
      ctx.fillStyle = fillStyle;

      // Some fills might not span the full width of the graph - they have parts where
      // their contribution stays zero for some time. So instead of having one fill call
      // with a path that is mostly empty, we split the shape of the fill so that we have
      // potentially multiple fill calls, one fill call for each range during which the
      // fill has an uninterrupted sequence of non-zero-contribution pixels.
      let lastNonZeroRangeEnd = 0;
      while (lastNonZeroRangeEnd < canvasPixelWidth) {
        const currentNonZeroRangeStart = _findNextDifferentIndex(
          accumulatedUpperEdge,
          previousUpperEdge,
          lastNonZeroRangeEnd
        );
        if (currentNonZeroRangeStart >= canvasPixelWidth) {
          break;
        }
        let currentNonZeroRangeEnd = canvasPixelWidth;
        ctx.beginPath();
        ctx.moveTo(
          currentNonZeroRangeStart,
          (1 - previousUpperEdge[currentNonZeroRangeStart]) * canvasPixelHeight
        );
        for (let i = currentNonZeroRangeStart + 1; i < canvasPixelWidth; i++) {
          const lastVal = previousUpperEdge[i];
          const thisVal = accumulatedUpperEdge[i];
          ctx.lineTo(i, (1 - lastVal) * canvasPixelHeight);
          if (lastVal === thisVal) {
            currentNonZeroRangeEnd = i;
            break;
          }
        }
        for (
          let i = currentNonZeroRangeEnd - 1;
          i >= currentNonZeroRangeStart;
          i--
        ) {
          ctx.lineTo(i, (1 - accumulatedUpperEdge[i]) * canvasPixelHeight);
        }
        ctx.closePath();
        ctx.fill();

        lastNonZeroRangeEnd = currentNonZeroRangeEnd;
      }
      previousUpperEdge = accumulatedUpperEdge;
    }
  }

  override render() {
    const { className, trackName, onClick } = this.props;
    return (
      <InView onChange={this._observerCallback}>
        <canvas className={className} ref={this._canvas} onClick={onClick}>
          <h2>Activity Graph for {trackName}</h2>
          <p>This graph shows a visual chart of thread activity.</p>
        </canvas>
      </InView>
    );
  }
}

/**
 * Filtered out samples use a diagonal stripe pattern, create that here.
 */
function _createDiagonalStripePattern(
  chartCtx: CanvasRenderingContext2D,
  color: string
): CanvasPattern {
  // Create a second canvas, draw to it in order to create a pattern. This canvas
  // and context will be discarded after the pattern is created.
  const patternCanvas = document.createElement('canvas');
  const dpr = Math.round(window.devicePixelRatio);
  patternCanvas.width = 4 * dpr;
  patternCanvas.height = 4 * dpr;
  const patternContext = patternCanvas.getContext('2d')!;
  patternContext.scale(dpr, dpr);

  const linear = patternContext.createLinearGradient(0, 0, 4, 4);
  linear.addColorStop(0, color);
  linear.addColorStop(0.25, color);
  linear.addColorStop(0.25, 'transparent');
  linear.addColorStop(0.5, 'transparent');
  linear.addColorStop(0.5, color);
  linear.addColorStop(0.75, color);
  linear.addColorStop(0.75, 'transparent');
  linear.addColorStop(1, 'transparent');
  patternContext.fillStyle = linear;
  patternContext.fillRect(0, 0, 4, 4);

  return chartCtx.createPattern(patternCanvas, 'repeat')!;
}

/**
 * Search an array from a starting index to find where two arrays diverge.
 */
function _findNextDifferentIndex(
  arr1: Float32Array,
  arr2: Float32Array,
  startIndex: number
): number {
  for (let i = startIndex; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return i;
    }
  }
  return arr1.length;
}
