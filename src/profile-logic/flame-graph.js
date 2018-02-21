/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { UnitIntervalOfProfileRange } from '../types/units';
import type { IndexIntoCallNodeTable } from '../types/profile-derived';

import * as CallTree from './call-tree';

export type FlameGraphDepth = number;
export type IndexIntoFlameGraphTiming = number;

export type FlameGraphTiming = Array<{
  start: UnitIntervalOfProfileRange[],
  end: UnitIntervalOfProfileRange[],
  selfTimeRelative: Array<number>,
  display: Array<{ totalTime: string, selfTime: string }>,
  callNode: IndexIntoCallNodeTable[],
  length: number,
}>;

type Stack = Array<{
  depth: number,
  nodeIndex: IndexIntoCallNodeTable,
}>;

/**
 * Build a FlameGraphTiming table from a call tree.
 */
export function getFlameGraphTiming(
  callTree: CallTree.CallTree
): FlameGraphTiming {
  const timing = [];
  // Array of call nodes to recursively process in the loop below.
  // Start with the roots of the call tree.
  const stack: Stack = callTree
    .getRoots()
    .map(nodeIndex => ({ nodeIndex, depth: 0 }));

  // Keep track of time offset by depth level.
  const timeOffset = [0.0];

  while (stack.length) {
    const { depth, nodeIndex } = stack.pop();
    const { totalTimeRelative, selfTimeRelative } = callTree.getNodeData(
      nodeIndex
    );

    const { totalTime, selfTime } = callTree.getDisplayData(nodeIndex);

    // Select an existing row, or create a new one.
    let row = timing[depth];
    if (row === undefined) {
      row = {
        start: [],
        end: [],
        selfTimeRelative: [],
        display: [],
        callNode: [],
        length: 0,
      };
      timing[depth] = row;
    }

    // Compute the timing information.
    row.start.push(timeOffset[depth]);
    row.end.push(timeOffset[depth] + totalTimeRelative);
    row.selfTimeRelative.push(selfTimeRelative);
    row.display.push({ totalTime, selfTime });
    row.callNode.push(nodeIndex);
    row.length++;

    // Before we add the total time of this node to the time offset,
    // we'll make sure that the first child (if any) begins with the
    // same time offset.
    timeOffset[depth + 1] = timeOffset[depth];
    timeOffset[depth] += totalTimeRelative;

    let children = callTree.getChildren(nodeIndex).slice();
    children.sort(
      (a, b) =>
        callTree.getNodeData(a).funcName < callTree.getNodeData(b).funcName
          ? 1
          : -1
    );
    children = children.map(nodeIndex => ({ nodeIndex, depth: depth + 1 }));

    stack.push(...children);
  }
  return timing;
}
