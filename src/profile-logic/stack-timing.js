/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
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
 * stackTimingByDepth Example:
 * [
 *   // This first object represents the first box at the base of the chart. It only
 *   // contains a single stack frame to draw, starting at 10ms, ending at 100ms. It
 *   // points to the stackIndex 0.
 *
 *   {start: [10], end: [100], stack: [0]}
 *
 *   // This next object represents 3 boxes to draw, the first box being stack 1 in the
 *   // stack table, and it starts at 20ms, and ends at 40ms.
 *
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [1, 2, 3]}
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [34, 59, 72]}
 *   ...
 *   {start: [25, 45], end: [35, 55], stack: [123, 159]}
 * ]
 */

export type StackTimingDepth = number;
export type IndexIntoStackTiming = number;

export type StackTiming = {|
  start: Milliseconds[],
  end: Milliseconds[],
  callNode: IndexIntoCallNodeTable[],
  length: number,
|};

export type StackTimingByDepth = Array<StackTiming>;

/**
 * Build a StackTimingByDepth table from a given thread.
 */
export function getStackTimingByDepth(
  samples: SamplesLikeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  callNodeInfo: CallNodeInfo,
  maxDepthPlusOne: number,
  interval: Milliseconds
): StackTimingByDepth {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const {
    prefix: callNodeTablePrefixColumn,
    subtreeRangeEnd: callNodeTableSubtreeRangeEndColumn,
    depth: callNodeTableDepthColumn,
  } = callNodeTable;
  const stackTimingByDepth = Array.from({ length: maxDepthPlusOne }, () => ({
    start: [],
    end: [],
    callNode: [],
    length: 0,
  }));

  if (samples.length === 0) {
    return stackTimingByDepth;
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

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sampleTime = samples.time[sampleIndex];
    const thisCallNodeIndex = sampleCallNodes[sampleIndex] ?? -1;
    if (thisCallNodeIndex === deepestOpenBoxCallNodeIndex) {
      continue;
    }

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
      const stackTimingForThisDepth = stackTimingByDepth[deepestOpenBoxDepth];
      const index = stackTimingForThisDepth.length++;
      stackTimingForThisDepth.start[index] = start;
      stackTimingForThisDepth.end[index] = sampleTime;
      stackTimingForThisDepth.callNode[index] = deepestOpenBoxCallNodeIndex;
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
      }
    }

    deepestOpenBoxCallNodeIndex = thisCallNodeIndex;
  }

  // We've processed all samples.
  // Commit the boxes that were left open by the last sample.
  const endTime = samples.time[samples.length - 1] + interval;
  while (deepestOpenBoxDepth !== -1) {
    const stackTimingForThisDepth = stackTimingByDepth[deepestOpenBoxDepth];
    const index = stackTimingForThisDepth.length++;
    const start = openBoxStartTimeByDepth[deepestOpenBoxDepth];
    stackTimingForThisDepth.start[index] = start;
    stackTimingForThisDepth.end[index] = endTime;
    stackTimingForThisDepth.callNode[index] = deepestOpenBoxCallNodeIndex;
    deepestOpenBoxCallNodeIndex =
      callNodeTablePrefixColumn[deepestOpenBoxCallNodeIndex];
    deepestOpenBoxDepth--;
  }

  return stackTimingByDepth;
}
