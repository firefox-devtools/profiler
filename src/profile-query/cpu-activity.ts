import type { Slice, SliceTree } from 'firefox-profiler/utils/slice-tree';
import type { TimestampManager } from './timestamps';

export interface CpuActivityEntry {
  startTime: number;
  startTimeName: string;
  startTimeStr: string;
  endTime: number;
  endTimeName: string;
  endTimeStr: string;
  cpuMs: number;
  depthLevel: number;
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

  const childrenStartPerParent: Array<number | null> = new Array(slices.length);
  const indexAndSumPerSlice: Array<{ i: number; sum: number }> = [];
  for (let i = 0; i < slices.length; i++) {
    childrenStartPerParent[i] = null;
    const { parent, sum } = slices[i];
    indexAndSumPerSlice.push({ i, sum });
    if (parent !== null && childrenStartPerParent[parent] === null) {
      childrenStartPerParent[parent] = i;
    }
  }
  indexAndSumPerSlice.sort((a, b) => b.sum - a.sum);
  const interestingSliceIndexes = new Set<number>();
  for (const { i } of indexAndSumPerSlice.slice(0, 20)) {
    let currentIndex: number | null = i;
    while (
      currentIndex !== null &&
      !interestingSliceIndexes.has(currentIndex)
    ) {
      interestingSliceIndexes.add(currentIndex);
      currentIndex = slices[currentIndex].parent;
    }
  }

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
  childrenStartPerParent: Array<number | null>,
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
