/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  UnitIntervalOfProfileRange,
  CallNodeTable,
  FuncTable,
  IndexIntoCallNodeTable,
  IndexIntoFuncTable,
  CallNodeSelfAndSummary,
} from 'firefox-profiler/types';
import type { StringTable } from 'firefox-profiler/utils/string-table';
import type { CallTreeTimingsNonInverted } from './call-tree';
import { computeLowerWingCallNodeSelf } from './call-tree';
import type { LowerWingCallNodeInfo } from './call-node-info';
import { computeLowerWingMaxDepthPlusOne } from './call-node-info';

import { bisectionRightByStrKey } from 'firefox-profiler/utils/bisect';

export type FlameGraphDepth = number;
export type IndexIntoFlameGraphTiming = number;

/**
 * FlameGraphTimingRow contains the data used for rendering a single
 * row of the flame graph. Each row contains one or more functions,
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
export type FlameGraphTimingRow = {
  start: UnitIntervalOfProfileRange[];
  end: UnitIntervalOfProfileRange[];
  selfRelative: Array<number>;
  callNode: IndexIntoCallNodeTable[];
  length: number;
};

/**
 * Used by the flame graph canvas to know which boxes to render where.
 *
 * The flame graph only calls getRow(depth) for on-screen rows; this allows
 * the implementation to generate rows lazily as the user scrolls towards
 * deeper calls.
 */
export abstract class FlameGraphTiming {
  _rowCount: number;
  _timingRows: FlameGraphTimingRow[]; // populated lazily by _buildNextTimingRow()

  constructor(rowCount: number) {
    this._timingRows = [];
    this._rowCount = rowCount;
  }

  get rowCount(): number {
    return this._rowCount;
  }

  getRow(depth: number): FlameGraphTimingRow {
    if (depth < 0 || depth >= this.rowCount) {
      throw new Error(
        `Out-of-bounds call to getRow: ${depth} is outside 0..${this.rowCount}`
      );
    }
    while (this._timingRows.length <= depth) {
      this._buildNextTimingRow();
    }
    return this._timingRows[depth];
  }

  // Convenience method for tests, don't call in production
  getAllRowsForTesting(): FlameGraphTimingRow[] {
    const rows = [];
    for (let depth = 0; depth < this.rowCount; depth++) {
      rows.push(this.getRow(depth));
    }
    return rows;
  }

  // For a given node / "box", get the sample percentage (as a fraction of 1) that
  // should be displayed in the tooltip for this node.
  abstract getRatioOfRootTotalSummary(
    depth: number,
    indexInRow: number
  ): number;

  // Build and push `_timingRows[_timingRows.length]`. Called by `getRow` until
  // enough rows have been built. Subclasses may extend their underlying tables
  // here too.
  abstract _buildNextTimingRow(): void;
}

/**
 * Non-inverted lazy timing: drives the regular flame graph, upper wing, and
 * self wing. Reads per-node totals and selfs straight out of
 * `CallTreeTimingsNonInverted` (which is already computed for the call tree
 * view), and uses `callNodeTable.prefix` to align children under parents.
 *
 * The inner build loop is the structural twin of `LowerWingFlameGraphTiming`'s,
 * minus the handle decoding and the `self = total − Σ child totals` step (here
 * `self` is read directly).
 */
export class RegularFlameGraphTiming extends FlameGraphTiming {
  _flameGraphRows: FlameGraphRows;
  _callNodeTable: CallNodeTable;
  _callTreeTimings: CallTreeTimingsNonInverted;

  // Used to position the children call node boxes: For a given parent box, its
  // first (left-most) child box starts at the same x position as the parent.
  _startPerCallNode: Float32Array;

  constructor(
    flameGraphRows: FlameGraphRows,
    callNodeTable: CallNodeTable,
    callTreeTimings: CallTreeTimingsNonInverted
  ) {
    super(flameGraphRows.length);
    this._flameGraphRows = flameGraphRows;
    this._callNodeTable = callNodeTable;
    this._callTreeTimings = callTreeTimings;

    this._startPerCallNode = new Float32Array(callNodeTable.length);
  }

  getRatioOfRootTotalSummary(depth: number, indexInRow: number): number {
    const row = this.getRow(depth);
    if (indexInRow < 0 || indexInRow >= row.length) {
      throw new Error(
        `Out-of-bounds call to getRatioOfRootTotalSummary: For depth ${depth}, ${indexInRow} is outside 0..${row.length}`
      );
    }

    const ratioOfFullWidth = row.end[indexInRow] - row.start[indexInRow];
    const total = ratioOfFullWidth * this._callTreeTimings.flameGraphWidthTotal;
    return total / this._callTreeTimings.rootTotalSummary;
  }

  _buildNextTimingRow(): void {
    const { total, self, flameGraphWidthTotal } = this._callTreeTimings;
    const { prefix } = this._callNodeTable;

    const depth = this._timingRows.length;
    const rowNodes = this._flameGraphRows[depth];
    const startPerCallNode = this._startPerCallNode;

    // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1858310
    const abs = Math.abs;

    const start: UnitIntervalOfProfileRange[] = [];
    const end: UnitIntervalOfProfileRange[] = [];
    const selfRelative: number[] = [];
    const timingCallNodes: IndexIntoCallNodeTable[] = [];

    // Sibling boxes are adjacent. Whenever the prefix changes, jump ahead to
    // the new parent's start so children stay aligned under their parent.
    //
    // Previous row: [B          ][D      ]       [G        ]
    // Current row:  [C][E][F]    [I    ]
    // (Note: upside down from how the flame graph is usually displayed.)
    let currentStart = 0;
    let previousPrefixCallNode = -1;
    for (let i = 0; i < rowNodes.length; i++) {
      const nodeIndex = rowNodes[i];
      const totalVal = total[nodeIndex];
      if (totalVal === 0) {
        continue;
      }

      const nodePrefix = prefix[nodeIndex];
      if (nodePrefix !== previousPrefixCallNode) {
        currentStart = nodePrefix === -1 ? 0 : startPerCallNode[nodePrefix];
        previousPrefixCallNode = nodePrefix;
      }
      startPerCallNode[nodeIndex] = currentStart;

      const totalRelative = abs(totalVal / flameGraphWidthTotal);
      const selfRelativeVal = abs(self[nodeIndex] / flameGraphWidthTotal);

      const currentEnd = currentStart + totalRelative;
      start.push(currentStart);
      end.push(currentEnd);
      selfRelative.push(selfRelativeVal);
      timingCallNodes.push(nodeIndex);

      currentStart = currentEnd;
    }

    this._timingRows.push({
      start,
      end,
      selfRelative,
      callNode: timingCallNodes,
      length: timingCallNodes.length,
    });
  }
}

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
 * Build a FlameGraphTiming from a call tree.
 */
export function getFlameGraphTiming(
  flameGraphRows: FlameGraphRows,
  callNodeTable: CallNodeTable,
  callTreeTimings: CallTreeTimingsNonInverted
): RegularFlameGraphTiming {
  return new RegularFlameGraphTiming(
    flameGraphRows,
    callNodeTable,
    callTreeTimings
  );
}

/**
 * Per-LowerWingTable-index total and self values used to drive the lower wing
 * flame graph. Both arrays have length equal to the lower-wing table length.
 * Index 0 is the root (the selected function).
 */
export type LowerWingFlameGraphTotals = {
  totalPerTableIdx: Float64Array;
  selfPerTableIdx: Float64Array;
  rootTotalSummary: number;
  // Equal to rootTotalSummary — the lower wing's flame graph root fills the
  // entire width.
  flameGraphWidthTotal: number;
};

/**
 * Lazy, depth-incremental FlameGraphTiming for the lower wing.
 *
 * Wraps a `LowerWingCallNodeInfo` and produces a `FlameGraphTimingRow` for any
 * depth on demand. Internal state:
 *
 *  - `_rowsCallNodes[d]` is the row of call-node handles for depth `d`, sorted
 *    in flame-graph display order. Lazily built one depth at a time from the
 *    previous row's children — same algorithm as the old
 *    `computeLowerWingFlameGraphRows`, just sliced.
 *  - `_timingRows[d]` is the per-cell start/end/self/etc. for depth `d`.
 *  - `_prefixSums` is the running prefix sum over `lowerWing.getSuffixOrderedCallNodes()`
 *    in its *current* (partition-refined) order. We recompute whenever the
 *    underlying table has grown since the last recompute — extending the BFS
 *    permutes the suffix order within nodes' fixed `[soStart, soEnd)` ranges,
 *    which invalidates per-position prefix sums but leaves per-range sums
 *    unchanged. Detection is just `lowerWing.getLowerWingTableUpToDepth(-1).length`.
 *  - `_startPerTableIdx` carries cells' left edges across rows so children can
 *    be aligned under their parent. Grown as the table grows.
 *
 * `numRows` is the cheap upper bound from `computeLowerWingMaxDepthPlusOne`,
 * so the Canvas can size the scroll area without forcing any tree build.
 *
 * Self-time correctness: row D's self values depend on the totals of nodes at
 * depth D+1. `getRow(D)` extends the lower-wing CNI to depth D, which processes
 * nodes at depth D and emits their depth-D+1 children — so children's
 * `[soStart, soEnd)` ranges are set and their totals are computable. (For the
 * deepest row, nodes have no children and self = total, which is also correct.)
 */
export class LowerWingFlameGraphTiming extends FlameGraphTiming {
  _lowerWing: LowerWingCallNodeInfo;
  _callNodeSelfAndSummary: CallNodeSelfAndSummary;
  _callNodeTable: CallNodeTable;
  _selectedFuncIndex: IndexIntoFuncTable | null;
  _funcTable: FuncTable;
  _stringTable: StringTable;

  // Lazy timing state.
  _mappedSelf: Float64Array | null;
  _prefixSums: Float64Array | null;
  _prefixSumsForTableLength: number;
  _rootTotalSummary: number;
  _tooltipRatioMultiplier: number;

  // Lazy row state. `_rowsCallNodes[d]` is dense for `d < _rowsCallNodes.length`.
  _rowsCallNodes: IndexIntoCallNodeTable[][];

  // Persistent left-edge cache (table-index keyed) used by row alignment.
  _startPerTableIdx: Float32Array;

  // Persistent total cache (table-index keyed). Populated for each node while
  // iterating its parent's children to compute `childSum`, then read back when
  // the node itself is emitted in the next row — avoids recomputing the same
  // prefix-sums subtraction twice. Row-0 roots are the only nodes never seen
  // as a child, so they compute their total directly.
  _totalPerTableIdx: Float64Array;

  constructor(
    lowerWing: LowerWingCallNodeInfo,
    callNodeSelfAndSummary: CallNodeSelfAndSummary,
    callNodeTable: CallNodeTable,
    selectedFuncIndex: IndexIntoFuncTable | null,
    funcTable: FuncTable,
    stringTable: StringTable
  ) {
    super(computeLowerWingMaxDepthPlusOne(callNodeTable, selectedFuncIndex));
    this._lowerWing = lowerWing;
    this._callNodeSelfAndSummary = callNodeSelfAndSummary;
    this._callNodeTable = callNodeTable;
    this._selectedFuncIndex = selectedFuncIndex;
    this._funcTable = funcTable;
    this._stringTable = stringTable;

    this._mappedSelf = null;
    this._prefixSums = null;
    this._prefixSumsForTableLength = -1;
    this._rootTotalSummary = 0;
    // tooltipRatioMultiplier for the lower wing is flameGraphWidthTotal /
    // rootTotalSummary, both equal to total[0]. So 1 when there's a selection
    // with sample weight, 0 otherwise. We resolve this lazily inside
    // `_ensurePrefixSums` since both values come from the prefix-sums pass.
    this._tooltipRatioMultiplier = 0;

    this._rowsCallNodes = [];
    this._startPerTableIdx = new Float32Array(16);
    this._totalPerTableIdx = new Float64Array(16);
  }

  getRatioOfRootTotalSummary(depth: number, indexInRow: number): number {
    const row = this.getRow(depth);
    if (indexInRow < 0 || indexInRow >= row.length) {
      throw new Error(
        `Out-of-bounds call to getRatioOfRootTotalSummary: For depth ${depth}, ${indexInRow} is outside 0..${row.length}`
      );
    }

    const ratioOfFullWidth = row.end[indexInRow] - row.start[indexInRow];
    return ratioOfFullWidth;
  }

  _ensureRowCallNodes(depth: number): void {
    if (this._selectedFuncIndex === null) {
      while (this._rowsCallNodes.length <= depth) {
        this._rowsCallNodes.push([]);
      }
      return;
    }
    if (this._rowsCallNodes.length === 0) {
      // Row 0: only the inverted root, whose handle is 0 in the lower wing.
      this._rowsCallNodes.push([0]);
    }
    while (this._rowsCallNodes.length <= depth) {
      this._buildNextRowCallNodes();
    }
  }

  // Build `_rowsCallNodes[next]` from the previous row's children. The
  // lower-wing table stores children sorted by func index, so we re-sort by
  // name via bisect-insert here (mirrors the old `computeLowerWingFlameGraphRows`).
  _buildNextRowCallNodes(): void {
    const nextDepth = this._rowsCallNodes.length;
    // Need parents (at nextDepth - 1) processed, i.e. CNI extended to
    // nextDepth - 1 so their children at nextDepth are populated.
    const table = this._lowerWing.getLowerWingTableUpToDepth(nextDepth - 1);
    const funcNameCol = this._funcTable.name;
    const stringTable = this._stringTable;
    const tableFunc = table.func;
    const tableChildren = table.children;

    const parentRow = this._rowsCallNodes[nextDepth - 1];
    const childRow: IndexIntoCallNodeTable[] = [];

    // Handle === table index for the lower-wing CNI, so no translation.
    for (let p = 0; p < parentRow.length; p++) {
      const parentHandle = parentRow[p];
      const children = tableChildren[parentHandle];
      if (children.length === 0) {
        continue;
      }
      const groupStart = childRow.length;
      for (let c = 0; c < children.length; c++) {
        const childHandle = children[c];
        const childFunc = tableFunc[childHandle];
        const childName = stringTable.getString(funcNameCol[childFunc]);
        const groupEnd = childRow.length;
        if (groupStart === groupEnd) {
          childRow.push(childHandle);
        } else {
          const insertionIndex = bisectionRightByStrKey(
            childRow,
            childName,
            (handle) => stringTable.getString(funcNameCol[tableFunc[handle]]),
            groupStart,
            groupEnd
          );
          childRow.splice(insertionIndex, 0, childHandle);
        }
      }
    }

    this._rowsCallNodes.push(childRow);
  }

  // Compute (or refresh) `_prefixSums` if the underlying CNI table has grown
  // since the last computation. Also resolves `_rootTotalSummary` and
  // `_tooltipRatioMultiplier` on the first run — those don't change as the
  // tree grows because the root's `[soStart, soEnd)` covers the full entry
  // set and that set is invariant.
  _ensurePrefixSums(): void {
    if (this._selectedFuncIndex === null) {
      if (this._prefixSums === null) {
        this._prefixSums = new Float64Array(1);
        // _rootTotalSummary and _tooltipRatioMultiplier stay at their default 0.
        this._prefixSumsForTableLength =
          this._lowerWing.getLowerWingTableUpToDepth(-1).length;
      }
      return;
    }

    const tableLength = this._lowerWing.getLowerWingTableUpToDepth(-1).length;
    if (
      this._prefixSums !== null &&
      this._prefixSumsForTableLength === tableLength
    ) {
      return;
    }

    if (this._mappedSelf === null) {
      this._mappedSelf = computeLowerWingCallNodeSelf(
        this._callNodeSelfAndSummary.callNodeSelf,
        this._callNodeTable,
        this._selectedFuncIndex
      );
    }
    const mappedSelf = this._mappedSelf;
    const suffixOrdered = this._lowerWing.getSuffixOrderedCallNodes();
    const N = suffixOrdered.length;
    const prefixSums = new Float64Array(N + 1);
    for (let k = 0; k < N; k++) {
      prefixSums[k + 1] = prefixSums[k] + mappedSelf[suffixOrdered[k]];
    }
    this._prefixSums = prefixSums;
    this._prefixSumsForTableLength = tableLength;
    // total[0] = root's range = all entries. Compute once; invariant across
    // further extensions.
    if (this._rootTotalSummary === 0 && N > 0) {
      this._rootTotalSummary = prefixSums[N];
      this._tooltipRatioMultiplier = this._rootTotalSummary === 0 ? 0 : 1;
    }
  }

  _growPerTableIdxArraysTo(minLength: number): void {
    if (this._startPerTableIdx.length >= minLength) {
      return;
    }
    let newCap = this._startPerTableIdx.length;
    while (newCap < minLength) {
      newCap *= 2;
    }
    const nextStart = new Float32Array(newCap);
    nextStart.set(this._startPerTableIdx);
    this._startPerTableIdx = nextStart;
    const nextTotal = new Float64Array(newCap);
    nextTotal.set(this._totalPerTableIdx);
    this._totalPerTableIdx = nextTotal;
  }

  _buildNextTimingRow(): void {
    const nextDepth = this._timingRows.length;

    // Extend the CNI to nextDepth so depth-nextDepth nodes are processed —
    // this populates their `_tChildren` and adds the depth-(nextDepth+1)
    // children whose totals feed into self-time at nextDepth.
    const table = this._lowerWing.getLowerWingTableUpToDepth(nextDepth);

    this._ensureRowCallNodes(nextDepth);
    this._ensurePrefixSums();
    this._growPerTableIdxArraysTo(table.length);

    const rowNodes = this._rowsCallNodes[nextDepth];
    const flameGraphWidthTotal = this._rootTotalSummary;
    if (flameGraphWidthTotal === 0) {
      this._timingRows.push({
        start: [],
        end: [],
        selfRelative: [],
        callNode: [],
        length: 0,
      });
      return;
    }

    const tablePrefix = table.prefix;
    const tableSoStart = table.suffixOrderIndexRangeStart;
    const tableSoEnd = table.suffixOrderIndexRangeEnd;
    const tableChildren = table.children;
    const prefixSums = this._prefixSums as Float64Array;
    const startPerTableIdx = this._startPerTableIdx;
    const totalPerTableIdx = this._totalPerTableIdx;

    // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1858310
    const abs = Math.abs;

    const start: UnitIntervalOfProfileRange[] = [];
    const end: UnitIntervalOfProfileRange[] = [];
    const selfRelative: number[] = [];
    const timingCallNodes: IndexIntoCallNodeTable[] = [];

    let currentStart = 0;
    let previousPrefixIdx = -1;
    // Handle === table index for the lower-wing CNI.
    for (let i = 0; i < rowNodes.length; i++) {
      const tableIdx = rowNodes[i];
      // Row-0 roots are never seen as a child, so their total isn't cached;
      // compute directly. Deeper rows read the total cached by their parent's
      // childSum loop on the previous row.
      const totalVal =
        nextDepth === 0
          ? prefixSums[tableSoEnd[tableIdx]] -
            prefixSums[tableSoStart[tableIdx]]
          : totalPerTableIdx[tableIdx];
      if (totalVal === 0) {
        continue;
      }

      // self = total − Σ children's totals. Children at depth nextDepth+1
      // are guaranteed to exist (CNI was extended to nextDepth), so each
      // child's [soStart, soEnd) is final and its total is well-defined.
      // Cache each child's total so the next row can read it directly.
      const children = tableChildren[tableIdx];
      let childSum = 0;
      for (let c = 0; c < children.length; c++) {
        const childIdx = children[c];
        const childTotal =
          prefixSums[tableSoEnd[childIdx]] - prefixSums[tableSoStart[childIdx]];
        totalPerTableIdx[childIdx] = childTotal;
        childSum += childTotal;
      }
      const selfVal = totalVal - childSum;

      const parentIdx = tablePrefix[tableIdx];

      if (parentIdx !== previousPrefixIdx) {
        currentStart = parentIdx === -1 ? 0 : startPerTableIdx[parentIdx];
        previousPrefixIdx = parentIdx;
      }
      startPerTableIdx[tableIdx] = currentStart;

      const totalRelative = abs(totalVal / flameGraphWidthTotal);
      const selfRelativeVal = abs(selfVal / flameGraphWidthTotal);

      const currentEnd = currentStart + totalRelative;
      start.push(currentStart);
      end.push(currentEnd);
      selfRelative.push(selfRelativeVal);
      timingCallNodes.push(tableIdx);

      currentStart = currentEnd;
    }

    this._timingRows.push({
      start,
      end,
      selfRelative,
      callNode: timingCallNodes,
      length: timingCallNodes.length,
    });
  }
}

/**
 * Construct the (lazy) flame-graph timing for the lower wing.
 *
 * The returned object is the unit of work the Canvas talks to: it asks for a
 * row by depth and the timing object extends the lower-wing CNI, refreshes
 * prefix sums, and computes only the rows that have been asked for.
 */
export function createLowerWingFlameGraphTiming(
  lowerWing: LowerWingCallNodeInfo,
  callNodeSelfAndSummary: CallNodeSelfAndSummary,
  callNodeTable: CallNodeTable,
  selectedFuncIndex: IndexIntoFuncTable | null,
  funcTable: FuncTable,
  stringTable: StringTable
): LowerWingFlameGraphTiming {
  return new LowerWingFlameGraphTiming(
    lowerWing,
    callNodeSelfAndSummary,
    callNodeTable,
    selectedFuncIndex,
    funcTable,
    stringTable
  );
}
