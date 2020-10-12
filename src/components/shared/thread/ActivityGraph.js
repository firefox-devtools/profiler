/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { computeActivityGraphFills } from './ActivityGraphFills';
import { timeCode } from 'firefox-profiler/utils/time-code';
import classNames from 'classnames';
import {
  Tooltip,
  MOUSE_OFFSET,
} from 'firefox-profiler/components/tooltip/Tooltip';
import SampleTooltipContents from 'firefox-profiler/components/shared/SampleTooltipContents';
import { mapCategoryColorNameToStyles } from 'firefox-profiler/utils/colors';

import './ActivityGraph.css';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  SelectedState,
  Milliseconds,
  CssPixels,
} from 'firefox-profiler/types';

import type {
  CategoryDrawStyles,
  ActivityFillGraphQuerier,
} from './ActivityGraphFills';

export type Props = {|
  +className: string,
  +trackName: string,
  +fullThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable
  ) => void,
  +categories: CategoryList,
  +samplesSelectedStates: null | SelectedState[],
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
|};

type State = {
  hoveredSample: null | IndexIntoSamplesTable,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

function _stopPropagation(e: TransitionEvent) {
  e.stopPropagation();
}

class ThreadActivityGraph extends React.PureComponent<Props, State> {
  _canvas: null | HTMLCanvasElement = null;
  _resizeListener = () => this.forceUpdate();
  _categoryDrawStyles: null | CategoryDrawStyles = null;
  _fillsQuerier: null | ActivityFillGraphQuerier = null;
  _container: HTMLElement | null = null;

  state = {
    hoveredSample: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    this.setState({ hoveredSample: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const canvas = this._canvas;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    this.setState({
      hoveredSample: this._getSampleAtMouseEvent(event),
      mouseX: event.pageX,
      // Have the tooltip align to the bottom of the track.
      mouseY: rect.bottom - MOUSE_OFFSET,
    });
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  _renderCanvas() {
    const canvas = this._canvas;
    if (canvas !== null) {
      timeCode('ThreadActivityGraph render', () => {
        this.drawCanvas(canvas);
      });
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
    const container = this._container;
    if (container !== null) {
      // Stop the propagation of transitionend so we won't fire multiple events
      // on the active tab resource track `transitionend` event.
      container.addEventListener('transitionend', _stopPropagation);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
    const container = this._container;
    if (container !== null) {
      container.removeEventListener('transitionend', _stopPropagation);
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

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      fullThread,
      interval,
      rangeStart,
      rangeEnd,
      samplesSelectedStates,
      treeOrderSampleComparator,
      categories,
    } = this.props;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const canvasPixelWidth = Math.round(rect.width * window.devicePixelRatio);
    const canvasPixelHeight = Math.round(rect.height * window.devicePixelRatio);
    canvas.width = canvasPixelWidth;
    canvas.height = canvasPixelHeight;

    const { fills, fillsQuerier } = computeActivityGraphFills({
      canvasPixelWidth,
      canvasPixelHeight,
      fullThread,
      interval,
      rangeStart,
      rangeEnd,
      samplesSelectedStates,
      xPixelsPerMs: canvasPixelWidth / (rangeEnd - rangeStart),
      treeOrderSampleComparator,
      greyCategoryIndex: categories.findIndex(c => c.color === 'grey') || 0,
      categoryDrawStyles: this._getCategoryDrawStyles(ctx),
    });

    this._fillsQuerier = fillsQuerier;

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

  _getSampleAtMouseEvent(
    event: SyntheticMouseEvent<>
  ): null | IndexIntoSamplesTable {
    // Create local variables so that Flow can refine the following to be non-null.
    const fillsQuerier = this._fillsQuerier;
    const canvas = this._canvas;
    if (!canvas || !fillsQuerier) {
      return null;
    }
    // Re-measure the canvas and get the coordinates and time for the click.
    const { rangeStart, rangeEnd } = this.props;
    const rect = canvas.getBoundingClientRect();
    const x = event.pageX - rect.left;
    const y = event.pageY - rect.top;
    const time = rangeStart + (x / rect.width) * (rangeEnd - rangeStart);

    return fillsQuerier.getSampleAtClick(x, y, time, rect);
  }

  _onMouseUp = (event: SyntheticMouseEvent<>) => {
    const sample = this._getSampleAtMouseEvent(event);
    if (sample !== null) {
      this.props.onSampleClick(event, sample);
    }
  };

  _takeContainerRef = (el: HTMLElement | null) => {
    this._container = el;
  };

  render() {
    this._renderCanvas();
    const { fullThread, categories, trackName } = this.props;
    const { hoveredSample, mouseX, mouseY } = this.state;
    return (
      <div
        className={this.props.className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        ref={this._takeContainerRef}
      >
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadActivityGraphCanvas'
          )}
          ref={this._takeCanvasRef}
          onMouseUp={this._onMouseUp}
        >
          <h2>Activity Graph for {trackName}</h2>
          <p>This graph shows a visual chart of thread activity.</p>
        </canvas>
        {hoveredSample === null ? null : (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <SampleTooltipContents
              sampleIndex={hoveredSample}
              fullThread={fullThread}
              categories={categories}
            />
          </Tooltip>
        )}
      </div>
    );
  }
}

export default ThreadActivityGraph;

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
  const patternContext = patternCanvas.getContext('2d');
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

  return chartCtx.createPattern(patternCanvas, 'repeat');
}

/**
 * Search an array from a starting index to find where two arrays diverge.
 */
function _findNextDifferentIndex(arr1, arr2, startIndex) {
  for (let i = startIndex; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return i;
    }
  }
  return arr1.length;
}
