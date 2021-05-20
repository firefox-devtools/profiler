/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import clamp from 'clamp';

import { bisectionRight } from 'firefox-profiler/utils/bisect';
import { ensureExists } from 'firefox-profiler/utils/flow';

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
type RenderedComponentSettings = {|
  +canvasPixelWidth: DevicePixels,
  +canvasPixelHeight: DevicePixels,
  +fullThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +xPixelsPerMs: number,
  +enableCPUUsage: boolean,
  +maxThreadCPUDelta: number,
  +treeOrderSampleComparator: ?(
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +greyCategoryIndex: IndexIntoCategoryList,
  +samplesSelectedStates: null | Array<SelectedState>,
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
  // The Float32Arrays are mutated in place during the computation step.
  +perPixelContribution: Float32Array,
  +accumulatedUpperEdge: Float32Array,
|};

export type CategoryDrawStyles = $ReadOnlyArray<{|
  +category: number,
  +gravity: number,
  +selectedFillStyle: string,
  +unselectedFillStyle: string,
  +filteredOutByTransformFillStyle: CanvasPattern,
  +selectedTextColor: string,
|}>;

type SelectedPercentageAtPixelBuffers = {|
  // These Float32Arrays are mutated in place during the computation step.
  +beforeSelectedPercentageAtPixel: Float32Array,
  +selectedPercentageAtPixel: Float32Array,
  +afterSelectedPercentageAtPixel: Float32Array,
  +filteredOutByTransformPercentageAtPixel: Float32Array,
  +filteredOutByTabPercentageAtPixel: Float32Array,
|};

export type CpuRatioInTimeRange = {|
  +cpuRatio: number,
  +timeRange: Milliseconds,
|};

const BOX_BLUR_RADII = [3, 2, 2];
const SMOOTHING_RADIUS = 3 + 2 + 2;
const SMOOTHING_KERNEL: Float32Array = _getSmoothingKernel(
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

  const upperGraphEdge = activityGraphFills.run();
  // We're done mutating the fills' Float32Array buffers.
  const fills = mutableFills;

  return {
    fills,
    fillsQuerier: new ActivityFillGraphQuerier(
      renderedComponentSettings,
      fills,
      upperGraphEdge
    ),
  };
}

/**
 * This class takes the immutable graph settings, and then computes the ActivityGraph's
 * fills by mutating the selected pecentage buffers and the category fill values.
 */
export class ActivityGraphFillComputer {
  +renderedComponentSettings: RenderedComponentSettings;
  // The fills and percentages are mutated in place.
  +mutablePercentageBuffers: SelectedPercentageAtPixelBuffers[];
  +mutableFills: CategoryFill[];

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
  run(): Float32Array {
    // First go through each sample, and set the buffers that contain the percentage
    // that a category contributes to a given place in the X axis of the chart.
    this._accumulateSampleCategories();

    // Smooth the graphs by applying a 1D gaussian blur to the per-pixel
    // contribution of each fill.
    for (const fill of this.mutableFills) {
      _applyGaussianBlur1D(fill.perPixelContribution, BOX_BLUR_RADII);
    }

    const upperGraphEdge = this._accumulateUpperEdge();

    return upperGraphEdge;
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
      fullThread: { samples, stackTable },
      interval,
      greyCategoryIndex,
      enableCPUUsage,
    } = this.renderedComponentSettings;

    if (samples.length === 0) {
      // If we have no samples, there's nothing to do.
      return;
    }

    let prevSampleTime = samples.time[0] - interval;
    let sampleTime = samples.time[0];

    // Go through the samples and accumulate the category into the percentageBuffers.
    const { threadCPUDelta } = samples;
    for (let i = 0; i < samples.length - 1; i++) {
      const nextSampleTime = samples.time[i + 1];
      const stackIndex = samples.stack[i];
      const category =
        stackIndex === null
          ? greyCategoryIndex
          : stackTable.category[stackIndex];

      let cpuBeforeSample = null;
      let cpuAfterSample = null;
      if (enableCPUUsage && threadCPUDelta) {
        // It must be non-null because we are checking this in the processing
        // step and eliminating all the null values.
        const cpuDeltaBefore = ensureExists(threadCPUDelta[i]);
        const cpuDeltaAfter = ensureExists(threadCPUDelta[i + 1]);
        const intervalDistribution =
          i === 0 ? 1 : (samples.time[i] - samples.time[i - 1]) / interval;
        const nextIntervalDistribution =
          (samples.time[i + 1] - samples.time[i]) / interval;

        // Figure out the CPU usage "per interval". This is needed for cases
        // where we have some missing samples. For example:
        //
        // Interval:        1ms                  2ms                 1ms
        // CPU:          100 cycles           200 cycles          200 cycles
        // Samples:  [x-------------x--------------------------x-------------x]
        //
        // In this case, even though it has the max CPU cycle count, the CPU
        // usage should be 50% because this cycle count is from 2ms area instead
        // of 1ms like the latter one.
        cpuBeforeSample = cpuDeltaBefore / intervalDistribution;
        cpuAfterSample = cpuDeltaAfter / nextIntervalDistribution;
      }

      // Mutate the percentage buffers.
      this._accumulateInCategory(
        category,
        i,
        prevSampleTime,
        sampleTime,
        nextSampleTime,
        cpuBeforeSample,
        cpuAfterSample
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

    let cpuBeforeSample = null;
    if (enableCPUUsage && threadCPUDelta && threadCPUDelta[lastIdx] !== null) {
      const cpuDelta = threadCPUDelta[lastIdx];
      const intervalDistribution =
        lastIdx === 0
          ? 1
          : (samples.time[lastIdx] - samples.time[lastIdx - 1]) / interval;
      cpuBeforeSample = cpuDelta / intervalDistribution;
    }

    this._accumulateInCategory(
      lastSampleCategory,
      samples.length - 1,
      prevSampleTime,
      sampleTime,
      sampleTime + interval,
      cpuBeforeSample,
      // There is no cpuAfterSample for this since this is the last sample.
      // Assigning the same CPU delta value to it.
      cpuBeforeSample
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
    cpuBeforeSample: number | null,
    cpuAfterSample: number | null
  ) {
    const {
      rangeEnd,
      rangeStart,
      categoryDrawStyles,
      xPixelsPerMs,
      canvasPixelWidth,
      maxThreadCPUDelta,
    } = this.renderedComponentSettings;
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
    const intPixelCenter = Math.floor((intPixelStart + intPixelEnd) / 2);

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

    // A number between 0 and 1 for sample ratio. It changes depending on
    // the CPU usage if it's given. If not, it uses 1 directly.
    const sampleFirstHalfRatio =
      cpuBeforeSample === null ? 1 : cpuBeforeSample / maxThreadCPUDelta;
    const sampleSecondHalfRatio =
      cpuAfterSample === null ? 1 : cpuAfterSample / maxThreadCPUDelta;

    // Samples have two parts to be able to present the CPU utilizations properly.
    // The first half of the sample will use the CPU delta number that belongs to
    // this sample.
    for (let i = intPixelStart; i <= intPixelCenter; i++) {
      percentageBuffer[i] += sampleFirstHalfRatio;
    }
    // The second half of the sample will use the CPU delta number that belongs to
    // the next sample.
    // For the samples that are consist of only one pixel, this loop will not be
    // executed. It will only be executed if sample has 2 or more pixels.
    for (let i = intPixelCenter + 1; i <= intPixelEnd; i++) {
      percentageBuffer[i] += sampleSecondHalfRatio;
    }

    // If a sample is only one pixel, then only the first for loop in is being
    // run. If a sample has more than one pixel, then both the first and the
    // second loop is being run. If there is only one pixel, which is
    // intPixelStart === intPixelEnd case, we should use the first half ratio to
    // compute the sub pixel subtraction. This is because we only use the first
    // half ratio to compute in that case. If there are 2 or more
    // pixels, then we use the second half ratio as the ending.
    let sampleEndRatio;
    if (intPixelStart === intPixelEnd) {
      // Sample has only one pixel in the activity graph. Therefore use the
      // first half ratio as the end ratio.
      sampleEndRatio = sampleFirstHalfRatio;
    } else {
      // Sample has more than one pixel in the activity graph. Therefore use the
      // second half ratio as the end ratio.
      sampleEndRatio = sampleSecondHalfRatio;
    }

    // After going through all the pixels, we should now remove all the parts in
    // the first and last pixels that don't belong to this sample. Because a
    // sample can start and end in sub-pixel values.
    // The algorithm works like this:
    //  - When one sample has several pixels, start and end pixels will be
    //    different and they will be reduced independently.
    //  - When one pixel has several samples, start and end pixels of every sample
    //    will be the same. Ratios of different samples will accumulate and form
    //    the 100% of a sample.

    percentageBuffer[intPixelStart] -=
      sampleFirstHalfRatio * (pixelStart - intPixelStart);
    percentageBuffer[intPixelEnd] -=
      sampleEndRatio * (1 - (pixelEnd - intPixelEnd));
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
      case 'FILTERED_OUT_BY_ACTIVE_TAB':
        return percentageBuffers.filteredOutByTabPercentageAtPixel;
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
  upperGraphEdge: Float32Array;

  constructor(
    renderedComponentSettings: RenderedComponentSettings,
    fills: CategoryFill[],
    upperGraphEdge: Float32Array
  ) {
    this.renderedComponentSettings = renderedComponentSettings;
    this.fills = fills;
    this.upperGraphEdge = upperGraphEdge;
  }

  /**
   * Given a click in CssPixels coordinates, look up the sample in the graph.
   */
  getSampleAndCpuRatioAtClick(
    cssX: CssPixels,
    cssY: CssPixels,
    time: Milliseconds,
    canvasBoundingRect: ClientRect
  ): HoveredPixelState | null {
    const {
      canvasPixelWidth,
      fullThread: { samples, stackTable },
      greyCategoryIndex,
    } = this.renderedComponentSettings;
    const devicePixelRatio = canvasPixelWidth / canvasBoundingRect.width;
    const deviceX = Math.round(cssX * devicePixelRatio);
    const deviceY = Math.round(cssY * devicePixelRatio);
    const categoryUnderMouse = this._categoryAtDevicePixel(deviceX, deviceY);
    if (categoryUnderMouse === null) {
      return null;
    }

    // Get all samples that contribute pixels to the clicked category in this
    // pixel column of the graph.
    const { category, categoryLowerEdge, yPercentage } = categoryUnderMouse;
    const candidateSamples = this._getSamplesAtTime(time);

    const cpuRatioInTimeRange = this._getCPURatioAtX(deviceX, candidateSamples);

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
      const sampleCategory =
        stackIndex !== null
          ? stackTable.category[stackIndex]
          : greyCategoryIndex;
      const upperEdgeOfThisSample = upperEdgeOfPreviousSample + contribution;
      // Checking the sample category here because there are samples with different
      // categories that has y percentage is lower than the upperEdgeOfThisSample.
      // It's possible to pick the wrong value otherwise.
      if (sampleCategory === category && yPercentage <= upperEdgeOfThisSample) {
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
    samplesAtThisPixel: $ReadOnlyArray<SampleContributionToPixel>
  ): CpuRatioInTimeRange | null {
    const {
      fullThread: { samples },
      interval,
    } = this.renderedComponentSettings;

    if (samplesAtThisPixel.length === 0) {
      // Return null if there are no candidate samples.
      return null;
    }

    const threadCPUDelta = samples.threadCPUDelta;
    if (!threadCPUDelta) {
      // There is no threadCPUDelta information in the array. Return null.
      return null;
    }

    // This is the height of the graph and it directly corresponds to the average
    // CPU usage number.
    const cpuRatio = this.upperGraphEdge[deviceX];

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
    category: IndexIntoCategoryList,
    categoryLowerEdge: number,
    yPercentage: number,
  } {
    const {
      canvasPixelWidth,
      canvasPixelHeight,
    } = this.renderedComponentSettings;

    if (
      deviceX < 0 ||
      deviceX >= canvasPixelWidth ||
      deviceY < 0 ||
      deviceY >= canvasPixelHeight
    ) {
      return null;
    }

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
  _getSamplesAtTime(time: number): $ReadOnlyArray<SampleContributionToPixel> {
    const {
      rangeStart,
      rangeEnd,
      treeOrderSampleComparator,
      canvasPixelWidth,
    } = this.renderedComponentSettings;

    const rangeLength = rangeEnd - rangeStart;
    const xPixelsPerMs = canvasPixelWidth / rangeLength;
    const xPixel = ((time - rangeStart) * xPixelsPerMs) | 0;
    const [
      sampleRangeStart,
      sampleRangeEnd,
    ] = this._getSampleRangeContributingToPixelWhenSmoothed(xPixel);

    const sampleContributions = [];
    for (let sample = sampleRangeStart; sample < sampleRangeEnd; sample++) {
      const contribution = this._getSmoothedContributionFromSampleToPixel(
        xPixel,
        xPixelsPerMs,
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
      fullThread: { samples },
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
    xPixelsPerMs: number,
    sample: IndexIntoSamplesTable
  ): number {
    const {
      fullThread: { samples },
      rangeStart,
    } = this.renderedComponentSettings;
    const kernelPos = xPixel - SMOOTHING_RADIUS;
    const pixelsAroundX = new Float32Array(SMOOTHING_KERNEL.length);
    const sampleTime = samples.time[sample];
    // xPixel in graph space maps to kernel[smoothingRadius]
    const sampleTimeRangeStart =
      sample > 0 ? (samples.time[sample - 1] + sampleTime) / 2 : -Infinity;
    const sampleTimeRangeEnd =
      sample + 1 < samples.length
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
    categoryIndex => {
      const categoryDrawStyle = categoryDrawStyles[categoryIndex];
      const buffer = percentageBuffers[categoryIndex];
      // For every category we draw four fills, for the four selection kinds:
      return [
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.unselectedFillStyle,
          perPixelContribution: buffer.beforeSelectedPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.selectedFillStyle,
          perPixelContribution: buffer.selectedPercentageAtPixel,
          accumulatedUpperEdge: new Float32Array(
            buffer.beforeSelectedPercentageAtPixel.length
          ),
        },
        {
          category: categoryDrawStyle.category,
          fillStyle: categoryDrawStyle.unselectedFillStyle,
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
