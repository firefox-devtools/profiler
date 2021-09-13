/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  UnitIntervalOfProfileRange,
  CallNodeInfo,
  CallNodeTable,
  IndexIntoCallNodeTable,
  Thread,
} from 'firefox-profiler/types';
import type { CallTreeCountsAndSummary } from './call-tree';

export type FlameGraphDepth = number;
export type IndexIntoFlameGraphTiming = number;

/**
 * FlameGraphTiming is an array containing data used for rendering the
 * flame graph. Each element in the array describes one row in the
 * graph. Each such element in turn contains one or more functions,
 * drawn as boxes with start and end positions, represented as unit
 * intervals of the profile range. It should be noted that start and
 * end does not represent units of time, but only positions on the
 * x-axis, derived from an alphabetical sort.
 *
 * callNode allows extracting information such as function names which
 * are shown in the flame graph.
 *
 * selfRelative contains the self time relative to the total time,
 * which is used to color the drawn functions.
 */
export type FlameGraphTiming = Array<{
  start: UnitIntervalOfProfileRange[],
  end: UnitIntervalOfProfileRange[],
  selfRelative: Array<number>,
  callNode: IndexIntoCallNodeTable[],
  length: number,
}>;

type RootsAndChildren = {
  /**
   * Conceptually, `children` is a collection of arrays, one for each
   * callnode in the tree. Each array contains all immediate callnode
   * children (with a non-zero total time) of a given callnode.
   *
   * To avoid heavy allocations for large call trees, the elements of
   * this collection are not real array instances. Instead, one has to
   * work with slices of one large array.
   *
   * Given a callnode `p` with callnode index `pi`, and `start` and
   * `end` defined as:
   * let start = children.offsets[pi];
   * let end = children.offsets[pi + 1];
   *
   * then children.array.slice(start, end) is a sorted list of all
   * callnode indices whose callnodes have `p` as their direct parent.
   * The list is sorted in descending order with respect to the
   * function names of the callnodes.
   */
  children: {
    // Array of IndexIntoCallNodeTable. This is a concatenation of all
    // children sub-arrays.
    array: Uint32Array,
    // This array maps a given IndexIntoCallNodeTable to a slice
    // within `array` by providing start and end indices.
    offsets: Uint32Array,
  },

  // A list of every root CallNodeIndex in the call tree.
  roots: IndexIntoCallNodeTable[],
};

/**
 * Obtain collections of callnode indices needed for building the
 * flame graph.
 *
 * The returned object contains two arrays, one for the roots and one
 * for all children of the call tree. Along with the children array is
 * an offset array used to index into it.
 */
export function getRootsAndChildren(
  thread: Thread,
  callNodeTable: CallNodeTable,
  callNodeChildCount: Uint32Array,
  totalTime: Float32Array
): RootsAndChildren {
  const roots = [];
  const array = new Uint32Array(callNodeTable.length);
  const offsets = new Uint32Array(callNodeTable.length + 1);

  /* For performance reasons the array is of type Uint32Array. This
   * means we cannot use values such as `undefined` or `null` to
   * indicate uninitialized values, as we build up the array. But
   * since `callNodeTable` is ordered is such a way that a given
   * callnode index always comes _after_ its parent callnode index, we
   * know that callnode index zero never can be a child. It is always
   * a root. (Not counting the special -1 root, but we don't need it
   * here). Hence, we are free to use the value 0 in the children
   * array to mark elements as not initialized, since 0 is never a
   * valid child. Since the default values of Uint32Array is 0, we
   * conveniently get an array where all its values are uninitialized
   * from start. */

  let callNodeIndex = 0;
  let ptr = 0;
  for (; callNodeIndex < callNodeTable.length; callNodeIndex++) {
    offsets[callNodeIndex] = ptr;
    ptr += callNodeChildCount[callNodeIndex];

    if (totalTime[callNodeIndex] === 0) {
      continue;
    }

    const parent = callNodeTable.prefix[callNodeIndex];
    if (parent === -1) {
      roots.push(callNodeIndex);
      continue;
    }

    const funcName = thread.stringTable.getString(
      thread.funcTable.name[callNodeTable.func[callNodeIndex]]
    );

    /* From the parent, we can now know the slice allotted for all
     * its children. */
    const start = offsets[parent];
    const end = offsets[parent] + callNodeChildCount[parent] - 1;

    /* Find the place in `array` where this callnode should be
     * inserted, swapping elements in the array as we go
     * along. Continue as long as this callnode's function name is
     * lexically smaller than the function names of the callnodes
     * already placed in the array. This ensures that all slices have
     * children in descending order. Any callnode indices equal to 0
     * means that they are uninitialized, so just breeze through
     * them. When we stop, when have found the right position to
     * insert our callnode.
     *
     * This effectively is an insertion sort, which is O(n^2), but
     * since n is typically small (the number of children of a given
     * callnode), it should be just fine.
     */
    let i = start;
    while (i < end) {
      if (
        array[i + 1] !== 0 &&
        funcName >
          thread.stringTable.getString(
            thread.funcTable.name[callNodeTable.func[array[i + 1]]]
          )
      ) {
        // We've found our spot if the next slot in the array is
        // occupied with a callnode whose function name is less than
        // ours.
        break;
      }

      array[i] = array[i + 1];
      i++;
    }
    array[i] = callNodeIndex;
  }
  offsets[callNodeIndex] = ptr;
  return { roots, children: { array, offsets } };
}

/**
 * Build a FlameGraphTiming table from a call tree.
 */
export function getFlameGraphTiming(
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  callTreeCountsAndSummary: CallTreeCountsAndSummary
): FlameGraphTiming {
  const { callNodeChildCount, callNodeSummary, rootTotalSummary } =
    callTreeCountsAndSummary;

  const { roots, children } = getRootsAndChildren(
    thread,
    callNodeInfo.callNodeTable,
    callNodeChildCount,
    callNodeSummary.total
  );
  const timing = [];

  // Array of call nodes to recursively process in the loop below.
  // Start with the roots of the call tree.
  const stack: Array<{
    depth: number,
    nodeIndex: IndexIntoCallNodeTable,
  }> = roots.map((nodeIndex) => ({ nodeIndex, depth: 0 }));

  // Keep track of time offset by depth level.
  const timeOffset = [0.0];

  while (stack.length) {
    const { depth, nodeIndex } = stack.pop();

    // Select an existing row, or create a new one.
    let row = timing[depth];
    if (row === undefined) {
      row = {
        start: [],
        end: [],
        selfRelative: [],
        callNode: [],
        length: 0,
      };
      timing[depth] = row;
    }

    // Take the absolute value, as native deallocations can be negative.
    const totalRelative = Math.abs(
      callNodeSummary.total[nodeIndex] / rootTotalSummary
    );
    const selfRelative = Math.abs(
      callNodeSummary.self[nodeIndex] / rootTotalSummary
    );

    // Compute the timing information.
    row.start.push(timeOffset[depth]);
    row.end.push(timeOffset[depth] + totalRelative);
    row.selfRelative.push(selfRelative);
    row.callNode.push(nodeIndex);
    row.length++;

    // Before we add the total time of this node to the time offset,
    // we'll make sure that the first child (if any) begins with the
    // same time offset.
    timeOffset[depth + 1] = timeOffset[depth];
    timeOffset[depth] += totalRelative;

    // The items in the children array are sorted in descending order,
    // but since they are popped from the stack at the top of the
    // while loop they'll be processed in ascending order.
    for (
      let offset = children.offsets[nodeIndex];
      offset < children.offsets[nodeIndex + 1];
      offset++
    ) {
      stack.push({ nodeIndex: children.array[offset], depth: depth + 1 });
    }
  }
  return timing;
}
