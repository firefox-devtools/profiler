/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import { timeCode } from '../utils/time-code';
import {
  getOriginAnnotationForFunc,
  getCategoryPairLabel,
  getBottomBoxInfoForCallNode,
} from './profile-data';
import { resourceTypes } from './data-structures';
import { getFunctionName } from './function-info';
import type {
  CategoryList,
  Thread,
  IndexIntoFuncTable,
  SamplesLikeTable,
  WeightType,
  CallNodeTable,
  CallNodePath,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeInfoInverted,
  CallNodeData,
  CallNodeDisplayData,
  CallNodeSummary,
  Milliseconds,
  ExtraBadgeInfo,
  BottomBoxInfo,
  Tree,
  SelfAndTotal,
} from 'firefox-profiler/types';

import ExtensionIcon from '../../res/img/svg/extension.svg';
import { formatCallNodeNumber, formatPercent } from '../utils/format-numbers';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import * as ProfileData from './profile-data';
import type { CallTreeSummaryStrategy } from '../types/actions';

type CallNodeChildren = IndexIntoCallNodeTable[];

export type CallNodeSelfAndSummary = {|
  callNodeSelf: Float32Array,
  rootTotalSummary: number, // sum of absolute values, this is used for computing percentages
|};

export type CallTreeTimingsNonInverted = {
  callNodeHasChildren: Uint8Array,
  callNodeSummary: CallNodeSummary,
  rootCount: number,
  rootTotalSummary: number,
};

type TotalAndHasChildren = {| total: number, hasChildren: boolean |};

export type InvertedCallTreeRoot = {|
  totalAndHasChildren: TotalAndHasChildren,
  func: IndexIntoFuncTable,
|};

export type CallTreeTimingsInverted = {|
  callNodeSelf: Float32Array,
  rootTotalSummary: number,
  sortedRoots: IndexIntoFuncTable[],
  totalPerRootFunc: Float32Array,
  hasChildrenPerRootFunc: Uint8Array,
|};

export type CallTreeTimings =
  | {| type: 'NON_INVERTED', timings: CallTreeTimingsNonInverted |}
  | {| type: 'INVERTED', timings: CallTreeTimingsInverted |};

function extractFaviconFromLibname(libname: string): string | null {
  try {
    const url = new URL('/favicon.ico', libname);
    if (url.protocol === 'http:') {
      // Upgrade http requests.
      url.protocol = 'https:';
    }
    return url.href;
  } catch (e) {
    console.error(
      'Error while extracing the favicon from the libname',
      libname
    );
    return null;
  }
}

export interface CallTree extends Tree<CallNodeDisplayData> {
  getNodeData(callNodeIndex: IndexIntoCallNodeTable): CallNodeData;
  findHeavyPathToSameFunctionAfterInversion(
    callNodeIndex: CallNodeIndex | null
  ): CallNodePath;
  getBottomBoxInfoForCallNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): BottomBoxInfo;
}

interface CallTreeInternal {
  getRoots(): CallNodeChildren;
  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean;
  createChildren(nodeIndex: IndexIntoCallNodeTable): CallNodeChildren;
  getTotal(nodeIndex: IndexIntoCallNodeTable): number;
  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath;
}

class CallTreeInternalRegular implements CallTreeInternal {
  _callNodeInfo: CallNodeInfo;
  _callNodeTable: CallNodeTable;
  _callNodeSummary: CallNodeSummary;
  _callNodeHasChildren: Uint8Array; // A table column matching the callNodeTable

  constructor(
    callNodeInfo: CallNodeInfo,
    callNodeSummary: CallNodeSummary,
    callNodeHasChildren: Uint8Array
  ) {
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    this._callNodeSummary = callNodeSummary;
    this._callNodeHasChildren = callNodeHasChildren;
  }

  getRoots(): CallNodeChildren {
    return this._createChildrenFromFirstChild(0);
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this._callNodeHasChildren[callNodeIndex] !== 0;
  }

  createChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    if (!this.hasChildren(callNodeIndex)) {
      return [];
    }
    return this._createChildrenFromFirstChild(callNodeIndex + 1);
  }

  _createChildrenFromFirstChild(
    firstChild: IndexIntoCallNodeTable | -1
  ): CallNodeChildren {
    const children = [];
    for (
      let childCallNodeIndex = firstChild;
      childCallNodeIndex !== -1;
      childCallNodeIndex = this._callNodeTable.nextSibling[childCallNodeIndex]
    ) {
      const childTotalSummary = this._callNodeSummary.total[childCallNodeIndex];
      const childHasChildren = this._callNodeHasChildren[childCallNodeIndex];

      if (childTotalSummary !== 0 || childHasChildren !== 0) {
        children.push(childCallNodeIndex);
      }
    }
    children.sort(
      (a, b) =>
        Math.abs(this._callNodeSummary.total[b]) -
        Math.abs(this._callNodeSummary.total[a])
    );

    return children;
  }

  getTotal(nodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeSummary.total[nodeIndex];
  }

  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath {
    const rangeEnd = this._callNodeTable.nextAfterDescendants[callNodeIndex];

    // Find the non-inverted node with the highest self time.
    let maxNode = -1;
    let maxAbs = 0;
    for (let nodeIndex = callNodeIndex; nodeIndex < rangeEnd; nodeIndex++) {
      const nodeSelf = Math.abs(this._callNodeSummary.self[nodeIndex]);
      if (maxNode === -1 || nodeSelf > maxAbs) {
        maxNode = nodeIndex;
        maxAbs = nodeSelf;
      }
    }

    return this._callNodeInfo.getCallNodePathFromIndex(maxNode);
  }
}

export class CallTreeInternalInverted implements CallTreeInternal {
  _callNodeInfo: CallNodeInfoInverted;
  _nonInvertedCallNodeTable: CallNodeTable;
  _callNodeSelf: Float32Array;
  _rootNodes: CallNodeIndex[];
  _funcCount: number;
  _totalPerRootFunc: Float32Array;
  _hasChildrenPerRootFunc: Uint8Array;
  _totalAndHasChildrenPerNonRootNode: Map<CallNodeIndex, TotalAndHasChildren> =
    new Map();

  constructor(
    callNodeInfo: CallNodeInfoInverted,
    callTreeTimingsInverted: CallTreeTimingsInverted
  ) {
    this._callNodeInfo = callNodeInfo;
    this._nonInvertedCallNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    this._callNodeSelf = callTreeTimingsInverted.callNodeSelf;
    const { sortedRoots, totalPerRootFunc, hasChildrenPerRootFunc } =
      callTreeTimingsInverted;
    this._totalPerRootFunc = totalPerRootFunc;
    this._hasChildrenPerRootFunc = hasChildrenPerRootFunc;
    this._rootNodes = sortedRoots;
  }

  getRoots(): CallNodeIndex[] {
    return this._rootNodes;
  }

  hasChildren(callNodeHandle: IndexIntoCallNodeTable): boolean {
    if (callNodeHandle < this._funcCount) {
      return this._hasChildrenPerRootFunc[callNodeHandle] !== 0;
    }
    return this._getTotalAndHasChildren(callNodeHandle).hasChildren;
  }

  createChildren(nodeIndex: CallNodeIndex): CallNodeChildren {
    if (!this.hasChildren(nodeIndex)) {
      return [];
    }

    const children = this._callNodeInfo
      .getChildren(nodeIndex)
      .filter((child) => {
        const { total, hasChildren } = this._getTotalAndHasChildren(child);
        return total !== 0 || hasChildren;
      });
    children.sort(
      (a, b) => Math.max(this.getTotal(b)) - Math.max(this.getTotal(a))
    );
    return children;
  }

  getTotal(callNodeHandle: CallNodeIndex): number {
    if (callNodeHandle < this._funcCount) {
      return this._totalPerRootFunc[callNodeHandle];
    }
    return this._getTotalAndHasChildren(callNodeHandle).total;
  }

  _getTotalAndHasChildren(node: CallNodeIndex): TotalAndHasChildren {
    if (node < this._funcCount) {
      throw new Error('This function should not be called for roots');
    }

    const cached = this._totalAndHasChildrenPerNonRootNode.get(node);
    if (cached !== undefined) {
      return cached;
    }

    const totalAndHasChildren = _getInvertedTreeNodeTotalAndHasChildren(
      node,
      this._callNodeInfo,
      this._callNodeSelf
    );
    this._totalAndHasChildrenPerNonRootNode.set(node, totalAndHasChildren);
    return totalAndHasChildren;
  }

  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath {
    const [rangeStart, rangeEnd] =
      this._callNodeInfo.getOrderingIndexRangeForNode(callNodeIndex);
    const orderedCallNodes = this._callNodeInfo.getOrderedSelfNodes();

    // Find the non-inverted node with the highest self time.
    let maxNode = -1;
    let maxAbs = 0;
    for (let i = rangeStart; i < rangeEnd; i++) {
      const nodeIndex = orderedCallNodes[i];
      const nodeSelf = Math.abs(this._callNodeSelf[nodeIndex]);
      if (maxNode === -1 || nodeSelf > maxAbs) {
        maxNode = nodeIndex;
        maxAbs = nodeSelf;
      }
    }

    const callPath = [];
    for (
      let currentNode = maxNode;
      currentNode !== -1;
      currentNode = this._nonInvertedCallNodeTable.prefix[currentNode]
    ) {
      callPath.push(this._nonInvertedCallNodeTable.func[currentNode]);
    }
    return callPath;
  }
}

export class CallTreeImpl implements CallTree {
  _categories: CategoryList;
  _internal: CallTreeInternal;
  _callNodeInfo: CallNodeInfo;
  _thread: Thread;
  _rootTotalSummary: number;
  _roots: CallNodeChildren;
  _displayDataByIndex: Map<IndexIntoCallNodeTable, CallNodeDisplayData>;
  // _children is indexed by IndexIntoCallNodeTable. Since they are
  // integers, using an array directly is faster than going through a Map.
  _children: Array<CallNodeChildren>;
  _isHighPrecision: boolean;
  _weightType: WeightType;

  constructor(
    thread: Thread,
    categories: CategoryList,
    callNodeInfo: CallNodeInfo,
    internal: CallTreeInternal,
    rootTotalSummary: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._internal = internal;
    this._callNodeInfo = callNodeInfo;
    this._thread = thread;
    this._roots = internal.getRoots();
    this._rootTotalSummary = rootTotalSummary;
    this._displayDataByIndex = new Map();
    this._children = [];
    this._isHighPrecision = isHighPrecision;
    this._weightType = weightType;
  }

  getRoots() {
    return this._roots;
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children[callNodeIndex];
    if (children === undefined) {
      children = this._internal.createChildren(callNodeIndex);
      this._children[callNodeIndex] = children;
    }
    return children;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this._internal.hasChildren(callNodeIndex);
  }

  _addDescendantsToSet(
    callNodeIndex: IndexIntoCallNodeTable,
    set: Set<IndexIntoCallNodeTable>
  ): void {
    for (const child of this.getChildren(callNodeIndex)) {
      set.add(child);
      this._addDescendantsToSet(child, set);
    }
  }

  getAllDescendants(
    callNodeIndex: IndexIntoCallNodeTable
  ): Set<IndexIntoCallNodeTable> {
    const result = new Set();
    this._addDescendantsToSet(callNodeIndex, result);
    return result;
  }

  getParent(nodeIndex: CallNodeIndex): CallNodeIndex | -1 {
    return this._callNodeInfo.getParentCallNodeIndex(nodeIndex) ?? -1;
  }

  getDepth(nodeIndex: CallNodeIndex): number {
    return this._callNodeInfo.depthForNode(nodeIndex);
  }

  getNodeData(nodeIndex: CallNodeIndex): CallNodeData {
    const funcIndex = this._callNodeInfo.funcForNode(nodeIndex);
    const funcName = this._thread.stringTable.getString(
      this._thread.funcTable.name[funcIndex]
    );
    const isRoot =
      this._callNodeInfo.getParentCallNodeIndex(nodeIndex) === null;
    const total = this._internal.getTotal(nodeIndex);
    const totalRelative = total / this._rootTotalSummary;
    const self = isRoot ? total : 0;
    const selfRelative = isRoot ? totalRelative : 0;

    return {
      funcName,
      total,
      totalRelative,
      self,
      selfRelative,
    };
  }

  _getInliningBadge(
    callNodeIndex: IndexIntoCallNodeTable,
    funcName: string
  ): ExtraBadgeInfo | void {
    const calledFunction = getFunctionName(funcName);
    const inlinedIntoNativeSymbol =
      this._callNodeInfo.sourceFramesInlinedIntoSymbolForNode(callNodeIndex);
    if (inlinedIntoNativeSymbol === -2) {
      return undefined;
    }

    if (inlinedIntoNativeSymbol === -1) {
      return {
        name: 'divergent-inlining',
        vars: { calledFunction },
        localizationId: 'CallTree--divergent-inlining-badge',
        contentFallback: '',
        titleFallback: `Some calls to ${calledFunction} were inlined by the compiler.`,
      };
    }

    const outerFunction = getFunctionName(
      this._thread.stringTable.getString(
        this._thread.nativeSymbols.name[inlinedIntoNativeSymbol]
      )
    );
    return {
      name: 'inlined',
      vars: { calledFunction, outerFunction },
      localizationId: 'CallTree--inlining-badge',
      contentFallback: '(inlined)',
      titleFallback: `Calls to ${calledFunction} were inlined into ${outerFunction} by the compiler.`,
    };
  }

  getDisplayData(callNodeIndex: IndexIntoCallNodeTable): CallNodeDisplayData {
    let displayData: CallNodeDisplayData | void =
      this._displayDataByIndex.get(callNodeIndex);
    if (displayData === undefined) {
      const { funcName, total, totalRelative, self } =
        this.getNodeData(callNodeIndex);
      const funcIndex = this._callNodeInfo.funcForNode(callNodeIndex);
      const categoryIndex = this._callNodeInfo.categoryForNode(callNodeIndex);
      const subcategoryIndex =
        this._callNodeInfo.subcategoryForNode(callNodeIndex);
      const badge = this._getInliningBadge(callNodeIndex, funcName);
      const resourceIndex = this._thread.funcTable.resource[funcIndex];
      const resourceType = this._thread.resourceTable.type[resourceIndex];
      const isFrameLabel = resourceIndex === -1;
      const libName = this._getOriginAnnotation(funcIndex);
      const weightType = this._weightType;

      let iconSrc = null;
      let icon = null;

      if (resourceType === resourceTypes.webhost) {
        icon = iconSrc = extractFaviconFromLibname(libName);
      } else if (resourceType === resourceTypes.addon) {
        iconSrc = ExtensionIcon;

        const resourceNameIndex =
          this._thread.resourceTable.name[resourceIndex];
        const iconText = this._thread.stringTable.getString(resourceNameIndex);
        icon = iconText;
      }

      const formattedTotal = formatCallNodeNumber(
        weightType,
        this._isHighPrecision,
        total
      );
      const formattedSelf = formatCallNodeNumber(
        weightType,
        this._isHighPrecision,
        self
      );
      const totalPercent = `${formatPercent(totalRelative)}`;

      let ariaLabel;
      let totalWithUnit;
      let selfWithUnit;
      switch (weightType) {
        case 'tracing-ms': {
          totalWithUnit = `${formattedTotal}ms`;
          selfWithUnit = `${formattedSelf}ms`;
          ariaLabel = oneLine`
              ${funcName},
              running time is ${totalWithUnit} (${totalPercent}),
              self time is ${selfWithUnit}
            `;
          break;
        }
        case 'samples': {
          // TODO - L10N pluralization
          totalWithUnit =
            total === 1
              ? `${formattedTotal} sample`
              : `${formattedTotal} samples`;
          selfWithUnit =
            self === 1 ? `${formattedSelf} sample` : `${formattedSelf} samples`;
          ariaLabel = oneLine`
            ${funcName},
            running count is ${totalWithUnit} (${totalPercent}),
            self count is ${selfWithUnit}
          `;
          break;
        }
        case 'bytes': {
          totalWithUnit = `${formattedTotal} bytes`;
          selfWithUnit = `${formattedSelf} bytes`;
          ariaLabel = oneLine`
            ${funcName},
            total size is ${totalWithUnit} (${totalPercent}),
            self size is ${selfWithUnit}
          `;
          break;
        }
        default:
          throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
      }

      displayData = {
        total: total === 0 ? '—' : formattedTotal,
        totalWithUnit: total === 0 ? '—' : totalWithUnit,
        self: self === 0 ? '—' : formattedSelf,
        selfWithUnit: self === 0 ? '—' : selfWithUnit,
        totalPercent,
        name: funcName,
        lib: libName.slice(0, 1000),
        // Dim platform pseudo-stacks.
        isFrameLabel,
        badge,
        categoryName: getCategoryPairLabel(
          this._categories,
          categoryIndex,
          subcategoryIndex
        ),
        categoryColor: this._categories[categoryIndex].color,
        iconSrc,
        icon,
        ariaLabel,
      };
      this._displayDataByIndex.set(callNodeIndex, displayData);
    }
    return displayData;
  }

  _getOriginAnnotation(funcIndex: IndexIntoFuncTable): string {
    return getOriginAnnotationForFunc(
      funcIndex,
      this._thread.funcTable,
      this._thread.resourceTable,
      this._thread.stringTable
    );
  }

  getBottomBoxInfoForCallNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): BottomBoxInfo {
    return getBottomBoxInfoForCallNode(
      callNodeIndex,
      this._callNodeInfo,
      this._thread
    );
  }

  /**
   * Take a CallNodeIndex, and compute an inverted path for it.
   *
   * e.g:
   *   (invertedPath, invertedCallTree) => path
   *   (path, callTree) => invertedPath
   *
   * Call trees are sorted with the CallNodes with the heaviest total time as the first
   * entry. This function walks to the tip of the heaviest branches to find the leaf node,
   * then construct an inverted CallNodePath with the result. This gives a pretty decent
   * result, but it doesn't guarantee that it will select the heaviest CallNodePath for the
   * INVERTED call tree. This would require doing a round trip through the reducers or
   * some other mechanism in order to first calculate the next inverted call tree. This is
   * probably not worth it, so go ahead and use the uninverted call tree, as it's probably
   * good enough.
   */
  findHeavyPathToSameFunctionAfterInversion(
    callNodeIndex: IndexIntoCallNodeTable | null
  ): CallNodePath {
    if (callNodeIndex === null) {
      return [];
    }
    const heaviestPath =
      this._internal.findHeaviestPathInSubtree(callNodeIndex);
    const startingDepth = this._callNodeInfo.depthForNode(callNodeIndex);
    const partialPath = heaviestPath.slice(startingDepth);
    return partialPath.reverse();
  }
}

type CallNodeIndex = IndexIntoCallNodeTable; // into inverted call node table

/**
 * Compute a part of the timings data which is useful for computing the timings
 * data for both the inverted and the non-inverted tree. This is a separate
 * function call from computeCallTreeTimings so that the result can be cached
 * and shared for both trees (and doesn't need to be recomputed when the "invert
 * call stack" checkbox is toggled).
 */
export function computeCallNodeSelfAndSummary(
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>
): CallNodeSelfAndSummary {
  const callNodeSelf = new Float32Array(callNodeTable.length);
  let rootTotalSummary = 0;

  for (
    let sampleIndex = 0;
    sampleIndex < sampleIndexToCallNodeIndex.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      const selfBefore = callNodeSelf[callNodeIndex];
      const selfAfter = selfBefore + weight;
      callNodeSelf[callNodeIndex] = selfAfter;
      rootTotalSummary += Math.abs(selfAfter) - Math.abs(selfBefore);
    }
  }

  return { callNodeSelf, rootTotalSummary };
}

function _getInvertedTreeNodeTotalAndHasChildren(
  nodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfoInverted,
  callNodeSelf: Float32Array
): TotalAndHasChildren {
  const nodeDepth = callNodeInfo.depthForNode(nodeIndex);
  const [rangeStart, rangeEnd] =
    callNodeInfo.getOrderingIndexRangeForNode(nodeIndex);
  const orderedCallNodes = callNodeInfo.getOrderedSelfNodes();
  const callNodeTableDepthCol =
    callNodeInfo.getNonInvertedCallNodeTable().depth;
  let total = 0;
  let hasChildren = false;
  for (let i = rangeStart; i < rangeEnd; i++) {
    const selfNode = orderedCallNodes[i];
    const self = callNodeSelf[selfNode];
    total += self;

    if (
      !hasChildren &&
      self !== 0 &&
      callNodeTableDepthCol[selfNode] > nodeDepth
    ) {
      hasChildren = true;
    }
  }
  return { total, hasChildren };
}

export function computeCallTreeTimingsInverted(
  { callNodeSelf, rootTotalSummary }: CallNodeSelfAndSummary,
  callNodeInfo: CallNodeInfoInverted
): CallTreeTimingsInverted {
  const rootCount = callNodeInfo.getRootCount();
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const callNodeTableFuncCol = callNodeTable.func;
  const callNodeTableDepthCol = callNodeTable.depth;
  const totalPerRootFunc = new Float32Array(rootCount);
  const hasChildrenPerRootFunc = new Uint8Array(rootCount);
  const seenRoot = new Uint8Array(rootCount);
  const sortedRoots = [];
  for (let i = 0; i < callNodeSelf.length; i++) {
    const self = callNodeSelf[i];
    if (self === 0) {
      continue;
    }
    const func = callNodeTableFuncCol[i];
    totalPerRootFunc[func] += self;
    if (!seenRoot[func]) {
      seenRoot[func] = 1;
      sortedRoots.push(func);
    }
    if (!hasChildrenPerRootFunc[func] && callNodeTableDepthCol[i] !== 0) {
      hasChildrenPerRootFunc[func] = 1;
    }
  }
  sortedRoots.sort(
    (a, b) => Math.max(totalPerRootFunc[b]) - Math.max(totalPerRootFunc[a])
  );
  return {
    callNodeSelf,
    rootTotalSummary,
    sortedRoots,
    totalPerRootFunc,
    hasChildrenPerRootFunc,
  };
}

export function computeCallTreeTimings(
  callNodeSelfAndSummary: CallNodeSelfAndSummary,
  callNodeInfo: CallNodeInfo
): CallTreeTimings {
  const callNodeInfoInverted = callNodeInfo.asInverted();
  if (callNodeInfoInverted !== null) {
    return {
      type: 'INVERTED',
      timings: computeCallTreeTimingsInverted(
        callNodeSelfAndSummary,
        callNodeInfoInverted
      ),
    };
  }
  return {
    type: 'NON_INVERTED',
    timings: computeCallTreeTimingsNonInverted(
      callNodeSelfAndSummary,
      callNodeInfo
    ),
  };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 *
 * Note: The "timionmgs" could have a number of different meanings based on the
 * what type of weight is in the SamplesLikeTable. For instance, it could be
 * milliseconds, sample counts, or bytes.
 */
export function computeCallTreeTimingsNonInverted(
  { callNodeSelf, rootTotalSummary }: CallNodeSelfAndSummary,
  callNodeInfo: CallNodeInfo
): CallTreeTimingsNonInverted {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();

  // Compute the following variables:
  const callNodeTotalSummary = new Float32Array(callNodeTable.length);
  const callNodeHasChildren = new Uint8Array(callNodeTable.length);
  let rootCount = 0;

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    callNodeTotalSummary[callNodeIndex] += callNodeSelf[callNodeIndex];
    const hasChildren = callNodeHasChildren[callNodeIndex] !== 0;
    const hasTotalValue = callNodeTotalSummary[callNodeIndex] !== 0;

    if (!hasChildren && !hasTotalValue) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      rootCount++;
    } else {
      callNodeTotalSummary[prefixCallNode] +=
        callNodeTotalSummary[callNodeIndex];
      callNodeHasChildren[prefixCallNode] = 1;
    }
  }

  return {
    callNodeSummary: {
      self: callNodeSelf,
      total: callNodeTotalSummary,
    },
    callNodeHasChildren,
    rootTotalSummary,
    rootCount,
  };
}

/**
 * An exported interface to get an instance of the CallTree class.
 */
export function getCallTree(
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  callTreeTimings: CallTreeTimings,
  weightType: WeightType
): CallTree {
  return timeCode('getCallTree', () => {
    switch (callTreeTimings.type) {
      case 'NON_INVERTED': {
        const { callNodeSummary, callNodeHasChildren, rootTotalSummary } =
          callTreeTimings.timings;

        return new CallTreeImpl(
          thread,
          categories,
          callNodeInfo,
          new CallTreeInternalRegular(
            callNodeInfo,
            callNodeSummary,
            callNodeHasChildren
          ),
          rootTotalSummary,
          Boolean(thread.isJsTracer),
          weightType
        );
      }
      case 'INVERTED': {
        return new CallTreeImpl(
          thread,
          categories,
          callNodeInfo,
          new CallTreeInternalInverted(
            ensureExists(callNodeInfo.asInverted()),
            callTreeTimings.timings
          ),
          callTreeTimings.timings.rootTotalSummary,
          Boolean(thread.isJsTracer),
          weightType
        );
      }
      default:
        throw assertExhaustiveCheck(
          callTreeTimings.type,
          'Unhandled CallTreeTimings type.'
        );
    }
  });
}

/**
 * This function takes the call tree summary strategy, and finds the appropriate data
 * structure. This can then be used by the call tree and other UI to report on the data.
 */
export function extractSamplesLikeTable(
  thread: Thread,
  strategy: CallTreeSummaryStrategy
): SamplesLikeTable {
  switch (strategy) {
    case 'timing':
      return thread.samples;
    case 'js-allocations':
      return ensureExists(
        thread.jsAllocations,
        'Expected the NativeAllocationTable to exist when using a "js-allocation" strategy'
      );
    case 'native-retained-allocations': {
      const nativeAllocations = ensureExists(
        thread.nativeAllocations,
        'Expected the NativeAllocationTable to exist when using a "native-allocation" strategy'
      );

      /* istanbul ignore if */
      if (!nativeAllocations.memoryAddress) {
        throw new Error(
          'Attempting to filter by retained allocations data that is missing the memory addresses.'
        );
      }
      return ProfileData.filterToRetainedAllocations(nativeAllocations);
    }
    case 'native-allocations':
      return ProfileData.filterToAllocations(
        ensureExists(
          thread.nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "native-allocations" strategy'
        )
      );
    case 'native-deallocations-sites':
      return ProfileData.filterToDeallocationsSites(
        ensureExists(
          thread.nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "native-deallocations-sites" strategy'
        )
      );
    case 'native-deallocations-memory': {
      const nativeAllocations = ensureExists(
        thread.nativeAllocations,
        'Expected the NativeAllocationTable to exist when using a "native-deallocations-memory" strategy'
      );

      /* istanbul ignore if */
      if (!nativeAllocations.memoryAddress) {
        throw new Error(
          'Attempting to filter by retained allocations data that is missing the memory addresses.'
        );
      }

      return ProfileData.filterToDeallocationsMemory(
        ensureExists(
          nativeAllocations,
          'Expected the NativeAllocationTable to exist when using a "js-allocation" strategy'
        )
      );
    }
    /* istanbul ignore next */
    default:
      throw assertExhaustiveCheck(strategy);
  }
}

/**
 * This function is an alternative to computeCallNodeSelfAndSummary: Rather than
 * using sample counts, it computes "traced times" based on sample timestamps. Samples
 * don't have duration information associated with them, it's mostly how long they
 * were observed to be running. This function computes the timing the exact same
 * way that the stack chart will display the information, so that timing information
 * will agree. In the past, timing was computed by samplingInterval * sampleCount.
 * This caused confusion when switching to the trace-based views when the numbers
 * did not agree. In order to remove confusion, we can show the sample counts,
 * plus the traced timing, which is a compromise between correctness, and consistency.
 */
export function computeCallNodeTracedSelfAndSummary(
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>,
  interval: Milliseconds
): CallNodeSelfAndSummary | null {
  if (samples.weightType !== 'samples' || samples.weight) {
    // Only compute for the samples weight types that have no weights. If a samples
    // table has weights then it's a diff profile. Currently, we aren't calculating
    // diff profiles, but it could be possible to compute this information twice,
    // once for positive weights, and once for negative weights, then sum them
    // together. At this time it's not really worth it.
    //
    // See https://github.com/firefox-devtools/profiler/issues/2615
    return null;
  }

  const callNodeSelf = new Float32Array(callNodeTable.length);
  let rootTotalSummary = 0;

  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const sampleTracedTime =
        samples.time[sampleIndex + 1] - samples.time[sampleIndex];
      callNodeSelf[callNodeIndex] += sampleTracedTime;
      rootTotalSummary += sampleTracedTime;
    }
  }
  if (samples.length > 0) {
    const callNodeIndex = sampleIndexToCallNodeIndex[samples.length - 1];
    if (callNodeIndex !== null) {
      // Use the sampling interval for the last sample.
      const sampleTracedTime = interval;
      callNodeSelf[callNodeIndex] += sampleTracedTime;
      rootTotalSummary += sampleTracedTime;
    }
  }

  return { callNodeSelf, rootTotalSummary };
}

export function getSelfAndTotalForCallNode(
  callNodeIndex: CallNodeIndex,
  callNodeInfo: CallNodeInfo,
  callTreeTimings: CallTreeTimings
): SelfAndTotal {
  switch (callTreeTimings.type) {
    case 'NON_INVERTED': {
      const callNodeSummary = callTreeTimings.timings.callNodeSummary;
      const self = callNodeSummary.self[callNodeIndex];
      const total = callNodeSummary.total[callNodeIndex];
      return { self, total };
    }
    case 'INVERTED': {
      const { totalPerRootFunc, callNodeSelf } = callTreeTimings.timings;
      const callNodeInfoInverted = ensureExists(callNodeInfo.asInverted());
      if (callNodeIndex < callNodeInfoInverted.getRootCount()) {
        // This is a root node.
        const rootFunc = callNodeIndex;
        const total = totalPerRootFunc[rootFunc];
        return { self: total, total };
      }

      // To compute the time for a non-root node in the inverted tree, sum up
      // the contributions from the self call nodes which contribute to this node.
      const orderedSelfNodes = callNodeInfoInverted.getOrderedSelfNodes();
      const [rangeStart, rangeEnd] =
        callNodeInfoInverted.getOrderingIndexRangeForNode(callNodeIndex);
      let total = 0;
      for (let i = rangeStart; i < rangeEnd; i++) {
        total += callNodeSelf[orderedSelfNodes[i]];
      }

      return { self: 0, total };
    }
    default:
      throw assertExhaustiveCheck(callTreeTimings.type);
  }
}
