/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Thread } from '../types/profile';
import type { Milliseconds } from '../types/units';
import type {
  CallNodeInfo,
  CallNodeTable,
  IndexIntoCallNodeTable,
} from '../types/profile-derived';
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

export type StackTimingByDepth = Array<{
  start: Milliseconds[],
  end: Milliseconds[],
  callNode: IndexIntoCallNodeTable[],
  length: number,
}>;

type LastSeen = {
  startTimeByDepth: number[],
  callNodeIndexByDepth: IndexIntoCallNodeTable[],
};

/**
 * Build a StackTimingByDepth table from a given thread.
 */
export function getStackTimingByDepth(
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  maxDepth: number
): StackTimingByDepth {
  const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
  const stackTimingByDepth = Array.from({ length: maxDepth }, () => ({
    start: [],
    end: [],
    callNode: [],
    length: 0,
  }));

  const lastSeen: LastSeen = {
    startTimeByDepth: [],
    callNodeIndexByDepth: [],
  };

  // Go through each sample, and push/pop it on the stack to build up
  // the stackTimingByDepth.
  let previousDepth = -1;
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    const sampleTime = thread.samples.time[i];

    // If this stack index is null (for instance if it was filtered out) then pop back
    // down to the base stack.
    if (stackIndex === null) {
      _popStacks(stackTimingByDepth, lastSeen, -1, previousDepth, sampleTime);
      previousDepth = -1;
    } else {
      const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
      const depth = callNodeTable.depth[callNodeIndex];

      // Find the depth of the nearest shared stack.
      const depthToPop = _findNearestSharedCallNodeDepth(
        callNodeTable,
        callNodeIndex,
        lastSeen,
        depth
      );
      _popStacks(
        stackTimingByDepth,
        lastSeen,
        depthToPop,
        previousDepth,
        sampleTime
      );
      _pushStacks(
        thread,
        callNodeTable,
        lastSeen,
        depth,
        callNodeIndex,
        sampleTime
      );
      previousDepth = depth;
    }
  }

  // Pop the remaining stacks
  const lastIndex = thread.samples.length - 1;
  const endingTime =
    thread.samples.time[lastIndex] + thread.samples.duration[lastIndex];
  _popStacks(stackTimingByDepth, lastSeen, -1, previousDepth, endingTime);

  return stackTimingByDepth;
}

function _findNearestSharedCallNodeDepth(
  callNodeTable: CallNodeTable,
  callNodeIndex: IndexIntoCallNodeTable,
  lastSeen: LastSeen,
  depthStart: number
): number {
  let nextCallNodeIndex = callNodeIndex;
  for (let depth = depthStart; depth >= 0; depth--) {
    if (lastSeen.callNodeIndexByDepth[depth] === nextCallNodeIndex) {
      return depth;
    }
    nextCallNodeIndex = callNodeTable.prefix[nextCallNodeIndex];
  }
  return -1;
}

function _popStacks(
  stackTimingByDepth: StackTimingByDepth,
  lastSeen: LastSeen,
  depth: number,
  previousDepth: number,
  sampleTime: number
) {
  // "Pop" off the stack, and commit the timing of the frames
  for (let stackDepth = depth + 1; stackDepth <= previousDepth; stackDepth++) {
    // Push on the new information.
    stackTimingByDepth[stackDepth].start.push(
      lastSeen.startTimeByDepth[stackDepth]
    );
    stackTimingByDepth[stackDepth].end.push(sampleTime);
    stackTimingByDepth[stackDepth].callNode.push(
      lastSeen.callNodeIndexByDepth[stackDepth]
    );
    stackTimingByDepth[stackDepth].length++;

    // Delete that this stack frame has been seen.
    delete lastSeen.callNodeIndexByDepth[stackDepth];
    delete lastSeen.startTimeByDepth[stackDepth];
  }
}

function _pushStacks(
  thread: Thread,
  callNodeTable: CallNodeTable,
  lastSeen: LastSeen,
  depth: number,
  startingCallNodeIndex: IndexIntoCallNodeTable,
  sampleTime: number
) {
  let callNodeIndex = startingCallNodeIndex;
  // "Push" onto the stack with new frames
  for (let parentDepth = depth; parentDepth >= 0; parentDepth--) {
    if (
      callNodeIndex === -1 ||
      lastSeen.callNodeIndexByDepth[parentDepth] !== undefined
    ) {
      break;
    }
    lastSeen.callNodeIndexByDepth[parentDepth] = callNodeIndex;
    lastSeen.startTimeByDepth[parentDepth] = sampleTime;
    callNodeIndex = callNodeTable.prefix[callNodeIndex];
  }
}
