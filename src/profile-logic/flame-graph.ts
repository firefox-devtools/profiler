/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  UnitIntervalOfProfileRange,
  CallNodeTable,
  FuncTable,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { CallTreeTimingsNonInverted } from './call-tree';

import { bisectionRightByStrKey } from 'firefox-profiler/utils/bisect';

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
  start: UnitIntervalOfProfileRange[];
  end: UnitIntervalOfProfileRange[];
  selfRelative: Array<number>;
  callNode: IndexIntoCallNodeTable[];
  length: number;
}>;

/**
 * FlameGraphRows is an array of rows, where each row is an array of call node
 * indexes. This is a timing-invariant representation of the flame graph and can
 * be cached independently of the sample / timing information.
 *
 * When combined with the timing information, it is used to produce FlameGraphTiming.
 *
 * In FlameGraphRows, rows[depth] contains all the call nodes of that depth.
 * The call nodes are ordered in the same order that they'll be displayed in the
 * flame graph:
 *
 *  - Siblings are ordered by function name.
 *  - Siblings are grouped, i.e. all nodes with the same prefix are next to each other.
 *  - The order of these groups with respect to each other is determined by how
 *    their prefix call nodes are ordered in the previous row.
 *
 * # Example ([call node index] [function name])
 *
 * ```
 *  - 0 A
 *    - 1 D
 *      - 2 I
 *    - 3 B
 *      - 4 C
 *      - 5 F
 *      - 6 E
 *    - 7 G
 *  - 8 H
 * ```
 *
 * The call node table above produces the following FlameGraphRows:
 * Depth 0: [0, 8]       // ["A", "H"]
 * Depth 1: [3, 1, 7]    // ["B", "D", "G"]
 * Depth 2: [4, 6, 5, 2] // ["C", "E", "F", "I"]
 *
 * Note that [4, 6, 5] are the children of 3 ("B"), sorted by name, and these
 * children have been moved before 2 ("I") to match the order of their parents.
 */
export type FlameGraphRows = IndexIntoCallNodeTable[][];

/**
 * Compute the FlameGraphRows. The result is independent of timing information.
 */
export function computeFlameGraphRows(
  callNodeTable: CallNodeTable,
  funcTable: FuncTable,
  stringTable: StringTable
): FlameGraphRows {
  if (callNodeTable.length === 0) {
    return [[]];
  }

  const { func, nextSibling, subtreeRangeEnd, maxDepth } = callNodeTable;
  const funcTableNameColumn = funcTable.name;

  // flameGraphRows is what we'll return from this function.
  //
  // Each row is conceptually partitioned into two parts: "Finished nodes" and
  // "pending nodes".
  //
  // For row d, flameGraphRows[d] is partitioned as follows (a..b is the half-open
  // range which includes a but excludes b):
  //
  //  - flameGraphRows[d][0..pendingRangeStartAtDepth[d]] are "finished"
  //  - flameGraphRows[d][pendingRangeStartAtDepth[d]..] are "pending"
  //
  // A node starts out as "pending" when we initially add it to the row.
  // A node becomes "finished" once we've decided to process its children.
  //
  // This is used to queue up a bunch of siblings before we process their
  // children.
  // We need to queue up nodes before we can process their children because
  // we can only process children once their parents are in the right order.
  const flameGraphRows: FlameGraphRows = Array.from(
    { length: maxDepth + 1 },
    () => []
  );
  const pendingRangeStartAtDepth = new Int32Array(maxDepth + 1);

  // At the beginning of each turn of this loop, add currentCallNode and all its
  // siblings as "pending" to row[currentDepth], ordered by name. Then find the
  // first pending call node with children, and go to the next iteration.
  let currentCallNode = 0;
  let currentDepth = 0; // always set to depth[currentCallNode]
  outer: while (true) {
    // assert(depth[currentCallNode] === currentDepth);

    // Add currentCallNode and all its siblings to the current row. Ensure correct
    // ordering when inserting each sibling.
    const rowAtThisDepth = flameGraphRows[currentDepth];
    const siblingIndexRangeStart = rowAtThisDepth.length; // index into rowAtThisDepth
    for (
      let currentSibling = currentCallNode;
      currentSibling !== -1;
      currentSibling = nextSibling[currentSibling]
    ) {
      const siblingIndexRangeEnd = rowAtThisDepth.length;
      if (siblingIndexRangeStart === siblingIndexRangeEnd) {
        // This is the first sibling that we see. We don't need to compute an
        // insertion index because we don't have any other siblings to compare
        // to yet.
        rowAtThisDepth.push(currentSibling);
      } else {
        // There are other siblings already present in rowAtThisDepth[siblingIndexRangeStart..].
        // Do an ordered insert, to keep siblings ordered by function name.
        // assert(siblingIndexRangeStart < siblingIndexRangeEnd)
        const thisFunc = func[currentSibling];
        const funcName = stringTable.getString(funcTableNameColumn[thisFunc]);
        const insertionIndex = bisectionRightByStrKey(
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
    // they are ordered correctly. They are all marked as pending;
    // pendingRangeStartAtDepth has not been advanced.

    // In the remainder of this loop iteration, all we'll be doing is to find
    // the next node for processing. Starting at the current depth, but going to
    // to more shallow depths if needed, we want to find the first pending node
    // which has children.

    // We know that the current row has at least one remaining pending node
    // (currentCallNode) so we start with this row.
    let candidateDepth = currentDepth;
    let candidateRow = rowAtThisDepth;
    let indexInCandidateRow = pendingRangeStartAtDepth[candidateDepth];
    let candidateNode = candidateRow[indexInCandidateRow];

    // candidateNode may not have any children. Keep searching, in this row and
    // in more shallow rows, until we find a node which does have children.

    // At the end of this loop, candidateNode will be set to a node which has
    // children, and the following will be true:
    // candidateNode === flameGraphRows[candidateDepth][pendingRangeStartAtDepth[candidateDepth]]
    //
    // "while (!hasChildren(candidateNode))"
    while (subtreeRangeEnd[candidateNode] === candidateNode + 1) {
      // candidateNode does not have any children.
      // "Finish" candidateNode by incrementing pendingRangeStartAtDepth[candidateDepth].
      indexInCandidateRow++;
      pendingRangeStartAtDepth[candidateDepth] = indexInCandidateRow;

      // Find the next row which still has pending nodes, going to shallower
      // depths until we hit the end.
      while (indexInCandidateRow === candidateRow.length) {
        // There are no more pending nodes in the current row - all nodes at
        // this depth are already finished.
        if (candidateDepth === 0) {
          // We must have processed the entire tree at this point, and we are done.
          break outer;
        }
        // Go to a shallower depth and continue the search there.
        candidateDepth--;
        candidateRow = flameGraphRows[candidateDepth];
        indexInCandidateRow = pendingRangeStartAtDepth[candidateDepth];
      }

      // candidateRow now has at least one pending node left.
      candidateNode = candidateRow[indexInCandidateRow];
    }

    // Now candidateNode is a pending node which has at least one child.
    // assert(candidateNode === flameGraphRows[candidateDepth][pendingRangeStartAtDepth[candidateDepth]])
    // assert(subtreeRangeEnd[candidateNode] !== candidateNode + 1)

    // We have now decided to process this node, i.e. we know that we will add
    // this node's children in the next loop iteration.
    // "Finish" candidateNode by incrementing pendingRangeStartAtDepth[candidateDepth].
    pendingRangeStartAtDepth[candidateDepth] = indexInCandidateRow + 1;

    // Advance to candidateNode's first child. Due to the way call nodes are ordered,
    // the first child of x (if present) is always at x + 1.
    currentCallNode = candidateNode + 1; // "currentCallNode = firstChild[candidateNode];"
    currentDepth = candidateDepth + 1;
  }

  return flameGraphRows;
}

/**
 * Build a FlameGraphTiming table from a call tree.
 */
export function getFlameGraphTiming(
  flameGraphRows: FlameGraphRows,
  callNodeTable: CallNodeTable,
  callTreeTimings: CallTreeTimingsNonInverted
): FlameGraphTiming {
  const { total, self, rootTotalSummary } = callTreeTimings;
  const { prefix } = callNodeTable;

  // This is where we build up the return value, one row at a time.
  const timing = [];

  // This is used to adjust the start position of a call node's box based on the
  // start position of its prefix node's box.
  const startPerCallNode = new Float32Array(callNodeTable.length);

  // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1858310
  const abs = Math.abs;

  // Go row by row.
  for (let depth = 0; depth < flameGraphRows.length; depth++) {
    const rowNodes = flameGraphRows[depth];

    const start = [];
    const end = [];
    const selfRelative = [];
    const timingCallNodes = [];

    // Process the call nodes in this row. Sibling boxes are adjacent to each other.
    // Whenever the prefix changes, we need to add a gap so that the child boxes
    // start at the same position as the parent box.
    //
    // Previous row: [B          ][D      ]       [G        ]
    // Current row:  [C][E][F]    [I    ]
    // (Note that this is upside down from how the flame graph is usually displayed)
    let currentStart = 0;
    let previousPrefixCallNode = -1;
    for (let indexInRow = 0; indexInRow < rowNodes.length; indexInRow++) {
      const nodeIndex = rowNodes[indexInRow];
      const totalVal = total[nodeIndex];
      if (totalVal === 0) {
        // Skip boxes with zero width.
        continue;
      }

      const nodePrefix = prefix[nodeIndex];
      if (nodePrefix !== previousPrefixCallNode) {
        // We have advanced to a node with a different parent, so we need to
        // jump ahead to the parent box's start position.
        currentStart = startPerCallNode[nodePrefix];
        previousPrefixCallNode = nodePrefix;
      }

      // Write down the start position of this call node so that it can be
      // checked later by this node's children.
      startPerCallNode[nodeIndex] = currentStart;

      // Take the absolute value, as native deallocations can be negative.
      const totalRelativeVal = abs(totalVal / rootTotalSummary);
      const selfRelativeVal = abs(self[nodeIndex] / rootTotalSummary);

      const currentEnd = currentStart + totalRelativeVal;
      start.push(currentStart);
      end.push(currentEnd);
      selfRelative.push(selfRelativeVal);
      timingCallNodes.push(nodeIndex);

      // The start position of the next box is the end position of the current box.
      currentStart = currentEnd;
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
