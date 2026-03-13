/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type Slice = {
  start: number;
  end: number;
  avg: number;
  sum: number;
  parent: number | null;
};

function addIndexIntervalsExceedingThreshold(
  threshold: number,
  threadCPURatio: Float64Array,
  time: number[],
  items: Slice[],
  parent: number | null,
  startIndex: number = 0,
  endIndex: number = threadCPURatio.length - 1
) {
  let currentStartIndex = startIndex;
  while (true) {
    let currentEndIndex = endIndex;
    while (
      currentStartIndex < currentEndIndex &&
      threadCPURatio[currentStartIndex + 1] < threshold
    ) {
      currentStartIndex++;
    }

    while (
      currentStartIndex < currentEndIndex &&
      threadCPURatio[currentEndIndex] < threshold
    ) {
      currentEndIndex--;
    }

    if (currentStartIndex === currentEndIndex) {
      break;
    }

    const startTime = time[currentStartIndex];
    let sum = 0;
    let lastEndIndexWithAvgExceedingThreshold = currentStartIndex + 1;
    let lastEndIndexWithAvgExceedingThresholdAvg = threshold;
    let lastEndIndexWithAvgExceedingThresholdSum = 0;
    let timeBefore = startTime;
    for (let i = currentStartIndex + 1; i <= currentEndIndex; i++) {
      const timeAfter = time[i];
      const timeDelta = timeAfter - timeBefore;
      sum += threadCPURatio[i] * timeDelta;
      if (timeAfter > startTime) {
        const avg = sum / (timeAfter - startTime);
        if (avg >= threshold) {
          lastEndIndexWithAvgExceedingThreshold = i;
          lastEndIndexWithAvgExceedingThresholdAvg = avg;
          lastEndIndexWithAvgExceedingThresholdSum = sum;
        }
      }
      timeBefore = timeAfter;
    }

    // assert(currentStartIndex < lastEndIndexWithAvgExceedingThreshold);
    items.push({
      start: currentStartIndex,
      end: lastEndIndexWithAvgExceedingThreshold,
      avg: lastEndIndexWithAvgExceedingThresholdAvg,
      sum: lastEndIndexWithAvgExceedingThresholdSum,
      parent,
    });
    currentStartIndex = lastEndIndexWithAvgExceedingThreshold;
  }
}

export type SliceTree = {
  slices: Slice[];
  time: number[];
};

export function getSlices(
  thresholds: number[],
  threadCPURatio: Float64Array,
  time: number[],
  startIndex: number = 0,
  endIndex: number = threadCPURatio.length - 1
): SliceTree {
  const firstThreshold = thresholds[0];
  const slices = new Array<Slice>();
  addIndexIntervalsExceedingThreshold(
    firstThreshold,
    threadCPURatio,
    time,
    slices,
    null,
    startIndex,
    endIndex
  );
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const nextThreshold = thresholds.find((thresh) => thresh > slice.avg);
    if (nextThreshold === undefined) {
      continue;
    }
    addIndexIntervalsExceedingThreshold(
      nextThreshold,
      threadCPURatio,
      time,
      slices,
      i,
      slice.start,
      slice.end
    );
  }
  return { slices, time };
}

function sliceToString(slice: Slice, time: number[]): string {
  const { avg, start, end } = slice;
  const startTime = time[start];
  const endTime = time[end];
  const duration = endTime - startTime;
  const sampleCount = end - start;
  return `${Math.round(avg * 100)}% for ${duration.toFixed(1)}ms (${sampleCount} samples): ${startTime.toFixed(1)}ms - ${endTime.toFixed(1)}ms`;
}

function appendSliceSubtree(
  slices: Slice[],
  startIndex: number,
  parent: number | null,
  childrenStartPerParent: number[],
  interestingSliceIndexes: Set<number>,
  nestingDepth: number,
  time: number[],
  s: string[]
) {
  for (let i = startIndex; i < slices.length; i++) {
    if (!interestingSliceIndexes.has(i)) {
      continue;
    }

    const slice = slices[i];
    if (slice.parent !== parent) {
      break;
    }

    s.push('  '.repeat(nestingDepth) + '- ' + sliceToString(slice, time));

    const childrenStart = childrenStartPerParent[i];
    if (childrenStart !== null) {
      appendSliceSubtree(
        slices,
        childrenStart,
        i,
        childrenStartPerParent,
        interestingSliceIndexes,
        nestingDepth + 1,
        time,
        s
      );
    }
  }
}

export function printSliceTree({ slices, time }: SliceTree): string[] {
  if (slices.length === 0) {
    return ['No significant activity.'];
  }

  const childrenStartPerParent = new Array(slices.length);
  const indexAndSumPerSlice = new Array(slices.length);
  for (let i = 0; i < slices.length; i++) {
    childrenStartPerParent[i] = null;
    const { parent, sum } = slices[i];
    indexAndSumPerSlice.push({ i, sum });
    if (parent !== null && childrenStartPerParent[parent] === null) {
      childrenStartPerParent[parent] = i;
    }
  }
  indexAndSumPerSlice.sort((a, b) => b.sum - a.sum);
  const interestingSliceIndexes = new Set(
    indexAndSumPerSlice.slice(0, 20).map((x) => x.i)
  );
  // console.log(interestingSliceIndexes);

  const s = new Array<string>();
  appendSliceSubtree(
    slices,
    0,
    null,
    childrenStartPerParent,
    interestingSliceIndexes,
    0,
    time,
    s
  );

  return s;
}
