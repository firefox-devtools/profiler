/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { bisectionLeft } from 'firefox-profiler/utils/bisect';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type { CallNodeInfoInverted } from 'firefox-profiler/profile-logic/profile-data';

import type {
  SamplesLikeTable,
  Milliseconds,
  CallNodeInfo,
  CallNodeTable,
  CallNodePath,
  StackTable,
  IndexIntoCallNodeTable,
  DevicePixels,
  IndexIntoFuncTable,
  IndexIntoSamplesTable,
  IndexIntoCategoryList,
  StartEndRange,
} from 'firefox-profiler/types';

/**
 * The StackTimingByDepth data structure organizes stack frames by their depth, and startDev
 * and sampleIndex times. This optimizes sample data for Stack Chart views. sampleIndext
 * makes it really easy to draw a large amount of spans at once based on where the
 * viewport is in the stack frame data. Plus the endDev timings for frames need to be
 * reconstructed from the sample data, as the samples only contain startDev timings.
 *
 * This format allows for specifically selecting certain rows of stack frames by using
 * the stack depth information. In addition, the startDev and endDev times of samples can be
 * found through binary searches, allowing for selecting the proper subsets of frames
 * to be drawn. Each row's sample length is different, but it can still be efficient
 * to find subsets of the data.
 *
 * Each object in the array below represents a single row of stack frames at a given
 * depth. Each object is a table that contains the the startDev time and endDev time in
 * milliseconds, and the stack index that points into the stack table.
 *
 * stackTimingByDepth Example:
 * [
 *   // This first object represents the first box at the base of the chart. It only
 *   // contains a single stack frame to draw, starting at 10ms, ending at 100ms. It
 *   // points to the stackIndex 0.
 *
 *   {startDev: [10], endDev: [100], stack: [0]}
 *
 *   // This next object represents 3 spans to draw, the first box being stack 1 in the
 *   // stack table, and it starts at 20ms, and ends at 40ms.
 *
 *   {startDev: [20, 40, 60], endDev: [40, 60, 80], stack: [1, 2, 3]}
 *   {startDev: [20, 40, 60], endDev: [40, 60, 80], stack: [34, 59, 72]}
 *   ...
 *   {startDev: [25, 45], endDev: [35, 55], stack: [123, 159]}
 * ]
 */

export type StackTimingDepth = number;
export type IndexIntoStackTiming = number;

export type StackTiming = {|
  startDev: DevicePixels[],
  endDev: DevicePixels[],
  sampleIndex: IndexIntoSamplesTable[],
  func: IndexIntoFuncTable[],
  category: IndexIntoCategoryList[],
  isSelectedPath: boolean[],
  parentIndexInPreviousRow: IndexIntoStackTiming[],
  length: number,
|};

export type StackTimingByDepth = StackTiming[];

function getEmptyStackTimingByDepth(
  maxDepth: StackTimingDepth
): StackTimingByDepth {
  return Array.from({ length: maxDepth }, () => ({
    startDev: [],
    endDev: [],
    sampleIndex: [],
    func: [],
    category: [],
    isSelectedPath: [],
    parentIndexInPreviousRow: [],
    length: 0,
  }));
}

/**
 * Round the given value to integers, consistently rounding x.5 towards positive infinity.
 * This is different from Math.round: Math.round rounds 0.5 to the right (to 1), and -0.5
 * to the left (to -1).
 * snap should be preferred over Math.round for rounding coordinates which might
 * be negative, so that there is no discontinuity when a box moves past zero.
 */
function snap(floatDeviceValue: DevicePixels): DevicePixels {
  return Math.floor(floatDeviceValue + 0.5);
}

/**
 * Round the given value to a multiple of 2.
 */
function snapValueToMultipleOfTwo(
  floatDeviceValue: DevicePixels
): DevicePixels {
  return snap(floatDeviceValue / 2) << 1;
}

/**
 * Build a StackTimingByDepth table from a given thread.
 */
export function getStackTimingByDepth(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  timeRangeEnd: Milliseconds,
  deviceWidth: DevicePixels,
  selectedCallNode: IndexIntoCallNodeTable | null,
  defaultCategory: IndexIntoCategoryList,
  interval: Milliseconds
): StackTimingByDepth {
  if (timeRangeStart >= timeRangeEnd || deviceWidth <= 0) {
    return getEmptyStackTimingByDepth(maxDepth);
  }

  let sampleIndexRangeStart = Math.max(
    0,
    bisectionLeft(samples.time, timeRangeStart) - 1
  );
  const sampleIndexRangeEnd = Math.min(
    samples.length - 1,
    bisectionLeft(samples.time, timeRangeEnd, sampleIndexRangeStart)
  );

  while (
    sampleIndexRangeStart < sampleIndexRangeEnd &&
    samples.stack[sampleIndexRangeStart] === null
  ) {
    sampleIndexRangeStart++;
  }

  if (sampleIndexRangeStart === sampleIndexRangeEnd) {
    return getEmptyStackTimingByDepth(maxDepth);
  }

  const timeWindowSizeInMilliseconds = timeRangeEnd - timeRangeStart;
  const devPxPerMs = deviceWidth / timeWindowSizeInMilliseconds;

  const firstSampleTime = samples.time[sampleIndexRangeStart];
  const firstSamplePos = snapValueToMultipleOfTwo(
    (firstSampleTime - timeRangeStart) * devPxPerMs
  );
  const firstPos = Math.max(0, firstSamplePos);

  const endTime =
    sampleIndexRangeEnd < samples.length
      ? samples.time[sampleIndexRangeEnd]
      : samples.time[sampleIndexRangeEnd - 1] + interval;
  const endPos = Math.min(
    deviceWidth,
    snapValueToMultipleOfTwo((endTime - timeRangeStart) * devPxPerMs)
  );

  return callNodeInfo.isInverted()
    ? getStackTimingByDepthInverted(
        samples,
        stackTable,
        callNodeInfo,
        maxDepth,
        timeRangeStart,
        devPxPerMs,
        selectedCallNode,
        defaultCategory,
        sampleIndexRangeStart,
        sampleIndexRangeEnd,
        firstPos,
        endPos
      )
    : getStackTimingByDepthNonInverted(
        samples,
        stackTable,
        callNodeInfo,
        maxDepth,
        timeRangeStart,
        devPxPerMs,
        selectedCallNode,
        sampleIndexRangeStart,
        sampleIndexRangeEnd,
        firstPos,
        endPos
      );
}

type StackTimingOpenSpan = {|
  sampleIndex: IndexIntoSamplesTable,
  callNodeIndex: IndexIntoCallNodeTable | -1,
  startDev: DevicePixels,
|};

export function getStackTimingByDepthNonInverted(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  devPxPerMs: number,
  selectedCallNode: IndexIntoCallNodeTable | null,
  sampleIndexRangeStart: IndexIntoSamplesTable,
  sampleIndexRangeEnd: IndexIntoSamplesTable,
  firstPos: DevicePixels,
  endPos: DevicePixels
): StackTimingByDepth {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  const callNodeTablePrefixColumn = callNodeTable.prefix;
  const callNodeTableNextAfterDescendantsColumn =
    callNodeTable.nextAfterDescendants;
  const callNodeTableDepthColumn = callNodeTable.depth;

  const stackTimingByDepth = getEmptyStackTimingByDepth(maxDepth);

  // Must be called in order of decreasing depth.
  function createSpan(
    currentSpan: StackTimingOpenSpan,
    depth: StackTimingDepth,
    endDev: DevicePixels
  ) {
    const { sampleIndex, startDev, callNodeIndex } = currentSpan;
    const stackTimingForThisDepth = stackTimingByDepth[depth];
    const index = stackTimingForThisDepth.length++;
    stackTimingForThisDepth.startDev[index] = startDev;
    stackTimingForThisDepth.endDev[index] = endDev;
    stackTimingForThisDepth.sampleIndex[index] = sampleIndex;
    stackTimingForThisDepth.func[index] = callNodeTable.func[callNodeIndex];
    stackTimingForThisDepth.category[index] =
      callNodeTable.category[callNodeIndex];
    stackTimingForThisDepth.isSelectedPath[index] =
      callNodeIndex === selectedCallNode;
    const parentIndexInPreviousRow =
      depth === 0 ? 0 : stackTimingByDepth[depth - 1].length;
    stackTimingForThisDepth.parentIndexInPreviousRow[index] =
      parentIndexInPreviousRow;
  }

  let prevCallNodeIndex = -1;
  let prevCallNodeDepth = -1;
  const prevSpanByDepth: Array<StackTimingOpenSpan> = Array.from(
    { length: maxDepth },
    () => ({ sampleIndex: 0, callNodeIndex: -1, startDev: 0 })
  );

  let nextSamplePos = firstPos;

  for (
    let sampleIndex = sampleIndexRangeStart;
    sampleIndex < sampleIndexRangeEnd;
    sampleIndex++
  ) {
    const thisSamplePos = nextSamplePos;
    const thisStack = samples.stack[sampleIndex];
    const thisCallNodeIndex =
      thisStack !== null ? stackIndexToCallNodeIndex[thisStack] : -1;

    if (sampleIndex + 1 < sampleIndexRangeEnd) {
      const nextSampleTime = samples.time[sampleIndex + 1];
      nextSamplePos = snapValueToMultipleOfTwo(
        (nextSampleTime - timeRangeStart) * devPxPerMs
      );
    }

    if (thisCallNodeIndex === prevCallNodeIndex) {
      continue;
    }

    // Phase 1: Commit open spans which don't contain the current call node.
    while (
      prevCallNodeDepth !== -1 &&
      (thisCallNodeIndex < prevCallNodeIndex ||
        thisCallNodeIndex >=
          callNodeTableNextAfterDescendantsColumn[prevCallNodeIndex])
    ) {
      const currentSpan = prevSpanByDepth[prevCallNodeDepth];
      createSpan(currentSpan, prevCallNodeDepth, thisSamplePos);
      prevCallNodeIndex = callNodeTablePrefixColumn[prevCallNodeIndex];
      prevCallNodeDepth--;
    }

    if (nextSamplePos !== thisSamplePos) {
      // Phase 2: Enter new spans for the current call node. Start at the bottom
      // and go up until we hit the common row.
      const thisCallNodeDepth =
        thisCallNodeIndex === -1
          ? -1
          : callNodeTableDepthColumn[thisCallNodeIndex];
      let currentCallNodeIndex = thisCallNodeIndex;
      let currentDepth = thisCallNodeDepth;

      while (currentDepth !== prevCallNodeDepth) {
        const currentSpan = prevSpanByDepth[currentDepth];
        currentSpan.callNodeIndex = currentCallNodeIndex;
        currentSpan.startDev = thisSamplePos;
        currentSpan.sampleIndex = sampleIndex;
        currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
        currentDepth--;
      }

      prevCallNodeIndex = thisCallNodeIndex;
      prevCallNodeDepth = thisCallNodeDepth;
    }
  }

  // Commit all open spans.
  for (let depth = prevCallNodeDepth; depth >= 0; depth--) {
    const currentSpan = prevSpanByDepth[depth];
    createSpan(currentSpan, depth, endPos);
  }

  return stackTimingByDepth;
}

type StackTimingOpenBoxInverted = {|
  sampleIndex: IndexIntoSamplesTable,
  func: IndexIntoFuncTable,
  category: IndexIntoCategoryList,
  startDev: DevicePixels,
  isSelectedPath: boolean,
|};

/**
 * Computes the StackTimingByDepth for the inverted stack chart.
 *
 *  Regular stack chart:                     Inverted stack chart:
 *    [A   A   A   A   A]                      [C] [D] [E   E] [G]
 *    [B   B] [E   E] [F]                      [B] [B] [A   A] [F]
 *    [C] [D]         [G]                      [A] [A]         [A]
 *
 * The inverted stack chart is not very useful.
 *
 * Whenever the (non-inverted) call node of two consecutive samples differs,
 * it's likely that their self function differs, too. And when that function is
 * different, it means that none of the spans from the previous sample are
 * extended; the entire stack of spans is "terminated" at the current sample,
 * regardless of what's in the rest of the stack.
 * In the end, you end up with just a grid of single-sample boxes.
 * Longer boxes only appear when a thread is stuck in a single function, for
 * example in a hot loop with no function calls, or when the thread is blocked.
 *
 * There are a few rare cases where two samples can have different self call
 * nodes, but share the same self function. Example:
 *
 *  Regular stack chart:                     Inverted stack chart:
 *    [A   A   A   A]                          [C   C   C   C]
 *    [B   B] [D] [C]                          [C] [B] [D] [A]
 *    [C   C] [C]                              [B] [A] [A]
 *    [C]                                      [A]
 *
 * In these rare cases the current implementation shares the span for that self
 * function between the consecutive samples. This matches what we do in the
 * regular stack chart. But it's not clear that this is a useful thing to do;
 * in the example above, there are four different calls to C which all end up
 * sharing the same span, and the visualization misleadingly suggests that
 * they're all the same call.
 *
 * But be that as it may; for now we maintain the long-standing behavior.
 *
 * Performance considerations:
 *
 * As described above, the two most common cases are "entire stack terminated"
 * and "entire stack shared". So those are the cases that we optimize for.
 * And, as with the regular stack chart, the fewer spans we create the better,
 * so this implementation won't create any spans which have been "snapped away
 * to nothing".
 */
export function getStackTimingByDepthInverted(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  devPxPerMs: number,
  selectedCallNode: IndexIntoCallNodeTable | null,
  defaultCategory: IndexIntoCategoryList,
  sampleIndexRangeStart: IndexIntoSamplesTable,
  sampleIndexRangeEnd: IndexIntoSamplesTable,
  firstPos: DevicePixels,
  endPos: DevicePixels
): StackTimingByDepth {
  const selectedCallPath =
    callNodeInfo.getCallNodePathFromIndex(selectedCallNode);
  const selectedCallPathDepth = selectedCallPath.length - 1;
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const callNodeTablePrefixColumn = callNodeTable.prefix;
  const stackIndexToNonInvertedCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();

  function createSpan(
    currentSpan: StackTimingOpenBoxInverted,
    depth: StackTimingDepth,
    currentPos: DevicePixels,
    parentBoxHasAlreadyBeenCommitted: boolean
  ) {
    const { sampleIndex, startDev, func, category, isSelectedPath } =
      currentSpan;
    if (startDev === currentPos) {
      return;
    }
    const stackTimingForThisDepth = stackTimingByDepth[depth];
    const index = stackTimingForThisDepth.length++;
    stackTimingForThisDepth.startDev[index] = startDev;
    stackTimingForThisDepth.endDev[index] = currentPos;
    stackTimingForThisDepth.sampleIndex[index] = sampleIndex;
    stackTimingForThisDepth.func[index] = func;
    stackTimingForThisDepth.category[index] = category;
    stackTimingForThisDepth.isSelectedPath[index] = isSelectedPath;
    const indexAdjust = parentBoxHasAlreadyBeenCommitted ? 1 : 0;
    const parentIndexInPreviousRow =
      depth === 0 ? 0 : stackTimingByDepth[depth - 1].length - indexAdjust;
    stackTimingForThisDepth.parentIndexInPreviousRow[index] =
      parentIndexInPreviousRow;
  }

  const stackTimingByDepth = getEmptyStackTimingByDepth(maxDepth);

  let prevCallNodeIndex = null;
  let prevCallNodeDepth = -1;
  let prevSampleWasVisible = true;
  const prevSpanByDepth: Array<StackTimingOpenBoxInverted> = Array.from(
    { length: maxDepth },
    () => ({
      sampleIndex: 0,
      func: 0,
      category: 0,
      startDev: 0,
      isSelectedPath: false,
    })
  );

  let nextSamplePos = firstPos;

  for (
    let sampleIndex = sampleIndexRangeStart;
    sampleIndex < sampleIndexRangeEnd;
    sampleIndex++
  ) {
    const currentStack = samples.stack[sampleIndex];
    const currentPos = nextSamplePos;
    let thisSampleIsVisible = true;

    if (sampleIndex + 1 < sampleIndexRangeEnd) {
      nextSamplePos = snapValueToMultipleOfTwo(
        (samples.time[sampleIndex + 1] - timeRangeStart) * devPxPerMs
      );
      thisSampleIsVisible = nextSamplePos !== currentPos;
    }

    if (currentStack === null) {
      // Commit all open spans.
      for (let depth = 0; depth <= prevCallNodeDepth; depth++) {
        const currentSpan = prevSpanByDepth[depth];
        createSpan(currentSpan, depth, currentPos, true);
      }

      prevCallNodeIndex = -1;
      prevCallNodeDepth = -1;
      continue;
    }

    const thisCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex[currentStack];
    let thisCallNodeDepth = callNodeTable.depth[thisCallNodeIndex];

    if (thisCallNodeIndex === prevCallNodeIndex && prevSampleWasVisible) {
      continue;
    }

    let currentCallNodeIndex = thisCallNodeIndex;
    let currentFunc = callNodeTable.func[currentCallNodeIndex];
    let currentDepth = 0;
    let currentPathMatchesSelectedCallPath =
      currentDepth <= selectedCallPathDepth &&
      currentFunc === selectedCallPath[currentDepth];

    // Step 1: Walk common depth while funcs match
    while (
      currentDepth <= prevCallNodeDepth &&
      currentDepth <= thisCallNodeDepth
    ) {
      const currentSpan = prevSpanByDepth[currentDepth];
      if (currentSpan.func !== currentFunc) {
        break;
      }

      // Resolve category mismatches.
      const category = callNodeTable.category[currentCallNodeIndex];
      if (currentSpan.category !== category) {
        currentSpan.category = defaultCategory;
      }
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    if (!thisSampleIsVisible) {
      thisCallNodeDepth = currentDepth;
    }

    // Step 2: Walk common depth after first func mismatch; close and reopen spans
    let currentParentHasBeenCommitted = false;
    while (
      currentDepth <= prevCallNodeDepth &&
      currentDepth <= thisCallNodeDepth
    ) {
      const currentSpan = prevSpanByDepth[currentDepth];
      createSpan(
        currentSpan,
        currentDepth,
        currentPos,
        currentParentHasBeenCommitted
      );
      currentSpan.sampleIndex = sampleIndex;
      currentSpan.func = currentFunc;
      currentSpan.startDev = currentPos;
      currentSpan.category = callNodeTable.category[currentCallNodeIndex];
      currentSpan.isSelectedPath =
        currentPathMatchesSelectedCallPath &&
        currentDepth === selectedCallPathDepth;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentParentHasBeenCommitted = true;
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    // Step 3a: Previous stack was deeper - close extra spans.
    for (let depth = currentDepth; depth <= prevCallNodeDepth; depth++) {
      const currentSpan = prevSpanByDepth[depth];
      createSpan(currentSpan, depth, currentPos, currentParentHasBeenCommitted);
      currentParentHasBeenCommitted = true;
    }

    // Step 3b: This stack is deeper - open extra spans.
    while (currentDepth <= thisCallNodeDepth) {
      const currentSpan = prevSpanByDepth[currentDepth];
      currentSpan.sampleIndex = sampleIndex;
      currentSpan.func = currentFunc;
      currentSpan.startDev = currentPos;
      currentSpan.category = callNodeTable.category[currentCallNodeIndex];
      currentSpan.isSelectedPath =
        currentPathMatchesSelectedCallPath &&
        currentDepth === selectedCallPathDepth;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    prevCallNodeIndex = thisCallNodeIndex;
    prevCallNodeDepth = thisCallNodeDepth;
    prevSampleWasVisible = thisSampleIsVisible;
  }

  // Commit all open spans.
  for (let depth = 0; depth <= prevCallNodeDepth; depth++) {
    const currentSpan = prevSpanByDepth[depth];
    createSpan(currentSpan, depth, endPos, true);
  }

  return stackTimingByDepth;
}

export function getTimeRangeForSpan(
  sampleIndex: IndexIntoSamplesTable,
  depth: StackTimingDepth,
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  sampleTimes: Milliseconds[],
  interval: Milliseconds
): StartEndRange {
  const [sampleStartIndex, sampleEndIndex] = getSampleIndexRangeForSpan(
    sampleIndex,
    depth,
    callNodeInfo,
    sampleCallNodes
  );
  return getTimeRangeFromSampleRange(
    sampleStartIndex,
    sampleEndIndex,
    sampleTimes,
    interval
  );
}

export function getTimeRangeFromSampleRange(
  sampleStartIndex: IndexIntoSamplesTable,
  sampleEndIndex: IndexIntoSamplesTable,
  sampleTimes: Milliseconds[],
  interval: Milliseconds
): StartEndRange {
  const start = sampleTimes[sampleStartIndex];
  const end =
    sampleEndIndex < sampleTimes.length
      ? sampleTimes[sampleEndIndex]
      : sampleTimes[sampleTimes.length - 1] + interval;

  return { start, end };
}

export function getSampleIndexRangeForSpan(
  sampleIndex: IndexIntoSamplesTable,
  depth: StackTimingDepth,
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  const callNodeInfoInverted = callNodeInfo.asInverted();
  return callNodeInfoInverted !== null
    ? getSampleIndexRangeForSpanInverted(
        sampleIndex,
        depth,
        callNodeInfoInverted,
        sampleCallNodes
      )
    : getSampleIndexRangeForSpanNonInverted(
        sampleIndex,
        depth,
        callNodeInfo,
        sampleCallNodes
      );
}

function _enlargeSampleRangeWhile(
  sampleIndex: IndexIntoSamplesTable,
  sampleCount: number,
  f: (IndexIntoSamplesTable) => boolean
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  let rangeStart = sampleIndex;
  while (rangeStart > 0 && f(rangeStart - 1)) {
    rangeStart--;
  }
  let rangeEnd = sampleIndex + 1;
  while (rangeEnd < sampleCount && f(rangeEnd)) {
    rangeEnd++;
  }
  return [rangeStart, rangeEnd];
}

function getAncestorCallNodeAtDepth(
  callNodeIndex: IndexIntoCallNodeTable,
  depth: number,
  callNodeTable: CallNodeTable
): IndexIntoCallNodeTable {
  let callNodeDepth = callNodeTable.depth[callNodeIndex];
  while (callNodeDepth > depth) {
    callNodeIndex = callNodeTable.prefix[callNodeIndex];
    callNodeDepth--;
  }
  return callNodeIndex;
}

function getSampleIndexRangeForSpanNonInverted(
  sampleIndex: IndexIntoSamplesTable,
  depth: StackTimingDepth,
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const spanCallNodeIndex = getAncestorCallNodeAtDepth(
    ensureExists(sampleCallNodes[sampleIndex]),
    depth,
    callNodeTable
  );
  const endIndex = callNodeTable.nextAfterDescendants[spanCallNodeIndex];

  return _enlargeSampleRangeWhile(
    sampleIndex,
    sampleCallNodes.length,
    (testedSampleIndex) => {
      const callNodeIndex = sampleCallNodes[testedSampleIndex];
      return (
        callNodeIndex !== null &&
        callNodeIndex >= spanCallNodeIndex &&
        callNodeIndex < endIndex
      );
    }
  );
}

function getInvertedCallPathOfDepth(
  callNodeIndex: IndexIntoCallNodeTable,
  depth: number,
  callNodeTable: CallNodeTable
): CallNodePath {
  const callNodePath = new Array(depth + 1);
  for (
    let callNodeInvertedDepth = 0;
    callNodeInvertedDepth <= depth;
    callNodeInvertedDepth++
  ) {
    callNodePath[callNodeInvertedDepth] = callNodeTable.func[callNodeIndex];
    callNodeIndex = callNodeTable.prefix[callNodeIndex];
  }
  return callNodePath;
}

function getSampleIndexRangeForSpanInverted(
  sampleIndex: IndexIntoSamplesTable,
  depth: StackTimingDepth,
  callNodeInfo: CallNodeInfoInverted,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const callPath = getInvertedCallPathOfDepth(
    ensureExists(sampleCallNodes[sampleIndex]),
    depth,
    callNodeTable
  );
  const callNodeIndex = ensureExists(
    callNodeInfo.getCallNodeIndexFromPath(callPath)
  );
  const orderingIndexForSelfNode = callNodeInfo.getOrderingIndexForSelfNode();
  const [orderingIndexRangeStart, orderingIndexRangeEnd] =
    callNodeInfo.getOrderingIndexRangeForNode(callNodeIndex);

  return _enlargeSampleRangeWhile(
    sampleIndex,
    sampleCallNodes.length,
    (testedSampleIndex) => {
      const callNodeIndex = sampleCallNodes[testedSampleIndex];
      if (callNodeIndex === null) {
        return false;
      }
      const orderingIndex = orderingIndexForSelfNode[callNodeIndex];
      return (
        orderingIndex >= orderingIndexRangeStart &&
        orderingIndex < orderingIndexRangeEnd
      );
    }
  );
}
