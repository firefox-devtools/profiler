/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';
import { oneLine } from 'common-tags';
import {
  resourceTypes,
  getEmptyUnbalancedNativeAllocationsTable,
  getEmptyBalancedNativeAllocationsTable,
  getEmptyStackTable,
  getEmptyCallNodeTable,
  shallowCloneFrameTable,
  shallowCloneFuncTable,
} from './data-structures';
import { CallNodeInfoImpl } from './call-node-info';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';
import { timeCode } from 'firefox-profiler/utils/time-code';
import { bisectionRight, bisectionLeft } from 'firefox-profiler/utils/bisect';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import {
  assertExhaustiveCheck,
  ensureExists,
  getFirstItemFromSet,
} from 'firefox-profiler/utils/flow';

import type {
  Profile,
  Thread,
  SamplesTable,
  StackTable,
  FrameTable,
  FuncTable,
  NativeSymbolTable,
  ResourceTable,
  CategoryList,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
  IndexIntoFuncTable,
  IndexIntoSamplesTable,
  IndexIntoStackTable,
  IndexIntoResourceTable,
  IndexIntoNativeSymbolTable,
  ThreadIndex,
  Category,
  Counter,
  CounterSamplesTable,
  NativeAllocationsTable,
  InnerWindowID,
  BalancedNativeAllocationsTable,
  IndexIntoFrameTable,
  PageList,
  CallNodeInfo,
  CallNodeTable,
  CallNodePath,
  CallNodeAndCategoryPath,
  IndexIntoCallNodeTable,
  AccumulatedCounterSamples,
  SamplesLikeTable,
  SelectedState,
  ProfileFilterPageData,
  Milliseconds,
  StartEndRange,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  EventDelayInfo,
  ThreadsKey,
  resourceTypeEnum,
  MarkerPayload,
  Address,
  AddressProof,
  TimelineType,
  NativeSymbolInfo,
  BottomBoxInfo,
  Bytes,
  ThreadWithReservedFunctions,
  TabID,
} from 'firefox-profiler/types';
import type { UniqueStringArray } from 'firefox-profiler/utils/unique-string-array';

/**
 * Various helpers for dealing with the profile as a data structure.
 * @module profile-data
 */

/**
 * Generate the non-inverted CallNodeInfo for a thread.
 */
export function getCallNodeInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  defaultCategory: IndexIntoCategoryList
): CallNodeInfo {
  const { callNodeTable, stackIndexToCallNodeIndex } = computeCallNodeTable(
    stackTable,
    frameTable,
    funcTable,
    defaultCategory
  );
  return new CallNodeInfoImpl(
    callNodeTable,
    callNodeTable,
    stackIndexToCallNodeIndex,
    stackIndexToCallNodeIndex,
    false
  );
}

type CallNodeTableAndStackMap = {
  callNodeTable: CallNodeTable,
  // IndexIntoStackTable -> IndexIntoCallNodeTable
  stackIndexToCallNodeIndex: Int32Array,
};

/**
 * Generate the CallNodeTable, and a map to convert an IndexIntoStackTable to a
 * IndexIntoCallNodeTable. This function runs through a stackTable, and
 * de-duplicates stacks that have frames that point to the same function.
 *
 * See `src/types/profile-derived.js` for the type definitions.
 * See `docs-developer/call-trees.md` for a detailed explanation of CallNodes.
 */
export function computeCallNodeTable(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  defaultCategory: IndexIntoCategoryList
): CallNodeTableAndStackMap {
  return timeCode('getCallNodeInfo', () => {
    const stackIndexToCallNodeIndex = new Int32Array(stackTable.length);

    // The callNodeTable components.
    const prefix: Array<IndexIntoCallNodeTable> = [];
    const firstChild: Array<IndexIntoCallNodeTable> = [];
    const nextSibling: Array<IndexIntoCallNodeTable> = [];
    const func: Array<IndexIntoFuncTable> = [];
    const category: Array<IndexIntoCategoryList> = [];
    const subcategory: Array<IndexIntoSubcategoryListForCategory> = [];
    const innerWindowID: Array<InnerWindowID> = [];
    const sourceFramesInlinedIntoSymbol: Array<
      IndexIntoNativeSymbolTable | -1 | null,
    > = [];
    let length = 0;

    // An extra column that only gets used while the table is built up: For each
    // node A, currentLastChild[A] tracks the last currently-known child node of A.
    // It is updated whenever a new node is created; e.g. creating node B updates
    // currentLastChild[prefix[B]].
    // currentLastChild[A] is -1 while A has no children.
    const currentLastChild: Array<IndexIntoCallNodeTable> = [];

    // The last currently-known root node, i.e. the last known "child of -1".
    let currentLastRoot = -1;

    function addCallNode(
      prefixIndex: IndexIntoCallNodeTable,
      funcIndex: IndexIntoFuncTable,
      categoryIndex: IndexIntoCategoryList,
      subcategoryIndex: IndexIntoSubcategoryListForCategory,
      windowID: InnerWindowID,
      inlinedIntoSymbol: IndexIntoNativeSymbolTable | null
    ) {
      const index = length++;
      prefix[index] = prefixIndex;
      func[index] = funcIndex;
      category[index] = categoryIndex;
      subcategory[index] = subcategoryIndex;
      innerWindowID[index] = windowID;
      sourceFramesInlinedIntoSymbol[index] = inlinedIntoSymbol;

      // Initialize these firstChild and nextSibling to -1. They will be updated
      // once this node's first child or next sibling gets created.
      firstChild[index] = -1;
      nextSibling[index] = -1;
      currentLastChild[index] = -1;

      // Update the next sibling of our previous sibling, and the first child of
      // our prefix (if we're the first child).
      // Also set this node's depth.
      if (prefixIndex === -1) {
        // This node is a root. Just update the previous root's nextSibling. Because
        // this node has no parent, there's also no firstChild information to update.
        if (currentLastRoot !== -1) {
          nextSibling[currentLastRoot] = index;
        }
        currentLastRoot = index;
      } else {
        // This node is not a root: update both firstChild and nextSibling information
        // when appropriate.
        const prevSiblingIndex = currentLastChild[prefixIndex];
        if (prevSiblingIndex === -1) {
          // This is the first child for this prefix.
          firstChild[prefixIndex] = index;
        } else {
          nextSibling[prevSiblingIndex] = index;
        }
        currentLastChild[prefixIndex] = index;
      }
    }

    // Go through each stack, and create a new callNode table, which is based off of
    // functions rather than frames.
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      // We know that at this point the following condition holds:
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixCallNode =
        prefixStack === null ? -1 : stackIndexToCallNodeIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const categoryIndex = stackTable.category[stackIndex];
      const subcategoryIndex = stackTable.subcategory[stackIndex];
      const inlinedIntoSymbol =
        frameTable.inlineDepth[frameIndex] > 0
          ? frameTable.nativeSymbol[frameIndex]
          : null;
      const funcIndex = frameTable.func[frameIndex];

      // Check if the call node for this stack already exists.
      let callNodeIndex = -1;
      if (stackIndex !== 0) {
        const currentFirstSibling =
          prefixCallNode === -1 ? 0 : firstChild[prefixCallNode];
        for (
          let currentSibling = currentFirstSibling;
          currentSibling !== -1;
          currentSibling = nextSibling[currentSibling]
        ) {
          if (func[currentSibling] === funcIndex) {
            callNodeIndex = currentSibling;
            break;
          }
        }
      }

      if (callNodeIndex === -1) {
        const windowID = frameTable.innerWindowID[frameIndex] || 0;

        // New call node.
        callNodeIndex = length;
        addCallNode(
          prefixCallNode,
          funcIndex,
          categoryIndex,
          subcategoryIndex,
          windowID,
          inlinedIntoSymbol
        );
      } else {
        // There is already a call node for this function. Use it, and check if
        // there are any conflicts between the various stack nodes that have been
        // merged into it.

        // Resolve category conflicts, by resetting a conflicting subcategory or
        // category to the default category.
        if (category[callNodeIndex] !== categoryIndex) {
          // Conflicting origin stack categories -> default category + subcategory.
          category[callNodeIndex] = defaultCategory;
          subcategory[callNodeIndex] = 0;
        } else if (subcategory[callNodeIndex] !== subcategoryIndex) {
          // Conflicting origin stack subcategories -> "Other" subcategory.
          subcategory[callNodeIndex] = 0;
        }

        // Resolve "inlined into" conflicts. This can happen if you have two
        // function calls A -> B where only one of the B calls is inlined, or
        // if you use call tree transforms in such a way that a function B which
        // was inlined into two different callers (A -> B, C -> B) gets collapsed
        // into one call node.
        if (
          sourceFramesInlinedIntoSymbol[callNodeIndex] !== inlinedIntoSymbol
        ) {
          // Conflicting inlining: -1.
          sourceFramesInlinedIntoSymbol[callNodeIndex] = -1;
        }
      }
      stackIndexToCallNodeIndex[stackIndex] = callNodeIndex;
    }
    return _createCallNodeTableFromUnorderedComponents(
      prefix,
      firstChild,
      nextSibling,
      func,
      category,
      subcategory,
      innerWindowID,
      sourceFramesInlinedIntoSymbol,
      length,
      stackIndexToCallNodeIndex
    );
  });
}

/**
 * Create a CallNodeTableAndStackMap with an ordered call node table based on
 * the pieces of an unordered call node table.
 *
 * The order of siblings is maintained.
 * If a node A has children, its first child B directly follows A.
 * Otherwise, the node following A is A's next sibling (if it has one), or the
 * next sibling of the closest ancestor which has a next sibling.
 * This means that any node and all its descendants are laid out contiguously.
 */
function _createCallNodeTableFromUnorderedComponents(
  prefix: Array<IndexIntoCallNodeTable>,
  firstChild: Array<IndexIntoFuncTable>,
  nextSibling: Array<IndexIntoFuncTable>,
  func: Array<IndexIntoFuncTable>,
  category: Array<IndexIntoCategoryList>,
  subcategory: Array<IndexIntoSubcategoryListForCategory>,
  innerWindowID: Array<InnerWindowID>,
  sourceFramesInlinedIntoSymbol: Array<IndexIntoNativeSymbolTable | -1 | null>,
  length: number,
  stackIndexToCallNodeIndex: Int32Array
): CallNodeTableAndStackMap {
  return timeCode('createCallNodeInfoFromUnorderedComponents', () => {
    if (length === 0) {
      return {
        callNodeTable: getEmptyCallNodeTable(),
        stackIndexToCallNodeIndex: new Int32Array(0),
      };
    }

    const prefixSorted = new Int32Array(length);
    const nextSiblingSorted = new Int32Array(length);
    const subtreeRangeEndSorted = new Uint32Array(length);
    const funcSorted = new Int32Array(length);
    const categorySorted = new Int32Array(length);
    const subcategorySorted = new Int32Array(length);
    const innerWindowIDSorted = new Float64Array(length);
    const sourceFramesInlinedIntoSymbolSorted = new Array(length);
    const depthSorted = new Array(length);
    let maxDepth = 0;

    // Traverse the entire tree, as follows:
    //  1. nextOldIndex is the next node in DFS order. Copy over all values from
    //     the unsorted columns into the sorted columns.
    //  2. Find the next node in DFS order, set nextOldIndex to it, and continue
    //     to the next loop iteration.
    const oldIndexToNewIndex = new Uint32Array(length);
    let nextOldIndex = 0;
    let nextNewIndex = 0;
    let currentDepth = 0;
    let currentOldPrefix = -1;
    let currentNewPrefix = -1;
    while (nextOldIndex !== -1) {
      const oldIndex = nextOldIndex;
      const newIndex = nextNewIndex;
      oldIndexToNewIndex[oldIndex] = newIndex;
      nextNewIndex++;

      prefixSorted[newIndex] = currentNewPrefix;
      funcSorted[newIndex] = func[oldIndex];
      categorySorted[newIndex] = category[oldIndex];
      subcategorySorted[newIndex] = subcategory[oldIndex];
      innerWindowIDSorted[newIndex] = innerWindowID[oldIndex];
      sourceFramesInlinedIntoSymbolSorted[newIndex] =
        sourceFramesInlinedIntoSymbol[oldIndex];
      depthSorted[newIndex] = currentDepth;
      // The remaining two columns, nextSiblingSorted and subtreeRangeEndSorted,
      // will be filled in when we get to the end of the current subtree.

      // Find the next index in DFS order: If we have children, then our first child
      // is next. Otherwise, we need to advance to our next sibling, if we have one,
      // otherwise to the next sibling of the first ancestor which has one.
      const oldFirstChild = firstChild[oldIndex];
      if (oldFirstChild !== -1) {
        // We have children. Our first child is the next node in DFS order.
        currentOldPrefix = oldIndex;
        currentNewPrefix = newIndex;
        nextOldIndex = oldFirstChild;
        currentDepth++;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
        }
        continue;
      }

      // We have no children. The next node is the next sibling of this node or
      // of an ancestor node. Now is also a good time to fill in the values for
      // subtreeRangeEnd and nextSibling.
      subtreeRangeEndSorted[newIndex] = nextNewIndex;
      nextOldIndex = nextSibling[oldIndex];
      nextSiblingSorted[newIndex] = nextOldIndex === -1 ? -1 : nextNewIndex;
      while (nextOldIndex === -1 && currentOldPrefix !== -1) {
        subtreeRangeEndSorted[currentNewPrefix] = nextNewIndex;
        const oldPrefixNextSibling = nextSibling[currentOldPrefix];
        nextSiblingSorted[currentNewPrefix] =
          oldPrefixNextSibling === -1 ? -1 : nextNewIndex;
        nextOldIndex = oldPrefixNextSibling;
        currentOldPrefix = prefix[currentOldPrefix];
        currentNewPrefix = prefixSorted[currentNewPrefix];
        currentDepth--;
      }
    }

    const callNodeTable: CallNodeTable = {
      prefix: prefixSorted,
      subtreeRangeEnd: subtreeRangeEndSorted,
      nextSibling: nextSiblingSorted,
      func: funcSorted,
      category: categorySorted,
      subcategory: subcategorySorted,
      innerWindowID: innerWindowIDSorted,
      sourceFramesInlinedIntoSymbol: sourceFramesInlinedIntoSymbolSorted,
      depth: depthSorted,
      maxDepth,
      length,
    };

    return {
      callNodeTable,
      stackIndexToCallNodeIndex: stackIndexToCallNodeIndex.map(
        (oldIndex) => oldIndexToNewIndex[oldIndex]
      ),
    };
  });
}

/**
 * Generate the inverted CallNodeInfo for a thread.
 */
export function getInvertedCallNodeInfo(
  thread: Thread,
  nonInvertedCallNodeTable: CallNodeTable,
  stackIndexToNonInvertedCallNodeIndex: Int32Array,
  defaultCategory: IndexIntoCategoryList
): CallNodeInfo {
  // We compute an inverted stack table, but we don't let it escape this function.
  const {
    invertedThread,
    oldStackToNewStack: nonInvertedStackToInvertedStack,
  } = _computeThreadWithInvertedStackTable(thread, defaultCategory);

  // Create an inverted call node table based on the inverted stack table.
  const {
    callNodeTable,
    stackIndexToCallNodeIndex: invertedStackIndexToCallNodeIndex,
  } = computeCallNodeTable(
    invertedThread.stackTable,
    invertedThread.frameTable,
    invertedThread.funcTable,
    defaultCategory
  );

  // Create a mapping that maps a stack index from the non-inverted thread to
  // its corresponding call node in the inverted tree.
  const nonInvertedStackIndexToCallNodeIndex = new Int32Array(
    thread.stackTable.length
  );
  for (
    let nonInvertedStackIndex = 0;
    nonInvertedStackIndex < nonInvertedStackIndexToCallNodeIndex.length;
    nonInvertedStackIndex++
  ) {
    const invertedStackIndex = nonInvertedStackToInvertedStack.get(
      nonInvertedStackIndex
    );
    if (invertedStackIndex === undefined) {
      // This stack is not used as a self stack, only as a prefix stack.
      // There may or may not be an inverted call node that corresponds to it,
      // but we haven't checked that and we don't need to know it.
      // nonInvertedStackIndexToCallNodeIndex only needs useful values for self stacks.
      nonInvertedStackIndexToCallNodeIndex[nonInvertedStackIndex] = -1;
    } else {
      nonInvertedStackIndexToCallNodeIndex[nonInvertedStackIndex] =
        invertedStackIndexToCallNodeIndex[invertedStackIndex];
    }
  }
  return new CallNodeInfoImpl(
    callNodeTable,
    nonInvertedCallNodeTable,
    nonInvertedStackIndexToCallNodeIndex,
    stackIndexToNonInvertedCallNodeIndex,
    true
  );
}

// Given a stack index `needleStack` and a call node in the inverted tree
// `invertedCallTreeNode`, find an ancestor stack of `needleStack` which
// corresponds to the given call node in the inverted call tree. Returns null if
// there is no such ancestor stack.
//
// Also returns null for any stacks which aren't used as self stacks.
//
// Example:
//
//    Stack table (`<func>:<line>`):        Inverted call tree:
//
//     - A:10                                - A
//        - B:20                             - B
//          - C:30                             - A
//          - C:31                           - C
//        - B:21                               - B
//                                               - A
//
// In this example, given the inverted tree call node C <- B and the needle
// stack A:10 -> B:20 -> C:30, the function will return the stack A:10 -> B:20.
//
// For example, if you double click the call node C <- B in the inverted tree,
// and if all samples spend their time in the stack A:10 -> B:20 -> C:30, then
// the source view should be scrolled to line 20.
//
// Background: needleStack has some self time. This self time shows up in a
// root node of the inverted tree. If you go to needleStack's prefix stack, i.e.
// if you go "up" a level in the non-inverted stack table, you go "down" a level
// in the inverted call tree. We want to go up/down enough so that we hit our
// call node. This gives us a stack node whose frame's func is the same as the
// func of `invertedCallTreeNode`. Then our caller can get some information from
// that frame, for example the frame's address or line.
export function getMatchingAncestorStackForInvertedCallNode(
  needleStack: IndexIntoStackTable,
  invertedTreeCallNode: IndexIntoCallNodeTable,
  invertedTreeCallNodeSubtreeEnd: IndexIntoCallNodeTable,
  invertedTreeCallNodeDepth: number,
  stackIndexToInvertedCallNodeIndex: Int32Array,
  stackTablePrefixCol: Array<IndexIntoStackTable | null>
): IndexIntoStackTable | null {
  // Get the inverted call tree node for the (non-inverted) stack.
  // For example, if the stack has the call path A -> B -> C,
  // this will give us the node C <- B <- A in the inverted tree.
  const needleCallNode = stackIndexToInvertedCallNodeIndex[needleStack];

  // Check if needleCallNode is a descendant of invertedTreeCallNode in the
  // inverted tree.
  if (
    needleCallNode >= invertedTreeCallNode &&
    needleCallNode < invertedTreeCallNodeSubtreeEnd
  ) {
    // needleCallNode is a descendant of invertedTreeCallNode in the inverted tree.
    // That means that needleStack's self time contributes to the total time of
    // invertedTreeCallNode. It also means that the non-inverted call path of
    // needleStack "ends with" the suffix described by invertedTreeCallNode.
    // For example, if invertedTreeCallNode is C <- B, and needleStack has the
    // non-inverted call path A -> B -> C, then we now know that A -> B -> C ends
    // with B -> C.
    // Now we strip off this suffix. In the example, we strip off "-> C" at the
    // end so that we end up with a stack for A -> B.
    // Stripping off the suffix is equivalent to "walking down" in the inverted tree.
    return getNthPrefixStack(
      needleStack,
      invertedTreeCallNodeDepth,
      stackTablePrefixCol
    );
  }

  // Not a descendant; return null.
  return null;
}

/**
 * Returns the n'th prefix of a stack, or null if it doesn't exist.
 * (n = 0: the node itself, n = 1: the immediate parent node,
 * n = 2: the grandparent, etc)
 */
export function getNthPrefixStack(
  stackIndex: IndexIntoStackTable | null,
  n: number,
  stackTablePrefixCol: Array<IndexIntoStackTable | null>
): IndexIntoStackTable | null {
  let s = stackIndex;
  for (let i = 0; i < n && s !== null; i++) {
    s = stackTablePrefixCol[s];
  }
  return s;
}

/**
 * Take a samples table, and return an array that contain indexes that point to the
 * leaf most call node, or null.
 */
export function getSampleIndexToCallNodeIndex(
  stacks: Array<IndexIntoStackTable | null>,
  stackIndexToCallNodeIndex: {
    [key: IndexIntoStackTable]: IndexIntoCallNodeTable,
  }
): Array<IndexIntoCallNodeTable | null> {
  return stacks.map((stack) => {
    return stack === null ? null : stackIndexToCallNodeIndex[stack];
  });
}

/**
 * This is an implementation of getSamplesSelectedStates for just the case where
 * no call node is selected.
 */
function getSamplesSelectedStatesForNoSelection(
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  activeTabFilteredCallNodes: Array<IndexIntoCallNodeTable | null>
): SelectedState[] {
  const result = new Array(sampleCallNodes.length);
  for (
    let sampleIndex = 0;
    sampleIndex < sampleCallNodes.length;
    sampleIndex++
  ) {
    // When there's no selected call node, we don't want to shadow everything
    // because everything is unselected. So let's pretend that
    // everything is selected so that anything not filtered out will be nicely
    // visible.
    let sampleSelectedState = 'SELECTED';

    // But we still want to display filtered-out samples differently.
    const callNodeIndex = sampleCallNodes[sampleIndex];
    if (callNodeIndex === null) {
      sampleSelectedState =
        activeTabFilteredCallNodes[sampleIndex] === null
          ? // This sample was not part of the active tab.
            'FILTERED_OUT_BY_ACTIVE_TAB'
          : // This sample was filtered out in the transform pipeline.
            'FILTERED_OUT_BY_TRANSFORM';
    }

    result[sampleIndex] = sampleSelectedState;
  }
  return result;
}

/**
 * Given the call node for each sample and the call node selected states,
 * compute each sample's selected state.
 *
 * For samples that are not filtered out, the sample's selected state is based
 * on the relation of the sample's call node to the selected call node: Any call
 * nodes in the selected node's subtree are "selected"; all other nodes are
 * either "before" or "after" the selected subtree.
 *
 * Call node tables are ordered in depth-first traversal order, so we can
 * determine whether a node is before, inside or after a subtree simply by
 * comparing the call node index to the "selected index range". Example:
 *
 * ```
 * before, 0
 *   before, 1
 *     before, 2
 *   before, 3
 * before, 4
 *   before, 5
 *     before, 6
 *     before, 7
 *       before, 8
 *   before, 9
 *     before, 10
 *       before, 11
 *     before, 12
 *     selected, 13 <-- selected node
 *       selected, 14
 *         selected, 15
 *           selected, 16
 *         selected, 17
 *       selected, 18
 *         selected, 19
 *         selected, 20
 *     after, 21
 *       after, 22
 *     after, 23
 *   after, 24
 *     after, 25
 * after, 26
 *   after, 27
 * ```
 *
 * In this example, the selected node has index 13 and the "selected index range"
 * is the range from 13 to 21 (not including 21).
 */
function mapCallNodeSelectedStatesToSamples(
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  activeTabFilteredCallNodes: Array<IndexIntoCallNodeTable | null>,
  selectedCallNodeIndex: IndexIntoCallNodeTable,
  selectedCallNodeDescendantsEndIndex: IndexIntoCallNodeTable
): SelectedState[] {
  const sampleCount = sampleCallNodes.length;
  const samplesSelectedStates = new Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    let sampleSelectedState: SelectedState = 'SELECTED';
    const callNodeIndex = sampleCallNodes[sampleIndex];
    if (callNodeIndex !== null) {
      if (callNodeIndex < selectedCallNodeIndex) {
        sampleSelectedState = 'UNSELECTED_ORDERED_BEFORE_SELECTED';
      } else if (callNodeIndex < selectedCallNodeDescendantsEndIndex) {
        sampleSelectedState = 'SELECTED';
      } else {
        sampleSelectedState = 'UNSELECTED_ORDERED_AFTER_SELECTED';
      }
    } else {
      // This sample was filtered out.
      sampleSelectedState =
        activeTabFilteredCallNodes[sampleIndex] === null
          ? // This sample was not part of the active tab.
            'FILTERED_OUT_BY_ACTIVE_TAB'
          : // This sample was filtered out in the transform pipeline.
            'FILTERED_OUT_BY_TRANSFORM';
    }
    samplesSelectedStates[sampleIndex] = sampleSelectedState;
  }
  return samplesSelectedStates;
}

/**
 * Go through the samples, and determine their current state with respect to
 * the selection.
 *
 * This is used in the activity graph. The "ordering" is used so that samples
 * from the same subtree (in the call tree) "clump together" in the graph.
 */
export function getSamplesSelectedStates(
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  activeTabFilteredCallNodes: Array<IndexIntoCallNodeTable | null>,
  selectedCallNodeIndex: IndexIntoCallNodeTable | null
): SelectedState[] {
  if (selectedCallNodeIndex === null || selectedCallNodeIndex === -1) {
    return getSamplesSelectedStatesForNoSelection(
      sampleCallNodes,
      activeTabFilteredCallNodes
    );
  }

  const callNodeTable = callNodeInfo.getCallNodeTable();
  return mapCallNodeSelectedStatesToSamples(
    sampleCallNodes,
    activeTabFilteredCallNodes,
    selectedCallNodeIndex,
    callNodeTable.subtreeRangeEnd[selectedCallNodeIndex]
  );
}

/**
 * This function returns the function index for a specific call node path. This
 * is the last element of this path, or the leaf element of the path.
 */
export function getLeafFuncIndex(path: CallNodePath): IndexIntoFuncTable {
  if (path.length === 0) {
    throw new Error("getLeafFuncIndex assumes that the path isn't empty.");
  }

  return path[path.length - 1];
}

export type JsImplementation =
  | 'interpreter'
  | 'blinterp'
  | 'baseline'
  | 'ion'
  | 'unknown';
export type StackImplementation = 'native' | JsImplementation;
export type BreakdownByImplementation = { [StackImplementation]: Milliseconds };
export type OneCategoryBreakdown = {|
  entireCategoryValue: Milliseconds,
  subcategoryBreakdown: Milliseconds[], // { [IndexIntoSubcategoryList]: Milliseconds }
|};
export type BreakdownByCategory = OneCategoryBreakdown[]; // { [IndexIntoCategoryList]: OneCategoryBreakdown }
export type ItemTimings = {|
  selfTime: {|
    // time spent excluding children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
    breakdownByCategory: BreakdownByCategory | null,
  |},
  totalTime: {|
    // time spent including children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
    breakdownByCategory: BreakdownByCategory | null,
  |},
|};

export type TimingsForPath = {|
  // timings for this path
  forPath: ItemTimings,
  rootTime: Milliseconds, // time for all the samples in the current tree
|};

/**
 * This function is the same as getTimingsForCallNodeIndex, but accepts a CallNodePath
 * instead of an IndexIntoCallNodeTable.
 */
export function getTimingsForPath(
  needlePath: CallNodePath,
  callNodeInfo: CallNodeInfo,
  interval: Milliseconds,
  thread: Thread,
  unfilteredThread: Thread,
  sampleIndexOffset: number,
  categories: CategoryList,
  samples: SamplesLikeTable,
  unfilteredSamples: SamplesLikeTable,
  displayImplementation: boolean
) {
  return getTimingsForCallNodeIndex(
    callNodeInfo.getCallNodeIndexFromPath(needlePath),
    callNodeInfo,
    interval,
    thread,
    unfilteredThread,
    sampleIndexOffset,
    categories,
    samples,
    unfilteredSamples,
    displayImplementation
  );
}

/**
 * This function returns the timings for a specific call node. The algorithm is
 * adjusted when the call tree is inverted.
 * Note that the unfilteredThread should be the original thread before any filtering
 * (by range or other) happens. Also sampleIndexOffset needs to be properly
 * specified and is the offset to be applied on thread's indexes to access
 * the same samples in unfilteredThread.
 */
export function getTimingsForCallNodeIndex(
  needleNodeIndex: IndexIntoCallNodeTable | null,
  callNodeInfo: CallNodeInfo,
  interval: Milliseconds,
  thread: Thread,
  unfilteredThread: Thread,
  sampleIndexOffset: number,
  categories: CategoryList,
  samples: SamplesLikeTable,
  unfilteredSamples: SamplesLikeTable,
  displayImplementation: boolean
): TimingsForPath {
  /* ------------ Variables definitions ------------*/

  // This is the data from the filtered thread that we'll loop over.
  const { stringTable } = thread;

  // This is the data from the unfiltered thread that we'll use to gather
  // category and JS implementation information. Note that samples are offset by
  // `sampleIndexOffset` because of range filtering.
  const {
    stackTable: unfilteredStackTable,
    funcTable: unfilteredFuncTable,
    frameTable: unfilteredFrameTable,
  } = unfilteredThread;

  // This holds the category index for the JavaScript category, so that we can
  // use it to quickly check the category later on.
  const javascriptCategoryIndex = categories.findIndex(
    ({ name }) => name === 'JavaScript'
  );

  // This object holds the timings for the current call node path, specified by
  // needleNodeIndex.
  const pathTimings: ItemTimings = {
    selfTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
    totalTime: {
      value: 0,
      breakdownByImplementation: null,
      breakdownByCategory: null,
    },
  };

  // This holds the root time, it's incremented for all samples and is useful to
  // have an absolute value to compare the other values with.
  let rootTime = 0;

  /* -------- End of variable definitions ------- */

  /* ------------ Functions definitions --------- *
   * We define functions here so that they have easy access to the variables and
   * the algorithm's parameters. */

  /**
   * This function is called for native stacks. If the native stack has the
   * 'JavaScript' category, then we move up the call tree to find the nearest
   * ancestor that's JS and returns its JS implementation.
   */
  function getImplementationForNativeStack(
    unfilteredStackIndex: IndexIntoStackTable
  ): StackImplementation {
    const category = unfilteredStackTable.category[unfilteredStackIndex];
    if (category !== javascriptCategoryIndex) {
      return 'native';
    }

    for (
      let currentStackIndex = unfilteredStackIndex;
      currentStackIndex !== null;
      currentStackIndex = unfilteredStackTable.prefix[currentStackIndex]
    ) {
      const frameIndex = unfilteredStackTable.frame[currentStackIndex];
      const funcIndex = unfilteredFrameTable.func[frameIndex];
      const isJS = unfilteredFuncTable.isJS[funcIndex];
      if (isJS) {
        return getImplementationForJsStack(frameIndex);
      }
    }

    // No JS frame was found in the ancestors, this is weird but why not?
    return 'native';
  }

  /**
   * This function Returns the JS implementation information for a specific JS stack.
   */
  function getImplementationForJsStack(
    unfilteredFrameIndex: IndexIntoFrameTable
  ): JsImplementation {
    const jsImplementationStrIndex =
      unfilteredFrameTable.implementation[unfilteredFrameIndex];

    if (jsImplementationStrIndex === null) {
      return 'interpreter';
    }

    const jsImplementation = stringTable.getString(jsImplementationStrIndex);

    switch (jsImplementation) {
      case 'baseline':
      case 'blinterp':
      case 'ion':
        return jsImplementation;
      default:
        return 'unknown';
    }
  }

  function getImplementationForStack(
    thisSampleIndex: IndexIntoSamplesTable
  ): StackImplementation {
    const stackIndex =
      unfilteredSamples.stack[thisSampleIndex + sampleIndexOffset];
    if (stackIndex === null) {
      // This should not happen in the unfiltered thread.
      console.error('We got a null stack, this should not happen.');
      return 'native';
    }

    const frameIndex = unfilteredStackTable.frame[stackIndex];
    const funcIndex = unfilteredFrameTable.func[frameIndex];
    const implementation = unfilteredFuncTable.isJS[funcIndex]
      ? getImplementationForJsStack(frameIndex)
      : getImplementationForNativeStack(stackIndex);

    return implementation;
  }

  /**
   * This is a small utility function to more easily add data to breakdowns.
   */
  function accumulateDataToTimings(
    timings: {
      breakdownByImplementation: BreakdownByImplementation | null,
      breakdownByCategory: BreakdownByCategory | null,
      value: number,
    },
    sampleIndex: IndexIntoSamplesTable,
    duration: Milliseconds
  ): void {
    // Step 1: increment the total value
    timings.value += duration;

    if (displayImplementation) {
      // Step 2: find the implementation value for this sample
      const implementation = getImplementationForStack(sampleIndex);

      // Step 3: increment the right value in the implementation breakdown
      if (timings.breakdownByImplementation === null) {
        timings.breakdownByImplementation = {};
      }
      if (timings.breakdownByImplementation[implementation] === undefined) {
        timings.breakdownByImplementation[implementation] = 0;
      }
      timings.breakdownByImplementation[implementation] += duration;
    } else {
      timings.breakdownByImplementation = null;
    }

    // step 4: find the category value for this stack. We want to use the
    // category of the unfilteredThread.
    const unfilteredStackIndex =
      unfilteredSamples.stack[sampleIndex + sampleIndexOffset];
    if (unfilteredStackIndex !== null) {
      const categoryIndex = unfilteredStackTable.category[unfilteredStackIndex];
      const subcategoryIndex =
        unfilteredStackTable.subcategory[unfilteredStackIndex];

      // step 5: increment the right value in the category breakdown
      if (timings.breakdownByCategory === null) {
        timings.breakdownByCategory = categories.map((category) => ({
          entireCategoryValue: 0,
          subcategoryBreakdown: Array(category.subcategories.length).fill(0),
        }));
      }
      timings.breakdownByCategory[categoryIndex].entireCategoryValue +=
        duration;
      timings.breakdownByCategory[categoryIndex].subcategoryBreakdown[
        subcategoryIndex
      ] += duration;
    }
  }
  /* ------------- End of function definitions ------------- */

  /* ------------ Start of the algorithm itself ------------ */
  if (needleNodeIndex === null) {
    // No index was provided, return empty timing information.
    return { forPath: pathTimings, rootTime };
  }

  const callNodeTable = callNodeInfo.getCallNodeTable();
  const stackIndexToCallNodeIndex = callNodeInfo.getStackIndexToCallNodeIndex();

  const needleDescendantsEndIndex =
    callNodeTable.subtreeRangeEnd[needleNodeIndex];

  const isInvertedTree = callNodeInfo.isInverted();
  const needleNodeIsRootOfInvertedTree =
    isInvertedTree && callNodeTable.prefix[needleNodeIndex] === -1;

  // Loop over each sample and accumulate the self time, running time, and
  // the implementation breakdown.
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    // Get the call node for this sample.
    // TODO: Consider using sampleCallNodes for this, to save one indirection on
    // a hot path.
    const thisStackIndex = samples.stack[sampleIndex];
    if (thisStackIndex === null) {
      continue;
    }
    const thisNodeIndex = stackIndexToCallNodeIndex[thisStackIndex];

    const weight = samples.weight ? samples.weight[sampleIndex] : 1;

    rootTime += Math.abs(weight);

    if (!isInvertedTree) {
      // For non-inverted trees, we compute the self time from the stacks' leaf nodes.
      if (thisNodeIndex === needleNodeIndex) {
        accumulateDataToTimings(pathTimings.selfTime, sampleIndex, weight);
      }
    }

    if (
      thisNodeIndex >= needleNodeIndex &&
      thisNodeIndex < needleDescendantsEndIndex
    ) {
      // One of the parents is the exact passed path.
      accumulateDataToTimings(pathTimings.totalTime, sampleIndex, weight);

      if (needleNodeIsRootOfInvertedTree) {
        // This root node matches the passed call node path.
        // This is the only place where we don't accumulate timings, mainly
        // because this would be the same as for the total time.
        pathTimings.selfTime.value += weight;
      }
    }
  }

  return { forPath: pathTimings, rootTime };
}

// This function computes the time range for a thread, using both its samples
// and markers data. It's memoized and exported below, because it's called both
// here in getTimeRangeIncludingAllThreads, and in selectors when dealing with
// markers.
// Because `getTimeRangeIncludingAllThreads` is called in a reducer and it's
// quite complex to change this, the memoization happens here.
// When changing the signature, please accordingly check that the map class used
// for memoization is still the right one.
function _getTimeRangeForThread(
  { samples, markers, jsAllocations, nativeAllocations }: Thread,
  interval: Milliseconds
): StartEndRange {
  const result = { start: Infinity, end: -Infinity };

  if (samples.length) {
    const lastSampleIndex = samples.length - 1;
    result.start = samples.time[0];
    result.end = samples.time[lastSampleIndex] + interval;
  } else if (markers.length) {
    // Looking at the markers only if there are no samples in the profile.
    // We need to look at those because it can be a marker only profile(no-sampling mode).
    // Finding start and end times sadly requires looping through all markers :(
    for (let i = 0; i < markers.length; i++) {
      const maybeStartTime = markers.startTime[i];
      const maybeEndTime = markers.endTime[i];
      const markerPhase = markers.phase[i];
      // The resulting range needs to adjust BOTH the start and end of the range, as
      // each marker type could adjust the total range beyond the current bounds.
      // Note the use of Math.min and Math.max are different for the start and end
      // of the markers.

      switch (markerPhase) {
        case INSTANT:
        case INTERVAL_START: {
          const startTime = ensureExists(maybeStartTime);

          result.start = Math.min(result.start, startTime);
          result.end = Math.max(result.end, startTime + interval);
          break;
        }
        case INTERVAL_END: {
          const endTime = ensureExists(maybeEndTime);

          result.start = Math.min(result.start, endTime);
          result.end = Math.max(result.end, endTime + interval);
          break;
        }
        case INTERVAL: {
          const startTime = ensureExists(maybeStartTime);
          const endTime = ensureExists(maybeEndTime);

          result.start = Math.min(result.start, startTime, endTime);
          result.end = Math.max(
            result.end,
            startTime + interval,
            endTime + interval
          );
          break;
        }
        default:
          throw new Error('Unhandled marker phase type.');
      }
    }
  }

  if (jsAllocations) {
    // For good measure, also check the allocations. This is mainly so that tests
    // will behave nicely.
    const lastIndex = jsAllocations.length - 1;
    result.start = Math.min(result.start, jsAllocations.time[0]);
    result.end = Math.max(result.end, jsAllocations.time[lastIndex] + interval);
  }

  if (nativeAllocations) {
    // For good measure, also check the allocations. This is mainly so that tests
    // will behave nicely.
    const lastIndex = nativeAllocations.length - 1;
    result.start = Math.min(result.start, nativeAllocations.time[0]);
    result.end = Math.max(
      result.end,
      nativeAllocations.time[lastIndex] + interval
    );
  }

  return result;
}

// We do a full memoization because it's called for several different threads.
// But it won't be called more than once per thread.
// Note that because MixedTupleMap internally uses a WeakMap, it should properly
// free the memory when we load another profile (for example when dealing with
// zip files).
const memoizedGetTimeRangeForThread = memoize(_getTimeRangeForThread, {
  // We use a MixedTupleMap because the function takes both primitive and
  // complex types.
  cache: new MixedTupleMap(),
});
export { memoizedGetTimeRangeForThread as getTimeRangeForThread };

export function getTimeRangeIncludingAllThreads(
  profile: Profile
): StartEndRange {
  const completeRange = { start: Infinity, end: -Infinity };
  if (
    profile.meta.profilingStartTime !== undefined &&
    profile.meta.profilingEndTime
  ) {
    return {
      start: profile.meta.profilingStartTime,
      end: profile.meta.profilingEndTime,
    };
  }
  profile.threads.forEach((thread) => {
    const threadRange = memoizedGetTimeRangeForThread(
      thread,
      profile.meta.interval
    );
    completeRange.start = Math.min(completeRange.start, threadRange.start);
    completeRange.end = Math.max(completeRange.end, threadRange.end);
  });
  return completeRange;
}

export function defaultThreadOrder(threads: Thread[]): ThreadIndex[] {
  const threadOrder = threads.map((thread, i) => i);

  // Note: to have a consistent behavior independant of the sorting algorithm,
  // we need to be careful that the comparator function is consistent:
  // comparator(a, b) === - comparator(b, a)
  // and
  // comparator(a, b) === 0   if and only if   a === b
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;

    if (nameA === nameB) {
      return a - b;
    }

    // Put the compositor/renderer thread last.
    // Compositor will always be before Renderer, if both are present.
    if (nameA === 'Compositor') {
      return 1;
    }

    if (nameB === 'Compositor') {
      return -1;
    }

    if (nameA === 'Renderer') {
      return 1;
    }

    if (nameB === 'Renderer') {
      return -1;
    }

    // Otherwise keep the existing order. We don't return 0 to guarantee that
    // the sort is stable even if the sort algorithm isn't.
    return a - b;
  });
  return threadOrder;
}

export function toValidImplementationFilter(
  implementation: string
): ImplementationFilter {
  switch (implementation) {
    case 'cpp':
    case 'js':
      return implementation;
    default:
      return 'combined';
  }
}

export function toValidCallTreeSummaryStrategy(
  strategy: mixed
): CallTreeSummaryStrategy {
  switch (strategy) {
    case 'timing':
    case 'js-allocations':
    case 'native-retained-allocations':
    case 'native-allocations':
    case 'native-deallocations-sites':
    case 'native-deallocations-memory':
      return strategy;
    default:
      // Default to "timing" if the strategy is not recognized. This value can come
      // from a user-generated URL.
      // e.g. `profiler.firefox.com/public/hash/ctSummary=tiiming` (note the typo.)
      // This default branch will ensure we don't send values we don't understand to
      // the store.
      return 'timing';
  }
}

export function filterThreadByImplementation(
  thread: Thread,
  implementation: string
): Thread {
  const { funcTable, stringTable } = thread;

  switch (implementation) {
    case 'cpp':
      return _filterThreadByFunc(thread, (funcIndex) => {
        // Return quickly if this is a JS frame.
        if (funcTable.isJS[funcIndex]) {
          return false;
        }
        // Regular C++ functions are associated with a resource that describes the
        // shared library that these C++ functions were loaded from. Jitcode is not
        // loaded from shared libraries but instead generated at runtime, so Jitcode
        // frames are not associated with a shared library and thus have no resource
        const locationString = stringTable.getString(funcTable.name[funcIndex]);
        const isProbablyJitCode =
          funcTable.resource[funcIndex] === -1 &&
          locationString.startsWith('0x');
        return !isProbablyJitCode;
      });
    case 'js':
      return _filterThreadByFunc(thread, (funcIndex) => {
        return funcTable.isJS[funcIndex] || funcTable.relevantForJS[funcIndex];
      });
    default:
      return thread;
  }
}

function _filterThreadByFunc(
  thread: Thread,
  shouldIncludeFuncInFilteredThread: (IndexIntoFuncTable) => boolean
): Thread {
  return timeCode('_filterThreadByFunc', () => {
    const { stackTable, frameTable } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
      category: [],
      subcategory: [],
    };
    const oldStackToNewStack = new Int32Array(stackTable.length);

    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const oldPrefix = stackTable.prefix[stackIndex];
      const frame = stackTable.frame[stackIndex];
      const func = frameTable.func[frame];
      const newPrefix = oldPrefix === null ? -1 : oldStackToNewStack[oldPrefix];
      if (shouldIncludeFuncInFilteredThread(func)) {
        const newStackIndex = newStackTable.length++;
        newStackTable.frame[newStackIndex] = frame;
        newStackTable.prefix[newStackIndex] =
          newPrefix !== -1 ? newPrefix : null;
        newStackTable.category[newStackIndex] = stackTable.category[stackIndex];
        newStackTable.subcategory[newStackIndex] =
          stackTable.subcategory[stackIndex];
        oldStackToNewStack[stackIndex] = newStackIndex;
      } else {
        oldStackToNewStack[stackIndex] = newPrefix;
      }
    }

    return updateThreadStacks(thread, newStackTable, (oldStack) => {
      if (oldStack === null) {
        return null;
      }
      const newStack = oldStackToNewStack[oldStack];
      return newStack !== -1 ? newStack : null;
    });
  });
}

export function filterThreadToSearchStrings(
  thread: Thread,
  searchStrings: string[] | null
): Thread {
  return timeCode('filterThreadToSearchStrings', () => {
    if (!searchStrings || !searchStrings.length) {
      return thread;
    }

    return searchStrings.reduce(filterThreadToSearchString, thread);
  });
}

export function filterThreadToSearchString(
  thread: Thread,
  searchString: string
): Thread {
  if (!searchString) {
    return thread;
  }
  const lowercaseSearchString = searchString.toLowerCase();
  const { funcTable, frameTable, stackTable, stringTable, resourceTable } =
    thread;

  function computeFuncMatchesFilter(func) {
    const nameIndex = funcTable.name[func];
    const nameString = stringTable.getString(nameIndex);
    if (nameString.toLowerCase().includes(lowercaseSearchString)) {
      return true;
    }

    const fileNameIndex = funcTable.fileName[func];
    if (fileNameIndex !== null) {
      const fileNameString = stringTable.getString(fileNameIndex);
      if (fileNameString.toLowerCase().includes(lowercaseSearchString)) {
        return true;
      }
    }

    const resourceIndex = funcTable.resource[func];
    if (resourceIndex !== -1) {
      const resourceNameIndex = resourceTable.name[resourceIndex];
      const resourceNameString = stringTable.getString(resourceNameIndex);
      if (resourceNameString.toLowerCase().includes(lowercaseSearchString)) {
        return true;
      }
    }

    return false;
  }

  const funcMatchesFilterCache = new Map();
  function funcMatchesFilter(func) {
    let result = funcMatchesFilterCache.get(func);
    if (result === undefined) {
      result = computeFuncMatchesFilter(func);
      funcMatchesFilterCache.set(func, result);
    }
    return result;
  }

  const stackMatchesFilterCache = new Map();
  function stackMatchesFilter(stackIndex) {
    if (stackIndex === null) {
      return false;
    }
    let result = stackMatchesFilterCache.get(stackIndex);
    if (result === undefined) {
      const prefix = stackTable.prefix[stackIndex];
      if (stackMatchesFilter(prefix)) {
        result = true;
      } else {
        const frame = stackTable.frame[stackIndex];
        const func = frameTable.func[frame];
        result = funcMatchesFilter(func);
      }
      stackMatchesFilterCache.set(stackIndex, result);
    }
    return result;
  }

  return updateThreadStacks(thread, stackTable, (stackIndex) =>
    stackMatchesFilter(stackIndex) ? stackIndex : null
  );
}

/**
 * We have page data(innerWindowID) inside the JS frames. Go through each sample
 * and filter out the ones that don't include any JS frame with the relevant innerWindowID.
 * Please note that it also keeps native frames if that sample has a relevant JS
 * frame in any part of the stack. Also it doesn't mutate the stack itself, only
 * nulls the stack array elements of samples object. Therefore, it doesn't
 * invalidate transforms.
 * If we don't have any item in relevantPages, returns all the samples.
 */
export function filterThreadByTab(
  thread: Thread,
  relevantPages: Set<InnerWindowID>
): Thread {
  return timeCode('filterThreadByTab', () => {
    if (relevantPages.size === 0) {
      // Either there is no relevant page or "active tab only" view is not active.
      return thread;
    }

    const { frameTable, stackTable } = thread;

    // innerWindowID array lives inside the frameTable. Check that and decide
    // if we should keep that sample or not.
    const frameMatchesFilterCache: Map<IndexIntoFrameTable, boolean> =
      new Map();
    function frameMatchesFilter(frame) {
      const cache = frameMatchesFilterCache.get(frame);
      if (cache !== undefined) {
        return cache;
      }

      const innerWindowID = frameTable.innerWindowID[frame];
      const matches =
        innerWindowID && innerWindowID > 0
          ? relevantPages.has(innerWindowID)
          : false;
      frameMatchesFilterCache.set(frame, matches);
      return matches;
    }

    // Use the stackTable to navigate to frameTable and cache the result of it.
    const stackMatchesFilterCache: Map<IndexIntoStackTable, boolean> =
      new Map();
    function stackMatchesFilter(stackIndex) {
      if (stackIndex === null) {
        return false;
      }
      const cache = stackMatchesFilterCache.get(stackIndex);
      if (cache !== undefined) {
        return cache;
      }

      const prefix = stackTable.prefix[stackIndex];
      if (stackMatchesFilter(prefix)) {
        stackMatchesFilterCache.set(stackIndex, true);
        return true;
      }

      const frame = stackTable.frame[stackIndex];
      const matches = frameMatchesFilter(frame);
      stackMatchesFilterCache.set(stackIndex, matches);
      return matches;
    }

    // Update the stack array elements of samples object and make them null if
    // they don't include any relevant JS frame.
    // It doesn't mutate the stack itself.
    return updateThreadStacks(thread, stackTable, (stackIndex) =>
      stackMatchesFilter(stackIndex) ? stackIndex : null
    );
  });
}

/**
 * Checks if a sample table has any useful samples.
 * A useful sample being one that isn't a "(root)" sample.
 */
export function hasUsefulSamples(
  table?: SamplesLikeTable,
  thread: Thread
): boolean {
  const { stackTable, frameTable, funcTable, stringTable } = thread;
  if (table === undefined || table.length === 0 || stackTable.length === 0) {
    return false;
  }
  const stackIndex = table.stack.find((stack) => stack !== null);
  if (
    stackIndex === undefined ||
    stackIndex === null // We know that it can't be null at this point, but Flow doesn't.
  ) {
    // All samples were null.
    return false;
  }
  if (stackTable.prefix[stackIndex] === null) {
    // There's only a single stack frame, check if it's '(root)'.
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const stringIndex = funcTable.name[funcIndex];
    if (stringTable.getString(stringIndex) === '(root)') {
      // If the first sample's stack is only the root, check if any other
      // sample is different.
      return table.stack.some((s) => s !== null && s !== stackIndex);
    }
  }
  return true;
}

/**
 * This function takes both a SamplesTable and can be used on CounterSamplesTable.
 */
export function getSampleIndexRangeForSelection(
  table: { time: Milliseconds[], length: number },
  rangeStart: number,
  rangeEnd: number
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  const sampleStart = bisectionLeft(table.time, rangeStart);
  const sampleEnd = bisectionLeft(table.time, rangeEnd, sampleStart);
  return [sampleStart, sampleEnd];
}

/**
 * This function takes a samples table and returns the sample range
 * including the sample just before and after the range. This is needed to make
 * sure that some charts will not be cut off at the edges when zoomed in to a range.
 */
export function getInclusiveSampleIndexRangeForSelection(
  table: { time: Milliseconds[], length: number },
  rangeStart: number,
  rangeEnd: number
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  let [sampleStart, sampleEnd] = getSampleIndexRangeForSelection(
    table,
    rangeStart,
    rangeEnd
  );

  // Include the samples just before and after the selection range, so that charts will
  // not be cut off at the edges.
  if (sampleStart > 0) {
    sampleStart--;
  }
  if (sampleEnd < table.length) {
    sampleEnd++;
  }

  return [sampleStart, sampleEnd];
}

export function filterThreadSamplesToRange(
  thread: Thread,
  rangeStart: number,
  rangeEnd: number
): Thread {
  const { samples, jsAllocations, nativeAllocations } = thread;
  const [beginSampleIndex, endSampleIndex] = getSampleIndexRangeForSelection(
    samples,
    rangeStart,
    rangeEnd
  );
  const newSamples: SamplesTable = {
    length: endSampleIndex - beginSampleIndex,
    time: samples.time.slice(beginSampleIndex, endSampleIndex),
    weight: samples.weight
      ? samples.weight.slice(beginSampleIndex, endSampleIndex)
      : null,
    weightType: samples.weightType,
    stack: samples.stack.slice(beginSampleIndex, endSampleIndex),
  };

  if (samples.eventDelay) {
    newSamples.eventDelay = samples.eventDelay.slice(
      beginSampleIndex,
      endSampleIndex
    );
  } else if (samples.responsiveness) {
    newSamples.responsiveness = samples.responsiveness.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  if (samples.threadCPUDelta) {
    newSamples.threadCPUDelta = samples.threadCPUDelta.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  if (samples.threadId) {
    newSamples.threadId = samples.threadId.slice(
      beginSampleIndex,
      endSampleIndex
    );
  }

  const newThread: Thread = {
    ...thread,
    samples: newSamples,
  };

  if (jsAllocations) {
    const [startAllocIndex, endAllocIndex] = getSampleIndexRangeForSelection(
      jsAllocations,
      rangeStart,
      rangeEnd
    );
    newThread.jsAllocations = {
      time: jsAllocations.time.slice(startAllocIndex, endAllocIndex),
      className: jsAllocations.className.slice(startAllocIndex, endAllocIndex),
      typeName: jsAllocations.typeName.slice(startAllocIndex, endAllocIndex),
      coarseType: jsAllocations.coarseType.slice(
        startAllocIndex,
        endAllocIndex
      ),
      weight: jsAllocations.weight.slice(startAllocIndex, endAllocIndex),
      weightType: jsAllocations.weightType,
      inNursery: jsAllocations.inNursery.slice(startAllocIndex, endAllocIndex),
      stack: jsAllocations.stack.slice(startAllocIndex, endAllocIndex),
      length: endAllocIndex - startAllocIndex,
    };
  }

  if (nativeAllocations) {
    const [startAllocIndex, endAllocIndex] = getSampleIndexRangeForSelection(
      nativeAllocations,
      rangeStart,
      rangeEnd
    );
    const time = nativeAllocations.time.slice(startAllocIndex, endAllocIndex);
    const weight = nativeAllocations.weight.slice(
      startAllocIndex,
      endAllocIndex
    );
    const stack = nativeAllocations.stack.slice(startAllocIndex, endAllocIndex);
    const length = endAllocIndex - startAllocIndex;
    if (nativeAllocations.memoryAddress) {
      newThread.nativeAllocations = {
        time,
        weight,
        weightType: nativeAllocations.weightType,
        stack,
        memoryAddress: nativeAllocations.memoryAddress.slice(
          startAllocIndex,
          endAllocIndex
        ),
        threadId: nativeAllocations.threadId.slice(
          startAllocIndex,
          endAllocIndex
        ),
        length,
      };
    } else {
      newThread.nativeAllocations = {
        time,
        weight,
        weightType: nativeAllocations.weightType,
        stack,
        length,
      };
    }
  }

  return newThread;
}

/**
 * Filter the counter samples to the given range by iterating all of their sample groups.
 */
export function filterCounterSamplesToRange(
  counter: Counter,
  rangeStart: number,
  rangeEnd: number
): Counter {
  const newCounter = { ...counter };
  const { samples } = newCounter;

  // Intentionally get the inclusive sample indexes with this one instead of
  // getSampleIndexRangeForSelection because graphs like memory graph requires
  // one sample before and after to be in the sample range so the graph doesn't
  // look cut off.
  const [beginSampleIndex, endSampleIndex] =
    getInclusiveSampleIndexRangeForSelection(samples, rangeStart, rangeEnd);

  newCounter.samples = {
    length: endSampleIndex - beginSampleIndex,
    time: samples.time.slice(beginSampleIndex, endSampleIndex),
    count: samples.count.slice(beginSampleIndex, endSampleIndex),
    number: samples.number
      ? samples.number.slice(beginSampleIndex, endSampleIndex)
      : undefined,
  };

  return newCounter;
}

/**
 * Process the samples in the counter.
 */
export function processCounter(counter: Counter): Counter {
  const { samples } = counter;
  const count = samples.count.slice();
  const number =
    samples.number !== undefined ? samples.number.slice() : undefined;

  // These lines zero out the first values of the counters, as they are unreliable. In
  // addition, there are probably some missed counts in the memory counters, so the
  // first memory number slowly creeps up over time, and becomes very unrealistic.
  // In order to not be affected by these platform limitations, zero out the first
  // counter values.
  //
  // "Memory counter in Gecko Profiler isn't cleared when starting a new capture"
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1520587
  count[0] = 0;
  if (number !== undefined) {
    number[0] = 0;
  }

  return {
    ...counter,
    samples: {
      ...samples,
      number,
      count,
    },
  };
}

/**
 * The memory counter contains relative offsets of memory. In order to draw an interesting
 * graph, take the memory counts, and find the minimum and maximum values, by
 * accumulating them over the entire profile range. Then, map those values to the
 * accumulatedCounts array.
 */
export function accumulateCounterSamples(
  samples: CounterSamplesTable,
  sampleRange?: [IndexIntoSamplesTable, IndexIntoSamplesTable]
): AccumulatedCounterSamples {
  let minCount = 0;
  let maxCount = 0;
  let accumulated = 0;
  const accumulatedCounts = Array(samples.length).fill(0);
  // If a range is provided, use it instead. This will also include the
  // samples right before and after the range.
  const startSampleIndex = sampleRange ? sampleRange[0] : 0;
  const endSampleIndex = sampleRange ? sampleRange[1] : samples.length;

  for (let i = startSampleIndex; i < endSampleIndex; i++) {
    accumulated += samples.count[i];
    minCount = Math.min(accumulated, minCount);
    maxCount = Math.max(accumulated, maxCount);
    accumulatedCounts[i] = accumulated;
  }
  const countRange = maxCount - minCount;

  return {
    minCount,
    maxCount,
    countRange,
    accumulatedCounts,
  };
}

/**
 * Compute the max counter sample counts per milliseconds to determine the range
 * of a counter.
 * If a start-end range is provided, it only computes the max value between that
 * range.
 */
export function computeMaxCounterSampleCountPerMs(
  samples: CounterSamplesTable,
  profileInterval: Milliseconds,
  sampleRange?: [IndexIntoSamplesTable, IndexIntoSamplesTable]
): number {
  let maxCount = 0;
  // If a range is provided, use it instead. This will also include the
  // samples right before and after the range.
  const startSampleIndex = sampleRange ? sampleRange[0] : 0;
  const endSampleIndex = sampleRange ? sampleRange[1] : samples.length;

  for (let i = startSampleIndex; i < endSampleIndex; i++) {
    const count = samples.count[i];
    const sampleTimeDeltaInMs =
      i === 0 ? profileInterval : samples.time[i] - samples.time[i - 1];
    const countPerMs = count / sampleTimeDeltaInMs;
    maxCount = Math.max(countPerMs, maxCount);
  }

  return maxCount;
}

/**
 * Pre-processing of raw eventDelay values.
 *
 * We don't do 16ms event injection for responsiveness values anymore. Instead,
 * profiler records the time since running event blocked the input events. But
 * this value is not enough to calculate event delays by itself. We need to process
 * these values and turn them into event delays, which we can use for determining
 * responsiveness later.
 *
 * For every event that gets enqueued, the delay time will go up by the event's
 * running time at the time at which the event is enqueued. The delay function
 * will be a sawtooth of the following shape:
 *
 *              |\           |...
 *              | \          |
 *         |\   |  \         |
 *         | \  |   \        |
 *      |\ |  \ |    \       |
 *   |\ | \|   \|     \      |
 *   | \|              \     |
 *  _|                  \____|
 *
 * Calculate the delay of a new event added at time t: (run every sample)
 *
 *  TimeSinceRunningEventBlockedInputEvents = RunningEventDelay + (now - RunningEventStart);
 *  effective_submission = now - TimeSinceRunningEventBlockedInputEvents;
 *  delta = (now - last_sample_time);
 *  last_sample_time = now;
 *  for (t=effective_submission to now) {
 *     delay[t] += delta;
 *  }
 *
 * Note that TimeSinceRunningEventBlockedInputEvents is our eventDelay values in
 * the profile. So we don't have to calculate this. It's calculated in the gecko side already.
 *
 * This first algorithm is not efficient because we are running this loop for each sample.
 * Instead it can be reduced in overhead by:
 *
 *  TimeSinceRunningEventBlockedInputEvents = RunningEventDelay + (now - RunningEventStart);
 *  effective_submission = now - TimeSinceRunningEventBlockedInputEvents;
 *  if (effective_submission != last_submission) {
 *    delta = (now - last_submission);
 *    // this loop should be made to match each sample point in the range
 *    // intead of assuming 1ms sampling as this pseudocode does
 *    for (t=last_submission to effective_submission-1) {
 *       delay[t] += delta;
 *       delta -= 1; // assumes 1ms; adjust as needed to match for()
 *    }
 *    last_submission = effective_submission;
 *  }
 *
 * In this algorithm, we are running this only if effective submission is changed.
 * This reduces the calculation overhead a lot.
 * So we used the second algorithm in this function to make it faster.
 *
 * For instance the processed eventDelay values will be something like this:
 *
 *   [12 , 3, 42, 31, 22, 10, 3, 71, 65, 42, 23, 3, 33, 25, 5, 3]
 *         |___|              |___|              |___|
 *     A new event is    New event is enqueued   New event is enqueued
 *     enqueued
 *
 * A more realistic and minimal example:
 *  Unprocessed values
 *
 *   [0, 0, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 0, 0, 0]
 *          ^last submission           ^ effective submission
 *
 *  Will be converted to:
 *
 *   [0, 0, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
 *
 * If you want to learn more about this eventDelay value on gecko side, see:
 * https://searchfox.org/mozilla-central/rev/3811b11b5773c1dccfe8228bfc7143b10a9a2a99/tools/profiler/core/platform.cpp#3000-3186
 */
export function processEventDelays(
  samples: SamplesTable,
  interval: Milliseconds
): EventDelayInfo {
  if (!samples.eventDelay) {
    throw new Error(
      'processEventDelays step should not be called for older profiles'
    );
  }

  const eventDelays = new Float32Array(samples.length);
  const rawEventDelays = ensureExists(
    samples.eventDelay,
    'eventDelays field is not present in this profile'
  );
  let lastSubmission = samples.time[0];
  let lastSubmissionIdx = 0;

  // Skipping the first element because we don't have any sample of its past.
  for (let i = 1; i < samples.length; i++) {
    const currentEventDelay = rawEventDelays[i];
    const nextEventDelay = rawEventDelays[i + 1] || 0; // it can be null or undefined (for the last element)
    const now = samples.time[i];
    if (currentEventDelay === null || currentEventDelay === undefined) {
      // Ignore anything that's not numeric. This can happen if there is no responsiveness
      // information, or if the sampler failed to collect a responsiveness value. This
      // can happen intermittently.
      //
      // See Bug 1506226.
      continue;
    }

    if (currentEventDelay < nextEventDelay) {
      // The submission is still ongoing, we should get the next event delay
      // value until the submission ends.
      continue;
    }

    // This is a new submission
    const sampleSinceBlockedEvents = Math.trunc(currentEventDelay / interval);
    const effectiveSubmission = now - currentEventDelay;
    const effectiveSubmissionIdx = i - sampleSinceBlockedEvents;

    if (effectiveSubmissionIdx < 0) {
      // Unfortunately submissions that were started before the profiler start
      // time are not reliable because we don't have any sample data for earlier.
      // Skipping it.
      lastSubmission = now;
      lastSubmissionIdx = i;
      continue;
    }

    if (lastSubmissionIdx === effectiveSubmissionIdx) {
      // Bail out early since there is nothing to do.
      lastSubmission = effectiveSubmission;
      lastSubmissionIdx = effectiveSubmissionIdx;
      continue;
    }

    let delta = now - lastSubmission;
    for (let j = lastSubmissionIdx + 1; j <= effectiveSubmissionIdx; j++) {
      eventDelays[j] += delta;
      delta -= samples.time[j + 1] - samples.time[j];
    }

    lastSubmission = effectiveSubmission;
    lastSubmissionIdx = effectiveSubmissionIdx;
  }

  // We are done with processing the delays.
  // Calculate min/max delay and delay range
  let minDelay = Number.MAX_SAFE_INTEGER;
  let maxDelay = 0;
  for (const delay of eventDelays) {
    if (delay) {
      minDelay = Math.min(delay, minDelay);
      maxDelay = Math.max(delay, maxDelay);
    }
  }
  const delayRange = maxDelay - minDelay;

  return {
    eventDelays,
    minDelay,
    maxDelay,
    delayRange,
  };
}

/**
 * This function converts a stack information into a call node and
 * category path structure.
 */
export function convertStackToCallNodeAndCategoryPath(
  thread: Thread,
  stack: IndexIntoStackTable
): CallNodeAndCategoryPath {
  const { stackTable, frameTable } = thread;
  const path = [];
  for (
    let stackIndex = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    const index = stackTable.frame[stackIndex];
    path.push({
      category: stackTable.category[stackIndex],
      func: frameTable.func[index],
    });
  }
  return path.reverse();
}

/**
 * Compute maximum depth of call stack for a given thread, and return maxDepth+1.
 * This value can be used as the length for any per-depth arrays.
 *
 * The depth for a root node is zero.
 * So if you only a single sample whose call node is a root node, this function
 * returns 1.
 *
 * If there are no samples, or the stacks are all filtered out for the samples,
 * then 0 is returned.
 */
export function computeCallNodeMaxDepthPlusOne(
  samples: SamplesLikeTable,
  callNodeInfo: CallNodeInfo
): number {
  // Compute the depth on a per-sample basis. This is done since the callNodeInfo is
  // computed for the filtered thread, but a samples-like table can use the preview
  // filtered thread, which involves a subset of the total call nodes.
  let maxDepth = -1;
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  // TODO: Use sampleCallNodes instead
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
    const depth = callNodeTable.depth[callNodeIndex];
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return maxDepth + 1;
}

function _computeThreadWithInvertedStackTable(
  thread: Thread,
  defaultCategory: IndexIntoCategoryList
): {
  invertedThread: Thread,
  oldStackToNewStack: Map<IndexIntoStackTable, IndexIntoStackTable>,
} {
  return timeCode('_computeThreadWithInvertedStackTable', () => {
    const { stackTable, frameTable } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      category: [],
      subcategory: [],
      prefix: [],
    };
    // Create a Map that keys off of two values, both the prefix and frame combination
    // by using a bit of math: prefix * frameCount + frame => stackIndex
    const prefixAndFrameToStack = new Map();
    const frameCount = frameTable.length;

    // Returns the stackIndex for a specific frame (that is, a function and its
    // context), and a specific prefix. If it doesn't exist yet it will create
    // a new stack entry and return its index.
    function stackFor(prefix, frame, category, subcategory) {
      const prefixAndFrameIndex =
        (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        newStackTable.category[stackIndex] = category;
        newStackTable.subcategory[stackIndex] = subcategory;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
      } else if (newStackTable.category[stackIndex] !== category) {
        // If two stack nodes from the non-inverted stack tree with different
        // categories happen to collapse into the same stack node in the
        // inverted tree, discard their category and set the category to the
        // default category.
        newStackTable.category[stackIndex] = defaultCategory;
        newStackTable.subcategory[stackIndex] = 0;
      } else if (newStackTable.subcategory[stackIndex] !== subcategory) {
        // If two stack nodes from the non-inverted stack tree with the same
        // category but different subcategories happen to collapse into the same
        // stack node in the inverted tree, discard their subcategory and set it
        // to the "Other" subcategory.
        newStackTable.subcategory[stackIndex] = 0;
      }
      return stackIndex;
    }

    const oldStackToNewStack = new Map();

    // For one specific stack, this will ensure that stacks are created for all
    // of its ancestors, by walking its prefix chain up to the root.
    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        newStack = null;
        for (
          let currentStack = stackIndex;
          currentStack !== null;
          currentStack = stackTable.prefix[currentStack]
        ) {
          // Notice how we reuse the previous stack as the prefix. This is what
          // effectively inverts the call tree.
          newStack = stackFor(
            newStack,
            stackTable.frame[currentStack],
            stackTable.category[currentStack],
            stackTable.subcategory[currentStack]
          );
        }
        oldStackToNewStack.set(stackIndex, ensureExists(newStack));
      }
      return newStack;
    }

    const invertedThread = updateThreadStacks(
      thread,
      newStackTable,
      convertStack
    );
    return { invertedThread, oldStackToNewStack };
  });
}

/**
 * Sometimes we want to update the stacks for a thread, for instance while searching
 * for a text string, or doing a call tree transformation. This function abstracts
 * out the manipulation of the data structures so that we can properly update
 * the stack table and any possible allocation information.
 */
export function updateThreadStacksByGeneratingNewStackColumns(
  thread: Thread,
  newStackTable: StackTable,
  computeMappedStackColumn: (
    Array<IndexIntoStackTable | null>,
    Array<Milliseconds>
  ) => Array<IndexIntoStackTable | null>,
  computeMappedSyncBacktraceStackColumn: (
    Array<IndexIntoStackTable | null>,
    Array<Milliseconds>
  ) => Array<IndexIntoStackTable | null>,
  computeMappedMarkerDataColumn: (
    Array<MarkerPayload | null>
  ) => Array<MarkerPayload | null>
): Thread {
  const { jsAllocations, nativeAllocations, samples, markers } = thread;

  const newSamples = {
    ...samples,
    stack: computeMappedStackColumn(samples.stack, samples.time),
  };

  const newMarkers = {
    ...markers,
    data: computeMappedMarkerDataColumn(markers.data),
  };

  const newThread = {
    ...thread,
    samples: newSamples,
    markers: newMarkers,
    stackTable: newStackTable,
  };

  if (jsAllocations) {
    // Map the JS allocations stacks if there are any.
    newThread.jsAllocations = {
      ...jsAllocations,
      stack: computeMappedSyncBacktraceStackColumn(
        jsAllocations.stack,
        jsAllocations.time
      ),
    };
  }
  if (nativeAllocations) {
    // Map the native allocations stacks if there are any.
    newThread.nativeAllocations = {
      ...nativeAllocations,
      stack: computeMappedSyncBacktraceStackColumn(
        nativeAllocations.stack,
        nativeAllocations.time
      ),
    };
  }

  return newThread;
}

/**
 * A simpler variant of updateThreadStacksByGeneratingNewStackColumns which just
 * accepts a convertStack function. Use this when you don't need to filter by
 * sample timestamp.
 */
export function updateThreadStacks(
  thread: Thread,
  newStackTable: StackTable,
  convertStack: (IndexIntoStackTable | null) => IndexIntoStackTable | null
): Thread {
  return updateThreadStacksSeparate(
    thread,
    newStackTable,
    convertStack,
    convertStack
  );
}

/**
 * Like updateThreadStacks, but accepts separate functions for converting sample
 * stacks and sync backtrace stacks. There is only one reason to treat the two
 * differently: Sample stacks start with a frame address which was sampled from
 * the instruction pointer, and sync backtrace stacks start with a frame address
 * that was originally derived from a return address (because there were other
 * frames on the native stack which have been stripped).
 */
export function updateThreadStacksSeparate(
  thread: Thread,
  newStackTable: StackTable,
  convertStack: (IndexIntoStackTable | null) => IndexIntoStackTable | null,
  convertSyncBacktraceStack: (
    IndexIntoStackTable | null
  ) => IndexIntoStackTable | null
): Thread {
  function convertMarkerData(
    oldData: MarkerPayload | null
  ): MarkerPayload | null {
    if (oldData && 'cause' in oldData && oldData.cause) {
      // Replace the cause with the right stack index.
      // $FlowExpectError Flow is failing to refine oldData.type based on the `cause` field check
      return {
        ...oldData,
        cause: {
          ...oldData.cause,
          stack: convertSyncBacktraceStack(oldData.cause.stack),
        },
      };
    }
    return oldData;
  }

  return updateThreadStacksByGeneratingNewStackColumns(
    thread,
    newStackTable,
    (stackColumn, _timeColumn) =>
      stackColumn.map((oldStack) => convertStack(oldStack)),
    (stackColumn, _timeColumn) =>
      stackColumn.map((oldStack) => convertSyncBacktraceStack(oldStack)),
    (markerDataColumn) => markerDataColumn.map(convertMarkerData)
  );
}

/**
 * When manipulating stack tables, the most common operation is to map from one
 * stack to a new stack using a Map. This function returns another function that
 * does this work. It is used in conjunction with updateThreadStacks().
 */
export function getMapStackUpdater(
  oldStackToNewStack: Map<
    null | IndexIntoStackTable,
    null | IndexIntoStackTable,
  >
): (IndexIntoStackTable | null) => IndexIntoStackTable | null {
  return (oldStack: IndexIntoStackTable | null) => {
    if (oldStack === null) {
      return null;
    }
    const newStack = oldStackToNewStack.get(oldStack);
    if (newStack === undefined) {
      throw new Error(
        'Could not find a stack when converting from an old stack to new stack.'
      );
    }
    return newStack;
  };
}

export function getSampleIndexClosestToStartTime(
  samples: SamplesTable,
  time: number,
  interval: Milliseconds
): IndexIntoSamplesTable {
  // Bisect to find the index of the first sample after the provided time.
  const index = bisectionRight(samples.time, time);

  if (index === 0) {
    return 0;
  }

  if (index === samples.length) {
    return samples.length - 1;
  }

  // Check the distance between the provided time and the center of the bisected sample
  // and its predecessor.
  const previousIndex = index - 1;

  let weight = interval;
  let previousWeight = interval;
  if (samples.weight) {
    const samplesWeight = samples.weight;
    weight = Math.abs(samplesWeight[index]);
    previousWeight = Math.abs(samplesWeight[previousIndex]);
  }

  const distanceToThis = samples.time[index] + weight / 2 - time;
  const distanceToLast =
    time - (samples.time[previousIndex] + previousWeight / 2);
  return distanceToThis < distanceToLast ? index : index - 1;
}

/*
 * Returns the sample index that is closest to *adjusted* sample time. This is a
 * very similar function to getSampleIndexClosestToStartTime. The difference is that
 * the other function uses the raw time values, on the other hand, this function
 * uses the adjusted time. In this context, adjusted time means that `time` array
 * represent the "center" of the sample, and raw values represent the "start" of
 * the sample.
 */
export function getSampleIndexClosestToCenteredTime(
  samples: SamplesTable,
  time: number
): IndexIntoSamplesTable {
  // Bisect to find the index of the first sample after the provided time.
  const index = bisectionRight(samples.time, time);

  if (index === 0) {
    return 0;
  }

  if (index === samples.length) {
    return samples.length - 1;
  }

  // Check the distance between the provided time and the center of the bisected sample
  // and its predecessor.
  const previousIndex = index - 1;
  let distanceToThis;
  let distanceToLast;

  if (samples.weight) {
    const samplesWeight = samples.weight;
    const weight = Math.abs(samplesWeight[index]);
    const previousWeight = Math.abs(samplesWeight[previousIndex]);

    distanceToThis = samples.time[index] + weight / 2 - time;
    distanceToLast = time - (samples.time[previousIndex] + previousWeight / 2);
  } else {
    distanceToThis = samples.time[index] - time;
    distanceToLast = time - samples.time[previousIndex];
  }

  return distanceToThis < distanceToLast ? index : index - 1;
}

export function getFriendlyThreadName(
  threads: Thread[],
  thread: Thread
): string {
  let label;
  let homonymThreads;

  switch (thread.name) {
    case 'GeckoMain': {
      if (thread['eTLD+1']) {
        // Use the site name if it's provided by the back-end and it's not sanitized.
        label = thread['eTLD+1'];
        homonymThreads = threads.filter((thread) => {
          return thread.name === 'GeckoMain' && thread['eTLD+1'] === label;
        });
      } else if (thread.processName) {
        // If processName is present, use that as it should contain a friendly name.
        // We want to use that for the GeckoMain thread because it is shown as the
        // root of other threads in each process group.
        label = thread.processName;
        homonymThreads = threads.filter((thread) => {
          return thread.name === 'GeckoMain' && thread.processName === label;
        });
      } else {
        switch (thread.processType) {
          case 'default':
            label = 'Parent Process';
            break;
          case 'gpu':
            label = 'GPU Process';
            break;
          case 'rdd':
            label = 'Remote Data Decoder';
            break;
          case 'tab': {
            label = 'Content Process';
            homonymThreads = threads.filter((thread) => {
              return (
                thread.name === 'GeckoMain' && thread.processType === 'tab'
              );
            });
            break;
          }
          case 'plugin':
            label = 'Plugin Process';
            break;
          case 'socket':
            label = 'Socket Process';
            break;
          default:
          // should we throw here ?
        }
      }
      break;
    }
    default:
  }

  if (!label) {
    label = thread.name;
  }

  // Check if homonymThreads are provided and append "(index/total)" numbers to
  // the label if that's the case.
  if (homonymThreads && homonymThreads.length > 1) {
    const index = 1 + homonymThreads.indexOf(thread);
    label += ` (${index}/${homonymThreads.length})`;
  }

  return label;
}

export function getThreadProcessDetails(
  thread: Thread,
  friendlyThreadName: string
): string {
  let label = `${friendlyThreadName}\n`;
  label += `Thread: "${thread.name}"`;
  if (thread.tid !== undefined) {
    label += ` (${thread.tid})`;
  }

  if (thread.processType) {
    label += `\nProcess: "${thread.processType}"`;
    if (thread.pid !== undefined) {
      label += ` (${thread.pid})`;
    }
  }

  if (thread.isPrivateBrowsing) {
    label += '\nPrivate Browsing: Yes';
  }

  if (thread.userContextId) {
    // If present and non-zero, this page was loaded inside a container.
    label += `\nContainer Id: ${thread.userContextId}`;
  }

  return label;
}

// Determines which information to show in the "origin annotation" if both an
// origin name and a filename are present.
// A return value of true means "show both", false means "only show filename."
function _shouldShowBothOriginAndFileName(
  fileName: string,
  origin: string,
  resourceType: resourceTypeEnum | null
): boolean {
  // If the origin string is just a URL prefix that's part of the
  // filename, it doesn't add any useful information, so only show
  // the filename.
  if (fileName.startsWith(origin)) {
    return false;
  }

  // For native code (resource type "library"), if we have the filename of the
  // source code, only show the filename and not the library name.
  if (resourceType === resourceTypes.library) {
    return false;
  }

  // If the resource is something else (e.g., an extension), show origin and filename.
  return true;
}

/**
 * This function returns the source origin for a function. This can be:
 * - a filename (javascript or object file or c++ source file)
 * - a URL (if the source is a website)
 */
export function getOriginAnnotationForFunc(
  funcIndex: IndexIntoFuncTable,
  funcTable: FuncTable,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray,
  frameLineNumber: number | null = null,
  frameColumnNumber: number | null = null
): string {
  let resourceType = null;
  let origin = null;
  const resourceIndex = funcTable.resource[funcIndex];
  if (resourceIndex !== -1) {
    resourceType = resourceTable.type[resourceIndex];
    const resourceNameIndex = resourceTable.name[resourceIndex];
    origin = stringTable.getString(resourceNameIndex);
  }

  const fileNameIndex = funcTable.fileName[funcIndex];
  let fileName;
  if (fileNameIndex !== null) {
    fileName = stringTable.getString(fileNameIndex);

    // Strip off any filename decorations from symbolication. It could be a path
    // (potentially using "special path" syntax, e.g. hg:...), or it could be a
    // URL, if the function is a JS function. If it's a path from symbolication,
    // strip it down to just the actual path.
    fileName = parseFileNameFromSymbolication(fileName).path;

    if (frameLineNumber !== null) {
      fileName += ':' + frameLineNumber;
      if (frameColumnNumber !== null) {
        fileName += ':' + frameColumnNumber;
      }
    } else {
      const lineNumber = funcTable.lineNumber[funcIndex];
      if (lineNumber !== null) {
        fileName += ':' + lineNumber;
        const columnNumber = funcTable.columnNumber[funcIndex];
        if (columnNumber !== null) {
          fileName += ':' + columnNumber;
        }
      }
    }
  }

  if (fileName) {
    if (
      origin &&
      _shouldShowBothOriginAndFileName(fileName, origin, resourceType)
    ) {
      return `${origin}: ${fileName}`;
    }
    return fileName;
  }

  if (origin) {
    return origin;
  }

  return '';
}

/**
 * Reserve functions in the thread's funcTable which may be needed for transforms
 * in the transform stack, so that transforms can keep the funcTable unchanged.
 *
 * This returns a new thread with an extended funcTable.
 *
 * At the moment, the only functions we reserve are "collapsed resource" functions.
 * These are used by the "collapse resource" transform.
 */
export function reserveFunctionsInThread(
  thread: Thread
): ThreadWithReservedFunctions {
  const funcTable = shallowCloneFuncTable(thread.funcTable);
  const reservedFunctionsForResources = new Map();
  const jsResourceTypes = [
    resourceTypes.addon,
    resourceTypes.url,
    resourceTypes.webhost,
    resourceTypes.otherhost,
  ];
  const { resourceTable } = thread;
  for (
    let resourceIndex = 0;
    resourceIndex < resourceTable.length;
    resourceIndex++
  ) {
    const resourceType = resourceTable.type[resourceIndex];
    const name = resourceTable.name[resourceIndex];
    const isJS = jsResourceTypes.includes(resourceType);
    const fileName = resourceType === resourceTypes.url ? name : null;
    const funcIndex = funcTable.length;
    funcTable.isJS.push(isJS);
    funcTable.relevantForJS.push(isJS);
    funcTable.name.push(name);
    funcTable.resource.push(resourceIndex);
    funcTable.fileName.push(fileName);
    funcTable.lineNumber.push(null);
    funcTable.columnNumber.push(null);
    funcTable.length++;
    reservedFunctionsForResources.set(resourceIndex, funcIndex);
  }
  return {
    thread: { ...thread, funcTable },
    reservedFunctionsForResources,
  };
}

/**
 * From a valid call node path, this function returns a list of information
 * about each function in this path: their names and their origins.
 */
export function getFuncNamesAndOriginsForPath(
  path: CallNodeAndCategoryPath,
  thread: Thread
): Array<{
  funcName: string,
  category: IndexIntoCategoryList,
  isFrameLabel: boolean,
  origin: string,
}> {
  const { funcTable, stringTable, resourceTable } = thread;

  return path.map((frame) => {
    const { category, func } = frame;
    return {
      funcName: stringTable.getString(funcTable.name[func]),
      category: category,
      isFrameLabel: funcTable.resource[func] === -1,
      origin: getOriginAnnotationForFunc(
        func,
        funcTable,
        resourceTable,
        stringTable
      ),
    };
  });
}

/**
 * Return a function that can compare two samples' call nodes, and determine
 * which node is "before" the other.
 * We use the call node index for this order. In the call node table, call nodes
 * are ordered in depth-first traversal order, so we can just compare those
 * indexes.
 *
 * This order is used for the activity graph. The tree order comparator is used
 * specifically for hit testing, but we also compare call nodes in the same way
 * in mapCallNodeSelectedStatesToSamples, which is what gets used for determining
 * which areas of the graph to draw in with the selection highlight fill.
 *
 * "Ordered after" means "swims on top in the activity graph".
 *
 * The depth-first traversal order has the nice property that the nodes of a
 * subtree are located in a contiguous index range. This means that the
 * highlighted area for a selected subtree is contiguous in the graph.
 */
export function getTreeOrderComparator(
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): (IndexIntoSamplesTable, IndexIntoSamplesTable) => number {
  /**
   * Determine the ordering of (possibly null) call nodes for two given samples.
   * Returns a value < 0 if sampleA is ordered before sampleB,
   *                 > 0 if sampleA is ordered after sampleB,
   *                == 0 if there is no ordering between sampleA and sampleB.
   * Samples which are filtered out, i.e. for which sampleCallNodes[sample] is
   * null, are ordered *after* samples which are not filtered out.
   */
  return function treeOrderComparator(
    sampleA: IndexIntoSamplesTable,
    sampleB: IndexIntoSamplesTable
  ): number {
    const callNodeA = sampleCallNodes[sampleA];
    const callNodeB = sampleCallNodes[sampleB];

    if (callNodeA === null) {
      if (callNodeB === null) {
        // Both samples are filtered out
        return 0;
      }
      // A filtered out, B not filtered out. A goes after B.
      return 1;
    }
    if (callNodeB === null) {
      // B filtered out, A not filtered out. B goes after A.
      return -1;
    }
    return callNodeA - callNodeB;
  };
}

export function getFriendlyStackTypeName(
  implementation: StackImplementation
): string {
  switch (implementation) {
    case 'interpreter':
      return 'JS interpreter';
    case 'blinterp':
    case 'baseline':
    case 'ion':
      return `JS JIT (${implementation})`;
    case 'native':
      return 'Native code';
    case 'unknown':
      return implementation;
    default:
      throw assertExhaustiveCheck(implementation);
  }
}

export function shouldDisplaySubcategoryInfoForCategory(
  category: Category
): boolean {
  // The first subcategory of every category is the "Other" subcategory.
  // For categories which only have the "Other" subcategory and no other
  // subcategories, don't display any subcategory information.
  return category.subcategories.length > 1;
}

/** Interprets sub category 0 as the category itself */
export function getCategoryPairLabel(
  categories: CategoryList,
  categoryIndex: number,
  subcategoryIndex: number
): string {
  const category = categories[categoryIndex];
  return subcategoryIndex !== 0
    ? `${category.name}: ${category.subcategories[subcategoryIndex]}`
    : `${category.name}`;
}

/**
 * This function filters to only positive memory size values in the native allocations.
 * It removes all of the deallocation information.
 */
export function filterToAllocations(
  nativeAllocations: NativeAllocationsTable
): NativeAllocationsTable {
  let newNativeAllocations;
  if (nativeAllocations.memoryAddress) {
    newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight > 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.memoryAddress.push(
          nativeAllocations.memoryAddress[i]
        );
        newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
        newNativeAllocations.length++;
      }
    }
  } else {
    newNativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight > 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.length++;
      }
    }
  }
  return newNativeAllocations;
}

/**
 * This function filters to only negative memory size values in the native allocations.
 * It shows all of the memory frees.
 */
export function filterToDeallocationsSites(
  nativeAllocations: NativeAllocationsTable
): NativeAllocationsTable {
  let newNativeAllocations;
  if (nativeAllocations.memoryAddress) {
    newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight < 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.memoryAddress.push(
          nativeAllocations.memoryAddress[i]
        );
        newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
        newNativeAllocations.length++;
      }
    }
  } else {
    newNativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
    for (let i = 0; i < nativeAllocations.length; i++) {
      const weight = nativeAllocations.weight[i];
      if (weight < 0) {
        newNativeAllocations.time.push(nativeAllocations.time[i]);
        newNativeAllocations.stack.push(nativeAllocations.stack[i]);
        newNativeAllocations.weight.push(weight);
        newNativeAllocations.length++;
      }
    }
  }
  return newNativeAllocations;
}

/**
 * This function filters to only negative memory size values in the native allocations.
 * It rewrites the stacks to point back to the stack of the allocation.
 */
export function filterToDeallocationsMemory(
  nativeAllocations: BalancedNativeAllocationsTable
): NativeAllocationsTable {
  // This is how the allocation table looks like:
  // A-----D------A-------D

  // This is like a Map<MemoryAddress, IndexIntoStackTable | null>;
  const memoryAddressToAllocationSite: Array<IndexIntoStackTable | null> = [];
  const newDeallocations = getEmptyBalancedNativeAllocationsTable();

  for (
    let allocationIndex = 0;
    allocationIndex < nativeAllocations.length;
    allocationIndex++
  ) {
    const bytes = nativeAllocations.weight[allocationIndex];
    const memoryAddress = nativeAllocations.memoryAddress[allocationIndex];
    if (bytes >= 0) {
      // This is an allocation.

      // Provide a map back to this index.
      if (memoryAddress in memoryAddressToAllocationSite) {
        console.error(oneLine`
          The address ${memoryAddress} was already present when we wanted to add it.
          This probably means the deallocation wasn't collected, which may sometimes
          happen. We will overwrite the previous entry.
        `);
      }
      memoryAddressToAllocationSite[memoryAddress] =
        nativeAllocations.stack[allocationIndex];
      continue;
    }

    // This is a deallocation.
    // Lookup the previous allocation.
    const allocationStackIndex = memoryAddressToAllocationSite[memoryAddress];
    if (allocationStackIndex === undefined) {
      // This deallocation doesn't match an allocation. Let's bail out.
      continue;
    }

    // This deallocation matches a previous allocation.
    newDeallocations.time.push(nativeAllocations.time[allocationIndex]);
    newDeallocations.stack.push(allocationStackIndex);
    newDeallocations.weight.push(bytes);
    newDeallocations.memoryAddress.push(memoryAddress);
    newDeallocations.threadId.push(nativeAllocations.threadId[allocationIndex]);
    newDeallocations.length++;

    // Remove the saved allocation
    delete memoryAddressToAllocationSite[memoryAddress];
  }

  return newDeallocations;
}

/**
 * Currently the native allocations naively collect allocations and deallocations.
 * There is no attempt to match up the sampled allocations with the deallocations.
 * Because of this, if a calltree were to combine both allocations and deallocations,
 * then the summary would most likely lie and not misreport leaked or retained memory.
 * For now, filter to only showing allocations or deallocations.
 *
 * This function filters to only positive values.
 */
export function filterToRetainedAllocations(
  nativeAllocations: BalancedNativeAllocationsTable
): NativeAllocationsTable {
  // A-----D------A-------D
  type Address = number;
  type IndexIntoAllocations = number;
  const memoryAddressToAllocation: Map<Address, IndexIntoAllocations> =
    new Map();
  const retainedAllocation = [];
  for (
    let allocationIndex = 0;
    allocationIndex < nativeAllocations.length;
    allocationIndex++
  ) {
    const bytes = nativeAllocations.weight[allocationIndex];
    const memoryAddress = nativeAllocations.memoryAddress[allocationIndex];
    if (bytes >= 0) {
      // Handle the allocation.

      // Provide a map back to this index.
      memoryAddressToAllocation.set(memoryAddress, allocationIndex);
      retainedAllocation[allocationIndex] = true;
    } else {
      // Do not retain deallocations.
      retainedAllocation[allocationIndex] = false;

      // Lookup the previous allocation.
      const previousAllocationIndex =
        memoryAddressToAllocation.get(memoryAddress);
      if (previousAllocationIndex !== undefined) {
        // This deallocation matches a previous allocation. Remove the allocation.
        retainedAllocation[previousAllocationIndex] = false;
        // There is a match, so delete this old association.
        memoryAddressToAllocation.delete(memoryAddress);
      }
    }
  }

  const newNativeAllocations = getEmptyBalancedNativeAllocationsTable();
  for (let i = 0; i < nativeAllocations.length; i++) {
    const weight = nativeAllocations.weight[i];
    if (retainedAllocation[i]) {
      newNativeAllocations.time.push(nativeAllocations.time[i]);
      newNativeAllocations.stack.push(nativeAllocations.stack[i]);
      newNativeAllocations.weight.push(weight);
      newNativeAllocations.memoryAddress.push(
        nativeAllocations.memoryAddress[i]
      );
      newNativeAllocations.threadId.push(nativeAllocations.threadId[i]);
      newNativeAllocations.length++;
    }
  }

  return newNativeAllocations;
}

/**
 * Extract the hostname and favicon from the last page for all tab ids. we
 * assume that the user wants to know about the last loaded page in this tab.
 * Returns null if we don't have information about pages (in older profiles).
 */
export function extractProfileFilterPageData(
  pagesMapByTabID: Map<TabID, PageList> | null,
  extensionIDToNameMap: Map<string, string> | null
): Map<TabID, ProfileFilterPageData> {
  if (pagesMapByTabID === null) {
    // We don't have pages array (which is the case for older profiles). Return early.
    return new Map();
  }

  const pageDataByTabID = new Map();
  for (const [tabID, pages] of pagesMapByTabID) {
    let topMostPages = pages.filter(
      (page) =>
        // It's the top-most frame if `embedderInnerWindowID` is zero.
        page.embedderInnerWindowID === 0
    );

    if (topMostPages.length > 1) {
      // If there are more than one top-most page, it's also good to filter out the
      // `about:` pages so user can see their url they are actually profiling.
      topMostPages = topMostPages.filter(
        (page) => !page.url.startsWith('about:')
      );
    }

    if (topMostPages.length === 0) {
      // There should be at least one topmost page.
      console.error(
        `Expected at least one topmost page for tabID ${tabID} but couldn't find it.`
      );
      continue;
    }

    // The last page is the one we care about.
    const pageUrl = topMostPages[topMostPages.length - 1].url;
    if (pageUrl.startsWith('about:')) {
      // If we only have an `about:*` page, we should return early with a friendly
      // origin and hostname. Otherwise the try block will always fail.
      pageDataByTabID.set(tabID, {
        origin: pageUrl,
        hostname: pageUrl,
        favicon: null,
      });
      continue;
    }

    // Constructing the page data outside of the try-catch block, and adding it
    // to the map outside of it as well. This is mostly because some favicon URL
    // constructions might fail and we don't want to miss them still. We should
    // always have at least a hostname, which is needed for displaying the tab
    // name.
    // The known failing case is when we try to construct a URL with a
    // moz-extension:// protocol on platforms outside of Firefox. Only Firefox
    // can parse it properly. Chrome and node will output a URL with no `origin`.
    const pageData: ProfileFilterPageData = {
      origin: '',
      hostname: '',
      favicon: null,
    };

    try {
      const page = new URL(pageUrl);

      pageData.hostname =
        extensionIDToNameMap && pageUrl.startsWith('moz-extension://')
          ? // Get the real extension name if it's an extension.
            (extensionIDToNameMap.get(
              'moz-extension://' +
                // For non-Firefox browsers, we can't construct a URL object
                // with the 'moz-extension://' protocol properly. So we have to
                // have a fallback that uses simple string split.
                (page.hostname ? page.hostname : pageUrl.split('/')[2]) +
                '/'
            ) ?? '')
          : page.hostname;

      // FIXME(Bug 1620546): This is not ideal and we should get the favicon
      // either during profile capture or profile pre-process.
      pageData.origin = page.origin;
      const favicon = new URL('/favicon.ico', page.origin);
      if (favicon.protocol === 'http:') {
        // Upgrade http requests.
        favicon.protocol = 'https:';
      }
      pageData.favicon = favicon.href;
    } catch (e) {
      console.warn(
        'Error while extracing the hostname and favicon from the page url',
        pageUrl
      );
    }

    // Adding it to the map outside of the try-catch block, just in case something
    // might fail.
    pageDataByTabID.set(tabID, pageData);
  }

  return pageDataByTabID;
}

// Returns the resource index for a "url" or "webhost" resource which is created
// on demand based on the script URI.
export function getOrCreateURIResource(
  scriptURI: string,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray,
  originToResourceIndex: Map<string, IndexIntoResourceTable>
): IndexIntoResourceTable {
  // Figure out the origin and host.
  let origin;
  let host;
  try {
    const url = new URL(scriptURI);
    if (
      !(
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'moz-extension:'
      )
    ) {
      throw new Error('not a webhost or extension protocol');
    }
    origin = url.origin;
    host = url.host;
  } catch (e) {
    origin = scriptURI;
    host = null;
  }

  let resourceIndex = originToResourceIndex.get(origin);
  if (resourceIndex !== undefined) {
    return resourceIndex;
  }

  resourceIndex = resourceTable.length++;
  originToResourceIndex.set(origin, resourceIndex);
  if (host) {
    // This is a webhost URL.
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = stringTable.indexForString(origin);
    resourceTable.host[resourceIndex] = stringTable.indexForString(host);
    resourceTable.type[resourceIndex] = resourceTypes.webhost;
  } else {
    // This is a URL, but it doesn't point to something on the web, e.g. a
    // chrome url.
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = stringTable.indexForString(scriptURI);
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = resourceTypes.url;
  }
  return resourceIndex;
}

/**
 * See the ThreadsKey type for an explanation.
 */
export function getThreadsKey(threadIndexes: Set<ThreadIndex>): ThreadsKey {
  if (threadIndexes.size === 1) {
    // Return the ThreadIndex directly if there is only one thread.
    // We know this value exists because of the size check, even if Flow doesn't.
    return ensureExists(getFirstItemFromSet(threadIndexes));
  }

  return [...threadIndexes].sort((a, b) => b - a).join(',');
}

/**
 * Checks if threadIndexesSet contains all the threads in the threadsKey.
 */
export function hasThreadKeys(
  threadIndexesSet: Set<ThreadIndex>,
  threadsKey: ThreadsKey
): boolean {
  const threadIndexes = ('' + threadsKey).split(',').map((n) => +n);
  for (const threadIndex of threadIndexes) {
    if (!threadIndexesSet.has(threadIndex)) {
      return false;
    }
  }
  return true;
}

export type StackReferences = {|
  // Stacks which were sampled by sampling. For native stacks, the
  // corresponding frame address was observed as a value of the instruction
  // pointer register.
  samplingSelfStacks: Set<IndexIntoStackTable>,
  // Stacks which were obtained during a synchronous backtrace. For
  // native stacks, the corresponding frame address is *not* an observed
  // value of the instruction pointer, because synchronous backtraces have
  // a few frames removed from the end of the stack, which includes the
  // frame with the instruction pointer. This difference only matters for
  // "return address nudging" which happens at the end of profile processing.
  syncBacktraceSelfStacks: Set<IndexIntoStackTable>,
|};

/**
 * Find the sets of stacks that are referenced as "self" stacks by
 * various tables in the thread.
 * The stacks' ancestor nodes are not included (except for any ancestor
 * nodes that had self time, i.e. were also referenced directly).
 * The returned sets are split into two groups: Stacks referenced by
 * samples, and stacks referenced by sync backtraces (e.g. marker causes).
 * The two have slightly different properties, see the type definition.
 */
export function gatherStackReferences(thread: Thread): StackReferences {
  const samplingSelfStacks = new Set();
  const syncBacktraceSelfStacks = new Set();

  const { samples, markers, jsAllocations, nativeAllocations } = thread;

  // Samples
  for (let i = 0; i < samples.length; i++) {
    const stack = samples.stack[i];
    if (stack !== null) {
      samplingSelfStacks.add(stack);
    }
  }

  // Markers
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (data && data.cause) {
      const stack = data.cause.stack;
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  // JS allocations
  if (jsAllocations !== undefined) {
    for (let i = 0; i < jsAllocations.length; i++) {
      const stack = jsAllocations.stack[i];
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  // Native allocations
  if (nativeAllocations !== undefined) {
    for (let i = 0; i < nativeAllocations.length; i++) {
      const stack = nativeAllocations.stack[i];
      if (stack !== null) {
        syncBacktraceSelfStacks.add(stack);
      }
    }
  }

  return { samplingSelfStacks, syncBacktraceSelfStacks };
}

/**
 * Creates a new thread with modified frame and stack tables for "nudged" return addresses:
 * All return addresses are moved backwards by one byte, to point into the "call"
 * instruction. This allows symbolication to obtain accurate line numbers and inline frames
 * for these frames.
 * Addresses which were sampled from the instruction pointer register remain unchanged.
 * Non-native frames (i.e profiler label frames or JS frames) also remain unchanged.
 *
 * This function is called at the end of profile processing. In the Gecko profile format,
 * caller frame addresses are return addresses. In the processed profile format, caller
 * frame addresses point at/into the call instruction.
 *
 * # Motivation
 *
 * When the profiler captures a stack, the frame addresses in the stack come from two
 * different sources:
 *
 *  1. The top frame comes from the instruction pointer register. The register contains the
 *     address of the instruction that is currently executing.
 *  2. The other frames come from stack walking. Stack walkers calculate the return
 *     addresses for all caller functions that are on the stack. A "return address" is the
 *     address that the CPU will jump to once the called function returns. It is the
 *     address of the instruction *after* the "call" instruction.
 *     The Gecko profile format assumes that all caller frame addresses are return
 *     addresses.
 *
 * Here's an example, where _LZ4F_compressUpdate calls _LZ4F_localSaveDict and the
 * CPU was observed executing an instruction in _LZ4F_localSaveDict.
 * The frame addresses in the stack are: [..., 0x5783a, 0x57c17].
 * (The example uses libmozglue.dylib 64EC2645330C3A0BA6E4EBCD28A1B5940.)
 *
 * Top of stack:
 *   _LZ4F_localSaveDict:
 *     57c10  push  rbp
 *     57c11  mov   rbp, rsp
 *     57c14  mov   rax, rdi
 * --> 57c17  cmp   dword [rdi+0x20], 0x2    ; instruction pointer, address maps to line 808
 *     57c1b  mov   rdi, qword [rdi+0xa8]
 *     57c22  jle   loc_57c33
 *     [...]
 *
 * Caller:
 *   _LZ4F_compressUpdate:
 *     [...]
 *     5782d  jmp   loc_5765f
 *     57832  mov   rdi, rbx
 *     57835  call  _LZ4F_localSaveDict       ; call instruction, address maps to line 897
 * --> 5783a  test  eax, eax                  ; return address,   address maps to line 898
 *     5783c  mov   rcx, 0xffffffffffffffff
 *     [...]
 *
 * Corresponding C code:
 *
 * [...]
 * 893    if ((cctxPtr->prefs.frameInfo.blockMode==LZ4F_blockLinked) && (lastBlockCompressed==fromSrcBuffer)) {
 * 894        if (compressOptionsPtr->stableSrc) {
 * 895            cctxPtr->tmpIn = cctxPtr->tmpBuff;
 * 896        } else {
 * 897            int const realDictSize = LZ4F_localSaveDict(cctxPtr);   // <-- here is the call
 * 898            if (realDictSize==0) return err0r(LZ4F_ERROR_GENERIC);  // <-- here is the line we'd get for the return address
 * 899            cctxPtr->tmpIn = cctxPtr->tmpBuff + realDictSize;
 * 900        }
 * 901    }
 * [...]
 *
 * During symbolication, we resolve each address to a source file + line number.
 * However, if we were to look up the line number for a return address, we get the
 * line number for the instruction *after* the "call" instruction. In the example,
 * 0x5783a is the return address, and symbolicating 0x5783a gives us line number 898.
 * This is not the line number we want! We want to know *which line contains the
 * function call*. So we need to look up the address of the call instruction, or at
 * least an address that falls "inside" the call instruction.
 * In the example, the call instruction is at 0x57835 and the return address is 0x5783a.
 * So the call instruction occupies 5 bytes starting at 0x57835. Any address in that
 * range, i.e. any address with `0x57835 <= address && address < 0x5783a`, will
 * symbolicate to line number 897. This is the line number we want.
 *
 * To keep it simple, we will just subtract one byte from the return address. This
 * won't point at the start of the call instruction, but it will point inside of it,
 * which is good enough.
 *
 * ## Alternatives
 *
 * There are two places where we could potentially perform the one-byte adjustment:
 * We can bake it into the frame table, or we can leave the frame table as-is and
 * do the adjustment only when we prepare the symbolication request. For the latter,
 * we would need a way to know which addresses need adjustment and which do not.
 * So we'd need a per-frame bit (e.g. a new frame table column) to differentiate
 * these frames.
 * However, we don't really have a use for the unchanged return address. The only
 * places where we make use of the frame address is during symbolication, and, in the
 * future, in an assembly view. Both uses want to account the sample time to the
 * calling instruction.
 * So for simplicity, this function chooses the "bake it into the frame table"
 * approach, and the processed format is documented to contain this adjustment.
 *
 * ## Summary
 *
 * To reiterate: The adjustment performed by this function is absolutely critical
 * for useful line numbers.  It may be "just one byte", but it makes all the
 * difference in having trustworthy information.
 * Without the adjustment, line numbers can be way off - in the example it was just
 * the very next line, but it could potentially be anywhere else in the function!
 * And finally, this issue does not only affect line numbers, it also affects inline
 * frames, for the same reason: The instruction after the call instruction could be
 * the result of a completely different function that was inlined at this spot.
 * If we instead look up the inline frames for the call instruction, we will get
 * the correct inline frames at the point of the function call.
 *
 * # Implementation
 *
 * There are two slightly tricky parts to the implementation of this function.
 *
 *  1. The original frame table + stack table does not annotate which frames came
 *     from the instruction pointer and which frames came from stack walking. We have
 *     to look at the rest of the thread to see which stack nodes are referenced from
 *     where.
 *  2. Some stack nodes and frames in the original thread serve a dual purpose: The
 *     address of an instruction that directly follows a call instruction could have
 *     been observed in both manners, at different times. And a stack node could be
 *     used in both contexts. If we detect that this happened, we need to duplicate
 *     the frame and the stack node and pick the right one depending on the use.
 */
export function nudgeReturnAddresses(thread: Thread): Thread {
  const { samplingSelfStacks, syncBacktraceSelfStacks } =
    gatherStackReferences(thread);

  const { stackTable, frameTable } = thread;

  // Collect frames that were obtained from the instruction pointer.
  // These are the top ("self") frames of stacks from sampling.
  // In the variable names below, ip means "instruction pointer".
  const oldIpFrameToNewIpFrame = new Uint32Array(frameTable.length);
  const ipFrames = new Set();
  for (const stack of samplingSelfStacks) {
    const frame = stackTable.frame[stack];
    oldIpFrameToNewIpFrame[frame] = frame;
    const address = frameTable.address[frame];
    if (address !== -1) {
      ipFrames.add(frame);
    }
  }

  // Collect frames that were obtained from stack walking.
  // These are any "self" frames of sync backtraces, and any frames
  // used for "prefix" stacks, i.e. callers.
  const returnAddressFrames: Map<IndexIntoFrameTable, Address> = new Map();
  const prefixStacks: Set<IndexIntoStackTable> = new Set();
  for (const stack of syncBacktraceSelfStacks) {
    const frame = stackTable.frame[stack];
    const returnAddress = frameTable.address[frame];
    if (returnAddress !== -1) {
      returnAddressFrames.set(frame, returnAddress);
    }
  }
  for (let stack = 0; stack < stackTable.length; stack++) {
    const prefix = stackTable.prefix[stack];
    if (prefix === null || prefixStacks.has(prefix)) {
      continue;
    }
    prefixStacks.add(prefix);
    const prefixFrame = stackTable.frame[prefix];
    const prefixAddress = frameTable.address[prefixFrame];
    if (prefixAddress !== -1) {
      returnAddressFrames.set(prefixFrame, prefixAddress);
    }
  }

  if (ipFrames.size === 0 && returnAddressFrames.size === 0) {
    // Nothing to do, use the original thread.
    return thread;
  }

  // Create the new frame table.
  // Frames that were observed both from the instruction pointer and from
  // stack walking have to be duplicated.
  const newFrameTable = shallowCloneFrameTable(frameTable);
  // Iterate over all *return address* frames, i.e. all frames that were obtained
  // by stack walking.
  for (const [frame, address] of returnAddressFrames) {
    if (ipFrames.has(frame)) {
      // This address of this frame was observed both as a return address and as
      // an instruction pointer register value. We have to duplicate this frame so
      // so that we can make a distinction between the two uses.
      // The new frame will be used as the ipFrame, and the old frame will be used
      // as the return address frame (and have its address nudged).
      const newIpFrame = newFrameTable.length;
      newFrameTable.address.push(address);
      newFrameTable.inlineDepth.push(frameTable.inlineDepth[frame]);
      newFrameTable.category.push(frameTable.category[frame]);
      newFrameTable.subcategory.push(frameTable.subcategory[frame]);
      newFrameTable.func.push(frameTable.func[frame]);
      newFrameTable.nativeSymbol.push(frameTable.nativeSymbol[frame]);
      newFrameTable.innerWindowID.push(frameTable.innerWindowID[frame]);
      newFrameTable.implementation.push(frameTable.implementation[frame]);
      newFrameTable.line.push(frameTable.line[frame]);
      newFrameTable.column.push(frameTable.column[frame]);
      newFrameTable.length++;
      oldIpFrameToNewIpFrame[frame] = newIpFrame;
      // Note: The duplicated frame uses the same func as the original frame.
      // This is ok because return address nudging is never expected to move
      // an address to a different function, so symbolication should never
      // have a need to split these frames into different functions.
    }
    // Subtract 1 byte from the return address.
    newFrameTable.address[frame] = address - 1;

    // Note that we don't change the funcTable.
    // Before symbolication, the funcTable name for the native frames are
    // of the form "0xhexaddress", and this string will still be the original
    // un-adjusted return address. Symbolication will fix that up.
    // Leaving the old string is ok; we're adjusting the frame address and
    // symbolication only looks at the frame address.
  }

  // Now the frame table contains adjusted / "nudged" addresses.

  // Make a new stack table which refers to the adjusted frames.
  const newStackTable = getEmptyStackTable();
  const mapForSamplingSelfStacks = new Map();
  const mapForBacktraceSelfStacks = new Map();
  const prefixMap = new Uint32Array(stackTable.length);
  for (let stack = 0; stack < stackTable.length; stack++) {
    const frame = stackTable.frame[stack];
    const category = stackTable.category[stack];
    const subcategory = stackTable.subcategory[stack];
    const prefix = stackTable.prefix[stack];

    const newPrefix = prefix === null ? null : prefixMap[prefix];

    if (prefixStacks.has(stack) || syncBacktraceSelfStacks.has(stack)) {
      // Copy this stack to the new stack table, and use the original frame
      // (which will have the nudged address if this is a return address stack).
      const newStackIndex = newStackTable.length;
      newStackTable.frame.push(frame);
      newStackTable.category.push(category);
      newStackTable.subcategory.push(subcategory);
      newStackTable.prefix.push(newPrefix);
      newStackTable.length++;
      prefixMap[stack] = newStackIndex;
      mapForBacktraceSelfStacks.set(stack, newStackIndex);
    }

    if (samplingSelfStacks.has(stack)) {
      // Copy this stack to the new stack table, and use the potentially duplicated
      // frame, with a non-nudged address.
      const ipFrame = oldIpFrameToNewIpFrame[frame];
      const newStackIndex = newStackTable.length;
      newStackTable.frame.push(ipFrame);
      newStackTable.category.push(category);
      newStackTable.subcategory.push(subcategory);
      newStackTable.prefix.push(newPrefix);
      newStackTable.length++;
      mapForSamplingSelfStacks.set(stack, newStackIndex);
    }
  }

  const newThread = {
    ...thread,
    frameTable: newFrameTable,
  };

  return updateThreadStacksSeparate(
    newThread,
    newStackTable,
    getMapStackUpdater(mapForSamplingSelfStacks),
    getMapStackUpdater(mapForBacktraceSelfStacks)
  );
}

/**
 * Find the address and library (debugName, breakpadId) for any frame which
 * was symbolicated to the given filename.
 */
export function findAddressProofForFile(
  profile: Profile,
  file: string
): AddressProof | null {
  const { libs } = profile;
  for (const thread of profile.threads) {
    const { frameTable, funcTable, resourceTable, stringTable } = thread;
    const fileStringIndex = stringTable.indexForString(file);
    const func = funcTable.fileName.indexOf(fileStringIndex);
    if (func === -1) {
      continue;
    }
    const frame = frameTable.func.indexOf(func);
    if (frame === -1) {
      continue;
    }
    const address = frameTable.address[frame];
    if (address === null) {
      continue;
    }
    const resource = funcTable.resource[func];
    if (resourceTable.type[resource] !== resourceTypes.library) {
      continue;
    }
    const libIndex = resourceTable.lib[resource];
    if (libIndex === null) {
      continue;
    }
    const lib = libs[libIndex];
    const { debugName, breakpadId } = lib;
    return {
      debugName,
      breakpadId,
      address,
    };
  }
  return null;
}

/**
 * Calculate a lower bound for the function size, in bytes, of a native symbol.
 * This is used when the symbol server does not return a size for a function.
 * We need to know the size when we want to show assembly code for the function,
 * in order to know how many bytes to disassemble.
 * We estimate the size by finding the highest known address for this symbol in
 * the frame table, and adding one byte (because the instruction at that address
 * is at least one byte long).
 */
export function calculateFunctionSizeLowerBound(
  frameTable: FrameTable,
  nativeSymbolAddress: Address,
  nativeSymbolIndex: IndexIntoNativeSymbolTable
): Bytes {
  let maxFrameAddress = nativeSymbolAddress;
  for (let i = 0; i < frameTable.length; i++) {
    if (frameTable.nativeSymbol[i] === nativeSymbolIndex) {
      const frameAddress = frameTable.address[i];
      if (frameAddress > maxFrameAddress) {
        maxFrameAddress = frameAddress;
      }
    }
  }
  return maxFrameAddress + 1 - nativeSymbolAddress;
}

/**
 * Gathers the native symbols for a given call node. In most cases, a call node
 * just has one native symbol (or zero if it's not native code). But in some
 * cases, a call node can have its native code in multiple different functions,
 * for example in the inverted tree if it was inlined into multiple different
 * functions.
 */
export function getNativeSymbolsForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  stackTable: StackTable,
  frameTable: FrameTable
): IndexIntoNativeSymbolTable[] {
  if (callNodeInfo.isInverted()) {
    return getNativeSymbolsForCallNodeInverted(
      callNodeIndex,
      callNodeInfo,
      stackTable,
      frameTable
    );
  }
  return getNativeSymbolsForCallNodeNonInverted(
    callNodeIndex,
    callNodeInfo,
    stackTable,
    frameTable
  );
}

export function getNativeSymbolsForCallNodeNonInverted(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  stackTable: StackTable,
  frameTable: FrameTable
): IndexIntoNativeSymbolTable[] {
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  const set = new Set();
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    if (stackIndexToCallNodeIndex[stackIndex] === callNodeIndex) {
      const frame = stackTable.frame[stackIndex];
      const nativeSymbol = frameTable.nativeSymbol[frame];
      if (nativeSymbol !== null) {
        set.add(nativeSymbol);
      }
    }
  }
  return [...set];
}

export function getNativeSymbolsForCallNodeInverted(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  stackTable: StackTable,
  frameTable: FrameTable
): IndexIntoNativeSymbolTable[] {
  const invertedCallNodeTable = callNodeInfo.getCallNodeTable();
  const depth = invertedCallNodeTable.depth[callNodeIndex];
  const endIndex = invertedCallNodeTable.subtreeRangeEnd[callNodeIndex];
  const stackTablePrefixCol = stackTable.prefix;
  const stackIndexToCallNodeIndex = callNodeInfo.getStackIndexToCallNodeIndex();
  const set = new Set();
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const stackForNode = getMatchingAncestorStackForInvertedCallNode(
      stackIndex,
      callNodeIndex,
      endIndex,
      depth,
      stackIndexToCallNodeIndex,
      stackTablePrefixCol
    );
    if (stackForNode !== null) {
      const frame = stackTable.frame[stackForNode];
      const nativeSymbol = frameTable.nativeSymbol[frame];
      if (nativeSymbol !== null) {
        set.add(nativeSymbol);
      }
    }
  }
  return [...set];
}

/**
 * Convert a native symbol index into a NativeSymbolInfo object, to create
 * something that's meaningful outside of its associated thread.
 */
export function getNativeSymbolInfo(
  nativeSymbol: IndexIntoNativeSymbolTable,
  nativeSymbols: NativeSymbolTable,
  frameTable: FrameTable,
  stringTable: UniqueStringArray
): NativeSymbolInfo {
  const functionSizeOrNull = nativeSymbols.functionSize[nativeSymbol];
  const functionSize =
    functionSizeOrNull ??
    calculateFunctionSizeLowerBound(
      frameTable,
      nativeSymbols.address[nativeSymbol],
      nativeSymbol
    );
  return {
    libIndex: nativeSymbols.libIndex[nativeSymbol],
    address: nativeSymbols.address[nativeSymbol],
    name: stringTable.getString(nativeSymbols.name[nativeSymbol]),
    functionSize,
    functionSizeIsKnown: functionSizeOrNull !== null,
  };
}

/**
 * Calculate the BottomBoxInfo for a call node, i.e. information about which
 * things should be shown in the profiler UI's "bottom box" when this call node
 * is double-clicked.
 *
 * We always want to update all panes in the bottom box when a new call node is
 * double-clicked, so that we don't show inconsistent information side-by-side.
 */
export function getBottomBoxInfoForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  thread: Thread
): BottomBoxInfo {
  const {
    stackTable,
    frameTable,
    funcTable,
    stringTable,
    resourceTable,
    nativeSymbols,
  } = thread;

  const callNodeTable = callNodeInfo.getCallNodeTable();
  const funcIndex = callNodeTable.func[callNodeIndex];
  const fileName = funcTable.fileName[funcIndex];
  const sourceFile = fileName !== null ? stringTable.getString(fileName) : null;
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === resourceTypes.library
      ? resourceTable.lib[resource]
      : null;
  const nativeSymbolsForCallNode = getNativeSymbolsForCallNode(
    callNodeIndex,
    callNodeInfo,
    stackTable,
    frameTable
  );
  const nativeSymbolInfosForCallNode = nativeSymbolsForCallNode.map(
    (nativeSymbolIndex) =>
      getNativeSymbolInfo(
        nativeSymbolIndex,
        nativeSymbols,
        frameTable,
        stringTable
      )
  );

  return {
    libIndex,
    sourceFile,
    nativeSymbols: nativeSymbolInfosForCallNode,
  };
}

/**
 * Determines the timeline type by looking at the profile data.
 *
 * There are three options:
 * 'cpu-category': If a profile has both category and cpu usage information.
 * 'category': If a profile has category information but not the cpu usage.
 * 'stack': If a profile doesn't have category or cpu usage information.
 */
export function determineTimelineType(profile: Profile): TimelineType {
  if (!profile.meta.categories) {
    // Profile doesn't have categories. We don't have enough information to draw
    // a proper category view with activity graph. Use the stack chart instead.
    // It can be either an imported or a very old profile.
    return 'stack';
  }

  if (
    !profile.meta.sampleUnits ||
    !profile.threads.some((thread) => thread.samples.threadCPUDelta)
  ) {
    // Have category information but doesn't have the CPU usage information.
    // Use 'category'.
    return 'category';
  }

  // Have both category and CPU usage information. Use 'cpu-category'.
  return 'cpu-category';
}

/**
 * Compute a map of tab to thread indexes map. This is useful for learning which
 * threads are involved for tabs. This is mainly used for the tab selector on
 * the top left corner.
 */
export function computeTabToThreadIndexesMap(
  threads: Thread[],
  innerWindowIDToTabMap: Map<InnerWindowID, TabID> | null
): Map<TabID, Set<ThreadIndex>> {
  const tabToThreadIndexesMap = new Map();
  if (!innerWindowIDToTabMap) {
    // There is no pages information in the profile, return an empty map.
    return tabToThreadIndexesMap;
  }

  // We need to iterate over all the samples and markers once to figure out
  // which innerWindowIDs are present in each thread. This is probably not
  // very cheap, but it'll allow us to not compute this information every
  // time when we need it.
  for (let threadIdx = 0; threadIdx < threads.length; threadIdx++) {
    const thread = threads[threadIdx];

    // First go over the innerWindowIDs of the samples.
    for (let i = 0; i < thread.frameTable.length; i++) {
      const innerWindowID = thread.frameTable.innerWindowID[i];
      if (innerWindowID === null || innerWindowID === 0) {
        // Zero value also means null for innerWindowID.
        continue;
      }

      const tabID = innerWindowIDToTabMap.get(innerWindowID);
      if (tabID === undefined) {
        // We couldn't find the tab of this innerWindowID, this should
        // never happen, it might indicate a bug in Firefox.
        console.warn(
          `Failed to find the tabID of innerWindowID ${innerWindowID}`
        );
        continue;
      }

      let threadIndexes = tabToThreadIndexesMap.get(tabID);
      if (!threadIndexes) {
        threadIndexes = new Set();
        tabToThreadIndexesMap.set(tabID, threadIndexes);
      }
      threadIndexes.add(threadIdx);
    }

    // Then go over the markers to find their innerWindowIDs.
    for (let i = 0; i < thread.markers.length; i++) {
      const markerData = thread.markers.data[i];

      if (!markerData) {
        continue;
      }

      if (
        markerData.innerWindowID !== null &&
        markerData.innerWindowID !== undefined &&
        // Zero value also means null for innerWindowID.
        markerData.innerWindowID !== 0
      ) {
        const innerWindowID = markerData.innerWindowID;
        const tabID = innerWindowIDToTabMap.get(innerWindowID);
        if (tabID === undefined) {
          // We couldn't find the tab of this innerWindowID, this should
          // never happen, it might indicate a bug in Firefox.
          console.warn(
            `Failed to find the tabID of innerWindowID ${innerWindowID}`
          );
          continue;
        }

        let threadIndexes = tabToThreadIndexesMap.get(tabID);
        if (!threadIndexes) {
          threadIndexes = new Set();
          tabToThreadIndexesMap.set(tabID, threadIndexes);
        }
        threadIndexes.add(threadIdx);
      }
    }
  }

  return tabToThreadIndexesMap;
}
