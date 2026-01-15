/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  SamplesLikeTable,
  Milliseconds,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from './call-node-info';

/**
 * The StackTimingByDepth data structure organizes stack frames by their depth, and start
 * and end times. This optimizes sample data for Stack Chart views. It
 * makes it really easy to draw a large amount of boxes at once based on where the
 * viewport is in the stack frame data. Plus the end timings for frames need to be
 * reconstructed from the sample data, as the samples only contain start timings.
 *
 * This format allows for specifically selecting certain rows of stack frames by using
 * the stack depth information. In addition, the start and end times of samples can be
 * found through binary searches, allowing for selecting the proper subsets of frames
 * to be drawn. Each row's sample length is different, but it can still be efficient
 * to find subsets of the data.
 *
 * Each object in the array below represents a single row of stack frames at a given
 * depth. Each object is a table that contains the the start time and end time in
 * milliseconds, and the stack index that points into the stack table.
 *
 * Here is a tree example:
 *
 * This table shows off how a stack chart gets filtered to JS only, where the number is
 * the stack index, and P is platform code, and J javascript.
 *
 *   0-10-20-30-40-50-60-70-80-90-91 <- Timing (ms)
 *    0-----1--2--3--4--5--6--7--8   <- same width indexes
 *  ================================
 *     0P 0P 0P 0P 0P 0P 0P 0P 0P  |
 *     1P 1P 1P    1P 1P 1P 1P 1P  |
 *     2P 2P 3P       4J 4J 4J 4J  |
 *                       5J 5J     |
 *                          6P     |
 *                          7P     |
 *                          8J     |
 *
 * Note that stacks 10 and 20 in the unfiltered tree are the same, therefore
 * they'll form just one "same width" stack.
 * It's easier to think of the "same widths" indexes as the space between each
 * new stack.
 *
 * stackTimingByDepth Example:
 * [
 *   // This first object represents the first box at the base of the chart. It only
 *   // contains a single stack frame to draw, starting at 10ms, ending at 100ms. It
 *   // points to the stackIndex 0.
 *
 *   {start: [10], end: [91], sameWidthsStart: [0], sameWidthsEnd: [8], stack: [0], length: 1},
 *
 *   // This next object represents 2 boxes to draw, the first box being stack 1 in the
 *   // stack table, and it starts at 10ms, and ends at 40ms.
 *   {start: [10, 50], end: [40, 91], sameWidthsStart: [0, 3], sameWidthsEnd: [2, 8], stack: [1, 1], length: 2},
 *
 *   // This next object represents 3 boxes to draw, the first box being stack 2 in the
 *   // stack table, and it starts at 10ms, and ends at 30ms.
 *   {start: [10, 30, 60], end: [30, 40, 91], sameWidthsStart: [0, 1, 4], sameWidthsEnd: [1, 2, 8], stack: [2, 3, 4], length: 3},
 *   {start: [70], end: [90], sameWidthsStart: [5], sameWidthsEnd: [7], stack: [5], length: 1},
 *   ...
 * ]
 *
 * As a result of the computation, getStackTimingByDepth also returns a mapping
 * between the same widths indexes and the corresponding times. This is a normal
 * array. In the previous example, it would have 8 elements and look like this:
 *    0   1   2   3   4   5   6   7   8   <- indexes
 *   [10, 30, 40, 50, 60, 70, 80, 90, 91] <- timings
 * This array makes it easy to find the boxes to draw for a preview selection.
 */

export type StackTimingDepth = number;
export type IndexIntoStackTiming = number;

export type StackTiming = {
  start: Milliseconds[];
  end: Milliseconds[];
  // These 2 properties sameWidthsStart and sameWidthsEnd increments at each
  // "tick", that is at each stack change. They'll make it possible to draw a
  // stack chart where each different stack has the same width, and can better
  // show very short changes.
  sameWidthsStart: number[];
  sameWidthsEnd: number[];
  callNode: IndexIntoCallNodeTable[];
  // argumentValues is used by the JS Execution Tracing setting and allows
  // displaying function calls' argument values.
  argumentValues?: number[];
  length: number;
};

export type StackTimingByDepth = Array<StackTiming>;
export type SameWidthsIndexToTimestampMap = number[];
export type StackTimingByDepthWithMap = {
  timings: StackTimingByDepth;
  sameWidthsIndexToTimestampMap: SameWidthsIndexToTimestampMap;
};

/**
 * Build a StackTimingByDepth table from a given thread.
 */
export function getStackTimingByDepth(
  samples: SamplesLikeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  callNodeInfo: CallNodeInfo,
  maxDepthPlusOne: number,
  interval: Milliseconds
): StackTimingByDepthWithMap {
  const callNodeTable = callNodeInfo.getCallNodeTable();
  const {
    prefix: callNodeTablePrefixColumn,
    subtreeRangeEnd: callNodeTableSubtreeRangeEndColumn,
    depth: callNodeTableDepthColumn,
  } = callNodeTable;
  const stackTimingByDepth: StackTimingByDepth = Array.from(
    { length: maxDepthPlusOne },
    (): StackTiming => {
      const shape: StackTiming = {
        start: [],
        end: [],
        sameWidthsStart: [],
        sameWidthsEnd: [],
        callNode: [],
        length: 0,
      };
      if ('argumentValues' in samples) {
        shape.argumentValues = [];
      }
      return shape;
    }
  );

  const sameWidthsIndexToTimestampMap: SameWidthsIndexToTimestampMap = [];

  if (samples.length === 0) {
    return { timings: stackTimingByDepth, sameWidthsIndexToTimestampMap };
  }

  // Overview of the algorithm:
  // We go sample by sample.
  // At the end of each iteration, we have a stack of "open boxes" which are
  // available for sharing with the next sample; each open box has a call node
  // and a start time. The number of open boxes matches the length of the call
  // path.
  // At the beginning of each iteration, we pick which of the open boxes from
  // the previous sample we want to share (these boxes remain "open") and which
  // ones we can't share.
  // The ones we can't share need to be "committed", i.e. added to stackTimingByDepth.
  // We share the boxes whose call nodes are ancestors of the current sample's
  // call node, and commit the rest. Then we open new boxes for the unshared part
  // of the current sample's call node path.

  // We remember the stack of open boxes by remembering only the deepest call
  // node; and the start time for each box in the stack.
  // The call nodes of the remaining "open boxes" are implicit; i.e. the call
  // node of the open box at depth d is the ancestor at depth d of
  // deepestOpenBoxCallNodeIndex.
  let deepestOpenBoxCallNodeIndex = -1;
  let deepestOpenBoxDepth = -1;
  const openBoxStartTimeByDepth = new Float64Array(maxDepthPlusOne);
  const openBoxStartTickByDepth = new Float64Array(maxDepthPlusOne);
  const openBoxArgsByDepth = new Int32Array(maxDepthPlusOne);

  let currentStackTick = 0;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const thisCallNodeIndex = sampleCallNodes[sampleIndex] ?? -1;
    if (thisCallNodeIndex === deepestOpenBoxCallNodeIndex) {
      continue;
    }

    let sampleArgs: number = -1;
    if ('argumentValues' in samples && samples.argumentValues !== undefined) {
      const val = samples.argumentValues[sampleIndex];
      if (val !== null) {
        sampleArgs = val;
      }
    }

    const sampleTime = samples.time[sampleIndex];

    // Phase 1: Commit open boxes which are not shared by the current call node,
    // i.e. any boxes whose call nodes are not ancestors of the current call node.
    // These unshared boxes will be committed and added to stackTimingForThisDepth.
    //
    // We walk up from the previous sample's depth until we find the lowest
    // common ancestor with the current sample's call node, commiting all boxes
    // along the way.
    //
    // Here we use the call node table ordering for a cheap "is in subtree of" check.
    // Any boxes which can stay open are the ones whose call nodes contain
    // thisCallNodeIndex in their subtree, i.e. the ones which are ancestors af
    // thisCallNodeIndex.
    while (
      deepestOpenBoxDepth !== -1 &&
      (thisCallNodeIndex < deepestOpenBoxCallNodeIndex ||
        thisCallNodeIndex >=
          callNodeTableSubtreeRangeEndColumn[deepestOpenBoxCallNodeIndex])
    ) {
      // deepestOpenBoxCallNodeIndex is *not* an ancestors of thisCallNodeIndex.
      // Commit this box.
      const start = openBoxStartTimeByDepth[deepestOpenBoxDepth];
      const startStackTick = openBoxStartTickByDepth[deepestOpenBoxDepth];
      const stackTimingForThisDepth = stackTimingByDepth[deepestOpenBoxDepth];
      const index = stackTimingForThisDepth.length++;
      stackTimingForThisDepth.start[index] = start;
      stackTimingForThisDepth.end[index] = sampleTime;
      stackTimingForThisDepth.sameWidthsStart[index] = startStackTick;
      stackTimingForThisDepth.sameWidthsEnd[index] = currentStackTick;
      stackTimingForThisDepth.callNode[index] = deepestOpenBoxCallNodeIndex;
      if (stackTimingForThisDepth.argumentValues) {
        stackTimingForThisDepth.argumentValues[index] =
          openBoxArgsByDepth[deepestOpenBoxDepth];
      }
      deepestOpenBoxCallNodeIndex =
        callNodeTablePrefixColumn[deepestOpenBoxCallNodeIndex];
      deepestOpenBoxDepth--;
    }

    // Phase 2: Enter new boxes for the current call node.
    // New boxes start from depth `deepestOpenBoxDepth`, which is the depth of
    // the lowest common ancestor of thisCallNodeIndex and the previous sample's
    // call node. We "open" boxes going down all the way to thisCallNodeIndex.
    if (thisCallNodeIndex !== -1) {
      const thisCallNodeDepth = callNodeTableDepthColumn[thisCallNodeIndex];
      while (deepestOpenBoxDepth < thisCallNodeDepth) {
        deepestOpenBoxDepth++;
        openBoxStartTimeByDepth[deepestOpenBoxDepth] = sampleTime;
        openBoxStartTickByDepth[deepestOpenBoxDepth] = currentStackTick;
        if (
          'argumentValues' in samples &&
          samples.argumentValues !== undefined
        ) {
          openBoxArgsByDepth[deepestOpenBoxDepth] = sampleArgs;
        }
      }
    }

    deepestOpenBoxCallNodeIndex = thisCallNodeIndex;
    sameWidthsIndexToTimestampMap[currentStackTick] = sampleTime;
    currentStackTick++;
  }

  // We've processed all samples.
  // Commit the boxes that were left open by the last sample.
  const endTime = samples.time[samples.length - 1] + interval;
  while (deepestOpenBoxDepth !== -1) {
    const stackTimingForThisDepth = stackTimingByDepth[deepestOpenBoxDepth];
    const index = stackTimingForThisDepth.length++;
    const start = openBoxStartTimeByDepth[deepestOpenBoxDepth];
    const startStackTick = openBoxStartTickByDepth[deepestOpenBoxDepth];
    stackTimingForThisDepth.start[index] = start;
    stackTimingForThisDepth.end[index] = endTime;
    stackTimingForThisDepth.sameWidthsStart[index] = startStackTick;
    stackTimingForThisDepth.sameWidthsEnd[index] = currentStackTick;
    stackTimingForThisDepth.callNode[index] = deepestOpenBoxCallNodeIndex;
    if (stackTimingForThisDepth.argumentValues) {
      stackTimingForThisDepth.argumentValues[index] =
        openBoxArgsByDepth[deepestOpenBoxDepth];
    }
    deepestOpenBoxCallNodeIndex =
      callNodeTablePrefixColumn[deepestOpenBoxCallNodeIndex];
    deepestOpenBoxDepth--;
  }
  sameWidthsIndexToTimestampMap[currentStackTick] = endTime;

  return { timings: stackTimingByDepth, sameWidthsIndexToTimestampMap };
}
