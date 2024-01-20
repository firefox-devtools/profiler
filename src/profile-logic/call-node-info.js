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
      // The call node with index 0 is guaruanteed to be a root, by construction
      // of the call node table.
      // Start with node 0 and add its siblings.
      for (
        let root = 0;
        root !== -1;
        root = this._callNodeTable.nextSibling[root]
      ) {
        roots.push(root);
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
  // and deepNodes = deepNodes[x] be its non-null deep nodes.
  // Then, for every index i in suffixOrderIndexRangeStart[x]..suffixOrderIndexRangeEnd[x],
  // the k'th prefix node of suffixOrderedCallNodes[i] is stored at deepNodes[x][i - suffixOrderIndexRangeStart[x]].
  deepNodes: Array<Uint32Array | null>, // IndexIntoInvertedNonRootCallNodeTable -> (Uint32Array | null)

  depth: number[], // IndexIntoInvertedNonRootCallNodeTable -> number
  length: number,
|};

// Compute the "suffix order index range" for each root of the inverted call
// node info, i.e. the range of suffix order indexes so that all non-inverted
// call nodes in that range have a call path which ends with the root's func.
// The returned array `rangeEnd` has just the (exclusive) end of those ranges;
// the start of each range is the end of the previous range, or zero.
//
// More explicitly, the suffix order index range for the inverted root for func X is:
// (X == 0 ? 0 : rangeEnd[X - 1]) .. rangeEnd[X]
function _computeInvertedRootSuffixOrderIndexRanges(
  callNodeTable: CallNodeTable,
  suffixOrderedCallNodes: Uint32Array,
  funcCount: number
): Uint32Array {
  const rootSuffixOrderIndexRangeEndCol = new Uint32Array(funcCount);
  const callNodeCount = suffixOrderedCallNodes.length;

  // suffixOrderedCallNodes is ordered by callNodeTable.func[callNodeIndex].
  // Walk it from front to back and terminate the index ranges whenever the
  // func changes.
  let currentFunc = 0;
  for (let i = 0; i < callNodeCount; i++) {
    const callNodeIndex = suffixOrderedCallNodes[i];
    const callNodeFunc = callNodeTable.func[callNodeIndex];
    // assert(currentFunc <= callNodeFunc, "guaranteed by suffix order")
    // If the current node has a different func from currentFunc, this means
    // that the range for currentFunc ends at i.
    // There may also be funcs with empty ranges between currentFunc and callNodeFunc.
    for (; currentFunc < callNodeFunc; currentFunc++) {
      rootSuffixOrderIndexRangeEndCol[currentFunc] = i;
    }
  }
  // Terminate the current func, and any remaining funcs in the funcTable for
  // which there is no non-inverted call node whose call path ends in that func.
  for (; currentFunc < funcCount; currentFunc++) {
    rootSuffixOrderIndexRangeEndCol[currentFunc] = callNodeCount;
  }

  return rootSuffixOrderIndexRangeEndCol;
}

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

      // Set all columns to zero / null for this root.
      sourceFramesInlinedIntoSymbol[funcIndex] = null;
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

// Information used to create the children of a node in the inverted tree.
type ChildrenInfo = {|
  // The func for each child. Duplicate-free and sorted by func.
  funcPerChild: IndexIntoFuncTable[],
  // The number of deep nodes for each child. Every entry is non-zero.
  deepNodeCountPerChild: number[],
  // The deep nodes of all children, concatenated into a single array.
  // The length of this array is the sum of the values in deepNodeCountPerChild.
  childrenDeepNodes: Uint32Array,
  // The suffixOrderIndexRangeStart of the first child.
  childrenSuffixOrderIndexRangeStart: number,
|};

/**
 * This is the implementation of the CallNodeInfoInverted interface.
 *
 * The most interesting part of this class is the _createChildren method. This is
 * the place where inverted nodes are "materialized" on demand.
 *
 * ## On-demand node creation
 *
 * 1. All root nodes have been created upfront. There is one root per func.
 * 2. The first _createChildren call will be for a root node. We create non-root
 *    nodes for the root's children, and add them to _invertedNonRootCallNodeTable.
 * 3. The next call to _createChildren can be for a non-root node. Again we
 *    create nodes for the children and add them to _invertedNonRootCallNodeTable.
 *
 * For any inverted tree node inX, _invertedNonRootCallNodeTable either contains
 * none or all of inX's children.
 * For any inverted non-root node inQ whose parent node is inP,
 * _createChildren(inP) is called before _createChildren(inQ) is called. That's
 * somewhat obvious: inQ is *created* by the _createChildren(inP) call; without
 * _createChildren(inP) we would not have an inQ to pass to _createChildren(inQ).
 *
 * ### Computation of the children
 *
 * To know what the children of a node in the inverted tree are, we need to look
 * at the parents in the non-inverted tree.
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
 * Inverted roots:
 *                                                 Represents call paths ending in
 * - [in0] A  (so:0..3)        =  A             =            ... A (cn0, cn4, cn2)
 * - [in1] B  (so:3..5)        =  B             =            ... B (cn1, cn5)
 * - [in2] C  (so:5..7)        =  C             =            ... C (cn6, cn3)
 * ```
 *
 * First, let's create the children for in0, which is the root for func A.
 * in0 has three "self nodes": cn0, cn4, and cn2.
 *
 * in0's func is A.
 * cn0, cn4, and cn2 also have func A. Of course; that's what makes them in0's self funcs.
 *
 * To create the children of in0, we need to look at the parents of cn0, cn4, and cn2.
 *
 * cn0 has no parent.
 * cn4's parent is cn0, whose func is A.
 * cn2's parent is cn1, whose func is B.
 *
 * This means that in0 has two children: One for func A and one for func B.
 *
 * Let's create the two children:
 *  - in3: func A, parent in0, self nodes [cn4]
 *  - in4: func B, parent in0, self nodes [cn2]
 *
 * Now we're done!
 *
 * ---
 *
 * Now let's create the children of a non-root node in the inverted tree.
 * We want to create the children for in4.
 * in4 describes the call path suffix "... -> B -> A".
 *
 * in4 has one self node: cn2. This is the only non-inverted node whose call path
 * ends in "... -> B -> A".
 *
 * in4 has depth 1.
 *
 * in4's func is B.
 * cn2's func is A. (!)
 *
 * cn2's func still corresponds to the inverted root, i.e. in0's func.
 * But cn2's parent, cn1, has func B.
 *
 * And cn1's parent, cn0, has func A.
 *
 * So in4 has one child, with func A. Let's create it:
 *  - in5: func A, parent in4, self nodes [cn2]
 *
 * What this example shows is that we need to look not at a self node's immediate
 * parent, but rather at its (k + 1)'th parent, where k is the depth of the
 * inverted node whose children we're creating.
 *
 * ---
 *
 * What are the children of in5?
 *
 * in5 has one self node: cn2.
 * in5 has depth 2.
 *
 * cn2's 0th parent is cn2.
 * cn2's 1st parent is cn1.
 * cn2's 2nd parent (i.e. its grandparent) is cn0.
 * cn2's 3rd parent is ... it does not have one!
 *
 * So in5 has no children.
 *
 * ---
 *
 * Now let's say we want to create the children of an inverted node with depth 20,
 * and it has 500 self nodes. We would need to look at each self node, find its
 * 21st parent node, and then check that node's func.
 *
 * Climbing up the parent chain 20 steps, for each of the 500 self nodes, would
 * be quite expensive. It would be better if we had stored the 20th parent for
 * each of the self nodes, so that we would only need to go up to the immediate
 * parent.
 *
 * So that's what we do. On each inverted node, we don't only store its self
 * nodes, we also store its "deep nodes", i.e. the k'th parent of each self node.
 * Then we only need to look at the immediate parent of each deep node in order
 * to know which children to create for the inverted node.
 *
 * For in0, k is 0, and the deep node for each self node is just the self node
 * itself. (The 0'th parent of a node is that node itself.)
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
 * in5 (depth 2):
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

  // The number of roots, i.e. this._roots.length.
  _rootCount: number;

  // All inverted call tree roots. The roots of the inverted call tree are the
  // "self" functions of the non-inverted call paths.
  _roots: InvertedCallNodeHandle[];

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
    suffixOrderedCallNodes: Uint32Array, // IndexIntoCallNodeTable[],
    suffixOrderIndexes: Uint32Array, // Map<IndexIntoCallNodeTable, SuffixOrderIndex>,
    defaultCategory: IndexIntoCategoryList,
    funcCount: number
  ) {
    this._callNodeTable = callNodeTable;
    this._stackIndexToNonInvertedCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex;
    this._suffixOrderedCallNodes = suffixOrderedCallNodes;
    this._suffixOrderIndexes = suffixOrderIndexes;
    this._defaultCategory = defaultCategory;

    const rootCount = funcCount;
    this._rootCount = rootCount;

    const roots = new Array(rootCount);
    for (let i = 0; i < rootCount; i++) {
      roots[i] = i;
    }
    this._roots = roots;

    const rootSuffixOrderIndexRangeEndCol =
      _computeInvertedRootSuffixOrderIndexRanges(
        callNodeTable,
        suffixOrderedCallNodes,
        funcCount
      );
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

  getRoots(): Array<InvertedCallNodeHandle> {
    return this._roots;
  }

  isRoot(nodeHandle: InvertedCallNodeHandle): boolean {
    return nodeHandle < this._rootCount;
  }

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

    return this._createChildrenForInfo(childrenInfo, parentNodeHandle);
  }

  /**
   * Compute the information needed to create the children of parentNodeHandle.
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
    if (parentIndexRangeStart + parentDeepNodeCount !== parentIndexRangeEnd) {
      throw new Error('indexes out of sync');
    }

    const callNodeTable = this._callNodeTable;

    // Count how many of the parent's deep nodes end at the parent. If there
    // are any, they will all be at the start of the parentDeepNodes array by
    // construction of the suffix order.
    let nodesWhichEndHereCount = 0;
    while (nodesWhichEndHereCount < parentDeepNodeCount) {
      const deepNode = parentDeepNodes[nodesWhichEndHereCount];
      if (callNodeTable.prefix[deepNode] !== -1) {
        break;
      }
      nodesWhichEndHereCount++;
    }

    if (nodesWhichEndHereCount === parentDeepNodeCount) {
      // All deep nodes ended at the parent's depth. The parent has no children.
      return null;
    }

    const childrenDeepNodeCount = parentDeepNodeCount - nodesWhichEndHereCount;
    const childrenDeepNodes = new Uint32Array(childrenDeepNodeCount);
    // assert(childrenDeepNodeCount > 0);

    // Iterate over the remaining deep nodes, get each deep node's prefix,
    // and build up our list of children. For each child, compute its func and
    // its number of deep nodes.

    const firstChildFirstParentDeepNode =
      parentDeepNodes[nodesWhichEndHereCount];
    const firstChildFirstDeepNode =
      callNodeTable.prefix[firstChildFirstParentDeepNode];
    childrenDeepNodes[0] = firstChildFirstDeepNode;
    const firstChildFunc = callNodeTable.func[firstChildFirstDeepNode];

    const deepNodeCountPerChild = [];
    const funcPerChild = [];

    let currentChildFunc = firstChildFunc;
    let currentChildDeepNodeCount = 1;
    for (let j = 1; j < childrenDeepNodeCount; j++) {
      const parentDeepNode = parentDeepNodes[nodesWhichEndHereCount + j];
      const deepNode = callNodeTable.prefix[parentDeepNode];
      childrenDeepNodes[j] = deepNode;
      // assert(deepNode !== -1, "parentDeepNodes is sorted so that all call paths which end at this depth come first (by definition of the suffix order), and we already skipped those");
      const deepNodeFunc = callNodeTable.func[deepNode];
      // assert(currentChildFunc <= deepNodeFunc, "parentDeepNodes is sorted by prefix func, by definition of the suffix order (at least in this range, because the rest of the call path is identical for all nodes in parentDeepNodes)");

      if (deepNodeFunc !== currentChildFunc) {
        funcPerChild.push(currentChildFunc);
        deepNodeCountPerChild.push(currentChildDeepNodeCount);
        currentChildFunc = deepNodeFunc;
        currentChildDeepNodeCount = 0;
      }
      currentChildDeepNodeCount++;
    }
    funcPerChild.push(currentChildFunc);
    deepNodeCountPerChild.push(currentChildDeepNodeCount);

    const childrenSuffixOrderIndexRangeStart =
      parentIndexRangeStart + nodesWhichEndHereCount;

    return {
      funcPerChild,
      deepNodeCountPerChild,
      childrenSuffixOrderIndexRangeStart,
      childrenDeepNodes,
    };
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
   * of suffixOrderedCallNodes[suffixOrderIndexRangeStart + i],
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

  _getChildWithFunc(
    childrenSortedByFunc: InvertedCallNodeHandle[],
    func: IndexIntoFuncTable
  ): InvertedCallNodeHandle | null {
    const index = bisectionRightByKey(childrenSortedByFunc, func, (node) =>
      this.funcForNode(node)
    );
    if (index === 0) {
      return null;
    }
    const childNodeHandle = childrenSortedByFunc[index - 1];
    if (this.funcForNode(childNodeHandle) !== func) {
      return null;
    }
    return childNodeHandle;
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
    // Null it out the stored deep nodes, because we won't need them after this.
    this._invertedNonRootCallNodeTable.deepNodes[nonRootIndex] = null;
    return deepNodes;
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

  // Returns a CallNodeIndex from a CallNodePath.
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
      const children = this.getChildren(deepestKnownAncestor);
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
      deepestKnownAncestor = childMatchingFunc;
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
