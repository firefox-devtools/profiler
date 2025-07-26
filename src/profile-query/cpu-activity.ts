import type { Slice, SliceTree } from 'firefox-profiler/utils/slice-tree';
import type { TimestampManager } from './timestamps';

export interface CpuActivityEntry {
  startTime: number;
  startTimeName: string;
  startTimeStr: string; // Formatted timestamp string (e.g., "6.991s")
  endTime: number;
  endTimeName: string;
  endTimeStr: string; // Formatted timestamp string (e.g., "10.558s")
  cpuMs: number;
  depthLevel: number;
}

function sliceToString(
  slice: Slice,
  time: number[],
  tsManager: TimestampManager
): string {
  const { avg, start, end } = slice;
  const startTime = time[start];
  const endTime = time[end];
  const duration = endTime - startTime;
  const startName = tsManager.nameForTimestamp(startTime);
  const endName = tsManager.nameForTimestamp(endTime);
  const startTimeStr = tsManager.timestampString(startTime);
  const endTimeStr = tsManager.timestampString(endTime);
  return `${Math.round(avg * 100)}% for ${duration.toFixed(1)}ms: [${startName} → ${endName}] (${startTimeStr} - ${endTimeStr})`;
}

function appendSliceSubtree(
  slices: Slice[],
  startIndex: number,
  parent: number | null,
  childrenStartPerParent: number[],
  interestingSliceIndexes: Set<number>,
  nestingDepth: number,
  time: number[],
  s: string[],
  tsManager: TimestampManager
) {
  for (let i = startIndex; i < slices.length; i++) {
    if (!interestingSliceIndexes.has(i)) {
      continue;
    }

    const slice = slices[i];
    if (slice.parent !== parent) {
      break;
    }

    s.push(
      '  '.repeat(nestingDepth) + '- ' + sliceToString(slice, time, tsManager)
    );

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
        s,
        tsManager
      );
    }
  }
}

export function printSliceTree(
  { slices, time }: SliceTree,
  tsManager: TimestampManager
): string[] {
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
    s,
    tsManager
  );

  return s;
}

/**
 * Collect CPU activity slices as structured data.
 */
export function collectSliceTree(
  { slices, time }: SliceTree,
  tsManager: TimestampManager
): CpuActivityEntry[] {
  if (slices.length === 0) {
    return [];
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

  const result: CpuActivityEntry[] = [];
  collectSliceSubtree(
    slices,
    0,
    null,
    childrenStartPerParent,
    interestingSliceIndexes,
    0,
    time,
    result,
    tsManager
  );

  return result;
}

function collectSliceSubtree(
  slices: Slice[],
  startIndex: number,
  parent: number | null,
  childrenStartPerParent: number[],
  interestingSliceIndexes: Set<number>,
  nestingDepth: number,
  time: number[],
  result: CpuActivityEntry[],
  tsManager: TimestampManager
) {
  for (let i = startIndex; i < slices.length; i++) {
    if (!interestingSliceIndexes.has(i)) {
      continue;
    }

    const slice = slices[i];
    if (slice.parent !== parent) {
      break;
    }

    const { start, end, avg } = slice;
    const startTime = time[start];
    const endTime = time[end];
    const duration = endTime - startTime;
    const cpuMs = duration * avg;

    result.push({
      startTime,
      startTimeName: tsManager.nameForTimestamp(startTime),
      startTimeStr: tsManager.timestampString(startTime),
      endTime,
      endTimeName: tsManager.nameForTimestamp(endTime),
      endTimeStr: tsManager.timestampString(endTime),
      cpuMs,
      depthLevel: nestingDepth,
    });

    const childrenStart = childrenStartPerParent[i];
    if (childrenStart !== null) {
      collectSliceSubtree(
        slices,
        childrenStart,
        i,
        childrenStartPerParent,
        interestingSliceIndexes,
        nestingDepth + 1,
        time,
        result,
        tsManager
      );
    }
  }
}
