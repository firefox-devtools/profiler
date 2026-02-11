/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import { ensureExists } from 'firefox-profiler/utils/types';

import './ActivityGraph.css';

import type {
  IndexIntoSamplesTable,
  IndexIntoCategoryList,
  Thread,
  SelectedState,
  Milliseconds,
  DevicePixels,
  CssPixels,
} from 'firefox-profiler/types';
import type { HoveredPixelState } from './ActivityGraph';

/**
 * This type contains the values that were used to render the ThreadActivityGraph's React
 * component, plus the sizing of the DOM element. These values are computed BEFORE drawing
 * to the 2d canvas, and are needed to compute the 2d canvas' fills.
 *
 * Computing these fills requires a large set of mutable and immutable values. This type
 * helps organize and delineate these two types of values by only containing the
 * immutable values. This object makes it easy to share these values between different
 * classes and functions.
 */
type RenderedComponentSettings = {
  readonly canvasPixelWidth: DevicePixels;
  readonly canvasPixelHeight: DevicePixels;
  readonly fullThread: Thread;
  readonly rangeFilteredThread: Thread;
  readonly interval: Milliseconds;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly sampleIndexOffset: number;
  readonly xPixelsPerMs: number;
  readonly enableCPUUsage: boolean;
  readonly treeOrderSampleComparator:
    | ((a: IndexIntoSamplesTable, b: IndexIntoSamplesTable) => number)
    | null;
  readonly greyCategoryIndex: IndexIntoCategoryList;
  readonly samplesSelectedStates: null | Array<SelectedState>;
  readonly categoryDrawStyles: CategoryDrawStyles;
};

type SampleContributionToPixel = {
  readonly sample: IndexIntoSamplesTable;
  readonly contribution: number;
};

/**
 * The category fills are the computation that is ultimately returned for drawing
 * the categories to the canvas. During the computation step, this value is mutated
 * in place, but should be consumed immutably.
 */
type CategoryFill = {
  readonly category: IndexIntoCategoryList;
  readonly fillStyle: string | CanvasPattern;
  // The Float32Arrays are mutated in place during the computation step.
  readonly perPixelContribution: Float32Array<ArrayBuffer>;
  readonly accumulatedUpperEdge: Float32Array<ArrayBuffer>;
};

export type CategoryDrawStyles = ReadonlyArray<{
  readonly category: number;
  readonly gravity: number;
  readonly _selectedFillStyle: string | [string, string];
  readonly _unselectedFillStyle: string | [string, string];
  readonly _selectedTextColor: string | [string, string];
  readonly getSelectedFillStyle: () => string;
  readonly getUnselectedFillStyle: () => string;
  readonly getSelectedTextColor: () => string;
  readonly filteredOutByTransformFillStyle: CanvasPattern | string;
}>;

type SelectedPercentageAtPixelBuffers = {
  // These Float32Arrays are mutated in place during the computation step.
  readonly beforeSelectedPercentageAtPixel: Float32Array<ArrayBuffer>;
  readonly selectedPercentageAtPixel: Float32Array<ArrayBuffer>;
  readonly afterSelectedPercentageAtPixel: Float32Array<ArrayBuffer>;
  readonly filteredOutByTransformPercentageAtPixel: Float32Array<ArrayBuffer>;
  readonly filteredOutByTabPercentageAtPixel: Float32Array<ArrayBuffer>;
};

export type CpuRatioInTimeRange = {
  readonly cpuRatio: number;
  readonly timeRange: Milliseconds;
};

const BOX_BLUR_RADII = [3, 2, 2];
const SMOOTHING_RADIUS = 3 + 2 + 2;
const SMOOTHING_KERNEL: Float32Array<ArrayBuffer> = _getSmoothingKernel(
  SMOOTHING_RADIUS,
  BOX_BLUR_RADII
);

export function computeActivityGraphFills(
  renderedComponentSettings: RenderedComponentSettings
) {
  const mutablePercentageBuffers = _createSelectedPercentageAtPixelBuffers(
    renderedComponentSettings
  );
  const mutableFills = _getCategoryFills(
    renderedComponentSettings.categoryDrawStyles,
    mutablePercentageBuffers
  );
  const activityGraphFills = new ActivityGraphFillComputer(
    renderedComponentSettings,
    mutablePercentageBuffers,
    mutableFills
  );

  const { averageCPUPerPixel, upperGraphEdge } = activityGraphFills.run();
  // We're done mutating the fills' Float32Array buffers.
  const fills = mutableFills;

  return {
    fills,
    fillsQuerier: new ActivityFillGraphQuerier(
      renderedComponentSettings,
      fills,
      averageCPUPerPixel,
      upperGraphEdge
    ),
  };
}

/**
 * This class takes the immutable graph settings, and then computes the ActivityGraph's
 * fills by mutating the selected pecentage buffers and the category fill values.
 */
export class ActivityGraphFillComputer {
  readonly renderedComponentSettings: RenderedComponentSettings;
  // The fills and percentages are mutated in place.
  readonly mutablePercentageBuffers: SelectedPercentageAtPixelBuffers[];
  readonly mutableFills: CategoryFill[];

  constructor(
    renderedComponentSettings: RenderedComponentSettings,
    mutablePercentageBuffers: SelectedPercentageAtPixelBuffers[],
    mutableFills: CategoryFill[]
  ) {
    this.renderedComponentSettings = renderedComponentSettings;
    this.mutablePercentageBuffers = mutablePercentageBuffers;
    this.mutableFills = mutableFills;
  }

  /**
   * Run the computation to compute a list of the fills that need to be drawn for the
   * ThreadActivityGraph.
   */
  run(): {
    readonly averageCPUPerPixel: Float32Array;
    readonly upperGraphEdge: Float32Array;
  } {
    // First go through each sample, and set the buffers that contain the percentage
    // that a category contributes to a given place in the X axis of the chart.
    this._accumulateSampleCategories();

    // First get the average CPU in each pixel, and then accumulate the upper edge
    // of the graph after applying the blur.
    const averageCPUPerPixel = this._accumulateUpperEdge().slice();

    // Smooth the graphs by applying a 1D gaussian blur to the per-pixel
    // contribution of each fill.
    for (const fill of this.mutableFills) {
      _applyGaussianBlur1D(fill.perPixelContribution, BOX_BLUR_RADII);
    }

    const upperGraphEdge = this._accumulateUpperEdge();

    return { averageCPUPerPixel, upperGraphEdge };
  }

  /**
   * Accumulate the per pixel contribution of each fill, so that each fill's
   * accumulatedUpperEdge array describes the shape of the "upper edge" after this fill.
   * Fills are stacked on top of each other.
   */
  _accumulateUpperEdge(): Float32Array {
    const { mutableFills } = this;
    {
      // Only copy the first array, as there is no accumulation.
      const { accumulatedUpperEdge, perPixelContribution } = mutableFills[0];
      for (let i = 0; i < perPixelContribution.length; i++) {
        accumulatedUpperEdge[i] = perPixelContribution[i];
      }
    }

    // Now accumulate the upper edges.
    let previousUpperEdge = mutableFills[0].accumulatedUpperEdge;
    for (const {
      perPixelContribution,
      accumulatedUpperEdge,
    } of mutableFills.slice(1)) {
      for (let i = 0; i < perPixelContribution.length; i++) {
        accumulatedUpperEdge[i] =
          previousUpperEdge[i] + perPixelContribution[i];
      }
      previousUpperEdge = accumulatedUpperEdge;
    }

    return previousUpperEdge;
  }

  /**
   * Go through each sample, and apply its category percentages to the category
   * percentage buffers. These percentage buffers determine the overall percentage
   * that a category contributes to a single pixel. These buffers are mutated in place
   * with these methods.
   */
  _accumulateSampleCategories() {
    const {
      fullThread,
      rangeFilteredThread: { samples, stackTable },
      interval,
      greyCategoryIndex,
      enableCPUUsage,
      sampleIndexOffset,
    } = this.renderedComponentSettings;

    if (samples.length === 0) {
      // If we have no samples, there's nothing to do.
      return;
    }

    let prevSampleTime = samples.time[0] - interval;
    let sampleTime = samples.time[0];

    if (sampleIndexOffset > 0) {
      // If sampleIndexOffset is greater than zero, it means that we are zoomed
      // in the timeline and we are seeing a portion of it. In that case,
      // rangeFilteredThread will not have the information of the first previous
      // sample. So we need to get that information from the full thread.
      prevSampleTime = fullThread.samples.time[sampleIndexOffset - 1];
    }

    // Go through the samples and accumulate the category into the percentageBuffers.
    const { threadCPURatio } = samples;
    for (let i = 0; i < samples.length - 1; i++) {
      const nextSampleTime = samples.time[i + 1];
      const stackIndex = samples.stack[i];
      const category =
        stackIndex === null
          ? greyCategoryIndex
          : stackTable.category[stackIndex];

      let beforeSampleCpuRatio = 1;
      let afterSampleCpuRatio = 1;
      if (enableCPUUsage && threadCPURatio) {
        beforeSampleCpuRatio = threadCPURatio[i];
        afterSampleCpuRatio = threadCPURatio[i + 1];
      }

      // Mutate the percentage buffers.
      this._accumulateInCategory(
        category,
        i,
        prevSampleTime,
        sampleTime,
        nextSampleTime,
        beforeSampleCpuRatio,
        afterSampleCpuRatio
      );

      prevSampleTime = sampleTime;
      sampleTime = nextSampleTime;
    }

    // Handle the last sample, which was not covered by the for loop above.
    const lastIdx = samples.length - 1;
    const lastSampleStack = samples.stack[lastIdx];
    const lastSampleCategory =
      lastSampleStack !== null
        ? stackTable.category[lastSampleStack]
        : greyCategoryIndex;

    let beforeSampleCpuRatio = 1;
    let afterSampleCpuRatio = 1;
    if (enableCPUUsage && threadCPURatio) {
      beforeSampleCpuRatio = threadCPURatio[lastIdx];

      const nextIdxInFullThread = sampleIndexOffset + lastIdx + 1;
      if (nextIdxInFullThread < fullThread.samples.length) {
        // Since we are zoomed in the timeline, rangeFilteredThread will not
        // have the information of the next sample. So we need to get that
        // information from the full thread.
        afterSampleCpuRatio = ensureExists(fullThread.samples.threadCPURatio)[
          nextIdxInFullThread
        ];
      } else {
        // If we don't have this information in the full thread, simply use the
        // previous CPU ratio.
        afterSampleCpuRatio = beforeSampleCpuRatio;
      }
    }

    this._accumulateInCategory(
      lastSampleCategory,
      samples.length - 1,
      prevSampleTime,
      sampleTime,
      sampleTime + interval,
      beforeSampleCpuRatio,
      afterSampleCpuRatio
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
    nextSampleTime: Milliseconds,
    beforeSampleCpuRatio: number,
    afterSampleCpuRatio: number
  ) {
    const { rangeEnd, rangeStart } = this.renderedComponentSettings;
    if (sampleTime < rangeStart || sampleTime >= rangeEnd) {
      return;
    }

    const percentageBuffers = this.mutablePercentageBuffers[category];
    const percentageBuffer = this._pickPercentageBuffer(
      percentageBuffers,
      sampleIndex
    );

    _accumulateInBuffer(
      percentageBuffer,
      this.renderedComponentSettings,
      prevSampleTime,
      sampleTime,
      nextSampleTime,
      beforeSampleCpuRatio,
      afterSampleCpuRatio,
      rangeStart
    );
  }

  /**
   * Pick the correct percentage buffer based on the sample state.
   */
  _pickPercentageBuffer(
    percentageBuffers: SelectedPercentageAtPixelBuffers,
    sampleIndex: IndexIntoSamplesTable
  ): Float32Array {
    const { samplesSelectedStates } = this.renderedComponentSettings;
    if (!samplesSelectedStates) {
      return percentageBuffers.selectedPercentageAtPixel;
    }
    switch (samplesSelectedStates[sampleIndex]) {
      case 'FILTERED_OUT_BY_TRANSFORM':
        return percentageBuffers.filteredOutByTransformPercentageAtPixel;
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
  renderedComponentSettings: RenderedComponentSettings;
  fills: CategoryFill[];
  averageCPUPerPixel: Float32Array;
  upperGraphEdge: Float32Array;

  constructor(
    renderedComponentSettings: RenderedComponentSettings,
    fills: CategoryFill[],
    averageCPUPerPixel: Float32Array,
    upperGraphEdge: Float32Array
  ) {
    this.renderedComponentSettings = renderedComponentSettings;
    this.fills = fills;
    this.averageCPUPerPixel = averageCPUPerPixel;
    this.upperGraphEdge = upperGraphEdge;
  }

  /**
   * Given a click in CssPixels coordinates, look up the sample in the graph.
   */
  getSampleAndCpuRatioAtClick(
    cssX: CssPixels,
    cssY: CssPixels,
    time: Milliseconds
  ): HoveredPixelState | null {
    const {
      rangeFilteredThread: { samples, stackTable },
      canvasPixelWidth,
      canvasPixelHeight,
    } = this.renderedComponentSettings;

    const { devicePixelRatio } = window;
    const deviceX = Math.floor(cssX * devicePixelRatio);
    const deviceY = Math.floor(cssY * devicePixelRatio);

    if (
      deviceX < 0 ||
      deviceX >= canvasPixelWidth ||
      deviceY < 0 ||
      deviceY >= canvasPixelHeight
    ) {
      return null;
    }

    const categoryUnderMouse = this._categoryAtDevicePixel(deviceX, deviceY);

    const candidateSamples = this._getSamplesAtTime(time);
    const cpuRatioInTimeRange = this._getCPURatioAtX(deviceX, candidateSamples);

    if (categoryUnderMouse === null) {
      if (cpuRatioInTimeRange === null) {
        // If there is not CPU ratio values in that time range, do not show the tooltip.
        return null;
      }
      // Show only the CPU ratio in the tooltip.
      return { sample: null, cpuRatioInTimeRange };
    }

    // Get all samples that contribute pixels to the clicked category in this
    // pixel column of the graph.
    const { category, categoryLowerEdge, yPercentage } = categoryUnderMouse;

    // The candidate samples are sorted by gravity, bottom to top.
    // Each sample occupies a non-empty subrange of the [0, 1] range. The height
    // of each sample's range is called "contribution" here. The sample ranges are
    // directly adjacent, there's no space between them.
    // yPercentage is the mouse position converted to the [0, 1] range. We want
    // to find the sample whose range contains that yPercentage value.
    // Since we already filtered the contributing samples by the clicked
    // category, we start stacking up their contributions onto the lower edge
    // of that category's fill.
    let upperEdgeOfPreviousSample = categoryLowerEdge;
    // Loop invariant: yPercentage >= upperEdgeOfPreviousSample.
    // (In fact, yPercentage > upperEdgeOfPreviousSample except during the first
    // iteration - in the first iteration, yPercentage can be == categoryLowerEdge.)
    for (const { sample, contribution } of candidateSamples) {
      const stackIndex = samples.stack[sample];
      if (stackIndex === null) {
        console.error(
          `Stack index was null for sample index ${sample}, this shouldn't happen normally, please fix your source of data.`
        );
        continue;
      }
      const sampleCategory = stackTable.category[stackIndex];
      if (sampleCategory !== category) {
        // The sample contribution is already filtered by the category at this
        // point. So we should skip the samples that have different categories.
        continue;
      }

      const upperEdgeOfThisSample = upperEdgeOfPreviousSample + contribution;
      if (yPercentage <= upperEdgeOfThisSample) {
        // We use <= rather than < here so that we don't return null if
        // yPercentage is equal to the upper edge of the last sample.
        return { sample, cpuRatioInTimeRange };
      }
      upperEdgeOfPreviousSample = upperEdgeOfThisSample;
    }

    return null;
  }

  /**
   * Determine the CPU usage ratio and the time range that contributes to this
   * ratio at that X. `upperGraphEdge` is the array we use to determine the CPU
   * ratio because this is the height of the whole activity graph, and it's a
   * number between 0 and 1 which is perfect for being used to determine the
   * percentage of the average CPU usage.
   */
  _getCPURatioAtX(
    deviceX: DevicePixels,
    samplesAtThisPixel: ReadonlyArray<SampleContributionToPixel>
  ): CpuRatioInTimeRange | null {
    const {
      rangeFilteredThread: { samples },
      interval,
    } = this.renderedComponentSettings;

    if (samplesAtThisPixel.length === 0) {
      // Return null if there are no candidate samples.
      return null;
    }

    const threadCPURatio = samples.threadCPURatio;
    if (!threadCPURatio) {
      // There is no threadCPURatio information in the array. Return null.
      return null;
    }

    const cpuRatio = this.averageCPUPerPixel[deviceX];

    // Get the time range of the contributed samples to the average CPU usage value.
    let timeRange = 0;
    for (const { sample } of samplesAtThisPixel) {
      timeRange +=
        sample === 0
          ? interval
          : samples.time[sample] - samples.time[sample - 1];
    }

    return { cpuRatio, timeRange };
  }

  /**
   * Find a specific category at a pixel location.
   * devicePixelY == 0 is the upper edge of the canvas,
   * devicePixelY == this.renderedComponentSettings.canvasPixelHeight is the
   * lower edge of the canvas.
   *
   * Returns a category such that categoryLowerEdge <= yPercentage and the next
   * category's lower edge would be > yPercentage.
   */
  _categoryAtDevicePixel(
    deviceX: DevicePixels,
    deviceY: DevicePixels
  ): null | {
    category: IndexIntoCategoryList;
    categoryLowerEdge: number;
    yPercentage: number;
  } {
    const { canvasPixelHeight } = this.renderedComponentSettings;

    // Convert the device pixel position into the range [0, 1], with 0 being
    // the *lower* edge of the canvas.
    const yPercentage = 1 - deviceY / canvasPixelHeight;

    let currentCategory = null;
    let currentCategoryStart = 0.0;
    let previousFillEnd = 0.0;

    // Find a fill such that yPercentage is between the fill's lower and its
    // upper edge. (The lower edge of a fill is given by the upper edge of the
    // previous fill. The first fill's lower edge is zero, i.e. the bottom edge
    // of the canvas.)
    // For each category, multiple fills can be present. All fills of the same
    // category will be consecutive in the fills array. See _getCategoryFills
    // for the full list.
    // Loop invariant: yPercentage >= previousFillEnd.
    // (In fact, yPercentage > previousFillEnd once we have encountered the first
    // non-empty fill. Before that, yPercentage can be == previousFillEnd, if
    // both are zero.)
    for (const { category, accumulatedUpperEdge } of this.fills) {
      const fillEnd = accumulatedUpperEdge[deviceX];

      if (category !== currentCategory) {
        currentCategory = category;
        currentCategoryStart = previousFillEnd;
      }

      if (fillEnd === previousFillEnd) {
        continue; // Ignore empty fills
      }

      if (yPercentage <= fillEnd) {
        // We use <= rather than < here so that we don't return null if
        // yPercentage is equal to the upper edge of the last fill.
        return {
          category,
          categoryLowerEdge: currentCategoryStart,
          yPercentage,
        };
      }

      previousFillEnd = fillEnd;
    }

    return null;
  }

  /**
   * Determine which samples contributed to a given height at a specific time. The result
   * is an array of all candidate samples, with their contribution amount.
   */
  _getSamplesAtTime(
    time: Milliseconds
  ): ReadonlyArray<SampleContributionToPixel> {
    const { rangeStart, treeOrderSampleComparator, xPixelsPerMs } =
      this.renderedComponentSettings;

    const xPixel = ((time - rangeStart) * xPixelsPerMs) | 0;
    const [sampleRangeStart, sampleRangeEnd] =
      this._getSampleRangeContributingToPixelWhenSmoothed(xPixel);

    const sampleContributions = [];
    for (let sample = sampleRangeStart; sample < sampleRangeEnd; sample++) {
      const contribution = this._getSmoothedContributionFromSampleToPixel(
        xPixel,
        sample
      );
      if (contribution > 0) {
        sampleContributions.push({
          sample,
          contribution,
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
      rangeFilteredThread: { samples },
      rangeStart,
      xPixelsPerMs,
    } = this.renderedComponentSettings;
    const contributionTimeRangeStart =
      rangeStart + (xPixel - SMOOTHING_RADIUS) / xPixelsPerMs;
    const contributionTimeRangeEnd =
      rangeStart + (xPixel + SMOOTHING_RADIUS) / xPixelsPerMs;

    // Now find the samples where the range [mid(previousSample.time, thisSample.time), mid(thisSample.time, nextSample.time)]
    // overlaps with contributionTimeRange.
    const firstSampleAfterContributionTimeRangeStart = bisectionRight(
      samples.time,
      contributionTimeRangeStart
    );
    const firstSampleAfterContributionTimeRangeEnd = bisectionRight(
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
    sample: IndexIntoSamplesTable
  ): number {
    const {
      rangeFilteredThread: { samples },
      enableCPUUsage,
      interval,
      sampleIndexOffset,
      fullThread,
      xPixelsPerMs,
      rangeStart,
    } = this.renderedComponentSettings;
    const kernelPos = xPixel - SMOOTHING_RADIUS;
    const pixelsAroundX = new Float32Array(SMOOTHING_KERNEL.length);
    const sampleTime = samples.time[sample];
    // Use the fullThread here to properly get the next and previous in case zoomed in.
    const fullThreadSample = sample + sampleIndexOffset;
    const prevSampleTime =
      fullThreadSample > 0
        ? fullThread.samples.time[fullThreadSample - 1]
        : sampleTime - interval;
    const nextSampleTime =
      fullThreadSample + 1 < fullThread.samples.length
        ? fullThread.samples.time[fullThreadSample + 1]
        : sampleTime + interval;

    let beforeSampleCpuRatio = 1;
    let afterSampleCpuRatio = 1;
    const { threadCPURatio } = samples;
    if (enableCPUUsage && threadCPURatio) {
      beforeSampleCpuRatio = threadCPURatio[sample];
      // Use the fullThread here to properly get the next in case zoomed in.
      const fullThreadSamplesCPURatio = ensureExists(
        fullThread.samples.threadCPURatio
      );
      if (fullThreadSample + 1 < fullThreadSamplesCPURatio.length) {
        afterSampleCpuRatio = fullThreadSamplesCPURatio[fullThreadSample + 1];
      } else {
        afterSampleCpuRatio = beforeSampleCpuRatio;
      }
    }

    const kernelRangeStartTime = rangeStart + kernelPos / xPixelsPerMs;

    _accumulateInBuffer(
      pixelsAroundX,
      this.renderedComponentSettings,
      prevSampleTime,
      sampleTime,
      nextSampleTime,
      beforeSampleCpuRatio,
      afterSampleCpuRatio,
      kernelRangeStartTime
    );

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
): Float32Array<ArrayBuffer> {
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
}: {
  categoryDrawStyles: CategoryDrawStyles;
  canvasPixelWidth: number;
}): SelectedPercentageAtPixelBuffers[] {
  return categoryDrawStyles.map(() => ({
    beforeSelectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    selectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    afterSelectedPercentageAtPixel: new Float32Array(canvasPixelWidth),
    filteredOutByTransformPercentageAtPixel: new Float32Array(canvasPixelWidth),
    // Unlike other fields, we do not mutate that array and we keep that zero
    // array to indicate that we don't want to draw anything for this case.
    filteredOutByTabPercentageAtPixel: new Float32Array(canvasPixelWidth),
  }));
}

/**
 * For each category, create a fill style for each of 4 draw states. These fill styles
 * are sorted by their gravity.
 *
 * 'UNSELECTED_ORDERED_BEFORE_SELECTED',
 * 'SELECTED',
 * 'UNSELECTED_ORDERED_AFTER_SELECTED',
 * 'FILTERED_OUT_BY_TRANSFORM'
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
    (categoryIndex) => {
      const categoryDrawStyle = categoryDrawStyles[categoryIndex];
      const buffer = percentageBuffers[categoryIndex];
      // For every category we draw four fills, for the four selection kinds:
      return [
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.getUnselectedFillStyle(),
          perPixelContribution: buffer.beforeSelectedPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.getSelectedFillStyle(),
          perPixelContribution: buffer.selectedPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.getUnselectedFillStyle(),
          perPixelContribution: buffer.afterSelectedPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.filteredOutByTransformFillStyle,
          perPixelContribution: buffer.filteredOutByTransformPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
      ];
    }
  );

  // Flatten out the fills into a single array.
  return ([] as CategoryFill[]).concat(...nestedFills);
}

/**
 * Mutates `percentageBuffer` by adding contributions from a single sample to
 * the pixels that the sample overlaps with. The buffer covers the following
 * time range: It starts at `rangeStart` and ends at
 * `rangeStart + percentageBuffer.length / renderedComponentSettings.xPixelsPerMs`.
 */
function _accumulateInBuffer(
  percentageBuffer: Float32Array,
  renderedComponentSettings: RenderedComponentSettings,
  prevSampleTime: Milliseconds,
  sampleTime: Milliseconds,
  nextSampleTime: Milliseconds,
  beforeSampleCpuRatio: number,
  afterSampleCpuRatio: number,
  bufferTimeRangeStart: Milliseconds
) {
  const { xPixelsPerMs } = renderedComponentSettings;
  const sampleCategoryStartTime = (prevSampleTime + sampleTime) / 2;
  const sampleCategoryEndTime = (sampleTime + nextSampleTime) / 2;
  let sampleCategoryStartPixel =
    (sampleCategoryStartTime - bufferTimeRangeStart) * xPixelsPerMs;
  let sampleCategoryEndPixel =
    (sampleCategoryEndTime - bufferTimeRangeStart) * xPixelsPerMs;
  if (sampleCategoryStartPixel < 0) {
    sampleCategoryStartPixel = 0;
  }
  if (sampleCategoryEndPixel > percentageBuffer.length - 1) {
    sampleCategoryEndPixel = percentageBuffer.length - 1;
  }
  const samplePixel = (sampleTime - bufferTimeRangeStart) * xPixelsPerMs;
  const intCategoryStartPixel = sampleCategoryStartPixel | 0;
  const intCategoryEndPixel = sampleCategoryEndPixel | 0;
  const intSamplePixel = samplePixel | 0;

  // Every sample has two parts because of different CPU usage values.
  // For every sample part, we have a fractional interval of this sample part's
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

  // Samples have two parts to be able to present the different CPU usages properly.
  // This is because CPU usage number of a sample represents the CPU usage
  // starting starting from the previous sample time to this sample time.
  // These parts will be:
  // - Between `sampleCategoryStartPixel` and `samplePixel` with beforeSampleCpuRatio.
  // - Between `samplePixel` and `sampleCategoryEndPixel` with afterSampleCpuRatio.

  // Here we are accumulating the first part of the sample. It will use the
  // CPU delta number that belongs to this sample.
  // This part starts from the "sample start time" to "sample time" and uses
  // beforeSampleCpuRatio.
  for (let i = intCategoryStartPixel; i <= intSamplePixel; i++) {
    percentageBuffer[i] += beforeSampleCpuRatio;
  }

  // Subtract the partial pixels from start and end of the first part.
  percentageBuffer[intCategoryStartPixel] -=
    beforeSampleCpuRatio * (sampleCategoryStartPixel - intCategoryStartPixel);
  percentageBuffer[intSamplePixel] -=
    beforeSampleCpuRatio * (1 - (samplePixel - intSamplePixel));

  // Here we are accumulating the second part of the sample. It will use the
  // CPU delta number that belongs to the next sample.
  // This part starts from "sample time" to "sample end time" and uses
  // afterSampleCpuRatio.
  for (let i = intSamplePixel; i <= intCategoryEndPixel; i++) {
    percentageBuffer[i] += afterSampleCpuRatio;
  }

  // Subtract the partial pixels from start and end of the second part.
  percentageBuffer[intSamplePixel] -=
    afterSampleCpuRatio * (samplePixel - intSamplePixel);
  percentageBuffer[intCategoryEndPixel] -=
    afterSampleCpuRatio * (1 - (sampleCategoryEndPixel - intCategoryEndPixel));
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
  srcArray: Float32Array<ArrayBuffer>,
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
