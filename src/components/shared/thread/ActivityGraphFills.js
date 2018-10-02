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
  Thread,
} from '../../../types/profile';
import type {
  Milliseconds,
  DevicePixels,
  CssPixels,
} from '../../../types/units';

/**
 * Computing the ActivityGraph's fills requires a set of immutable properties that
 * are used to compute the fills, but are never changed. In order to separate out
 * the mutable values, collect all of these immutable settings in one object that
 * can easily be shared between classes and functions.
 */
type LastRenderedGraphSettings = {|
  +canvasPixelWidth: DevicePixels,
  +canvasPixelHeight: DevicePixels,
  +fullThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +xPixelsPerMs: number,
  +treeOrderSampleComparator: ?(
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +greyCategoryIndex: IndexIntoCategoryList,
  +samplesSelectedStates: ?Array<boolean>,
  +categoryDrawStyles: CategoryDrawStyles,
|};

type SampleContributionToPixel = {|
  +sample: IndexIntoSamplesTable,
  +contribution: number,
|};

/**
 * The category fills are the computation that is ultimately returned for drawing
 * the categories to the canvas. During the computation step, this value is mutated
 * in place, but should be consumed immutably.
 */
type CategoryFill = {|
  +category: IndexIntoCategoryList,
  +fillStyle: string | CanvasPattern,
  // The Float32Array is mutated in place during the computation step.
  +perPixelContribution: Float32Array,
|};

export type CategoryDrawStyles = $ReadOnlyArray<{|
  +category: number,
  +gravity: number,
  +selectedFillStyle: string,
  +unselectedFillStyle: string,
  +filteredOutFillStyle: CanvasPattern,
|}>;

type SelectedPercentageAtPixelBuffers = {|
  // These Float32Arrays are mutated in place during the computation step.
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

export function computeActivityGraphFills(
  lastRenderedGraphSettings: LastRenderedGraphSettings
) {
  const mutablePercentageBuffers = _createSelectedPercentageAtPixelBuffers(
    lastRenderedGraphSettings
  );
  const mutableFills = _getCategoryFills(
    lastRenderedGraphSettings.categoryDrawStyles,
    mutablePercentageBuffers
  );
  const activityGraphFills = new ActivityGraphFillComputer(
    lastRenderedGraphSettings,
    mutablePercentageBuffers,
    mutableFills
  );

  activityGraphFills.run();
  // We're done mutating the fills' Float32Array buffers.
  const fills = mutableFills;

  return {
    fills,
    fillsQuerier: new ActivityFillGraphQuerier(
      lastRenderedGraphSettings,
      fills
    ),
  };
}

/**
 * This class takes the immutable graph settings, and then computes the ActivityGraph's
 * fills by mutating the selected pecentage buffers and the category fill values.
 */
export class ActivityGraphFillComputer {
  +lastRenderedGraphSettings: LastRenderedGraphSettings;
  // The fills and percentages are mutated in place.
  +mutablePercentageBuffers: SelectedPercentageAtPixelBuffers[];
  +mutableFills: CategoryFill[];

  constructor(
    lastRenderedGraphSettings: LastRenderedGraphSettings,
    mutablePercentageBuffers: SelectedPercentageAtPixelBuffers[],
    mutableFills: CategoryFill[]
  ) {
    this.lastRenderedGraphSettings = lastRenderedGraphSettings;
    this.mutablePercentageBuffers = mutablePercentageBuffers;
    this.mutableFills = mutableFills;
  }

  /**
   * Run the computation to compute a list of the fills that need to be drawn for the
   * ThreadActivityGraph.
   */
  run(): void {
    const {
      mutableFills,
      lastRenderedGraphSettings: { canvasPixelWidth },
    } = this;

    // First go through each sample, and set the buffers that contain the percentage
    // that a category contributes to a given place in the X axis of the chart.
    this._accumulateSampleCategories();

    // Smooth the graphs by applying a 1D gaussian blur to the per-pixel
    // contribution of each fill.
    for (const fill of mutableFills) {
      _applyGaussianBlur1D(fill.perPixelContribution, BOX_BLUR_RADII);
    }

    // Finally compute the last cumulative array.
    let lastCumulativeArray = mutableFills[0].perPixelContribution;
    for (const { perPixelContribution } of mutableFills.slice(1)) {
      for (let i = 0; i < canvasPixelWidth; i++) {
        perPixelContribution[i] += lastCumulativeArray[i];
      }
      lastCumulativeArray = perPixelContribution;
    }
  }

  /**
   * Go through each sample, and apply its category percentages to the category
   * percentage buffers. These percentage buffers determine the overall percentage
   * that a category contributes to a single pixel. These buffers are mutated in place
   * with these methods.
   */
  _accumulateSampleCategories() {
    const {
      fullThread: { samples, stackTable },
      interval,
      greyCategoryIndex,
    } = this.lastRenderedGraphSettings;

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
    } = this.lastRenderedGraphSettings;
    if (sampleTime < rangeStart || sampleTime >= rangeEnd) {
      return;
    }

    const categoryDrawStyle = categoryDrawStyles[category];
    const percentageBuffers = this.mutablePercentageBuffers[category];

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
    const { samplesSelectedStates } = this.lastRenderedGraphSettings;
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
}

/**
 * This class contains the logic to pick a sample based on where the ThreaActivityGraph
 * was clicked. In this way, the fills can be computed one time, and the previously
 * computed settings can be re-used until the graph is drawn again.
 */
export class ActivityFillGraphQuerier {
  lastRenderedGraphSettings: LastRenderedGraphSettings;
  fills: CategoryFill[];

  constructor(
    lastRenderedGraphSettings: LastRenderedGraphSettings,
    fills: CategoryFill[]
  ) {
    this.lastRenderedGraphSettings = lastRenderedGraphSettings;
    this.fills = fills;
  }

  /**
   * Given a click in CssPixels coordinates, look up the sample in the graph.
   */
  getSampleAtClick(
    cssX: CssPixels,
    cssY: CssPixels,
    time: Milliseconds,
    canvasBoundingRect: ClientRect
  ): IndexIntoSamplesTable | null {
    const { canvasPixelWidth } = this.lastRenderedGraphSettings;
    const devicePixelRatio = canvasPixelWidth / canvasBoundingRect.width;
    const categoryUnderMouse = this._categoryAtDevicePixel(
      Math.round(cssX * devicePixelRatio),
      Math.round(cssY * devicePixelRatio)
    );
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

  /**
   * Find a specific category at a pixel location.
   */
  _categoryAtDevicePixel(
    deviceX: DevicePixels,
    deviceY: DevicePixels
  ): null | {
    category: IndexIntoCategoryList,
    offsetToCategoryStart: DevicePixels,
  } {
    const {
      canvasPixelWidth,
      canvasPixelHeight,
    } = this.lastRenderedGraphSettings;

    if (
      deviceX < 0 ||
      deviceX >= canvasPixelWidth ||
      deviceY < 0 ||
      deviceY >= canvasPixelHeight
    ) {
      return null;
    }

    const valueToFind = 1 - deviceY / canvasPixelHeight;
    let currentCategory = null;
    let currentCategoryStart = 0.0;
    let previousFillEnd = 0.0;
    for (const { category, perPixelContribution } of this.fills) {
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
  ): $ReadOnlyArray<SampleContributionToPixel> {
    const {
      rangeStart,
      rangeEnd,
      treeOrderSampleComparator,
      greyCategoryIndex,
      fullThread: { samples, stackTable },
      canvasPixelWidth,
    } = this.lastRenderedGraphSettings;

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
    const {
      fullThread: { samples },
      rangeStart,
      xPixelsPerMs,
    } = this.lastRenderedGraphSettings;
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
    const {
      fullThread: { samples },
      rangeStart,
    } = this.lastRenderedGraphSettings;
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
function _createSelectedPercentageAtPixelBuffers({
  categoryDrawStyles,
  canvasPixelWidth,
}): SelectedPercentageAtPixelBuffers[] {
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
  categoryDrawStyles: CategoryDrawStyles,
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
