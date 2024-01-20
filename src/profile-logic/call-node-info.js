/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import {
  hashPath,
  concatHash,
  hashPathSingleFunc,
} from 'firefox-profiler/utils/path';
import { ensureExists } from '../utils/flow';

import type {
  IndexIntoFuncTable,
  CallNodeInfo,
  CallNodeInfoInverted,
  CallNodeTable,
  CallNodePath,
  IndexIntoCallNodeTable,
  SuffixOrderIndex,
  IndexIntoCategoryList,
  IndexIntoNativeSymbolTable,
  IndexIntoSubcategoryListForCategory,
  InnerWindowID,
} from 'firefox-profiler/types';

/**
 * The implementation of the CallNodeInfo interface.
 *
 * CallNodeInfoInvertedImpl inherits from this class and shares this implementation.
 * By the end of this commit stack, it will no longer inherit from this class and
 * will have its own implementation.
 */
export class CallNodeInfoNonInvertedImpl implements CallNodeInfo {
  // The call node table. (always non-inverted)
  _callNodeTable: CallNodeTable;

  // The mapping of stack index to corresponding non-inverted call node index.
  _stackIndexToNonInvertedCallNodeIndex: Int32Array;

  // This is a Map<CallNodePathHash, IndexIntoCallNodeTable>. This map speeds up
  // the look-up process by caching every CallNodePath we handle which avoids
  // looking up parents again and again.
  _cache: Map<string, IndexIntoCallNodeTable> = new Map();

  constructor(
    callNodeTable: CallNodeTable,
    stackIndexToNonInvertedCallNodeIndex: Int32Array
  ) {
    this._callNodeTable = callNodeTable;
    this._stackIndexToNonInvertedCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex;
  }

  isInverted(): boolean {
    return false;
  }

  asInverted(): CallNodeInfoInverted | null {
    return null;
  }

  getNonInvertedCallNodeTable(): CallNodeTable {
    return this._callNodeTable;
  }

  getStackIndexToNonInvertedCallNodeIndex(): Int32Array {
    return this._stackIndexToNonInvertedCallNodeIndex;
  }

  getCallNodePathFromIndex(
    callNodeIndex: IndexIntoCallNodeTable | null
  ): CallNodePath {
    if (callNodeIndex === null || callNodeIndex === -1) {
      return [];
    }

    const callNodePath = [];
    let cni = callNodeIndex;
    while (cni !== -1) {
      callNodePath.push(this._callNodeTable.func[cni]);
      cni = this._callNodeTable.prefix[cni];
    }
    callNodePath.reverse();
    return callNodePath;
  }

  getCallNodeIndexFromPath(
    callNodePath: CallNodePath
  ): IndexIntoCallNodeTable | null {
    const cache = this._cache;
    const hashFullPath = hashPath(callNodePath);
    const result = cache.get(hashFullPath);
    if (result !== undefined) {
      // The cache already has the result for the full path.
      return result;
    }

    // This array serves as a map and stores the hashes of callNodePath's
    // parents to speed up the algorithm. First we'll follow the tree from the
    // bottom towards the top, pushing hashes as we compute them, and then we'll
    // move back towards the bottom popping hashes from this array.
    const sliceHashes = [hashFullPath];

    // Step 1: find whether we already computed the index for one of the path's
    // parents, starting from the closest parent and looping towards the "top" of
    // the tree.
    // If we find it for one of the parents, we'll be able to start at this point
    // in the following look up.
    let i = callNodePath.length;
    let index;
    while (--i > 0) {
      // Looking up each parent for this call node, starting from the deepest node.
      // If we find a parent this makes it possible to start the look up from this location.
      const subPath = callNodePath.slice(0, i);
      const hash = hashPath(subPath);
      index = cache.get(hash);
      if (index !== undefined) {
        // Yay, we already have the result for a parent!
        break;
      }
      // Cache the hashed value because we'll need it later, after resolving this path.
      // Note we don't add the hash if we found the parent in the cache, so the
      // last added element here will accordingly be the first popped in the next
      // algorithm.
      sliceHashes.push(hash);
    }

    // Step 2: look for the requested path using the call node table, starting at
    // the parent we already know if we found one, and looping down the tree.
    // We're contributing to the cache at the same time.

    // `index` is undefined if no parent was found in the cache. In that case we
    // start from the start, and use `-1` which is the prefix we use to indicate
    // the root node.
    if (index === undefined) {
      // assert(i === 0);
      index = -1;
    }

    while (i < callNodePath.length) {
      // Resolving the index for subpath `callNodePath.slice(0, i+1)` given we
      // know the index for the subpath `callNodePath.slice(0, i)` (its parent).
      const func = callNodePath[i];
      const nextNodeIndex = this.getCallNodeIndexFromParentAndFunc(index, func);

      // We couldn't find this path into the call node table. This shouldn't
      // normally happen.
      if (nextNodeIndex === null) {
        return null;
      }

      // Contributing to the shared cache
      const hash = sliceHashes.pop();
      cache.set(hash, nextNodeIndex);

      index = nextNodeIndex;
      i++;
    }

    return index < 0 ? null : index;
  }

  getCallNodeIndexFromParentAndFunc(
    parent: IndexIntoCallNodeTable | -1,
    func: IndexIntoFuncTable
  ): IndexIntoCallNodeTable | null {
    const callNodeTable = this._callNodeTable;
    if (parent === -1) {
      if (callNodeTable.length === 0) {
        return null;
      }
    } else if (callNodeTable.subtreeRangeEnd[parent] === parent + 1) {
      // parent has no children.
      return null;
    }
    // Node children always come after their parents in the call node table,
    // that's why we start looping at `parent + 1`.
    // Note that because the root parent is `-1`, we correctly start at `0` when
    // we look for a root.
    const firstChild = parent + 1;
    for (
      let callNodeIndex = firstChild;
      callNodeIndex !== -1;
      callNodeIndex = callNodeTable.nextSibling[callNodeIndex]
    ) {
      if (callNodeTable.func[callNodeIndex] === func) {
        return callNodeIndex;
      }
    }

    return null;
  }

  getRoots(): IndexIntoCallNodeTable[] {
    const roots = [];
    if (this._callNodeTable.length !== 0) {
      for (
        let invertedRoot = 0;
        invertedRoot !== -1;
        invertedRoot = this._callNodeTable.nextSibling[invertedRoot]
      ) {
        roots.push(invertedRoot);
      }
    }
    return roots;
  }

  isRoot(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this._callNodeTable.prefix[callNodeIndex] === -1;
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): IndexIntoCallNodeTable[] {
    if (
      this._callNodeTable.subtreeRangeEnd[callNodeIndex] ===
      callNodeIndex + 1
    ) {
      return [];
    }

    const children = [];
    const firstChild = callNodeIndex + 1;
    for (
      let childCallNodeIndex = firstChild;
      childCallNodeIndex !== -1;
      childCallNodeIndex = this._callNodeTable.nextSibling[childCallNodeIndex]
    ) {
      children.push(childCallNodeIndex);
    }
    return children;
  }

  prefixForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable | -1 {
    return this._callNodeTable.prefix[callNodeIndex];
  }

  funcForNode(callNodeIndex: IndexIntoCallNodeTable): IndexIntoFuncTable {
    return this._callNodeTable.func[callNodeIndex];
  }

  categoryForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCategoryList {
    return this._callNodeTable.category[callNodeIndex];
  }

  subcategoryForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCategoryList {
    return this._callNodeTable.subcategory[callNodeIndex];
  }

  innerWindowIDForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCategoryList {
    return this._callNodeTable.innerWindowID[callNodeIndex];
  }

  depthForNode(callNodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeTable.depth[callNodeIndex];
  }

  sourceFramesInlinedIntoSymbolForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoNativeSymbolTable | -1 | null {
    return this._callNodeTable.sourceFramesInlinedIntoSymbol[callNodeIndex];
  }
}

// A "subtype" of IndexIntoCallNodeTable, used in places where it is known that
// we are referring to an inverted call node. We just use it as a convention,
// Flow doesn't actually treat this any different from any other index and won't
// catch incorrect uses.
type InvertedCallNodeHandle = number;

// An index into InvertedNonRootCallNodeTable. This is usually created by
// taking an InvertedCallNodeHandle and subtracting rootCount.
type IndexIntoInvertedNonRootCallNodeTable = number;

// Information about the roots of the inverted call tree. We compute this
// information upfront for all roots. The root count is fixed, so most of the
// arrays in this struct are fixed-size typed arrays.
// The number of roots is the same as the number of functions in the funcTable.
type InvertedRootCallNodeTable = {|
  category: Int32Array, // IndexIntoFuncTable -> IndexIntoCategoryList
  subcategory: Int32Array, // IndexIntoFuncTable -> IndexIntoSubcategoryListForCategory
  innerWindowID: Float64Array, // IndexIntoFuncTable -> InnerWindowID
  // IndexIntoNativeSymbolTable: all frames that collapsed into this call node inlined into the same native symbol
  // -1: divergent: some, but not all, frames that collapsed into this call node were inlined, or they are from different symbols
  // null: no inlining
  sourceFramesInlinedIntoSymbol: Array<IndexIntoNativeSymbolTable | -1 | null>,
  // The (exclusive) end of the suffix order index range for each root node.
  // The beginning of the range is given by suffixOrderIndexRangeEnd[i - 1], or by
  // zero. This is possible because both the inverted root order and the suffix order
  // are determined by the func order.
  suffixOrderIndexRangeEnd: Uint32Array, // IndexIntoFuncTable -> SuffixOrderIndex,
  length: number,
|};

// Information about the non-root nodes of the inverted call tree. This table
// grows on-demand, as new inverted call nodes are materialized.
type InvertedNonRootCallNodeTable = {|
  prefix: InvertedCallNodeHandle[],
  func: IndexIntoFuncTable[], // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoFuncTable
  pathHash: string[], // IndexIntoInvertedNonRootCallNodeTable -> string
  category: IndexIntoCategoryList[], // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoCategoryList
  subcategory: IndexIntoSubcategoryListForCategory[], // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoSubcategoryListForCategory
  innerWindowID: InnerWindowID[], // IndexIntoInvertedNonRootCallNodeTable -> InnerWindowID
  // IndexIntoNativeSymbolTable: all frames that collapsed into this call node inlined into the same native symbol
  // -1: divergent: some, but not all, frames that collapsed into this call node were inlined, or they are from different symbols
  // null: no inlining
  sourceFramesInlinedIntoSymbol: Array<IndexIntoNativeSymbolTable | -1 | null>,
  suffixOrderIndexRangeStart: SuffixOrderIndex[], // IndexIntoInvertedNonRootCallNodeTable -> SuffixOrderIndex
  suffixOrderIndexRangeEnd: SuffixOrderIndex[], // IndexIntoInvertedNonRootCallNodeTable -> SuffixOrderIndex

  // Non-null for non-root nodes whose children haven't been created yet.
  // For a non-root node x of the inverted tree, let k = depth[x] its depth in the inverted tree,
  // and deepNodes = deepNodesForSuffixOrderIndexRange[x] be its non-null deep nodes.
  // Then, for every index i in suffixOrderIndexRangeStart[x]..suffixOrderIndexRangeEnd[x],
  // the k'th prefix node of suffixOrderedCallNodes[i] is stored at deepNodes[i - suffixOrderIndexRangeStart[x]].
  deepNodesForSuffixOrderIndexRange: Array<Uint32Array | null>, // IndexIntoInvertedNonRootCallNodeTable -> (Uint32Array | null)

  depth: number[], // IndexIntoInvertedNonRootCallNodeTable -> number
  length: number,
|};

// Compute the InvertedRootCallNodeTable.
// We compute this information upfront for all roots. The root count is fixed -
// the number of roots is the same as the number of functions in the funcTable.
function _createInvertedRootCallNodeTable(
  callNodeTable: CallNodeTable,
  rootSuffixOrderIndexRangeEndCol: Uint32Array,
  suffixOrderedCallNodes: Uint32Array,
  defaultCategory: IndexIntoCategoryList
): InvertedRootCallNodeTable {
  const funcCount = rootSuffixOrderIndexRangeEndCol.length;
  const category = new Int32Array(funcCount);
  const subcategory = new Int32Array(funcCount);
  const innerWindowID = new Float64Array(funcCount);
  const sourceFramesInlinedIntoSymbol = new Array(funcCount);
  let previousRootSuffixOrderIndexRangeEnd = 0;
  for (let funcIndex = 0; funcIndex < funcCount; funcIndex++) {
    const callNodesuffixOrderIndexRangeStart =
      previousRootSuffixOrderIndexRangeEnd;
    const callNodesuffixOrderIndexRangeEnd =
      rootSuffixOrderIndexRangeEndCol[funcIndex];
    previousRootSuffixOrderIndexRangeEnd = callNodesuffixOrderIndexRangeEnd;
    if (
      callNodesuffixOrderIndexRangeStart === callNodesuffixOrderIndexRangeEnd
    ) {
      sourceFramesInlinedIntoSymbol[funcIndex] = null;
      // Leave the remaining columns at zero for this root.
      continue;
    }

    // Fill the remaining fields with the conflict-resolved versions of the values
    // in the non-inverted call node table.
    const firstNonInvertedCallNodeIndex =
      suffixOrderedCallNodes[callNodesuffixOrderIndexRangeStart];
    let resolvedCategory =
      callNodeTable.category[firstNonInvertedCallNodeIndex];
    let resolvedSubcategory =
      callNodeTable.subcategory[firstNonInvertedCallNodeIndex];
    const resolvedInnerWindowID =
      callNodeTable.innerWindowID[firstNonInvertedCallNodeIndex];
    let resolvedSourceFramesInlinedIntoSymbol =
      callNodeTable.sourceFramesInlinedIntoSymbol[
        firstNonInvertedCallNodeIndex
      ];

    // Resolve conflicts in the same way as for the non-inverted call node table.
    for (
      let orderingIndex = callNodesuffixOrderIndexRangeStart + 1;
      orderingIndex < callNodesuffixOrderIndexRangeEnd;
      orderingIndex++
    ) {
      const currentNonInvertedCallNodeIndex =
        suffixOrderedCallNodes[orderingIndex];
      // Resolve category conflicts, by resetting a conflicting subcategory or
      // category to the default category.
      if (
        resolvedCategory !==
        callNodeTable.category[currentNonInvertedCallNodeIndex]
      ) {
        // Conflicting origin stack categories -> default category + subcategory.
        resolvedCategory = defaultCategory;
        resolvedSubcategory = 0;
      } else if (
        resolvedSubcategory !==
        callNodeTable.subcategory[currentNonInvertedCallNodeIndex]
      ) {
        // Conflicting origin stack subcategories -> "Other" subcategory.
        resolvedSubcategory = 0;
      }

      // Resolve "inlined into" conflicts. This can happen if you have two
      // function calls A -> B where only one of the B calls is inlined, or
      // if you use call tree transforms in such a way that a function B which
      // was inlined into two different callers (A -> B, C -> B) gets collapsed
      // into one call node.
      if (
        resolvedSourceFramesInlinedIntoSymbol !==
        callNodeTable.sourceFramesInlinedIntoSymbol[
          currentNonInvertedCallNodeIndex
        ]
      ) {
        // Conflicting inlining: -1.
        resolvedSourceFramesInlinedIntoSymbol = -1;
      }

      // FIXME: Resolve conflicts of InnerWindowID
    }

    category[funcIndex] = resolvedCategory;
    subcategory[funcIndex] = resolvedSubcategory;
    innerWindowID[funcIndex] = resolvedInnerWindowID;
    sourceFramesInlinedIntoSymbol[funcIndex] =
      resolvedSourceFramesInlinedIntoSymbol;
  }

  return {
    category,
    subcategory,
    innerWindowID,
    sourceFramesInlinedIntoSymbol,
    suffixOrderIndexRangeEnd: rootSuffixOrderIndexRangeEndCol,
    length: funcCount,
  };
}

function _createEmptyInvertedNonRootCallNodeTable(): InvertedNonRootCallNodeTable {
  return {
    prefix: [],
    func: [],
    pathHash: [],
    category: [],
    subcategory: [],
    innerWindowID: [],
    sourceFramesInlinedIntoSymbol: [],
    suffixOrderIndexRangeStart: [],
    suffixOrderIndexRangeEnd: [],
    deepNodesForSuffixOrderIndexRange: [],
    depth: [],
    length: 0,
  };
}

type PreparedChildrenAndSpecialChild = {|
  // The node indexes in the inverted tree of this node's children.
  childCallNodes: InvertedCallNodeHandle[],
  // The node index of the child corresponding to specialChildFunc, if found.
  specialChild: InvertedCallNodeHandle | null,
|};

/**
 * This is the implementation of the CallNodeInfoInverted interface.
 */
export class CallNodeInfoInvertedImpl implements CallNodeInfoInverted {
  // The non-inverted call node table.
  _callNodeTable: CallNodeTable;

  // The part of the inverted call node table for the roots of the inverted tree.
  _invertedRootCallNodeTable: InvertedRootCallNodeTable;

  // The dynamically growing part of the inverted call node table for just the
  // non-root nodes. Entries are added to this table as needed, whenever a caller
  // asks us for children of a node for which we haven't needed children before,
  // or when a caller asks us to translate an inverted call path that we haven't
  // seend before to an inverted call node index.
  _invertedNonRootCallNodeTable: InvertedNonRootCallNodeTable;

  // The mapping of non-inverted stack index to non-inverted call node index.
  _stackIndexToNonInvertedCallNodeIndex: Int32Array;

  // The number of roots, which is also the number of functions. Each root of
  // the inverted tree represents a "self" function, i.e. all call paths which
  // end in a certain function.
  // We have roots even for functions which aren't used as "self" functions in
  // any sampled stacks, for simplicity. The actual displayed number of roots
  // in the call tree will usually be lower because roots with a zero total sample
  // count will be filtered out. But any data in this class is fully independent
  // from sample counts.
  _rootCount: number;

  // This is a Map<SuffixOrderIndex, IndexIntoNonInvertedCallNodeTable>.
  // It lists the non-inverted call nodes in "suffix order", i.e. ordered by
  // comparing their call paths from back to front.
  _suffixOrderedCallNodes: Uint32Array;

  // This is the inverse of _suffixOrderedCallNodes; i.e. it is a
  // Map<IndexIntoNonInvertedCallNodeTable, SuffixOrderIndex>.
  _suffixOrderIndexes: Uint32Array;

  // The default category (usually "Other"), used when creating new inverted
  // call nodes based on divergently-categorized functions.
  _defaultCategory: IndexIntoCategoryList;

  // A scratch array of length funcTable.length, which can be used to count the
  // number of occurrences of a function. Used for incremental sorting of call nodes.
  _funcCountBuf: Uint32Array;

  // This is a Map<CallNodePathHash, InvertedCallNodeHandle>. This map speeds up
  // the look-up process by caching every CallNodePath we handle which avoids
  // looking up parents again and again.
  _cache: Map<string, InvertedCallNodeHandle> = new Map();

  // For every inverted call node, the list of its child nodes, if we've computed
  // it already. Computed on-demand by _getOrCreateChildren().
  _children: Map<InvertedCallNodeHandle, InvertedCallNodeHandle[]> = new Map();

  constructor(
    callNodeTable: CallNodeTable,
    stackIndexToNonInvertedCallNodeIndex: Int32Array,
    suffixOrderedCallNodes: Uint32Array, // IndexIntoCallNodeTable[],
    suffixOrderIndexes: Uint32Array, // Map<IndexIntoCallNodeTable, SuffixOrderIndex>,
    rootSuffixOrderIndexRangeEndCol: Uint32Array,
    defaultCategory: IndexIntoCategoryList,
    funcCountBuf: Uint32Array
  ) {
    this._callNodeTable = callNodeTable;
    this._stackIndexToNonInvertedCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex;
    this._suffixOrderedCallNodes = suffixOrderedCallNodes;
    this._suffixOrderIndexes = suffixOrderIndexes;
    this._defaultCategory = defaultCategory;
    this._rootCount = rootSuffixOrderIndexRangeEndCol.length;
    this._funcCountBuf = funcCountBuf;
    this._funcCountBuf.fill(0);
    const invertedRootCallNodeTable = _createInvertedRootCallNodeTable(
      callNodeTable,
      rootSuffixOrderIndexRangeEndCol,
      suffixOrderedCallNodes,
      defaultCategory
    );
    this._invertedRootCallNodeTable = invertedRootCallNodeTable;
    this._invertedNonRootCallNodeTable =
      _createEmptyInvertedNonRootCallNodeTable();
  }

  isInverted(): boolean {
    return true;
  }

  asInverted(): CallNodeInfoInvertedImpl | null {
    return this;
  }

  getNonInvertedCallNodeTable(): CallNodeTable {
    return this._callNodeTable;
  }

  getStackIndexToNonInvertedCallNodeIndex(): Int32Array {
    return this._stackIndexToNonInvertedCallNodeIndex;
  }

  getSuffixOrderedCallNodes(): Uint32Array {
    return this._suffixOrderedCallNodes;
  }

  getSuffixOrderIndexes(): Uint32Array {
    return this._suffixOrderIndexes;
  }

  getFuncCount(): number {
    return this._rootCount;
  }

  isRoot(nodeHandle: InvertedCallNodeHandle): boolean {
    return nodeHandle < this._rootCount;
  }

  getSuffixOrderIndexRangeForCallNode(
    nodeHandle: InvertedCallNodeHandle
  ): [SuffixOrderIndex, SuffixOrderIndex] {
    if (nodeHandle < this._rootCount) {
      const funcIndex = nodeHandle;
      const rangeStart =
        funcIndex === 0
          ? 0
          : this._invertedRootCallNodeTable.suffixOrderIndexRangeEnd[
              funcIndex - 1
            ];
      const rangeEnd =
        this._invertedRootCallNodeTable.suffixOrderIndexRangeEnd[funcIndex];
      return [rangeStart, rangeEnd];
    }
    const nonRootIndex = nodeHandle - this._rootCount;
    const rangeStart =
      this._invertedNonRootCallNodeTable.suffixOrderIndexRangeStart[
        nonRootIndex
      ];
    const rangeEnd =
      this._invertedNonRootCallNodeTable.suffixOrderIndexRangeEnd[nonRootIndex];
    return [rangeStart, rangeEnd];
  }

  /**
   * Materialize inverted call nodes for parentNodeHandle's children in the
   * inverted tree.
   *
   * Some callers of this function are interested in the index of the new child
   * for a specific function. If so, they set specialChildFunc to that function
   * index, and the corresponding child node will be returned in rv.specialChild.
   *
   * This function refines the suffix order so that it's correct for the newly-
   * created children. It also adds entries to this._invertedNonRootCallNodeTable
   * for each child.
   *
   * As we go deeper into the inverted tree, we go higher up in the non-inverted
   * tree: To create the children of an inverted node, we need to look at the
   * parents / "prefixes" of the corresponding non-inverted nodes.
   * For each non-inverted node, we store both its "self" node and its
   * "deep node". For an inverted node at depth k, the deep node is the kth parent
   * of the self node. The deep node's function determines which one of the
   * children in the *inverted* tree the non-inverted node is assigned to.
   */
  _createChildren(
    parentNodeHandle: InvertedCallNodeHandle,
    specialChildFunc: IndexIntoFuncTable | null
  ): PreparedChildrenAndSpecialChild {
    const invertedNonRootCallNodeTable = this._invertedNonRootCallNodeTable;
    const callNodeTable = this._callNodeTable;
    const suffixOrderedCallNodes = this._suffixOrderedCallNodes;
    const suffixOrderIndexes = this._suffixOrderIndexes;

    const parentDeepNodes =
      this._takeDeepNodesForInvertedNode(parentNodeHandle);
    const [parentIndexRangeStart, parentIndexRangeEnd] =
      this.getSuffixOrderIndexRangeForCallNode(parentNodeHandle);
    if (
      parentDeepNodes.length !==
      parentIndexRangeEnd - parentIndexRangeStart
    ) {
      throw new Error('indexes out of sync');
    }

    // We need to sort the next level in [parentIndexRangeStart, parentIndexRangeEnd).
    // To do the sorting, we use a trick from radix sort: First, we traverse the
    // child call nodes and count how many occurrences there are of each func
    // (i.e. build a histogram). Then we iterate over the funcs and compute the
    // start indexes in the sorted array for each func, by accumulating the counts.
    // Then we do another pass over the child call nodes and use the start indexes
    // to put each call node at its new sorted position.
    const countPerFunc = this._funcCountBuf;
    const nodesWhichEndHere = [];

    // These three columns write down { selfNode, deepNode, func } per call node.
    const unsortedCallNodesSelfNodeCol = [];
    const unsortedCallNodesDeepNodeCol = [];
    const unsortedCallNodesFuncCol = [];

    const uniqueFuncs = [];

    // Pass 1: Build a histogram (`countPerFunc`) by traversing the child call nodes.
    // We also build a list of which funcs have non-zero counts, in `uniqueFuncs`.
    // And we write down { selfNode, deepNode, func } per call node.
    for (let i = 0; i < parentDeepNodes.length; i++) {
      const selfNode = suffixOrderedCallNodes[parentIndexRangeStart + i];
      const parentDeepNode = parentDeepNodes[i];
      const deepNode = callNodeTable.prefix[parentDeepNode];
      if (deepNode !== -1) {
        const func = callNodeTable.func[deepNode];
        const previousCountForThisFunc = countPerFunc[func];
        countPerFunc[func] = previousCountForThisFunc + 1;
        if (previousCountForThisFunc === 0) {
          uniqueFuncs.push(func);
        }
        unsortedCallNodesSelfNodeCol.push(selfNode);
        unsortedCallNodesDeepNodeCol.push(deepNode);
        unsortedCallNodesFuncCol.push(func);
      } else {
        nodesWhichEndHere.push(selfNode);
      }
    }

    const childrenCount = uniqueFuncs.length;
    const childrenFuncs = new Uint32Array(uniqueFuncs);
    childrenFuncs.sort(); // Fast typed-array sort

    const childNodesIndexRangeStartCol = new Uint32Array(childrenCount);
    const childNodesIndexRangeEndCol = new Uint32Array(childrenCount);

    const childRangeStart = parentIndexRangeStart + nodesWhichEndHere.length;
    const childRangeLength = unsortedCallNodesFuncCol.length;
    if (childRangeStart + childRangeLength !== parentIndexRangeEnd) {
      throw new Error('indexes out of sync');
    }

    // Pass 2: Compute the accumulated sort index ranges (with the start index
    // going into `nextIndexPerFunc`) for each child node func, based on
    // the counts in the histogram. `previousEndIndex` is the accumulator.
    const nextIndexPerFunc = countPerFunc; // WARNING: We are using the same array for both!
    let previousEndIndex = 0;
    for (let i = 0; i < childrenFuncs.length; i++) {
      const func = childrenFuncs[i];
      const count = countPerFunc[func];
      if (count === 0) {
        throw new Error(
          'childrenFuncs should only contain funcs with non-zero counts'
        );
      }

      const startIndex = previousEndIndex;
      const endIndex = previousEndIndex + count;
      nextIndexPerFunc[func] = startIndex;

      childNodesIndexRangeStartCol[i] = startIndex;
      childNodesIndexRangeEndCol[i] = endIndex;

      previousEndIndex = endIndex;
    }

    // Pass 3: (two loops) Put the call nodes into their new spots in the sorted
    // ordering, with the help of the computed index ranges.

    // BEGIN Apply new ordering. Warning: Between here and "END Apply new ordering",
    // suffixOrderIndexes and suffixOrderedCallNodes will be in an inconsistent state.

    // First, apply the new ordering to nodesWhichEndHere.
    for (let i = 0; i < nodesWhichEndHere.length; i++) {
      const selfNode = nodesWhichEndHere[i];
      const orderingIndex = parentIndexRangeStart + i;
      suffixOrderIndexes[selfNode] = orderingIndex;
      suffixOrderedCallNodes[orderingIndex] = selfNode;
    }

    // Then, apply the new ordering to unsortedCallNodes.
    const childrenDeepNodes = new Uint32Array(childRangeLength);
    for (let i = 0; i < unsortedCallNodesFuncCol.length; i++) {
      const func = unsortedCallNodesFuncCol[i];
      const index = nextIndexPerFunc[func]++;
      const selfNode = unsortedCallNodesSelfNodeCol[i];
      childrenDeepNodes[index] = unsortedCallNodesDeepNodeCol[i];
      const orderingIndex = childRangeStart + index;
      suffixOrderIndexes[selfNode] = orderingIndex;
      suffixOrderedCallNodes[orderingIndex] = selfNode;
    }

    // END apply new ordering.
    // The new ordering has been applied, and suffixOrderIndexes and
    // suffixOrderedCallNodes are well-defined bijections again.

    // Clear nextIndexPerFunc so that we don't need to clear it next time when we reuse it.
    for (let i = 0; i < childrenFuncs.length; i++) {
      const func = childrenFuncs[i];
      nextIndexPerFunc[func] = 0;
    }

    const parentNodeCallPathHash = this._pathHashForNode(parentNodeHandle);
    const childrenDepth = this.depthForNode(parentNodeHandle) + 1;

    const childCallNodes = [];
    let specialChild = null; // will be set to the index corresponding to specialChildFunc
    for (let i = 0; i < childrenFuncs.length; i++) {
      const func = childrenFuncs[i];
      const indexRangeStart = childNodesIndexRangeStartCol[i];
      const indexRangeEnd = childNodesIndexRangeEndCol[i];
      const suffixOrderIndexRangeStart = childRangeStart + indexRangeStart;
      const suffixOrderIndexRangeEnd = childRangeStart + indexRangeEnd;

      const firstNodeNode = childrenDeepNodes[indexRangeStart];
      let currentCategory = callNodeTable.category[firstNodeNode];
      let currentSubcategory = callNodeTable.subcategory[firstNodeNode];
      const currentInnerWindowID = callNodeTable.innerWindowID[firstNodeNode];
      let currentSourceFramesInlinedIntoSymbol =
        callNodeTable.sourceFramesInlinedIntoSymbol[firstNodeNode];

      for (let index = indexRangeStart + 1; index < indexRangeEnd; index++) {
        const nodeNode = childrenDeepNodes[index];

        // Resolve category conflicts, by resetting a conflicting subcategory or
        // category to the default category.
        if (currentCategory !== callNodeTable.category[nodeNode]) {
          // Conflicting origin stack categories -> default category + subcategory.
          currentCategory = this._defaultCategory;
          currentSubcategory = 0;
        } else if (currentSubcategory !== callNodeTable.subcategory[nodeNode]) {
          // Conflicting origin stack subcategories -> "Other" subcategory.
          currentSubcategory = 0;
        }

        // Resolve "inlined into" conflicts. This can happen if you have two
        // function calls A -> B where only one of the B calls is inlined, or
        // if you use call tree transforms in such a way that a function B which
        // was inlined into two different callers (A -> B, C -> B) gets collapsed
        // into one call node.
        if (
          currentSourceFramesInlinedIntoSymbol !==
          callNodeTable.sourceFramesInlinedIntoSymbol[nodeNode]
        ) {
          // Conflicting inlining: -1.
          currentSourceFramesInlinedIntoSymbol = -1;
        }

        // FIXME: Resolve conflicts of InnerWindowID
      }

      const deepNodesForSuffixOrderIndexRange = childrenDeepNodes.subarray(
        indexRangeStart,
        indexRangeEnd
      );

      const newIndex = invertedNonRootCallNodeTable.length++;
      const newHandle = this._rootCount + newIndex;

      const pathHash = concatHash(parentNodeCallPathHash, func);
      invertedNonRootCallNodeTable.prefix[newIndex] = parentNodeHandle;
      invertedNonRootCallNodeTable.func[newIndex] = func;
      invertedNonRootCallNodeTable.pathHash[newIndex] = pathHash;
      invertedNonRootCallNodeTable.category[newIndex] = currentCategory;
      invertedNonRootCallNodeTable.subcategory[newIndex] = currentSubcategory;
      invertedNonRootCallNodeTable.innerWindowID[newIndex] =
        currentInnerWindowID;
      invertedNonRootCallNodeTable.sourceFramesInlinedIntoSymbol[newIndex] =
        currentSourceFramesInlinedIntoSymbol;
      invertedNonRootCallNodeTable.deepNodesForSuffixOrderIndexRange[newIndex] =
        deepNodesForSuffixOrderIndexRange;
      invertedNonRootCallNodeTable.suffixOrderIndexRangeStart[newIndex] =
        suffixOrderIndexRangeStart;
      invertedNonRootCallNodeTable.suffixOrderIndexRangeEnd[newIndex] =
        suffixOrderIndexRangeEnd;
      invertedNonRootCallNodeTable.depth[newIndex] = childrenDepth;
      childCallNodes.push(newHandle);

      this._cache.set(pathHash, newHandle);

      if (func === specialChildFunc) {
        specialChild = newHandle;
      }
    }
    this._children.set(parentNodeHandle, childCallNodes);
    return { childCallNodes, specialChild };
  }

  _getChildWithFunc(
    childrenSortedByFunc: InvertedCallNodeHandle[],
    func: IndexIntoFuncTable
  ): InvertedCallNodeHandle | null {
    // TODO: Use bisection
    for (let i = 0; i < childrenSortedByFunc.length; i++) {
      const childNodeHandle = childrenSortedByFunc[i];
      if (this.funcForNode(childNodeHandle) === func) {
        return childNodeHandle;
      }
    }
    return null;
  }

  _getOrCreateChildren(
    parent: InvertedCallNodeHandle,
    specialChildFunc: IndexIntoFuncTable | null
  ): PreparedChildrenAndSpecialChild {
    const childCallNodes = this._children.get(parent);
    if (childCallNodes === undefined) {
      return this._createChildren(parent, specialChildFunc);
    }

    const specialChild =
      specialChildFunc !== null
        ? this._getChildWithFunc(childCallNodes, specialChildFunc)
        : null;
    return { childCallNodes, specialChild };
  }

  _findDeepestKnownAncestor(callPath: CallNodePath): InvertedCallNodeHandle {
    const completePathNode = this._cache.get(hashPath(callPath));
    if (completePathNode !== undefined) {
      return completePathNode;
    }

    let bestNode = callPath[0];
    let remainingDepthRangeStart = 1;
    let remainingDepthRangeEnd = callPath.length - 1;
    while (remainingDepthRangeStart < remainingDepthRangeEnd) {
      const currentDepth =
        (remainingDepthRangeStart + remainingDepthRangeEnd) >> 1;
      // assert(currentDepth < remainingDepthRangeEnd);
      const currentPartialPath = callPath.slice(0, currentDepth + 1);
      const currentNode = this._cache.get(hashPath(currentPartialPath));
      if (currentNode !== undefined) {
        bestNode = currentNode;
        remainingDepthRangeStart = currentDepth + 1;
      } else {
        remainingDepthRangeEnd = currentDepth;
      }
    }
    return bestNode;
  }

  getChildren(nodeIndex: InvertedCallNodeHandle): InvertedCallNodeHandle[] {
    const { childCallNodes } = this._getOrCreateChildren(nodeIndex, null);
    return childCallNodes;
  }

  /**
   * For an inverted call node whose children haven't been created yet, this
   * returns the "deep nodes" corresponding to its suffix ordered call nodes.
   * A deep node is the k'th parent node of a non-inverted call node, where k
   * is the depth of the *inverted* call node.
   */
  _takeDeepNodesForInvertedNode(
    callNodeHandle: InvertedCallNodeHandle
  ): Uint32Array {
    if (callNodeHandle < this._rootCount) {
      // This is a root.
      const [rangeStart, rangeEnd] =
        this.getSuffixOrderIndexRangeForCallNode(callNodeHandle);
      return this._suffixOrderedCallNodes.subarray(rangeStart, rangeEnd);
    }

    // callNodeHandle is a non-root node.
    const nonRootIndex: IndexIntoInvertedNonRootCallNodeTable =
      callNodeHandle - this._rootCount;
    const deepNodesForSuffixOrderIndexRange = ensureExists(
      this._invertedNonRootCallNodeTable.deepNodesForSuffixOrderIndexRange[
        nonRootIndex
      ],
      '_takeDeepNodesForInvertedNode should only be called once for each node, and only after its parent prepared its children.'
    );
    // Null it out, because we won't need it any more and because the order will
    // be stale.
    this._invertedNonRootCallNodeTable.deepNodesForSuffixOrderIndexRange[
      nonRootIndex
    ] = null;
    return deepNodesForSuffixOrderIndexRange;
  }

  // This function returns a CallNodePath from a InvertedCallNodeHandle.
  getCallNodePathFromIndex(
    callNodeHandle: InvertedCallNodeHandle | null
  ): CallNodePath {
    if (callNodeHandle === null || callNodeHandle === -1) {
      return [];
    }

    const rootCount = this._rootCount;
    const callNodePath = [];
    let currentHandle = callNodeHandle;
    while (currentHandle >= rootCount) {
      const nonRootIndex = currentHandle - rootCount;
      callNodePath.push(this._invertedNonRootCallNodeTable.func[nonRootIndex]);
      currentHandle = this._invertedNonRootCallNodeTable.prefix[nonRootIndex];
    }
    const rootFunc = currentHandle;
    callNodePath.push(rootFunc);
    callNodePath.reverse();
    return callNodePath;
  }

  // Returns a CallNodeIndex from a CallNodePath, using and contributing to the
  // cache parameter.
  getCallNodeIndexFromPath(
    callNodePath: CallNodePath
  ): InvertedCallNodeHandle | null {
    if (callNodePath.length === 0) {
      return null;
    }

    if (callNodePath.length === 1) {
      return callNodePath[0]; // For roots, IndexIntoFuncTable === InvertedCallNodeHandle
    }

    const pathDepth = callNodePath.length - 1;
    let deepestKnownAncestor = this._findDeepestKnownAncestor(callNodePath);
    let deepestKnownAncestorDepth = this.depthForNode(deepestKnownAncestor);

    while (deepestKnownAncestorDepth < pathDepth) {
      const currentChildFunc = callNodePath[deepestKnownAncestorDepth + 1];
      const { specialChild } = this._getOrCreateChildren(
        deepestKnownAncestor,
        currentChildFunc
      );
      if (specialChild === null) {
        // No child matches the func we were looking for.
        // This can happen when the provided call path doesn't exist. In that case
        // we return null.
        return null;
      }
      deepestKnownAncestor = specialChild;
      deepestKnownAncestorDepth++;
    }
    return deepestKnownAncestor;
  }

  // Returns the CallNodeIndex that matches the function `func` and whose parent's
  // CallNodeIndex is `parent`.
  getCallNodeIndexFromParentAndFunc(
    parent: InvertedCallNodeHandle | -1,
    func: IndexIntoFuncTable
  ): InvertedCallNodeHandle | null {
    if (parent === -1) {
      return func; // For roots, IndexIntoFuncTable === InvertedCallNodeHandle
    }
    return this._getOrCreateChildren(parent, func).specialChild;
  }

  _pathHashForNode(callNodeHandle: InvertedCallNodeHandle): string {
    if (callNodeHandle < this._rootCount) {
      return hashPathSingleFunc(callNodeHandle);
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.pathHash[nonRootIndex];
  }

  prefixForNode(
    callNodeHandle: InvertedCallNodeHandle
  ): InvertedCallNodeHandle | -1 {
    if (callNodeHandle < this._rootCount) {
      // This is a root.
      return -1;
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.prefix[nonRootIndex];
  }

  funcForNode(callNodeHandle: InvertedCallNodeHandle): IndexIntoFuncTable {
    if (callNodeHandle < this._rootCount) {
      // This is a root. For roots, InvertedCallNodeHandle === IndexIntoFuncTable.
      return callNodeHandle;
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.func[nonRootIndex];
  }

  categoryForNode(
    callNodeHandle: InvertedCallNodeHandle
  ): IndexIntoCategoryList {
    if (callNodeHandle < this._rootCount) {
      const rootFunc = callNodeHandle;
      return this._invertedRootCallNodeTable.category[rootFunc];
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.category[nonRootIndex];
  }

  subcategoryForNode(
    callNodeHandle: InvertedCallNodeHandle
  ): IndexIntoCategoryList {
    if (callNodeHandle < this._rootCount) {
      const rootFunc = callNodeHandle;
      return this._invertedRootCallNodeTable.subcategory[rootFunc];
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.subcategory[nonRootIndex];
  }

  innerWindowIDForNode(
    callNodeHandle: InvertedCallNodeHandle
  ): IndexIntoCategoryList {
    if (callNodeHandle < this._rootCount) {
      const rootFunc = callNodeHandle;
      return this._invertedRootCallNodeTable.innerWindowID[rootFunc];
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.innerWindowID[nonRootIndex];
  }

  depthForNode(callNodeHandle: InvertedCallNodeHandle): number {
    if (callNodeHandle < this._rootCount) {
      // Roots have depth 0.
      return 0;
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.depth[nonRootIndex];
  }

  sourceFramesInlinedIntoSymbolForNode(
    callNodeHandle: InvertedCallNodeHandle
  ): IndexIntoNativeSymbolTable | -1 | null {
    if (callNodeHandle < this._rootCount) {
      const rootFunc = callNodeHandle;
      return this._invertedRootCallNodeTable.sourceFramesInlinedIntoSymbol[
        rootFunc
      ];
    }
    const nonRootIndex = callNodeHandle - this._rootCount;
    return this._invertedNonRootCallNodeTable.sourceFramesInlinedIntoSymbol[
      nonRootIndex
    ];
  }
}
