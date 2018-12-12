/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { computeActivityGraphFills } from './ActivityGraphFills';
import { timeCode } from '../../../utils/time-code';
import classNames from 'classnames';
import photonColors from 'photon-colors';
import Tooltip, { MOUSE_OFFSET } from '../Tooltip';
import SampleTooltipContents from '../SampleTooltipContents';

import './ActivityGraph.css';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
} from '../../../types/profile';
import type { Milliseconds, CssPixels } from '../../../types/units';
import type {
  CategoryDrawStyles,
  ActivityFillGraphQuerier,
} from './ActivityGraphFills';

export type Props = {|
  +className: string,
  +fullThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +onSampleClick: (sampleIndex: IndexIntoSamplesTable) => void,
  +categories: CategoryList,
  +samplesSelectedStates?: boolean[],
  +treeOrderSampleComparator?: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
|};

type State = {
  hoveredSample: null | IndexIntoSamplesTable,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class ThreadActivityGraph extends React.PureComponent<Props, State> {
  _canvas: null | HTMLCanvasElement = null;
  _resizeListener = () => this.forceUpdate();
  _categoryDrawStyles: null | CategoryDrawStyles = null;
  _fillsQuerier: null | ActivityFillGraphQuerier = null;

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
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
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
          const styles = _mapColorNameToStyles(colorName);
          return {
            ...styles,
            category: categoryIndex,
            filteredOutFillStyle: _createDiagonalStripePattern(
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
    const { samples } = fullThread;

    if (samples.length === 0) {
      // Do not attempt to render when there are no samples.
      return;
    }
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
    const time = rangeStart + x / rect.width * (rangeEnd - rangeStart);

    return fillsQuerier.getSampleAtClick(x, y, time, rect);
  }

  _onMouseUp = (event: SyntheticMouseEvent<>) => {
    const sample = this._getSampleAtMouseEvent(event);
    if (sample !== null) {
      this.props.onSampleClick(sample);
    }
  };

  render() {
    this._renderCanvas();
    const { fullThread, categories } = this.props;
    const { hoveredSample, mouseX, mouseY } = this.state;
    return (
      <div
        className={this.props.className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadActivityGraphCanvas'
          )}
          ref={this._takeCanvasRef}
          onMouseUp={this._onMouseUp}
        />
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
 * Map a color name, which comes from Gecko, into a CSS style color. These colors cannot
 * be changed without considering the values coming from Gecko, and from old profiles
 * that already have their category colors saved into the profile.
 *
 * Category color names come from:
 * https://searchfox.org/mozilla-central/rev/0b8ed772d24605d7cb44c1af6d59e4ca023bd5f5/tools/profiler/core/platform.cpp#1593-1627
 */
function _mapColorNameToStyles(colorName: string) {
  switch (colorName) {
    case 'transparent':
      return {
        selectedFillStyle: 'transparent',
        unselectedFillStyle: 'transparent',
        gravity: 0,
      };
    case 'purple':
      return {
        selectedFillStyle: photonColors.PURPLE_70,
        // Colors are assumed to have the form #RRGGBB, so concatenating 2 more digits to
        // the end defines the transparency #RRGGBBAA.
        unselectedFillStyle: photonColors.PURPLE_70 + '60',
        gravity: 5,
      };
    case 'green':
      return {
        selectedFillStyle: photonColors.GREEN_60,
        unselectedFillStyle: photonColors.GREEN_60 + '60',
        gravity: 4,
      };
    case 'orange':
      return {
        selectedFillStyle: photonColors.ORANGE_50,
        unselectedFillStyle: photonColors.ORANGE_50 + '60',
        gravity: 2,
      };
    case 'yellow':
      return {
        selectedFillStyle: photonColors.YELLOW_50,
        unselectedFillStyle: photonColors.YELLOW_50 + '60',
        gravity: 6,
      };
    case 'lightblue':
      return {
        selectedFillStyle: photonColors.BLUE_40,
        unselectedFillStyle: photonColors.BLUE_40 + '60',
        gravity: 1,
      };
    case 'grey':
      return {
        selectedFillStyle: photonColors.GREY_30,
        unselectedFillStyle: photonColors.GREY_30 + '60',
        gravity: 8,
      };
    case 'blue':
      return {
        selectedFillStyle: photonColors.BLUE_60,
        unselectedFillStyle: photonColors.BLUE_60 + '60',
        gravity: 3,
      };
    case 'brown':
      return {
        selectedFillStyle: photonColors.MAGENTA_60,
        unselectedFillStyle: photonColors.MAGENTA_60 + '60',
        gravity: 7,
      };
    default:
      console.error(
        'Unknown color name encountered. Consider updating this code to handle it.'
      );
      return {
        selectedFillStyle: photonColors.GREY_30,
        unselectedFillStyle: photonColors.GREY_30 + '60',
        gravity: 8,
      };
  }
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
