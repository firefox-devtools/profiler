/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Thread } from '../types/profile';
import type { Milliseconds } from '../types/units';
import type {
  IndexIntoCallNodeTable,
  CallNodeInfo,
} from '../types/profile-derived';

import * as CallTree from './call-tree';

export type FlameGraphTiming = Array<{
  start: Milliseconds[],
  end: Milliseconds[],
  callNode: IndexIntoCallNodeTable[],
  length: number,
}>;

/**
 * Build a FlameGraphTiming table from a given thread.
 *
 * @param {object} thread - The profile thread.
 * @param {object} callNodeInfo - from the callNodeInfo selector.
 * @param {CallTree} callTree - The call tree.
 * @return {array} flameGraphTiming
 */
export function getFlameGraphTiming(
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  callTree: CallTree.CallTree
): FlameGraphTiming {
  const timing = [];
  const timeOffset = [];

  let stack = callTree.getRoots().map(nodeIndex => ({ nodeIndex, depth: 0 }));

  while (stack.length) {
    const { depth, nodeIndex } = stack.pop();
    const totalTime = callTree._callNodeTimes.totalTime[nodeIndex];

    let row = timing[depth];
    if (row === undefined) {
      row = {
        start: [],
        end: [],
        callNode: [],
        length: 0,
      };
      timing[depth] = row;
    }

    if (timeOffset[depth] === undefined) {
      timeOffset[depth] = 0;
    }

    timeOffset[depth + 1] = timeOffset[depth];

    row.start.push(timeOffset[depth]);
    row.end.push(timeOffset[depth] + totalTime);
    row.callNode.push(nodeIndex);
    row.length++;

    timeOffset[depth] += totalTime;

    let children = callTree.getChildren(nodeIndex);
    children.sort(
      (a, b) => (callTree.getNode(a).name < callTree.getNode(b).name ? 1 : -1)
    );
    children = children.map(nodeIndex => ({ nodeIndex, depth: depth + 1 }));

    stack = [...stack, ...children];
  }
  return timing;
}
