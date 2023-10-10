/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  UnitIntervalOfProfileRange,
  CallNodeTable,
  FuncTable,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';
import type { UniqueStringArray } from 'firefox-profiler/utils/unique-string-array';
import type { CallTreeCountsAndSummary } from './call-tree';

import { bisectionLeftByStrKey } from 'firefox-profiler/utils/bisect';

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

export type OrderedCallNodeRows = IndexIntoCallNodeTable[][];

export function computeOrderedCallNodeRows(
  callNodeTable: CallNodeTable,
  funcTable: FuncTable,
  stringTable: UniqueStringArray
): OrderedCallNodeRows {
  const callNodeCount = callNodeTable.length;
  if (callNodeCount === 0) {
    return [[]];
  }

  const { func, nextSibling, nextAfterDescendants } = callNodeTable;
  const funcTableNameColumn = funcTable.name;

  const rows = [[]];

  let currentDepth = 0;
  // For each row k, the index of the element of rows[k] whose descendants we
  // want to descend into next.
  const nextIndexPerRow = [0];

  let currentCallNode = 0;
  outer: while (true) {
    // assert(depth[currentCallNode] === currentDepth);

    // Add this node and its siblings to the current row. Ensure correct ordering
    // when inserting each sibling.
    const rowAtThisDepth = rows[currentDepth];
    const siblingIndexRangeStart = rowAtThisDepth.length;
    for (
      let currentSibling = currentCallNode;
      currentSibling !== -1;
      currentSibling = nextSibling[currentSibling]
    ) {
      const siblingIndexRangeEnd = rowAtThisDepth.length;
      if (siblingIndexRangeStart === siblingIndexRangeEnd) {
        rowAtThisDepth.push(currentSibling);
      } else {
        // Do an ordered insert, to keep siblings ordered by function name.
        // assert(siblingIndexRangeStart < siblingIndexRangeEnd)
        const thisFunc = func[currentSibling];
        const funcName = stringTable.getString(funcTableNameColumn[thisFunc]);
        const insertionIndex = bisectionLeftByStrKey(
          rowAtThisDepth,
          funcName,
          (cn) => stringTable.getString(funcTableNameColumn[func[cn]]),
          siblingIndexRangeStart,
          siblingIndexRangeEnd
        );
        rowAtThisDepth.splice(insertionIndex, 0, currentSibling);
      }
    }

    // Now currentCallNode and all its siblings have been added to the row, and
    // they are ordered correctly. Descend into the children of the first pending
    // node which has children.
    let candidateRow = rowAtThisDepth;
    let indexInCandidateRow = nextIndexPerRow[currentDepth];
    let candidateNode = candidateRow[indexInCandidateRow];
    while (nextAfterDescendants[candidateNode] === candidateNode + 1) {
      // candidateNode does not have any children.
      // Advance to the next candidate in its row.
      indexInCandidateRow++;
      nextIndexPerRow[currentDepth] = indexInCandidateRow;
      while (indexInCandidateRow === candidateRow.length) {
        // We've hit the end of candidateRow. Try to go up a level.
        if (currentDepth === 0) {
          // We're completely done.
          break outer;
        }
        // Go up a level.
        currentDepth--;
        candidateRow = rows[currentDepth];
        indexInCandidateRow = nextIndexPerRow[currentDepth];
      }

      candidateNode = candidateRow[indexInCandidateRow];
    }
    // Now candidateNode is a node which has at least one child.
    indexInCandidateRow++;
    nextIndexPerRow[currentDepth] = indexInCandidateRow;
    // Advance to candidateNode's first child.
    currentCallNode = candidateNode + 1;
    currentDepth++;
    if (currentDepth === rows.length) {
      rows[currentDepth] = [];
      nextIndexPerRow[currentDepth] = 0;
    }
  }

  return rows;
}

/**
 * Build a FlameGraphTiming table from a call tree.
 */
export function getFlameGraphTiming(
  orderedCallNodeRows: OrderedCallNodeRows,
  callNodeTable: CallNodeTable,
  callTreeCountsAndSummary: CallTreeCountsAndSummary
): FlameGraphTiming {
  const { callNodeSummary, rootTotalSummary } = callTreeCountsAndSummary;
  const { total, self } = callNodeSummary;
  const { prefix } = callNodeTable;

  const timing = [];

  const timeOffsetPerCallNode = new Float32Array(callNodeTable.length);

  const abs = Math.abs;

  for (let depth = 0; depth < orderedCallNodeRows.length; depth++) {
    const rowNodes = orderedCallNodeRows[depth];
    const start = [];
    const end = [];
    const selfRelative = [];
    const timingCallNodes = [];
    let timeOffset = 0.0;
    let previousPrefixCallNode = -1;
    for (let indexInRow = 0; indexInRow < rowNodes.length; indexInRow++) {
      const nodeIndex = rowNodes[indexInRow];
      const totalVal = total[nodeIndex];
      if (totalVal === 0) {
        continue;
      }

      const nodePrefix = prefix[nodeIndex];
      if (nodePrefix !== previousPrefixCallNode) {
        timeOffset = timeOffsetPerCallNode[nodePrefix];
        previousPrefixCallNode = nodePrefix;
      }

      timeOffsetPerCallNode[nodeIndex] = timeOffset;

      // Take the absolute value, as native deallocations can be negative.
      const totalRelativeVal = abs(totalVal / rootTotalSummary);
      const selfRelativeVal = abs(self[nodeIndex] / rootTotalSummary);

      const timeOffsetAfter = timeOffset + totalRelativeVal;
      start.push(timeOffset);
      end.push(timeOffsetAfter);
      selfRelative.push(selfRelativeVal);
      timingCallNodes.push(nodeIndex);

      timeOffset = timeOffsetAfter;
    }
    timing[depth] = {
      start,
      end,
      selfRelative,
      callNode: timingCallNodes,
      length: timingCallNodes.length,
    };
  }

  return timing;
}
