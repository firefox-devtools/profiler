/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import bisection from 'bisection';
import clamp from 'clamp';

import './ActivityGraph.css';

import type {
  IndexIntoSamplesTable,
  IndexIntoCategoryList,
  SamplesTable,
  StackTable,
} from '../../../types/profile';
import type {
  Milliseconds,
  DevicePixels,
  CssPixels,
} from '../../../types/units';
import type { ActivityGraphProps } from './ActivityGraph';

type SampleContributionToPixel = {|
  sample: IndexIntoSamplesTable,
  contribution: number,
|};

type CategoryFill = {|
  category: IndexIntoCategoryList,
  perPixelContribution: Float32Array,
  fillStyle: string | CanvasPattern,
|};

export type CategoryDrawStyle = {|
  +category: number,
  +gravity: number,
  +selectedFillStyle: string,
  +unselectedFillStyle: string,
  +filteredOutFillStyle: CanvasPattern,
|};

type SelectedPercentageAtPixelBuffers = {|
  // The following arrays get recreated when the canvas gets resized.
  +beforeSelectedPercentageAtPixel: Float32Array,
  +selectedPercentageAtPixel: Float32Array,
  +afterSelectedPercentageAtPixel: Float32Array,
  +filteredOutPercentageAtPixel: Float32Array,
|};

const BOX_BLUR_RADII = [3, 2, 2];
const SMOOTHING_RADIUS = 3 + 2 + 2;
const SMOOTHING_KERNEL: Float32Array = _getSmoothingKernel(
  SMOOTHING_RADIUS,
  BOX_BLUR_RADII
);

/**
 * A lot of logic and mutation goes into computing the fills in the ThreadActivityGraph.
 * This class breaks out the fill computations separately from the component logic. This
 * makes it easier to to have lots of shared mutable state between the various
 * calculations.
 *
 * Note that this class should be recreated for every new computation of the fills.
 * It computes the category percentages inside a set of Float32Array buffers. These
 * should be discarded after use. This class has lots of mutation, so there shouldn't
 * be any assumptions made about the validity of strict equalities.
 */
export class ActivityGraphFills {
  rangeStart: Milliseconds;
  rangeEnd: Milliseconds;
  rangeLength: Milliseconds;
  canvasPixelWidth: DevicePixels;
  canvasPixelHeight: DevicePixels;
  devicePixelRatio: number;
  xPixelsPerMs: number;
  categoryDrawStyles: CategoryDrawStyle[];
  percentageBuffers: SelectedPercentageAtPixelBuffers[];
  samples: SamplesTable;
  stackTable: StackTable;
  interval: Milliseconds;
  greyCategoryIndex: IndexIntoCategoryList;
  samplesSelectedStates: ?Array<boolean>;
  categoryFills: CategoryFill[];
  treeOrderSampleComparator: ?(
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number;

  constructor(
    canvasPixelWidth: DevicePixels,
    canvasPixelHeight: DevicePixels,
    {
      rangeEnd,
      rangeStart,
      categories,
      interval,
      samplesSelectedStates,
      treeOrderSampleComparator,
      fullThread: { samples, stackTable },
    }: ActivityGraphProps,
    categoryDrawStyles: CategoryDrawStyle[]
  ) {
    // Collect the common variables used on the various methods.
    this.canvasPixelWidth = canvasPixelWidth;
    this.canvasPixelHeight = canvasPixelHeight;
    this.rangeEnd = rangeEnd;
    this.rangeStart = rangeStart;
    this.rangeLength = rangeEnd - rangeStart;
    this.categoryDrawStyles = categoryDrawStyles;
    this.interval = interval;
    this.xPixelsPerMs = this.canvasPixelWidth / this.rangeLength;
    this.samples = samples;
    this.stackTable = stackTable;
    this.samplesSelectedStates = samplesSelectedStates;
    this.greyCategoryIndex = categories.findIndex(c => c.color === 'grey') || 0;
    this.devicePixelRatio = window.devicePixelRatio;
    this.treeOrderSampleComparator = treeOrderSampleComparator;
    this.percentageBuffers = _createSelectedPercentageAtPixelBuffers(
      categoryDrawStyles,
      this.canvasPixelWidth
    );
    this.categoryFills = _getCategoryFills(
      categoryDrawStyles,
      this.percentageBuffers
    );
  }

  /**
   * Go through each sample, and apply its category percentages to the category
   * percentage buffers. These percentage buffers determine the overall percentage
   * that a category contributes to a single pixel. These buffers are mutated in place
   * with these methods.
   */
  accumulateSampleCategories() {
    const { samples, interval, stackTable, greyCategoryIndex } = this;

    let prevSampleTime = samples.time[0] - interval;
    let sampleTime = samples.time[0];

    // Go through the samples and accumulate the category into the percentageBuffers.
    for (let i = 0; i < samples.length - 1; i++) {
      const nextSampleTime = samples.time[i + 1];
      const stackIndex = samples.stack[i];
      const category =
        stackIndex === null
          ? greyCategoryIndex
          : stackTable.category[stackIndex];

      // Mutate the percentage buffers.
      this._accumulateInCategory(
        category,
        i,
        prevSampleTime,
        sampleTime,
        nextSampleTime
      );

      prevSampleTime = sampleTime;
      sampleTime = nextSampleTime;
    }

    // Handle the last sample, which was not covered by the for loop above.
    const lastSampleStack = samples.stack[samples.length - 1];
    const lastSampleCategory =
      lastSampleStack !== null
        ? stackTable.category[lastSampleStack]
        : greyCategoryIndex;

    this._accumulateInCategory(
      lastSampleCategory,
      samples.length - 1,
      prevSampleTime,
      sampleTime,
      sampleTime + interval
    );
  }

  /**
   * Mutate the percentage buffers, by taking this category, and accumulating its
   * percentage into the buffer.
   */
  _accumulateInCategory(
    category: IndexIntoCategoryList,
    sampleIndex: IndexIntoSamplesTable,
    prevSampleTime: Milliseconds,
    sampleTime: Milliseconds,
    nextSampleTime: Milliseconds
  ) {
    const {
      rangeEnd,
      rangeStart,
      categoryDrawStyles,
      xPixelsPerMs,
      canvasPixelWidth,
    } = this;
    if (sampleTime < rangeStart || sampleTime >= rangeEnd) {
      return;
    }

    const categoryDrawStyle = categoryDrawStyles[category];
    const percentageBuffers = this.percentageBuffers[category];

    if (categoryDrawStyle.selectedFillStyle === 'transparent') {
      return;
    }

    const sampleStart = (prevSampleTime + sampleTime) / 2;
    const sampleEnd = (sampleTime + nextSampleTime) / 2;
    let pixelStart = (sampleStart - rangeStart) * xPixelsPerMs;
    let pixelEnd = (sampleEnd - rangeStart) * xPixelsPerMs;
    pixelStart = Math.max(0, pixelStart);
    pixelEnd = Math.min(canvasPixelWidth - 1, pixelEnd);
    const intPixelStart = Math.floor(pixelStart);
    const intPixelEnd = Math.floor(pixelEnd);

    // For every sample, we have a fractional interval of this sample's
    // contribution to the graph's pixels.
    //
    // v       v       v       v       v       v       v       v       v
    // +-------+-------+-----+-+-------+-------+-----+-+-------+-------+
    // |       |       |     |///////////////////////| |       |       |
    // |       |       |     |///////////////////////| |       |       |
    // |       |       |     |///////////////////////| |       |       |
    // +-------+-------+-----+///////////////////////+-+-------+-------+
    //
    // We have a device-pixel array of contributions. We map the fractional
    // interval to this array of device pixels: Fully overlapping pixels are
    // 1, and the partial overlapping pixels are the degree of overlap.

    //                                 |
    //                                 v
    //
    // +-------+-------+-------+-------+-------+-------+-------+-------+
    // |       |       |       |///////////////+-------+       |       |
    // |       |       |       |///////////////////////|       |       |
    // |       |       +-------+///////////////////////|       |       |
    // +-------+-------+///////////////////////////////+-------+-------+
    const percentageBuffer = this._pickPercentageBuffer(
      percentageBuffers,
      sampleIndex
    );
    for (let i = intPixelStart; i <= intPixelEnd; i++) {
      percentageBuffer[i] += 1;
    }
    percentageBuffer[intPixelStart] -= pixelStart - intPixelStart;
    percentageBuffer[intPixelEnd] -= 1 - (pixelEnd - intPixelEnd);
  }

  /**
   * Pick the correct percentage buffer based on the sample state.
   */
  _pickPercentageBuffer(
    percentageBuffers: SelectedPercentageAtPixelBuffers,
    sampleIndex: IndexIntoSamplesTable
  ): Float32Array {
    const { samplesSelectedStates } = this;
    if (!samplesSelectedStates) {
      return percentageBuffers.selectedPercentageAtPixel;
    }
    switch (samplesSelectedStates[sampleIndex]) {
      case 'FILTERED_OUT':
        return percentageBuffers.filteredOutPercentageAtPixel;
      case 'UNSELECTED_ORDERED_BEFORE_SELECTED':
        return percentageBuffers.beforeSelectedPercentageAtPixel;
      case 'SELECTED':
        return percentageBuffers.selectedPercentageAtPixel;
      case 'UNSELECTED_ORDERED_AFTER_SELECTED':
        return percentageBuffers.afterSelectedPercentageAtPixel;
      default:
        throw new Error('Unexpected samplesSelectedStates value');
    }
  }

  /**
   * Find a specific category at a pixel location.
   */
  categoryAtPixel(
    x: number,
    y: number
  ): null | {
    category: IndexIntoCategoryList,
    offsetToCategoryStart: DevicePixels,
  } {
    const deviceX = Math.round(x * this.devicePixelRatio);
    const deviceY = Math.round(y * this.devicePixelRatio);

    if (
      !this.categoryFills ||
      deviceX < 0 ||
      deviceX >= this.canvasPixelWidth ||
      deviceY < 0 ||
      deviceY >= this.canvasPixelHeight
    ) {
      return null;
    }

    const valueToFind = 1 - deviceY / this.canvasPixelHeight;
    let currentCategory = null;
    let currentCategoryStart = 0.0;
    let previousFillEnd = 0.0;
    for (const { category, perPixelContribution } of this.categoryFills) {
      const fillEnd = perPixelContribution[deviceX];

      if (category !== currentCategory) {
        currentCategory = category;
        currentCategoryStart = previousFillEnd;
      }

      if (fillEnd >= valueToFind) {
        return {
          category,
          offsetToCategoryStart: valueToFind - currentCategoryStart,
        };
      }

      previousFillEnd = fillEnd;
    }

    return null;
  }

  /**
   * Determine which samples contributed to a given categoy at a specific time. The result
   * is an array of all candidate samples, with their contribution amount.
   */
  _getCategoriesSamplesAtTime(
    time: number,
    category: IndexIntoCategoryList
  ): Array<SampleContributionToPixel> {
    const {
      rangeStart,
      rangeEnd,
      treeOrderSampleComparator,
      greyCategoryIndex,
      samples,
      stackTable,
      canvasPixelWidth,
    } = this;

    const rangeLength = rangeEnd - rangeStart;
    const xPixelsPerMs = canvasPixelWidth / rangeLength;
    const xPixel = ((time - rangeStart) * xPixelsPerMs) | 0;
    const [
      sampleRangeStart,
      sampleRangeEnd,
    ] = this._getSampleRangeContributingToPixelWhenSmoothed(xPixel);

    const sampleContributions = [];
    for (let sample = sampleRangeStart; sample < sampleRangeEnd; sample++) {
      const stackIndex = samples.stack[sample];
      const sampleCategory =
        stackIndex !== null
          ? stackTable.category[stackIndex]
          : greyCategoryIndex;
      if (sampleCategory === category) {
        sampleContributions.push({
          sample,
          contribution: this._getSmoothedContributionFromSampleToPixel(
            xPixel,
            xPixelsPerMs,
            sample
          ),
        });
      }
    }
    if (treeOrderSampleComparator) {
      sampleContributions.sort((a, b) => {
        const sampleA = a.sample;
        const sampleB = b.sample;
        return treeOrderSampleComparator(sampleA, sampleB);
      });
    }
    return sampleContributions;
  }

  /**
   * Apply the smoothing to a pixel position to determine the start and end time range
   * that could affect that pixel.
   */
  _getSampleRangeContributingToPixelWhenSmoothed(
    xPixel: number
  ): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
    const { samples, rangeStart, xPixelsPerMs } = this;
    const contributionTimeRangeStart =
      rangeStart + (xPixel - SMOOTHING_RADIUS) / xPixelsPerMs;
    const contributionTimeRangeEnd =
      rangeStart + (xPixel + SMOOTHING_RADIUS) / xPixelsPerMs;

    // Now find the samples where the range [mid(previousSample.time, thisSample.time), mid(thisSample.time, nextSample.time)]
    // overlaps with contributionTimeRange.
    const firstSampleAfterContributionTimeRangeStart = bisection.right(
      samples.time,
      contributionTimeRangeStart
    );
    const firstSampleAfterContributionTimeRangeEnd = bisection.right(
      samples.time,
      contributionTimeRangeEnd
    );
    return [
      Math.max(0, firstSampleAfterContributionTimeRangeStart - 1),
      Math.min(samples.length - 1, firstSampleAfterContributionTimeRangeEnd) +
        1,
    ];
  }

  /**
   * Compute how much a sample contributes to a given pixel after smoothing has
   * been applied.
   */
  _getSmoothedContributionFromSampleToPixel(
    xPixel: number,
    xPixelsPerMs: number,
    sample: IndexIntoSamplesTable
  ): number {
    const { samples, rangeStart } = this;
    const kernelPos = xPixel - SMOOTHING_RADIUS;
    const pixelsAroundX = new Float32Array(SMOOTHING_KERNEL.length);
    const sampleTime = samples.time[sample];
    // xPixel in graph space maps to kernel[smoothingRadius]
    const sampleTimeRangeStart =
      sample > 0 ? (samples.time[sample - 1] + sampleTime) / 2 : -Infinity;
    const sampleTimeRangeEnd =
      sample < samples.length
        ? (samples.time[sample + 1] + sampleTime) / 2
        : Infinity;

    let pixelStart =
      (sampleTimeRangeStart - rangeStart) * xPixelsPerMs - kernelPos;
    let pixelEnd = (sampleTimeRangeEnd - rangeStart) * xPixelsPerMs - kernelPos;
    pixelStart = clamp(pixelStart, 0, SMOOTHING_KERNEL.length - 1);
    pixelEnd = clamp(pixelEnd, 0, SMOOTHING_KERNEL.length - 1);
    const intPixelStart = pixelStart | 0;
    const intPixelEnd = pixelEnd | 0;

    for (let i = intPixelStart; i <= intPixelEnd; i++) {
      pixelsAroundX[i] += 1;
    }
    pixelsAroundX[intPixelStart] -= pixelStart - intPixelStart;
    pixelsAroundX[intPixelEnd] -= 1 - (pixelEnd - intPixelEnd);

    let sum = 0;
    for (let i = 0; i < SMOOTHING_KERNEL.length; i++) {
      sum += SMOOTHING_KERNEL[i] * pixelsAroundX[i];
    }

    return sum;
  }

  /**
   * Compute a list of the fills that need to be drawn for the ThreadActivityGraph.
   */
  computeFills(): CategoryFill[] {
    const { categoryFills, canvasPixelWidth } = this;

    // First go through each sample, and set the buffers that contain the percentage
    // that a category contributes to a given place in the X axis of the chart.
    this.accumulateSampleCategories();

    // Smooth the graphs by applying a 1D gaussian blur to the per-pixel
    // contribution of each fill.
    for (const fill of categoryFills) {
      _applyGaussianBlur1D(fill.perPixelContribution, BOX_BLUR_RADII);
    }

    // Finally compute the last cumulative array.
    let lastCumulativeArray = categoryFills[0].perPixelContribution;
    for (const { perPixelContribution } of categoryFills.slice(1)) {
      for (let i = 0; i < canvasPixelWidth; i++) {
        perPixelContribution[i] += lastCumulativeArray[i];
      }
      lastCumulativeArray = perPixelContribution;
    }

    return categoryFills;
  }

  /**
   * Given a click in CssPixels coordinates, look up the sample in the graph.
   */
  getSampleAtClick(
    x: CssPixels,
    y: CssPixels,
    time: Milliseconds
  ): IndexIntoSamplesTable | null {
    const categoryUnderMouse = this.categoryAtPixel(x, y);
    if (categoryUnderMouse === null) {
      return null;
    }

    let { offsetToCategoryStart } = categoryUnderMouse;
    const candidateSamples = this._getCategoriesSamplesAtTime(
      time,
      categoryUnderMouse.category
    );

    for (let i = 0; i < candidateSamples.length; i++) {
      const { sample, contribution } = candidateSamples[i];
      if (offsetToCategoryStart <= contribution) {
        return sample;
      }
      offsetToCategoryStart -= contribution;
    }

    return null;
  }
}

/**
 * Get a smoothing kernel. This is a list of values ranged from 0 to 1 that are
 * smoothed by a gaussian blur.
 */
function _getSmoothingKernel(
  smoothingRadius: number,
  boxBlurRadii: number[]
): Float32Array {
  const kernelWidth = smoothingRadius + 1 + smoothingRadius;
  const kernel = new Float32Array(kernelWidth);
  kernel[smoothingRadius] = 1;
  _applyGaussianBlur1D(kernel, boxBlurRadii);
  return kernel;
}

/**
 * Create the buffers that hold the percentage of a category at a given device pixel.
 * These buffers can only be used once per fill computation. The buffer values are
 * updated across various method calls.
 */
function _createSelectedPercentageAtPixelBuffers(
  categoryDrawStyles: CategoryDrawStyle[],
  canvasPixelWidth: DevicePixels
): SelectedPercentageAtPixelBuffers[] {
  return categoryDrawStyles.map(() => ({
    beforeSelectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    selectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    afterSelectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    filteredOutPercentageAtPixel: new Float32Array(canvasPixelWidth),
  }));
}

/**
 * For each category, create a fill style for each of 4 draw states. These fill styles
 * are sorted by their gravity.
 *
 * 'UNSELECTED_ORDERED_BEFORE_SELECTED',
 * 'SELECTED',
 * 'UNSELECTED_ORDERED_AFTER_SELECTED',
 * 'FILTERED_OUT'
 */
function _getCategoryFills(
  categoryDrawStyles: CategoryDrawStyle[],
  percentageBuffers: SelectedPercentageAtPixelBuffers[]
): CategoryFill[] {
  // Sort all of the categories by their gravity.
  const categoryIndexesByGravity = categoryDrawStyles
    .map((_, i) => i)
    .sort(
      (a, b) => categoryDrawStyles[b].gravity - categoryDrawStyles[a].gravity
    );

  const nestedFills: CategoryFill[][] = categoryIndexesByGravity.map(
    categoryIndex => {
      const categoryDrawStyle = categoryDrawStyles[categoryIndex];
      const buffer = percentageBuffers[categoryIndex];
      // For every category we draw four fills, for the four selection kinds:
      return [
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.unselectedFillStyle,
          perPixelContribution: buffer.beforeSelectedPercentageAtPixel,
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.selectedFillStyle,
          perPixelContribution: buffer.selectedPercentageAtPixel,
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.unselectedFillStyle,
          perPixelContribution: buffer.afterSelectedPercentageAtPixel,
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.filteredOutFillStyle,
          perPixelContribution: buffer.filteredOutPercentageAtPixel,
        },
      ];
    }
  );

  // Flatten out the fills into a single array.
  return [].concat(...nestedFills);
}

/**
 * Apply a 1d box blur to a destination array.
 */
function _boxBlur1D(
  srcArray: Float32Array,
  destArray: Float32Array,
  radius: number
): void {
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
  for (let x = radius + 1; x < srcArray.length - radius; ++x) {
    total -= srcArray[x - radius - 1];
    total += srcArray[x + radius];
    destArray[x] = total / (radius * 2 + 1);
  }
  for (let x = srcArray.length - radius; x < srcArray.length; ++x) {
    total -= srcArray[x - radius - 1];
    destArray[x] = total / (radius * 2 + 1);
  }
}

/**
 * Apply a blur with a gaussian distribution to a destination array.
 */
function _applyGaussianBlur1D(
  srcArray: Float32Array,
  boxBlurRadii: number[]
): void {
  let a = srcArray;
  let b = new Float32Array(srcArray.length);
  for (const radius of boxBlurRadii) {
    _boxBlur1D(a, b, radius);
    [b, a] = [a, b];
  }

  if (b === srcArray) {
    // The last blur was applied to the temporary array, blit the final values back
    // to the srcArray. This ensures that we are always mutating the values of the
    // src array, and not returning the newly created array.
    for (let i = 0; i < srcArray.length; i++) {
      srcArray[i] = a[i];
    }
  }
}
