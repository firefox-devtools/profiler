/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  UnitIntervalOfProfileRange,
  CallNodeTable,
  FuncTable,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';
import type { StringTable } from 'firefox-profiler/utils/string-table';
import type {
  CallTreeTimingsInverted,
  CallTreeTimingsNonInverted,
} from './call-tree';
import type { CallNodeInfoInverted } from './call-node-info';

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
export interface FlameGraphTiming {
  readonly rowCount: number;
  getRow(depth: number): FlameGraphTimingRow;
  getAllRowsForTesting(): FlameGraphTimingRow[];
}

class FlameGraphTimingNonInverted implements FlameGraphTiming {
  _flameGraphRows: FlameGraphRows;
  _callNodeTable: CallNodeTable;
  _callTreeTimings: CallTreeTimingsNonInverted;

  // Populated lazily by _buildNextTimingRow().
  _timingRows: FlameGraphTimingRow[];

  // Used to position the children call node boxes: For a given parent box, its
  // first (left-most) child box starts at the same x position as the parent.
  _startPerCallNode: Float32Array;

  constructor(
    flameGraphRows: FlameGraphRows,
    callNodeTable: CallNodeTable,
    callTreeTimings: CallTreeTimingsNonInverted
  ) {
    this._flameGraphRows = flameGraphRows;
    this._callNodeTable = callNodeTable;
    this._callTreeTimings = callTreeTimings;

    this._timingRows = [];
    this._startPerCallNode = new Float32Array(callNodeTable.length);
  }

  get rowCount(): number {
    return this._flameGraphRows.length;
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

  _buildNextTimingRow(): void {
    const { total, self, rootTotalSummary } = this._callTreeTimings;
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

      const totalRelative = abs(totalVal / rootTotalSummary);
      const selfRelativeVal = abs(self[nodeIndex] / rootTotalSummary);

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
): FlameGraphTiming {
  return new FlameGraphTimingNonInverted(
    flameGraphRows,
    callNodeTable,
    callTreeTimings
  );
}

type InvertedNodeTiming = {
  total: number;
  hasChildren: boolean;
};

type InvertedFlameGraphRowItem = {
  nodeIndex: IndexIntoCallNodeTable;
  start: UnitIntervalOfProfileRange;
  end: UnitIntervalOfProfileRange;
};

// The flame graph does not support horizontal zooming, so boxes that are smaller
// than a fraction of a 16k-wide display cannot be hovered or read. We still take
// their width into account when positioning later boxes, but we do not expand
// their descendants.
const MIN_INVERTED_FLAME_GRAPH_BOX_WIDTH = 1 / 16384;

class FlameGraphTimingInverted implements FlameGraphTiming {
  _callNodeInfo: CallNodeInfoInverted;
  _callTreeTimings: CallTreeTimingsInverted;
  _funcTable: FuncTable;
  _stringTable: StringTable;
  _nonRootTimingCache: Map<IndexIntoCallNodeTable, InvertedNodeTiming> =
    new Map();
  _timingRows: FlameGraphTimingRow[] = [];
  _nextRowItems: InvertedFlameGraphRowItem[];
  _rowCount: number;

  constructor(
    callNodeInfo: CallNodeInfoInverted,
    callTreeTimings: CallTreeTimingsInverted,
    funcTable: FuncTable,
    stringTable: StringTable
  ) {
    this._callNodeInfo = callNodeInfo;
    this._callTreeTimings = callTreeTimings;
    this._funcTable = funcTable;
    this._stringTable = stringTable;

    const { rootTotalSummary } = callTreeTimings;
    this._rowCount =
      rootTotalSummary === 0 ? 0 : callNodeInfo.getCallNodeTable().maxDepth + 1;
    this._nextRowItems = this._getRootRowItems();
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

  _compareCallNodesByFuncName = (
    a: IndexIntoCallNodeTable,
    b: IndexIntoCallNodeTable
  ): number => {
    const callNodeInfo = this._callNodeInfo;
    const { name } = this._funcTable;
    const stringTable = this._stringTable;
    const funcA = callNodeInfo.funcForNode(a);
    const funcB = callNodeInfo.funcForNode(b);
    const funcNameA = stringTable.getString(name[funcA]);
    const funcNameB = stringTable.getString(name[funcB]);
    if (funcNameA < funcNameB) {
      return -1;
    }
    if (funcNameA > funcNameB) {
      return 1;
    }
    return funcA - funcB;
  };

  _getNodeTiming(nodeIndex: IndexIntoCallNodeTable): InvertedNodeTiming {
    const callNodeInfo = this._callNodeInfo;
    const { callNodeSelf, totalPerRootFunc, hasChildrenPerRootFunc } =
      this._callTreeTimings;

    if (callNodeInfo.isRoot(nodeIndex)) {
      return {
        total: totalPerRootFunc[nodeIndex],
        hasChildren: hasChildrenPerRootFunc[nodeIndex] !== 0,
      };
    }

    const cached = this._nonRootTimingCache.get(nodeIndex);
    if (cached !== undefined) {
      return cached;
    }

    const nodeDepth = callNodeInfo.depthForNode(nodeIndex);
    const [rangeStart, rangeEnd] =
      callNodeInfo.getSuffixOrderIndexRangeForCallNode(nodeIndex);
    const suffixOrderedCallNodes = callNodeInfo.getSuffixOrderedCallNodes();
    const callNodeTableDepthCol = callNodeInfo.getCallNodeTable().depth;

    let total = 0;
    let hasChildren = false;
    for (let i = rangeStart; i < rangeEnd; i++) {
      const selfNode = suffixOrderedCallNodes[i];
      const self = callNodeSelf[selfNode];
      total += self;
      hasChildren =
        hasChildren ||
        (self !== 0 && callNodeTableDepthCol[selfNode] > nodeDepth);
    }

    const timing = { total, hasChildren };
    this._nonRootTimingCache.set(nodeIndex, timing);
    return timing;
  }

  _getChildrenWithTiming(
    nodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable[] {
    const callNodeInfo = this._callNodeInfo;
    const children = callNodeInfo.getChildren(nodeIndex);
    const displayedChildren = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const { total, hasChildren } = this._getNodeTiming(child);
      if (total !== 0 || hasChildren) {
        displayedChildren.push(child);
      }
    }
    displayedChildren.sort(this._compareCallNodesByFuncName);
    return displayedChildren;
  }

  _getRootRowItems(): InvertedFlameGraphRowItem[] {
    const { rootTotalSummary, sortedRoots, totalPerRootFunc } =
      this._callTreeTimings;
    const abs = Math.abs;

    if (rootTotalSummary === 0) {
      return [];
    }

    const roots = [];
    for (let i = 0; i < sortedRoots.length; i++) {
      roots.push(sortedRoots[i]);
    }
    roots.sort(this._compareCallNodesByFuncName);

    const rootRowItems: InvertedFlameGraphRowItem[] = [];
    let currentRootStart = 0;
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      const totalRelative = abs(totalPerRootFunc[root] / rootTotalSummary);
      const start = currentRootStart;
      const end = start + totalRelative;
      if (totalRelative >= MIN_INVERTED_FLAME_GRAPH_BOX_WIDTH) {
        rootRowItems.push({ nodeIndex: root, start, end });
      }
      currentRootStart = end;
    }

    return rootRowItems;
  }

  _buildNextTimingRow(): void {
    const { rootTotalSummary } = this._callTreeTimings;
    const callNodeInfo = this._callNodeInfo;
    const abs = Math.abs;

    const rowItems = this._nextRowItems;
    const start: UnitIntervalOfProfileRange[] = [];
    const end: UnitIntervalOfProfileRange[] = [];
    const selfRelative: number[] = [];
    const timingCallNodes: IndexIntoCallNodeTable[] = [];
    const nextRowItems: InvertedFlameGraphRowItem[] = [];

    for (let i = 0; i < rowItems.length; i++) {
      const { nodeIndex, start: itemStart, end: itemEnd } = rowItems[i];
      const { total } = this._getNodeTiming(nodeIndex);

      start.push(itemStart);
      end.push(itemEnd);
      selfRelative.push(
        callNodeInfo.isRoot(nodeIndex) ? abs(total / rootTotalSummary) : 0
      );
      timingCallNodes.push(nodeIndex);

      if (itemEnd - itemStart < MIN_INVERTED_FLAME_GRAPH_BOX_WIDTH) {
        continue;
      }

      const children = this._getChildrenWithTiming(nodeIndex);
      let currentChildStart = itemStart;
      for (let childIndex = 0; childIndex < children.length; childIndex++) {
        const child = children[childIndex];
        const childTotal = this._getNodeTiming(child).total;
        const childTotalRelative = abs(childTotal / rootTotalSummary);
        const childEnd = currentChildStart + childTotalRelative;
        if (childTotalRelative >= MIN_INVERTED_FLAME_GRAPH_BOX_WIDTH) {
          nextRowItems.push({
            nodeIndex: child,
            start: currentChildStart,
            end: childEnd,
          });
        }
        currentChildStart = childEnd;
      }
    }

    this._nextRowItems = nextRowItems;
    this._timingRows.push({
      start,
      end,
      selfRelative,
      callNode: timingCallNodes,
      length: timingCallNodes.length,
    });
  }
}

export function getInvertedFlameGraphTiming(
  callNodeInfo: CallNodeInfoInverted,
  callTreeTimings: CallTreeTimingsInverted,
  funcTable: FuncTable,
  stringTable: StringTable
): FlameGraphTiming {
  return new FlameGraphTimingInverted(
    callNodeInfo,
    callTreeTimings,
    funcTable,
    stringTable
  );
}
