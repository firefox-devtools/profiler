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
import { bisectionRightByKey } from '../utils/bisect';

import type {
  IndexIntoFuncTable,
  CallNodeTable,
  CallNodePath,
  IndexIntoCallNodeTable,
  IndexIntoCategoryList,
  IndexIntoNativeSymbolTable,
  IndexIntoSubcategoryListForCategory,
  InnerWindowID,
} from 'firefox-profiler/types';

/**
 * An interface that's implemented in both the non-inverted and in the inverted
 * case. The two CallNodeInfo implementations wrap the call node table and
 * provide associated functionality.
 */
export interface CallNodeInfo {
  // If true, call node indexes describe nodes in the inverted call tree.
  isInverted(): boolean;

  // Returns this object as CallNodeInfoInverted if isInverted(), otherwise null.
  asInverted(): CallNodeInfoInverted | null;

  // Returns the non-inverted call node table.
  // This is always the non-inverted call node table, regardless of isInverted().
  getNonInvertedCallNodeTable(): CallNodeTable;

  // Returns a mapping from the stack table to the non-inverted call node table.
  // The Int32Array should be used as if it were a
  // Map<IndexIntoStackTable, IndexIntoCallNodeTable | -1>.
  //
  // All entries are >= 0.
  // This always maps to the non-inverted call node table, regardless of isInverted().
  getStackIndexToNonInvertedCallNodeIndex(): Int32Array;

  // Converts a call node index into a call node path.
  getCallNodePathFromIndex(
    callNodeIndex: IndexIntoCallNodeTable | null
  ): CallNodePath;

  // Converts a call node path into a call node index.
  getCallNodeIndexFromPath(
    callNodePath: CallNodePath
  ): IndexIntoCallNodeTable | null;

  // Returns the call node index that matches the function `func` and whose
  // parent's index  is `parent`. If `parent` is -1, this returns the index of
  // the root node with function `func`.
  // Returns null if the described call node doesn't exist.
  getCallNodeIndexFromParentAndFunc(
    parent: IndexIntoCallNodeTable | -1,
    func: IndexIntoFuncTable
  ): IndexIntoCallNodeTable | null;

  // These functions return various properties about each node. You could also
  // get these properties from the call node table, but that only works if the
  // call node is a non-inverted call node (because we only have a non-inverted
  // call node table). If your code is generic over inverted / non-inverted mode,
  // and you just have a IndexIntoCallNodeTable and a CallNodeInfo instance,
  // call the functions below.

  prefixForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable | -1;
  funcForNode(callNodeIndex: IndexIntoCallNodeTable): IndexIntoFuncTable;
  categoryForNode(callNodeIndex: IndexIntoCallNodeTable): IndexIntoCategoryList;
  subcategoryForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCategoryList;
  innerWindowIDForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCategoryList;
  depthForNode(callNodeIndex: IndexIntoCallNodeTable): number;
  sourceFramesInlinedIntoSymbolForNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoNativeSymbolTable | -1 | -2;
}

/**
 * The implementation of the CallNodeInfo interface for the non-inverted tree.
 */
export class CallNodeInfoNonInverted implements CallNodeInfo {
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
      const hash = sliceHashes.pop()!;
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
  ): IndexIntoNativeSymbolTable | -1 | -2 {
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
type InvertedRootCallNodeTable = {
  category: Int32Array; // IndexIntoFuncTable -> IndexIntoCategoryList
  subcategory: Int32Array; // IndexIntoFuncTable -> IndexIntoSubcategoryListForCategory
  innerWindowID: Float64Array; // IndexIntoFuncTable -> InnerWindowID
  // IndexIntoNativeSymbolTable: all frames that collapsed into this call node inlined into the same native symbol
  // -1: divergent: some, but not all, frames that collapsed into this call node were inlined, or they are from different symbols
  // -2: no inlining
  sourceFramesInlinedIntoSymbol: Int32Array; // IndexIntoFuncTable -> IndexIntoNativeSymbolTable | -1 | -2
  // The (exclusive) end of the suffix order index range for each root node.
  // The beginning of the range is given by suffixOrderIndexRangeEnd[i - 1], or by
  // zero. This is possible because both the inverted root order and the suffix order
  // are determined by the func order.
  suffixOrderIndexRangeEnd: Uint32Array; // IndexIntoFuncTable -> SuffixOrderIndex,
  length: number;
};

// Information about the non-root nodes of the inverted call tree. This table
// grows on-demand, as new inverted call nodes are materialized.
type InvertedNonRootCallNodeTable = {
  prefix: InvertedCallNodeHandle[];
  func: IndexIntoFuncTable[]; // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoFuncTable
  pathHash: string[]; // IndexIntoInvertedNonRootCallNodeTable -> string
  category: IndexIntoCategoryList[]; // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoCategoryList
  subcategory: IndexIntoSubcategoryListForCategory[]; // IndexIntoInvertedNonRootCallNodeTable -> IndexIntoSubcategoryListForCategory
  innerWindowID: InnerWindowID[]; // IndexIntoInvertedNonRootCallNodeTable -> InnerWindowID
  // IndexIntoNativeSymbolTable: all frames that collapsed into this call node inlined into the same native symbol
  // -1: divergent: some, but not all, frames that collapsed into this call node were inlined, or they are from different symbols
  // -2: no inlining
  sourceFramesInlinedIntoSymbol: Array<IndexIntoNativeSymbolTable | -1 | -2>;
  suffixOrderIndexRangeStart: SuffixOrderIndex[]; // IndexIntoInvertedNonRootCallNodeTable -> SuffixOrderIndex
  suffixOrderIndexRangeEnd: SuffixOrderIndex[]; // IndexIntoInvertedNonRootCallNodeTable -> SuffixOrderIndex

  // Non-null for non-root nodes whose children haven't been created yet.
  // The array at index x caches ancestors of the non-inverted nodes belonging
  // to the inverted node x, specifically the ancestor "k steps up" from each
  // non-inverted node, with k being the depth of the inverted node.
  // This is useful to quickly compute the children for this inverted node.
  // Afterwards it's set to null for that index, and the next level is passed on
  // to the newly-created children.
  // Please refer to 'Why do we keep a "deepNodes" property in the inverted table?'
  // in the comment on CallNodeInvertedImpl below for a more detailed explanation.
  //
  // For every inverted non-root call node x with deepNodes[x] !== null:
  //   For every suffix order index i in suffixOrderIndexRangeStart[x]..suffixOrderIndexRangeEnd[x],
  //   the k'th parent node of suffixOrderedCallNodes[i] is stored at
  //   deepNodes[x][i - suffixOrderIndexRangeStart[x]], with k = depth[x].
  deepNodes: Array<Uint32Array | null>; // IndexIntoInvertedNonRootCallNodeTable -> (Uint32Array | null)

  depth: number[]; // IndexIntoInvertedNonRootCallNodeTable -> number
  length: number;
};

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
  const sourceFramesInlinedIntoSymbol = new Int32Array(funcCount);
  let previousRootSuffixOrderIndexRangeEnd = 0;
  for (let funcIndex = 0; funcIndex < funcCount; funcIndex++) {
    const callNodeSuffixOrderIndexRangeStart =
      previousRootSuffixOrderIndexRangeEnd;
    const callNodeSuffixOrderIndexRangeEnd =
      rootSuffixOrderIndexRangeEndCol[funcIndex];
    previousRootSuffixOrderIndexRangeEnd = callNodeSuffixOrderIndexRangeEnd;
    if (
      callNodeSuffixOrderIndexRangeStart === callNodeSuffixOrderIndexRangeEnd
    ) {
      // This root is never actually displayed in the inverted tree. It
      // corresponds to a func which has no self time - no non-inverted node has
      // this func as its self func. This root only exists for simplicity, so
      // that there is one root per func.

      // Set a dummy value for this unused root.
      sourceFramesInlinedIntoSymbol[funcIndex] = -2; // "no symbol"
      // (the other columns are already initialized to zero because they're
      // typed arrays)
      continue;
    }

    // Fill the remaining fields with the conflict-resolved versions of the values
    // in the non-inverted call node table.
    const firstNonInvertedCallNodeIndex =
      suffixOrderedCallNodes[callNodeSuffixOrderIndexRangeStart];
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
      let orderingIndex = callNodeSuffixOrderIndexRangeStart + 1;
      orderingIndex < callNodeSuffixOrderIndexRangeEnd;
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
    deepNodes: [],
    depth: [],
    length: 0,
  };
}

// The return type of _computeSuffixOrderForInvertedRoots.
//
// This is not the fully-refined suffix order; you could say that it's
// refined up to depth zero. It is refined enough so that every root has a
// contiguous range in the suffix order, where each range contains the root's
// corresponding non-inverted nodes.
type SuffixOrderForInvertedRoots = {
  suffixOrderedCallNodes: Uint32Array;
  suffixOrderIndexes: Uint32Array;
  rootSuffixOrderIndexRangeEndCol: Uint32Array;
};

/**
 * Computes an ordering for the non-inverted call node table where all
 * non-inverted call nodes are ordered by their self func.
 *
 * This function is very performance sensitive. The number of non-inverted call
 * nodes can be very high, e.g. ~3 million for https://share.firefox.dev/3N56qMu
 */
function _computeSuffixOrderForInvertedRoots(
  nonInvertedCallNodeTable: CallNodeTable,
  funcCount: number
): SuffixOrderForInvertedRoots {
  // Rather than using Array.prototype.sort, this function uses the technique
  // used by "radix sort":
  //
  //  1. Count the occurrences per key, i.e. the number of call nodes per func.
  //  2. Reserve slices in the sorted space, by accumulating the counts into a
  //     start index per partition.
  //  3. Put the unsorted values into their sorted spots, incrementing the
  //     per-partition next index as we go.
  //
  // This is much faster, and it also makes it easier to compute the inverse
  // mapping (suffixOrderIndexes) and the rootSuffixOrderIndexRangeEndCol.

  // Pass 1: Compute, per func, how many non-inverted call nodes end in this func.
  const nodeCountPerFunc = new Uint32Array(funcCount);
  const callNodeCount = nonInvertedCallNodeTable.length;
  const callNodeTableFuncCol = nonInvertedCallNodeTable.func;
  for (let i = 0; i < callNodeCount; i++) {
    const func = callNodeTableFuncCol[i];
    nodeCountPerFunc[func]++;
  }

  // Pass 2: Compute cumulative start index based on the counts.
  const startIndexPerFunc = nodeCountPerFunc; // Warning: we are reusing the same array
  let nextFuncStartIndex = 0;
  for (let func = 0; func < startIndexPerFunc.length; func++) {
    const count = nodeCountPerFunc[func];
    startIndexPerFunc[func] = nextFuncStartIndex;
    nextFuncStartIndex += count;
  }

  // Pass 3: Compute the new ordering based on the reserved slices in startIndexPerFunc.
  const nextIndexPerFunc = startIndexPerFunc;
  const suffixOrderedCallNodes = new Uint32Array(callNodeCount);
  const suffixOrderIndexes = new Uint32Array(callNodeCount);
  for (let callNode = 0; callNode < callNodeCount; callNode++) {
    const func = callNodeTableFuncCol[callNode];
    const orderIndex = nextIndexPerFunc[func]++;
    suffixOrderedCallNodes[orderIndex] = callNode;
    suffixOrderIndexes[callNode] = orderIndex;
  }

  // The indexes in nextIndexPerFunc have now been advanced such that they point
  // at the end of each partition.
  const rootSuffixOrderIndexRangeEndCol = startIndexPerFunc;

  return {
    suffixOrderedCallNodes,
    suffixOrderIndexes,
    rootSuffixOrderIndexRangeEndCol,
  };
}

// Information used to create the children of a node in the inverted tree.
type ChildrenInfo = {
  // The func for each child. Duplicate-free and sorted by func.
  funcPerChild: Uint32Array; // IndexIntoFuncTable[]
  // The number of deep nodes for each child. Every entry is non-zero.
  deepNodeCountPerChild: Uint32Array;
  // The subset of the parent's self nodes which are not part of childrenSelfNodes.
  selfNodesWhichEndAtParent: IndexIntoCallNodeTable[];
  // The self nodes and their corresponding deep nodes for all children, each
  // flattened into a single array.
  // The length of these arrays is the sum of the values in deepNodeCountPerChild.
  childrenSelfNodes: Uint32Array;
  childrenDeepNodes: Uint32Array;
  // The suffixOrderIndexRangeStart of the first child.
  childrenSuffixOrderIndexRangeStart: number;
};

// An index into SuffixOrderedCallNodes.
export type SuffixOrderIndex = number;

/**
 * The CallNodeInfo implementation for the inverted tree, with additional
 * functionality for the inverted call tree.
 *
 * # The Suffix Order
 *
 * We define an alternative ordering of the *non-inverted* call nodes, called the
 * "suffix order", which is useful when interacting with the *inverted* tree.
 * The suffix order is stored by two Uint32Array side tables, returned by
 * getSuffixOrderedCallNodes() and getSuffixOrderIndexes().
 * getSuffixOrderedCallNodes() maps a suffix order index to a non-inverted call
 * node, and getSuffixOrderIndexes() is the reverse, mapping a non-inverted call
 * node to its suffix order index.
 *
 * ## Background
 *
 * Many operations we do in the profiler require the ability to do an efficient
 * "ancestor" check:
 *
 *  - For a call node X in the call tree, what's its "total"?
 *  - When call node X in the call tree is selected, which samples should be
 *    highlighted in the activity graph, and which samples should contribute to
 *    the category breakdown in the sidebar?
 *  - For how many samples has the clicked call node X been observed in a certain
 *    line of code / in a certain instruction?
 *
 * We answer these questions by iterating over samples, getting the sample's
 * call node Y, and checking whether the selected / clicked node X is an ancestor
 * of Y.
 *
 * In the non-inverted call tree, the ordering in the call node table gives us a
 * quick way to do these checks: For a call node X, all its descendant call nodes
 * are in a contiguous range between X and callNodeTable.subtreeRangeEnd[X].
 *
 * We want to have a similar ability for the *inverted* call tree, but without
 * computing a full inverted call node table. The suffix order gives us this
 * ability. It's based on the following insights:
 *
 *  1. Non-inverted call nodes are "enough" for many purposes even in inverted mode:
 *
 *     When doing the per-sample checks listed above, we don't need an *inverted*
 *     call node for each sample. We just need an inverted call node for the
 *     clicked / selected node, and then we can check if the sample's
 *     *non-inverted* call node contributes to the selected / clicked *inverted*
 *     call node.
 *     A non-inverted call node is just a representation of a call path. You can
 *     read that call path from front to back, or you can read it from back to
 *     front. If you read it from back to front that's the inverted call path.
 *
 *  2. We can store multiple different orderings of the non-inverted call node
 *     table.
 *
 *     The non-inverted call node table remains ordered in depth-first traversal
 *     order of the non-inverted tree, as described in the "Call node ordering"
 *     section on the CallNodeTable type. The suffix order is an additional,
 *     alternative ordering that we store on the side.
 *
 * ## Definition
 *
 * We define the suffix order as the lexicographic order of the inverted call path.
 * Or as the lexicographic order of the non-inverted call paths "when reading back to front".
 *
 * D -> B comes before A -> C, because B comes before C.
 * D -> B comes after A -> B, because B == B and D comes after A.
 * D -> B comes before A -> D -> B, because B == B, D == D, and "end of path" comes before A.
 *
 * ## Example
 *
 * ### Non-inverted call tree:
 *
 * Legend:
 *
 * cnX: Non-inverted call node index X
 * soX: Suffix order index X
 *
 * ```
 *   Tree            Left aligned    Right aligned        Reordered by suffix
 * - [cn0] A      =  A            =            A [so0]    [so0] [cn0] A
 *   - [cn1] B    =  A -> B       =       A -> B [so3]    [so1] [cn4] A <- A
 *     - [cn2] A  =  A -> B -> A  =  A -> B -> A [so2] ↘↗ [so2] [cn2] A <- B <- A
 *     - [cn3] C  =  A -> B -> C  =  A -> B -> C [so6] ↗↘ [so3] [cn1] B <- A
 *   - [cn4] A    =  A -> A       =       A -> A [so1]    [so4] [cn5] B <- A <- A
 *     - [cn5] B  =  A -> A -> B  =  A -> A -> B [so4]    [so5] [cn6] C <- A
 *   - [cn6] C    =  A -> C       =       A -> C [so5]    [so6] [cn3] C <- B <- A
 * ```
 *
 * ### Inverted call tree:
 *
 * Legend, continued:
 *
 * inX:     Inverted call node index X (this index is somewhat arbitrary because
 *          it's based on the order in which callNodeInfoInverted.getChildren is
 *          called)
 * so:X..Y: Suffix order index range soX..soY (soY excluded)
 *
 * ```
 *                                                 Represents call paths ending in
 * - [in0] A  (so:0..3)        =  A             =            ... A (cn0, cn4, cn2)
 *   - [in3] A  (so:1..2)      =  A <- A        =       ... A -> A (cn4)
 *   - [in4] B  (so:2..3)      =  A <- B        =       ... B -> A (cn2)
 *     - [in6] A  (so:2..3)    =  A <- B <- A   =  ... A -> B -> A (cn2)
 * - [in1] B  (so:3..5)        =  B             =            ... B (cn1, cn5)
 *   - [in5] A  (so:3..5)      =  B <- A        =       ... A -> B (cn1, cn5)
 *     - [in10] A  (so:4..5)   =  B <- A <- A   =  ... A -> A -> B (cn5)
 * - [in2] C  (so:5..7)        =  C             =            ... C (cn6, cn3)
 *   - [in7] A  (so:5..6)      =  C <- A        =       ... A -> C (cn6)
 *   - [in8] B  (so:6..7)      =  C <- B        =       ... B -> C (cn3)
 *     - [in9] A  (so:6..7)    =  C <- B <- A   =  ... A -> B -> C (cn3)
 * ```
 *
 * In the suffix order, call paths become grouped in such a way that call paths
 * which belong to the same *inverted* tree node (i.e. which share a suffix) end
 * up ordered next to each other. This makes it so that a node in the inverted
 * tree can refer to all its represented call paths with a single contiguous range.
 *
 * In this example, inverted tree node `in5` represents all call paths which end
 * in A -> B. Both `cn1` and `cn5` do so; `cn1` is A -> B and `cn5` is A -> A -> B.
 * In the suffix order, `cn1` and `cn5` end up next to each other, at positions
 * `so3` and `so4`. This means that the two paths can be referred to via the suffix
 * order index range 3..5.
 *
 * Suffix ordered call nodes: [0, 4, 2, 1, 5, 6, 3] (soX -> cnY)
 * Suffix order indexes:      [0, 3, 2, 6, 1, 4, 5] (cnX -> soY)
 *
 * ## Incremental order refinement
 *
 * Sorting all non-inverted nodes upfront would take a long time on large profiles.
 * So we don't do that. Instead, we refine the order as new inverted tree nodes
 * are materialized on demand.
 *
 * The ground rules are:
 *  - For any inverted call node X, getSuffixOrderIndexRangeForCallNode(X) must
 *    always return the same range.
 *  - For any inverted call node X, the *set* of suffix ordered call nodes in the
 *    range returned by getSuffixOrderIndexRangeForCallNode(X) must always be the
 *    same. Notably, the order in the range does *not* necessarily need to remain
 *    the same.
 *
 * This means that, whenever you have a handle X of an inverted call node, you
 * can be confident that your checks of the form "is non-inverted call node Y
 * part of X's range" will work correctly.
 *
 * # On-demand node creation
 *
 * Inverted nodes are created in this order:
 *
 * 1. All root nodes have been created upfront. There is one root per func.
 * 2. The first _createChildren call will be for a root node. We create non-root
 *    nodes for the root's children, and add them to _invertedNonRootCallNodeTable.
 * 3. The next call to _createChildren can be for a non-root node. Again we
 *    create nodes for the children and add them to _invertedNonRootCallNodeTable.
 *
 * Example:
 *
 * ```
 * Non-inverted tree:
 *
 *   Tree            Left aligned    Right aligned
 * - [cn0] A      =  A            =            A [so0]
 *   - [cn1] B    =  A -> B       =       A -> B [so3]
 *     - [cn2] A  =  A -> B -> A  =  A -> B -> A [so2]
 *     - [cn3] C  =  A -> B -> C  =  A -> B -> C [so6]
 *   - [cn4] A    =  A -> A       =       A -> A [so1]
 *     - [cn5] B  =  A -> A -> B  =  A -> A -> B [so4]
 *   - [cn6] C    =  A -> C       =       A -> C [so5]
 *
 * Inverted tree:
 *                                                 Represents call paths ending in
 * - [in0] A  (so:0..3)        =  A             =            ... A (cn0, cn4, cn2)
 *   - [in3] A  (so:1..2)      =  A <- A        =       ... A -> A (cn4)
 *   - [in4] B  (so:2..3)      =  A <- B        =       ... B -> A (cn2)
 *     - [in6] A  (so:2..3)    =  A <- B <- A   =  ... A -> B -> A (cn2)
 * - [in1] B  (so:3..5)        =  B             =            ... B (cn1, cn5)
 *   - [in5] A  (so:3..5)      =  B <- A        =       ... A -> B (cn1, cn5)
 *     - [in10] A  (so:4..5)   =  B <- A <- A   =  ... A -> A -> B (cn5)
 * - [in2] C  (so:5..7)        =  C             =            ... C (cn6, cn3)
 *   - [in7] A  (so:5..6)      =  C <- A        =       ... A -> C (cn6)
 *   - [in8] B  (so:6..7)      =  C <- B        =       ... B -> C (cn3)
 *     - [in9] A  (so:6..7)    =  C <- B <- A   =  ... A -> B -> C (cn3)
 * ```
 *
 * This inverted tree was built up as follows:
 *
 * Iteration 0: We create all roots.            New nodes: in0, in1, in2
 * Iteration 1: _createChildren(in0) is called. New nodes: in3, in4
 * Iteration 2: _createChildren(in1) is called. New nodes: in5
 * Iteration 3: _createChildren(in4) is called. New nodes: in6
 * Iteration 4: _createChildren(in2) is called. New nodes: in7, in8
 * Iteration 5: _createChildren(in8) is called. New nodes: in9
 * Iteration 6: _createChildren(in5) is called. New nodes: in10
 *
 * The order of the _createChildren calls depends on how the user interacts with the
 * call tree. The user could uncollapse call tree nodes in a different order,
 * which would cause _createChildren to be called in a different order, and the
 * inverted nodes we create would have different indexes.
 *
 * There are two invariants about "which inverted nodes exist" at any given time:
 *
 * 1. For any inverted tree node inX, _invertedNonRootCallNodeTable either contains
 *    all or none of inX's children.
 * 2. For any inverted non-root node `inQ` with parent node `inP`,
 *    _createChildren(inP) is called before _createChildren(inQ) is called. That's
 *    somewhat obvious: inQ is *created* by the _createChildren(inP) call; without
 *    _createChildren(inP) we would not have an inQ to pass to _createChildren(inQ).
 *
 * ## Computation of the children
 *
 * How do we know which children to create? We look at the parents in the
 * *non-inverted* tree.
 *
 * First, let's create the children for the root `in0` (func: A, depth 0).
 * in0 has three "self nodes": cn0 (func: A), cn4 (func: A), and cn2 (func: A).
 *
 * To create the children of in0, we need to look at the parents of cn0, cn4, and cn2.
 *
 * cn0 has no parent.
 * cn4's parent is cn0 (func: A).
 * cn2's parent is cn1 (func: B).
 *
 * This means that in0 has two children: One for func A and one for func B.
 *
 * Let's create the two children:
 *  - in3: func A, parent in0, depth 1, self nodes [cn4]
 *  - in4: func B, parent in0, depth 1, self nodes [cn2]
 *
 * ### Why do we keep a "deepNodes" property in the inverted table?
 *
 * In the next few paragraphs, we'll explain why we need to constantly iterate
 * over the non-inverted parents, and that the "deepNodes" property is a cache
 * to make it faster. Keep reading!
 *
 * Let's create the children of the non-root node in4 (func: B, depth 1).
 * in4 represents the call path suffix "... -> B -> A".
 *
 * in4 has one self node: cn2 (func: A). cn2 is the only non-inverted node
 * whose call path ends in "... -> B -> A".
 *
 * cn2's 0th parent (i.e. itself) is cn2 (func: A).
 * cn2's 1st parent is cn1 (func: B).
 * cn2's 2nd parent (i.e. its grandparent) is cn0 (func: A). <-- func A
 *
 * So in4 has one child, with func A. Let's create it:
 *  - in6: func A, parent in4, depth 2, self nodes [cn2]
 *
 * This example shows that, if we create inverted children of depth 2,
 * we need to look at the grandparent ("2nd parent") of each self node.
 *
 * ---
 *
 * Let's try to go one level deeper and create the children of in6 (func A, depth 2):
 *
 * in6 has one self node: cn2.
 * in6 has depth 2, its children would have depth 3.
 *
 * cn2's 0th parent is cn2 (func: A).
 * cn2's 1st parent is cn1 (func: B).
 * cn2's 2nd parent is cn0 (func: A).
 * cn2's 3rd parent is ... it does not have one!
 *
 * So in6 has no children.
 *
 * ---
 *
 * More generically, we've shown that, in order to create inverted children of
 * depth k, we need to look at the k'th parent of all self nodes for the inverted
 * node whose children we're creating.
 *
 * If we had to get those k'th parent nodes from the self node all the time, we
 * would spend a lot of time walking up the non-inverted tree! For example, if
 * we wanted to create the children of an inverted node with depth 20, if that
 * node had 500 self nodes, we would need to find the 21st parent node of each of
 * those 500 self nodes!
 *
 * Walking up 21 steps is a bit silly, because we already walked up 20 steps for
 * the same nodes when we created the inverted parent. Can we just store the result
 * of the 20-step walk, and reuse it? Yes we can!
 *
 * So that's what why we have the "deepNodes" cache: On each inverted node, we
 * don't only store its self nodes, we also store its "deep nodes", i.e. the k'th
 * parent of each self node, with k being the depth of the inverted node.
 * Then we only need to look at the immediate parent of each deep node in order
 * to know which children to create for the inverted node.
 *
 * For an inverted root such as in0, k is 0, and the deep node for each self node
 * is just the self node itself. (The 0'th parent of a node is that node itself.)
 *
 * in0:
 * |-----------|-------------------------|
 * | self node | corresponding deep node |
 * |-----------|-------------------------|
 * | cn0       | cn0                     |
 * | cn4       | cn4                     |
 * | cn2       | cn2                     |
 * |-----------|-------------------------|
 *
 * For in4, k is 1, and the deep node for each self node is the self node's
 * immediate parent.
 *
 * in4:
 * |-----------|-------------------------|
 * | self node | corresponding deep node |
 * |-----------|-------------------------|
 * | cn2       | cn1                     |
 * |-----------|-------------------------|
 *
 * in6 (depth 2):
 * |-----------|-------------------------|
 * | self node | corresponding deep node |
 * |-----------|-------------------------|
 * | cn2       | cn0                     |
 * |-----------|-------------------------|
 *
 * So whenever we create the children of an inverted node, we start with its
 * deep nodes and get their immediate parents. These parents become the deep
 * nodes of the newly-created children. We store them on each new child. And
 * this saves time because we don't have to walk up the parent chain by more
 * than one step.
 *
 * Once we've created the children of an inverted node, we can discard its own
 * deep nodes. They're not needed anymore. So _takeDeepNodesForInvertedNode
 * nulls out the stored deepNodes for an inverted node when it's called.
 */
export class CallNodeInfoInverted implements CallNodeInfo {
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

  // This is a Map<CallNodePathHash, InvertedCallNodeHandle>. This map speeds up
  // the look-up process by caching every CallNodePath we handle which avoids
  // repeatedly looking up parents.
  _cache: Map<string, InvertedCallNodeHandle> = new Map();

  // For every inverted call node, the list of its child nodes, if we've computed
  // it already. Entries are inserted by getChildren().
  _children: Map<InvertedCallNodeHandle, InvertedCallNodeHandle[]> = new Map();

  constructor(
    callNodeTable: CallNodeTable,
    stackIndexToNonInvertedCallNodeIndex: Int32Array,
    defaultCategory: IndexIntoCategoryList,
    funcCount: number
  ) {
    this._callNodeTable = callNodeTable;
    this._stackIndexToNonInvertedCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex;

    const {
      suffixOrderedCallNodes,
      suffixOrderIndexes,
      rootSuffixOrderIndexRangeEndCol,
    } = _computeSuffixOrderForInvertedRoots(callNodeTable, funcCount);

    this._suffixOrderedCallNodes = suffixOrderedCallNodes;
    this._suffixOrderIndexes = suffixOrderIndexes;
    this._defaultCategory = defaultCategory;
    this._rootCount = funcCount;

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

  asInverted(): CallNodeInfoInverted | null {
    return this;
  }

  getNonInvertedCallNodeTable(): CallNodeTable {
    return this._callNodeTable;
  }

  getStackIndexToNonInvertedCallNodeIndex(): Int32Array {
    return this._stackIndexToNonInvertedCallNodeIndex;
  }

  // Get a mapping SuffixOrderIndex -> IndexIntoNonInvertedCallNodeTable.
  // This array contains all non-inverted call node indexes, ordered by
  // call path suffix. See "suffix order" in the documentation above.
  // Note that the contents of this array will be mutated by CallNodeInfoInverted
  // when new inverted nodes are created on demand (e.g. during a call to
  // getChildren or to getCallNodeIndexFromPath). So callers should not hold on
  // to this array across calls which can create new inverted call nodes.
  getSuffixOrderedCallNodes(): Uint32Array {
    return this._suffixOrderedCallNodes;
  }

  // Returns the inverse of getSuffixOrderedCallNodes(), i.e. a mapping
  // IndexIntoNonInvertedCallNodeTable -> SuffixOrderIndex.
  // Note that the contents of this array will be mutated by CallNodeInfoInverted
  // when new inverted nodes are created on demand (e.g. during a call to
  // getChildren or to getCallNodeIndexFromPath). So callers should not hold on
  // to this array across calls which can create new inverted call nodes.
  getSuffixOrderIndexes(): Uint32Array {
    return this._suffixOrderIndexes;
  }

  // Get the number of functions. There is one root per function.
  // So this is also the number of roots at the same time.
  // The inverted call node index for a root is the same as the function index.
  getFuncCount(): number {
    return this._rootCount;
  }

  // Returns whether the given node is a root node.
  isRoot(nodeHandle: InvertedCallNodeHandle): boolean {
    return nodeHandle < this._rootCount;
  }

  // Get the [start, exclusiveEnd] range of suffix order indexes for this
  // inverted tree node. This lets you list the non-inverted call nodes which
  // "contribute to" the given inverted call node. Or put differently, it lets
  // you iterate over the non-inverted call nodes whose call paths "end with"
  // the call path suffix represented by the inverted node.
  // By the definition of the suffix order, all non-inverted call nodes whose
  // call path ends with the suffix defined by the inverted call node `callNodeIndex`
  // will be in a contiguous range in the suffix order.
  getSuffixOrderIndexRangeForCallNode(
    nodeHandle: InvertedCallNodeHandle
  ): [SuffixOrderIndex, SuffixOrderIndex] {
    if (nodeHandle < this._rootCount) {
      // nodeHandle is a root. For roots, the node handle IS the func index.
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
   * The returned array of call node handles is sorted by func.
   */
  _createChildren(
    parentNodeHandle: InvertedCallNodeHandle
  ): InvertedCallNodeHandle[] {
    const parentDeepNodes =
      this._takeDeepNodesForInvertedNode(parentNodeHandle);
    const childrenInfo = this._computeChildrenInfo(
      parentNodeHandle,
      parentDeepNodes
    );
    if (childrenInfo === null) {
      // This node has no children.
      return [];
    }

    this._applyRefinedSuffixOrderForNode(
      parentNodeHandle,
      childrenInfo.selfNodesWhichEndAtParent,
      childrenInfo.childrenSelfNodes
    );

    return this._createChildrenForInfo(childrenInfo, parentNodeHandle);
  }

  /**
   * Compute the information needed to create the children of parentNodeHandle,
   * and the information needed to refine the suffix order for the parent's
   * suffix order index range.
   *
   * As we go deeper into the inverted tree, we go higher up in the non-inverted
   * tree: To create the children of an inverted node, we need to look at the
   * parents / "prefixes" of the corresponding non-inverted "deep nodes".
   *
   * See the class documentation for more details and examples.
   */
  _computeChildrenInfo(
    parentNodeHandle: InvertedCallNodeHandle,
    parentDeepNodes: Uint32Array
  ): ChildrenInfo | null {
    const parentDeepNodeCount = parentDeepNodes.length;
    const [parentIndexRangeStart, parentIndexRangeEnd] =
      this.getSuffixOrderIndexRangeForCallNode(parentNodeHandle);
    const parentSelfNodes = this._suffixOrderedCallNodes.subarray(
      parentIndexRangeStart,
      parentIndexRangeEnd
    );

    if (parentSelfNodes.length !== parentDeepNodes.length) {
      throw new Error('indexes out of sync');
    }

    // We have the parent's self nodes and their corresponding deep nodes.
    // These nodes are currently only sorted up to the parent's depth:
    // we know that every parentDeepNode has the parent's func.
    // But if we look at the prefix of each parentDeepNode, we'll encounter
    // funcs in an arbitrary order.
    //
    // It is this function's responsibility to come up with a re-arranged order
    // such that each of the newly-created child nodes can have a contiguous
    // range of suffix ordered call nodes.
    //
    // To compute the new order, we do the following:
    //
    //  1. We iterate over all the deep nodes in the parent's range, and count
    //     how many there are, per deep node func.
    //  2. We reserve space based on those counts, by computing a start index
    //     for each collection of deep nodes (one partition per func).
    //  3. We create ordered arrays, by taking the unordered nodes and putting
    //     them in the right spot based on the computed start indexes.
    //
    // The parent may also have deep nodes which don't have a prefix. We track
    // those separately. Once the suffix order is updated, the corresponding
    // self nodes for these deep nodes will come *before* the ordered-by-func
    // nodes.

    // These three columns write down { selfNode, deepNode, func } per
    // non-inverted call node in the parent's range, but only for the nodes
    // where the deep node has a parent. If the deep node does not have a
    // parent, then it's not relevant for the inverted node's children, and its
    // corresponding self node is stored in `selfNodesWhichEndHere`.
    const unsortedCallNodesSelfNodeCol = [];
    const unsortedCallNodesDeepNodeCol = [];
    const unsortedCallNodesFuncCol = [];

    const selfNodesWhichEndHere = [];

    // Pass 1: Count the deep nodes per func, and build up a list of funcs.
    // We will need to create a child for each deep node func, and each child will
    // need to know how many deep nodes it has.
    const deepNodeCountPerFunc = new Map();
    const callNodeTable = this._callNodeTable;
    for (let i = 0; i < parentDeepNodeCount; i++) {
      const selfNode = parentSelfNodes[i];
      const parentDeepNode = parentDeepNodes[i];
      const deepNode = callNodeTable.prefix[parentDeepNode];
      if (deepNode !== -1) {
        const func = callNodeTable.func[deepNode];
        const previousCountForThisFunc = deepNodeCountPerFunc.get(func);
        if (previousCountForThisFunc === undefined) {
          deepNodeCountPerFunc.set(func, 1);
        } else {
          deepNodeCountPerFunc.set(func, previousCountForThisFunc + 1);
        }

        unsortedCallNodesSelfNodeCol.push(selfNode);
        unsortedCallNodesDeepNodeCol.push(deepNode);
        unsortedCallNodesFuncCol.push(func);
      } else {
        selfNodesWhichEndHere.push(selfNode);
      }
    }

    const nodesWhichEndHereCount = selfNodesWhichEndHere.length;
    const childrenDeepNodeCount = unsortedCallNodesDeepNodeCol.length;
    if (
      nodesWhichEndHereCount + childrenDeepNodeCount !==
      parentDeepNodeCount
    ) {
      throw new Error('indexes out of sync');
    }

    if (nodesWhichEndHereCount === parentDeepNodeCount) {
      // All deep nodes ended at the parent's depth. The parent has no children.
      // Also, the suffix order is already fully refined for the parent's range.
      return null;
    }

    // We create one child for each distinct func we found. We order the children
    // by func so that _getChildWithFunc can use bisection.
    const funcPerChild = new Uint32Array(deepNodeCountPerFunc.keys());
    funcPerChild.sort(); // Fast typed-array sort
    const childCount = funcPerChild.length;

    // Pass 2: Using the counts in deepNodeCountPerFunc, reserve the right amount
    // of slots in the sorted arrays, by computing accumulated start indexes in
    // startIndexPerChild.
    // These start indexes slice the range 0..childrenDeepNodeCount into
    // partitions; one partition per child, in the right order.
    const startIndexPerChild = new Uint32Array(childCount);
    const deepNodeCountPerChild = new Uint32Array(childCount);
    const funcToChildIndex = new Map();

    let nextChildStartIndex = 0;
    for (let childIndex = 0; childIndex < childCount; childIndex++) {
      const func = funcPerChild[childIndex];
      funcToChildIndex.set(func, childIndex);

      const deepNodeCount = ensureExists(deepNodeCountPerFunc.get(func));
      deepNodeCountPerChild[childIndex] = deepNodeCount;
      startIndexPerChild[childIndex] = nextChildStartIndex;
      nextChildStartIndex += deepNodeCount;
    }

    // Pass 3: Compute the ordered selfNode and deepNode arrays.
    const nextIndexPerChild = startIndexPerChild;
    const childrenDeepNodes = new Uint32Array(childrenDeepNodeCount);
    const childrenSelfNodes = new Uint32Array(childrenDeepNodeCount);
    for (let i = 0; i < childrenDeepNodeCount; i++) {
      const func = unsortedCallNodesFuncCol[i];
      const childIndex = ensureExists(funcToChildIndex.get(func));

      const selfNode = unsortedCallNodesSelfNodeCol[i];
      const deepNode = unsortedCallNodesDeepNodeCol[i];

      const newIndex = nextIndexPerChild[childIndex]++;
      childrenDeepNodes[newIndex] = deepNode;
      childrenSelfNodes[newIndex] = selfNode;
    }

    const childrenSuffixOrderIndexRangeStart =
      parentIndexRangeStart + nodesWhichEndHereCount;

    return {
      funcPerChild,
      deepNodeCountPerChild,
      childrenSuffixOrderIndexRangeStart,
      selfNodesWhichEndAtParent: selfNodesWhichEndHere,
      childrenSelfNodes,
      childrenDeepNodes,
    };
  }

  /**
   * Within the suffix order index range of the given inverted node call node,
   * replace the current suffixOrderedCallNodes with
   * [...selfNodesWhichEndHere, ...selfNodesOrderedByDeepFunc].
   * Those must be the same nodes, just in a different order.
   *
   * This updates both this._suffixOrderedCallNodes and this._suffixOrderIndexes
   * so that the two remain in sync.
   *
   * After this call, the suffix order will be accurate up to depth k + 1 for
   * the given range, k being the depth of the inverted call node identified by
   * nodeHandle.
   *
   * Preconditions:
   *  - All call nodes in the range must share the call path suffix which is
   *    represented by the inverted node `nodeHandle`; the length of this suffix
   *    is k + 1 (because nodeHandle's depth in the inverted tree is k).
   *  - selfNodesWhichEndHere must be the subset of call nodes in that range
   *    which do not have a (k + 1)'th parent.
   *  - selfNodesOrderedByDeepFunc must be the subset of call nodes which *do*
   *    have a (k + 1)'th parent, and they must be ordered by that parent's func.
   */
  _applyRefinedSuffixOrderForNode(
    nodeHandle: InvertedCallNodeHandle,
    selfNodesWhichEndHere: IndexIntoCallNodeTable[],
    selfNodesOrderedByDeepFunc: Uint32Array
  ) {
    const [suffixOrderIndexRangeStart, suffixOrderIndexRangeEnd] =
      this.getSuffixOrderIndexRangeForCallNode(nodeHandle);
    const suffixOrderIndexes = this._suffixOrderIndexes;
    const suffixOrderedCallNodes = this._suffixOrderedCallNodes;

    let nextSuffixOrderIndex = suffixOrderIndexRangeStart;
    for (let i = 0; i < selfNodesWhichEndHere.length; i++) {
      const selfNode = selfNodesWhichEndHere[i];
      const orderIndex = nextSuffixOrderIndex++;
      suffixOrderIndexes[selfNode] = orderIndex;
      suffixOrderedCallNodes[orderIndex] = selfNode;
    }
    for (let i = 0; i < selfNodesOrderedByDeepFunc.length; i++) {
      const selfNode = selfNodesOrderedByDeepFunc[i];
      const orderIndex = nextSuffixOrderIndex++;
      suffixOrderIndexes[selfNode] = orderIndex;
      suffixOrderedCallNodes[orderIndex] = selfNode;
    }

    if (nextSuffixOrderIndex !== suffixOrderIndexRangeEnd) {
      throw new Error('Indexes out of sync');
    }
  }

  /**
   * Create the children for parentNodeHandle based on the information in
   * childrenInfo.
   *
   * Returns the handles of the created children. The returned array is ordered
   * by func.
   */
  _createChildrenForInfo(
    childrenInfo: ChildrenInfo,
    parentNodeHandle: InvertedCallNodeHandle
  ): InvertedCallNodeHandle[] {
    const parentNodeCallPathHash = this._pathHashForNode(parentNodeHandle);
    const childrenDepth = this.depthForNode(parentNodeHandle) + 1;

    const {
      funcPerChild,
      deepNodeCountPerChild,
      childrenSuffixOrderIndexRangeStart,
      childrenDeepNodes,
    } = childrenInfo;

    const childCount = funcPerChild.length;
    const childCallNodes = [];
    let nextChildDeepNodeIndex = 0;
    let nextChildSuffixOrderIndexRangeStart =
      childrenSuffixOrderIndexRangeStart;
    for (let childIndex = 0; childIndex < childCount; childIndex++) {
      const func = funcPerChild[childIndex];
      const deepNodeCount = deepNodeCountPerChild[childIndex];

      const suffixOrderIndexRangeStart = nextChildSuffixOrderIndexRangeStart;
      const childDeepNodes = childrenDeepNodes.subarray(
        nextChildDeepNodeIndex,
        nextChildDeepNodeIndex + deepNodeCount
      );
      nextChildSuffixOrderIndexRangeStart += deepNodeCount;
      nextChildDeepNodeIndex += deepNodeCount;

      const childHandle = this._createNonRootNode(
        func,
        childDeepNodes,
        suffixOrderIndexRangeStart,
        childrenDepth,
        parentNodeHandle,
        parentNodeCallPathHash
      );
      childCallNodes.push(childHandle);
    }
    return childCallNodes;
  }

  /**
   * Create a single non-root node in this._invertedNonRootCallNodeTable and
   * return its handle.
   *
   * All deepNodes have the same func, matching the func of this new inverted node.
   *
   * For all i in 0..deepNodes.length, deepNodes[i] is the k'th parent node
   * of suffixOrderedCallNodes[suffixOrderIndexRangeStart + i] in the non-inverted tree,
   * with k being the depth of the new inverted node.
   */
  _createNonRootNode(
    func: IndexIntoFuncTable,
    deepNodes: Uint32Array,
    suffixOrderIndexRangeStart: number,
    depth: number,
    parentNodeHandle: InvertedCallNodeHandle,
    parentNodeCallPathHash: string
  ): InvertedCallNodeHandle {
    const deepNodeCount = deepNodes.length;
    // assert(deepNodeCount > 0);

    const callNodeTable = this._callNodeTable;

    const firstDeepNode = deepNodes[0];
    let currentCategory = callNodeTable.category[firstDeepNode];
    let currentSubcategory = callNodeTable.subcategory[firstDeepNode];
    const currentInnerWindowID = callNodeTable.innerWindowID[firstDeepNode];
    let currentSourceFramesInlinedIntoSymbol =
      callNodeTable.sourceFramesInlinedIntoSymbol[firstDeepNode];

    const invertedNonRootCallNodeTable = this._invertedNonRootCallNodeTable;
    for (let i = 1; i < deepNodeCount; i++) {
      const deepNode = deepNodes[i];

      // Resolve category conflicts, by resetting a conflicting subcategory or
      // category to the default category.
      if (currentCategory !== callNodeTable.category[deepNode]) {
        // Conflicting origin stack categories -> default category + subcategory.
        currentCategory = this._defaultCategory;
        currentSubcategory = 0;
      } else if (currentSubcategory !== callNodeTable.subcategory[deepNode]) {
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
        callNodeTable.sourceFramesInlinedIntoSymbol[deepNode]
      ) {
        // Conflicting inlining: -1.
        currentSourceFramesInlinedIntoSymbol = -1;
      }

      // FIXME: Resolve conflicts of InnerWindowID
    }

    const newIndex = invertedNonRootCallNodeTable.length++;
    const newHandle = this._rootCount + newIndex;

    const pathHash = concatHash(parentNodeCallPathHash, func);
    invertedNonRootCallNodeTable.prefix[newIndex] = parentNodeHandle;
    invertedNonRootCallNodeTable.func[newIndex] = func;
    invertedNonRootCallNodeTable.pathHash[newIndex] = pathHash;
    invertedNonRootCallNodeTable.category[newIndex] = currentCategory;
    invertedNonRootCallNodeTable.subcategory[newIndex] = currentSubcategory;
    invertedNonRootCallNodeTable.innerWindowID[newIndex] = currentInnerWindowID;
    invertedNonRootCallNodeTable.sourceFramesInlinedIntoSymbol[newIndex] =
      currentSourceFramesInlinedIntoSymbol;
    invertedNonRootCallNodeTable.deepNodes[newIndex] = deepNodes;
    invertedNonRootCallNodeTable.suffixOrderIndexRangeStart[newIndex] =
      suffixOrderIndexRangeStart;
    invertedNonRootCallNodeTable.suffixOrderIndexRangeEnd[newIndex] =
      suffixOrderIndexRangeStart + deepNodeCount;
    invertedNonRootCallNodeTable.depth[newIndex] = depth;

    this._cache.set(pathHash, newHandle);
    return newHandle;
  }

  /**
   * Returns the array of child node handles for the given inverted call node.
   * The returned array of call node handles is sorted by func.
   */
  getChildren(nodeIndex: InvertedCallNodeHandle): InvertedCallNodeHandle[] {
    let childCallNodes = this._children.get(nodeIndex);
    if (childCallNodes === undefined) {
      childCallNodes = this._createChildren(nodeIndex);
      this._children.set(nodeIndex, childCallNodes);
    }
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
      // The "deep nodes" of a root are just the suffix ordered call nodes of the root.
      // Going by the definition above, k == 0 (because the depth of the inverted
      // call node is zero), and the 0'th parent of the non-inverted call nodes is
      // just that node itself.
      const [rangeStart, rangeEnd] =
        this.getSuffixOrderIndexRangeForCallNode(callNodeHandle);
      return this._suffixOrderedCallNodes.subarray(rangeStart, rangeEnd);
    }

    // callNodeHandle is a non-root node.
    const nonRootIndex: IndexIntoInvertedNonRootCallNodeTable =
      callNodeHandle - this._rootCount;
    const deepNodes = ensureExists(
      this._invertedNonRootCallNodeTable.deepNodes[nonRootIndex],
      '_takeDeepNodesForInvertedNode should only be called once for each node, and only after its parent created its children.'
    );
    // Null it out the stored deep nodes, because we won't need them after this,
    // and because their order may become out of sync after refinement.
    this._invertedNonRootCallNodeTable.deepNodes[nonRootIndex] = null;
    return deepNodes;
  }

  // This function returns an inverted CallNodePath from a InvertedCallNodeHandle.
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

  // Returns a CallNodeIndex from an inverted CallNodePath.
  //
  // This method will lazily populate new items in the table on demand, when
  // necessary.
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

    // Get the deepest ancestor already present in the inverted table.
    let deepestExistingInvertedAncestorNode =
      this._findDeepestExistingInvertedAncestorNode(callNodePath);
    let deepestExistingInvertedAncestorNodeDepth = this.depthForNode(
      deepestExistingInvertedAncestorNode
    );

    // Now create the necessary children until the end of the requested call node path.
    while (deepestExistingInvertedAncestorNodeDepth < pathDepth) {
      const currentChildFunc =
        callNodePath[deepestExistingInvertedAncestorNodeDepth + 1];
      const children = this.getChildren(deepestExistingInvertedAncestorNode);
      const childMatchingFunc = this._getChildWithFunc(
        children,
        currentChildFunc
      );
      if (childMatchingFunc === null) {
        // No child matches the func we were looking for.
        // This can happen when the provided call path doesn't exist. In that case
        // we return null.
        return null;
      }
      deepestExistingInvertedAncestorNode = childMatchingFunc;
      deepestExistingInvertedAncestorNodeDepth++;
    }
    return deepestExistingInvertedAncestorNode;
  }

  // If the inverted call path `callPath` describes an existing inverted node,
  // return its handle. Otherwise, the node for `callPath` doesn't exist yet, and
  // we need to find an ancestor node for which we haven't called `_createChildren`
  // yet. This ancestor is the "deepest existing" ancestor. That's the node which
  // this function returns.
  _findDeepestExistingInvertedAncestorNode(
    callPath: CallNodePath
  ): InvertedCallNodeHandle {
    const completePathNode = this._cache.get(hashPath(callPath));
    if (completePathNode !== undefined) {
      return completePathNode;
    }

    // Find the depth of the deepest existing ancestor node using bisection.
    // For each tested depth `currentDepth`, we create a partial inverted call
    // path `callPath.slice(0, currentDepth + 1)` and check whether we have an
    // inverted node for that partial call path. We find the largest value of
    // `currentDepth` for which the partial call path refers to an existing node,
    // and set `bestNode` to that node.
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

  // Return the element in `childrenSortedByFunc` whose func matches `func`, or
  // null if no such element exist.
  _getChildWithFunc(
    childrenSortedByFunc: InvertedCallNodeHandle[],
    func: IndexIntoFuncTable
  ): InvertedCallNodeHandle | null {
    // Use bisection to find the right child. This is valid because the caller
    // promises that the array is sorted by func.
    // As a reminder, the returned index is where the func would be inserted in
    // the sorted array, at the right of potentially equal values.
    const index = bisectionRightByKey(childrenSortedByFunc, func, (node) =>
      this.funcForNode(node)
    );
    if (index === 0) {
      return null;
    }

    // If a child with our func is present in the array, it'll be left of the
    // "insertion position", i.e. at childrenSortedByFunc[index - 1].
    const childNodeHandle = childrenSortedByFunc[index - 1];
    if (this.funcForNode(childNodeHandle) !== func) {
      return null;
    }
    return childNodeHandle;
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
    const children = this.getChildren(parent);
    return this._getChildWithFunc(children, func);
  }

  _pathHashForNode(callNodeHandle: InvertedCallNodeHandle): string {
    if (callNodeHandle < this._rootCount) {
      // callNodeHandle is a root, and for roots, InvertedCallNodeHandle === IndexIntoFuncTable.
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
  ): IndexIntoNativeSymbolTable | -1 | -2 {
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
