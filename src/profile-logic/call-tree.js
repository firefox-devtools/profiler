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
  CallNodeTableBitSet,
  CallNodePath,
  IndexIntoCallNodeTable,
  CallNodeData,
  CallNodeDisplayData,
  Milliseconds,
  ExtraBadgeInfo,
  BottomBoxInfo,
  CallNodeSelfAndSummary,
  SelfAndTotal,
} from 'firefox-profiler/types';

import ExtensionIcon from '../../res/img/svg/extension.svg';
import { formatCallNodeNumber, formatPercent } from '../utils/format-numbers';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import { checkBit } from '../utils/bitset';
import * as ProfileData from './profile-data';
import type { CallTreeSummaryStrategy } from '../types/actions';
import type { CallNodeInfo, CallNodeInfoInverted } from './call-node-info';

type CallNodeChildren = IndexIntoCallNodeTable[];

export type CallTreeTimingsNonInverted = {|
  callNodeHasChildren: Uint8Array,
  self: Float64Array,
  total: Float64Array,
  rootTotalSummary: number, // sum of absolute values, this is used for computing percentages
|};

type TotalAndHasChildren = {| total: number, hasChildren: boolean |};

export type InvertedCallTreeRoot = {|
  totalAndHasChildren: TotalAndHasChildren,
  func: IndexIntoFuncTable,
|};

export type CallTreeTimingsInverted = {|
  callNodeSelf: Float64Array,
  rootTotalSummary: number,
  sortedRoots: IndexIntoFuncTable[],
  totalPerRootFunc: Float64Array,
  hasChildrenPerRootFunc: Uint8Array,
|};

export type CallTreeTimingsFunctionList = {|
  funcSelf: Float64Array,
  funcTotal: Float64Array,
  sortedFuncs: IndexIntoFuncTable[],
  rootTotalSummary: number,
|};

export type CallTreeTimings =
  | {| type: 'NON_INVERTED', timings: CallTreeTimingsNonInverted |}
  | {| type: 'FUNCTION_LIST', timings: CallTreeTimingsFunctionList |}
  | {| type: 'INVERTED', timings: CallTreeTimingsInverted |};

/**
 * Gets the CallTreeTimingsNonInverted out of a CallTreeTimings object.
 */
export function extractNonInvertedCallTreeTimings(
  callTreeTimings: CallTreeTimings
): CallTreeTimingsNonInverted | null {
  if (callTreeTimings.type === 'NON_INVERTED') {
    return callTreeTimings.timings;
  }
  return null;
}

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

interface CallTreeInternal {
  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean;
  createChildren(nodeIndex: IndexIntoCallNodeTable): CallNodeChildren;
  createRoots(): CallNodeChildren;
  getSelfAndTotal(nodeIndex: IndexIntoCallNodeTable): SelfAndTotal;
  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath;
}

export class CallTreeInternalNonInverted implements CallTreeInternal {
  _callNodeInfo: CallNodeInfo;
  _callNodeTable: CallNodeTable;
  _callTreeTimings: CallTreeTimingsNonInverted;
  _callNodeHasChildren: Uint8Array; // A table column matching the callNodeTable

  constructor(
    callNodeInfo: CallNodeInfo,
    callTreeTimings: CallTreeTimingsNonInverted
  ) {
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.getCallNodeTable();
    this._callTreeTimings = callTreeTimings;
    this._callNodeHasChildren = callTreeTimings.callNodeHasChildren;
  }

  _getFirstChildIndex(
    callNodeIndex: IndexIntoCallNodeTable | -1
  ): IndexIntoCallNodeTable | -1 {
    if (callNodeIndex === -1) {
      return this._callNodeTable.length !== 0 ? 0 : -1;
    }
    const subtreeRangeEnd = this._callNodeTable.subtreeRangeEnd[callNodeIndex];
    if (subtreeRangeEnd !== callNodeIndex + 1) {
      return callNodeIndex + 1;
    }
    return -1;
  }

  createRoots() {
    return this.createChildren(-1);
  }

  createChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    const firstChild = this._getFirstChildIndex(callNodeIndex);
    const children = [];
    for (
      let childCallNodeIndex = firstChild;
      childCallNodeIndex !== -1;
      childCallNodeIndex = this._callNodeTable.nextSibling[childCallNodeIndex]
    ) {
      const childTotalSummary = this._callTreeTimings.total[childCallNodeIndex];
      const childHasChildren = this._callNodeHasChildren[childCallNodeIndex];

      if (childTotalSummary !== 0 || childHasChildren !== 0) {
        children.push(childCallNodeIndex);
      }
    }
    children.sort(
      (a, b) =>
        Math.abs(this._callTreeTimings.total[b]) -
        Math.abs(this._callTreeTimings.total[a])
    );
    return children;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this._callNodeHasChildren[callNodeIndex] !== 0;
  }

  getSelfAndTotal(callNodeIndex: IndexIntoCallNodeTable): SelfAndTotal {
    const self = this._callTreeTimings.self[callNodeIndex];
    const total = this._callTreeTimings.total[callNodeIndex];
    return { self, total };
  }

  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath {
    const rangeEnd = this._callNodeTable.subtreeRangeEnd[callNodeIndex];

    // Find the call node with the highest self time.
    let maxNode = -1;
    let maxAbs = 0;
    for (let nodeIndex = callNodeIndex; nodeIndex < rangeEnd; nodeIndex++) {
      const nodeSelf = Math.abs(this._callTreeTimings.self[nodeIndex]);
      if (maxNode === -1 || nodeSelf > maxAbs) {
        maxNode = nodeIndex;
        maxAbs = nodeSelf;
      }
    }

    return this._callNodeInfo.getCallNodePathFromIndex(maxNode);
  }
}

export class CallTreeInternalFunctionList implements CallTreeInternal {
  _timings: CallTreeTimingsFunctionList;
  _roots: IndexIntoCallNodeTable[];

  constructor(timings: CallTreeTimingsFunctionList) {
    this._timings = timings;
  }

  hasChildren(_callNodeIndex: IndexIntoCallNodeTable): boolean {
    return false;
  }

  createChildren(_nodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    return [];
  }

  createRoots(): CallNodeChildren {
    return this._timings.sortedFuncs;
  }

  getSelfAndTotal(nodeIndex: IndexIntoCallNodeTable): SelfAndTotal {
    return {
      self: this._timings.funcSelf[nodeIndex],
      total: this._timings.funcTotal[nodeIndex],
    };
  }

  findHeaviestPathInSubtree(
    _callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath {
    throw new Error(
      'unexpected call to findHeaviestPathInSubtree in CallTreeInternalFunctionList'
    );
  }
}

class CallTreeInternalInverted implements CallTreeInternal {
  _callNodeInfo: CallNodeInfoInverted;
  _callNodeTable: CallNodeTable;
  _callNodeSelf: Float64Array;
  _rootNodes: IndexIntoCallNodeTable[];
  _totalPerRootFunc: Float64Array;
  _hasChildrenPerRootFunc: Uint8Array;
  _totalAndHasChildrenPerNonRootNode: Map<
    IndexIntoCallNodeTable,
    TotalAndHasChildren,
  > = new Map();

  constructor(
    callNodeInfo: CallNodeInfoInverted,
    callTreeTimingsInverted: CallTreeTimingsInverted
  ) {
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.getCallNodeTable();
    this._callNodeSelf = callTreeTimingsInverted.callNodeSelf;
    const { sortedRoots, totalPerRootFunc, hasChildrenPerRootFunc } =
      callTreeTimingsInverted;
    this._totalPerRootFunc = totalPerRootFunc;
    this._hasChildrenPerRootFunc = hasChildrenPerRootFunc;
    this._rootNodes = sortedRoots;
  }

  createRoots(): IndexIntoCallNodeTable[] {
    return this._rootNodes;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    if (this._callNodeInfo.isRoot(callNodeIndex)) {
      return this._hasChildrenPerRootFunc[callNodeIndex] !== 0;
    }
    return this._getTotalAndHasChildren(callNodeIndex).hasChildren;
  }

  createChildren(nodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
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
      (a, b) =>
        Math.abs(this._getTotalAndHasChildren(b).total) -
        Math.abs(this._getTotalAndHasChildren(a).total)
    );
    return children;
  }

  getSelfAndTotal(callNodeIndex: IndexIntoCallNodeTable): SelfAndTotal {
    if (this._callNodeInfo.isRoot(callNodeIndex)) {
      const total = this._totalPerRootFunc[callNodeIndex];
      return { self: total, total };
    }
    const { total } = this._getTotalAndHasChildren(callNodeIndex);
    return { self: 0, total };
  }

  _getTotalAndHasChildren(
    callNodeIndex: IndexIntoCallNodeTable
  ): TotalAndHasChildren {
    if (this._callNodeInfo.isRoot(callNodeIndex)) {
      throw new Error('This function should not be called for roots');
    }

    const cached = this._totalAndHasChildrenPerNonRootNode.get(callNodeIndex);
    if (cached !== undefined) {
      return cached;
    }

    const totalAndHasChildren = _getInvertedTreeNodeTotalAndHasChildren(
      callNodeIndex,
      this._callNodeInfo,
      this._callNodeSelf
    );
    this._totalAndHasChildrenPerNonRootNode.set(
      callNodeIndex,
      totalAndHasChildren
    );
    return totalAndHasChildren;
  }

  findHeaviestPathInSubtree(
    callNodeIndex: IndexIntoCallNodeTable
  ): CallNodePath {
    const [rangeStart, rangeEnd] =
      this._callNodeInfo.getSuffixOrderIndexRangeForCallNode(callNodeIndex);
    const orderedCallNodes = this._callNodeInfo.getSuffixOrderedCallNodes();

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
      currentNode = this._callNodeTable.prefix[currentNode]
    ) {
      callPath.push(this._callNodeTable.func[currentNode]);
    }
    return callPath;
  }
}

export class CallTree {
  _categories: CategoryList;
  _internal: CallTreeInternal;
  _callNodeInfo: CallNodeInfo;
  _thread: Thread;
  _rootTotalSummary: number;
  _displayDataByIndex: Map<IndexIntoCallNodeTable, CallNodeDisplayData>;
  // _children is indexed by IndexIntoCallNodeTable. Since they are
  // integers, using an array directly is faster than going through a Map.
  _children: Array<CallNodeChildren>;
  _roots: IndexIntoCallNodeTable[];
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
    this._rootTotalSummary = rootTotalSummary;
    this._displayDataByIndex = new Map();
    this._children = [];
    this._roots = internal.createRoots();
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

  getParent(
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable | -1 {
    return this._callNodeInfo.prefixForNode(callNodeIndex);
  }

  getDepth(callNodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeInfo.depthForNode(callNodeIndex);
  }

  getNodeData(callNodeIndex: IndexIntoCallNodeTable): CallNodeData {
    const funcIndex = this._callNodeInfo.funcForNode(callNodeIndex);
    const funcName = this._thread.stringTable.getString(
      this._thread.funcTable.name[funcIndex]
    );

    const { self, total } = this._internal.getSelfAndTotal(callNodeIndex);
    const totalRelative = total / this._rootTotalSummary;
    const selfRelative = self / this._rootTotalSummary;

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
   * Take a IndexIntoCallNodeTable, and compute an inverted path for it.
   *
   * e.g:
   *   (invertedPath, invertedCallTree) => path
   *   (path, callTree) => invertedPath
   *
   * Call trees are sorted with the CallNodes with the heaviest total time as the first
   * entry. This function walks to the tip of the heaviest branches to find the self node,
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

/**
 * Compute the self time for each call node, and the sum of the absolute self
 * values.
 */
export function computeCallNodeSelfAndSummary(
  samples: SamplesLikeTable,
  sampleIndexToCallNodeIndex: Array<null | IndexIntoCallNodeTable>,
  callNodeCount: number
): CallNodeSelfAndSummary {
  const callNodeSelf = new Float64Array(callNodeCount);
  for (
    let sampleIndex = 0;
    sampleIndex < sampleIndexToCallNodeIndex.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelf[callNodeIndex] += weight;
    }
  }

  // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1858310
  const abs = Math.abs;

  let rootTotalSummary = 0;
  for (let callNodeIndex = 0; callNodeIndex < callNodeCount; callNodeIndex++) {
    rootTotalSummary += abs(callNodeSelf[callNodeIndex]);
  }

  return { callNodeSelf, rootTotalSummary };
}

export function getSelfAndTotalForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  callTreeTimings: CallTreeTimings
): SelfAndTotal {
  switch (callTreeTimings.type) {
    case 'NON_INVERTED': {
      const { timings } = callTreeTimings;
      const self = timings.self[callNodeIndex];
      const total = timings.total[callNodeIndex];
      return { self, total };
    }
    case 'FUNCTION_LIST': {
      const callNodeInfoInverted = ensureExists(callNodeInfo.asInverted());
      const { timings } = callTreeTimings;
      const { funcSelf, funcTotal } = timings;
      if (!callNodeInfoInverted.isRoot(callNodeIndex)) {
        throw new Error(
          'When using function list timings, callNodeIndex must always refer to a function (an inverted root)'
        );
      }
      return { self: funcSelf[callNodeIndex], total: funcTotal[callNodeIndex] };
    }
    case 'INVERTED': {
      const callNodeInfoInverted = ensureExists(callNodeInfo.asInverted());
      const { timings } = callTreeTimings;
      const { callNodeSelf, totalPerRootFunc } = timings;
      if (callNodeInfoInverted.isRoot(callNodeIndex)) {
        const total = totalPerRootFunc[callNodeIndex];
        return { self: total, total };
      }
      const { total } = _getInvertedTreeNodeTotalAndHasChildren(
        callNodeIndex,
        callNodeInfoInverted,
        callNodeSelf
      );
      return { self: 0, total };
    }
    default:
      throw assertExhaustiveCheck(callTreeTimings.type);
  }
}

function _getInvertedTreeNodeTotalAndHasChildren(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfoInverted,
  callNodeSelf: Float64Array
): TotalAndHasChildren {
  const nodeDepth = callNodeInfo.depthForNode(callNodeIndex);
  const [rangeStart, rangeEnd] =
    callNodeInfo.getSuffixOrderIndexRangeForCallNode(callNodeIndex);
  const suffixOrderedCallNodes = callNodeInfo.getSuffixOrderedCallNodes();
  const callNodeTableDepthCol = callNodeInfo.getCallNodeTable().depth;

  // Warning: This function can be quite confusing. That's because we are dealing
  // with both inverted call nodes and non-inverted call nodes.
  // `callNodeIndex` is a node in the *inverted* tree.
  // The suffixOrderedCallNodes we iterate over below are nodes in the
  // *non-inverted* tree.
  // The total time of a node in the inverted tree is the sum of the self times
  // of all the non-inverted nodes that contribute to the inverted node.

  let total = 0;
  let hasChildren = false;
  for (let i = rangeStart; i < rangeEnd; i++) {
    const selfNode = suffixOrderedCallNodes[i];
    const self = callNodeSelf[selfNode];
    total += self;

    // The inverted call node has children if it has any inverted child nodes
    // with non-zero total time. The total time of such an inverted child node
    // is the sum of the self times of the non-inverted call nodes which
    // contribute to it. Does `selfNode` contribute to one of our children?
    // Maybe. To do so, it would need to describe a call path whose length is at
    // least as long as the inverted call paths of our children - if not, it only
    // contributes to `callNodeIndex` and not to our children.
    // Rather than comparing the length of the call paths, we can just compare
    // the depths.
    //
    // In other words:
    // The inverted call node has children if any deeper call paths with non-zero
    // self time contribute to it.
    hasChildren =
      hasChildren ||
      (self !== 0 && callNodeTableDepthCol[selfNode] > nodeDepth);
  }
  return { total, hasChildren };
}

export function computeCallTreeTimingsInverted(
  callNodeInfo: CallNodeInfoInverted,
  { callNodeSelf, rootTotalSummary }: CallNodeSelfAndSummary
): CallTreeTimingsInverted {
  const funcCount = callNodeInfo.getFuncCount();
  const callNodeTable = callNodeInfo.getCallNodeTable();
  const callNodeTableFuncCol = callNodeTable.func;
  const callNodeTableDepthCol = callNodeTable.depth;
  const totalPerRootFunc = new Float64Array(funcCount);
  const hasChildrenPerRootFunc = new Uint8Array(funcCount);
  const seenPerRootFunc = new Uint8Array(funcCount);
  const sortedRoots = [];
  for (let i = 0; i < callNodeSelf.length; i++) {
    const self = callNodeSelf[i];
    if (self === 0) {
      continue;
    }

    // Map the non-inverted call node to its corresponding root in the inverted
    // call tree. This is done by finding the inverted root which corresponds to
    // the self function of the non-inverted call node.
    const func = callNodeTableFuncCol[i];

    totalPerRootFunc[func] += self;
    if (seenPerRootFunc[func] === 0) {
      seenPerRootFunc[func] = 1;
      sortedRoots.push(func);
    }
    if (callNodeTableDepthCol[i] !== 0) {
      hasChildrenPerRootFunc[func] = 1;
    }
  }
  sortedRoots.sort(
    (a, b) => Math.abs(totalPerRootFunc[b]) - Math.abs(totalPerRootFunc[a])
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
  callNodeInfo: CallNodeInfo,
  callNodeSelfAndSummary: CallNodeSelfAndSummary
): CallTreeTimings {
  const callNodeInfoInverted = callNodeInfo.asInverted();
  if (callNodeInfoInverted !== null) {
    return {
      type: 'INVERTED',
      timings: computeCallTreeTimingsInverted(
        callNodeInfoInverted,
        callNodeSelfAndSummary
      ),
    };
  }
  return {
    type: 'NON_INVERTED',
    timings: computeCallTreeTimingsNonInverted(
      callNodeInfo,
      callNodeSelfAndSummary
    ),
  };
}

/**
 * This computes all of the count and timing information displayed in the
 * regular (non-inverted) calltree.
 */
export function computeCallTreeTimingsNonInverted(
  callNodeInfo: CallNodeInfo,
  callNodeSelfAndSummary: CallNodeSelfAndSummary
): CallTreeTimingsNonInverted {
  const callNodeTable = callNodeInfo.getCallNodeTable();
  const { callNodeSelf, rootTotalSummary } = callNodeSelfAndSummary;

  // Compute the following variables:
  const callNodeTotal = new Float64Array(callNodeTable.length);
  const callNodeHasChildren = new Uint8Array(callNodeTable.length);

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    // callNodeTotal[callNodeIndex] is the sum of our children's totals.
    // Compute this node's total by adding this node's self.
    const total = callNodeTotal[callNodeIndex] + callNodeSelf[callNodeIndex];
    const hasChildren = callNodeHasChildren[callNodeIndex] !== 0;
    const hasTotalValue = total !== 0;

    callNodeTotal[callNodeIndex] = total;

    if (!hasChildren && !hasTotalValue) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode !== -1) {
      callNodeTotal[prefixCallNode] += total;
      callNodeHasChildren[prefixCallNode] = 1;
    }
  }

  return {
    self: callNodeSelf,
    total: callNodeTotal,
    callNodeHasChildren,
    rootTotalSummary,
  };
}

/**
 * For each function in the func table, compute the sum of the sample weights
 * of the samples which have that function somewhere in their stack.
 *
 * Example:
 *
 * 1 A -> B -> A
 * 1 A -> B
 * 1 B -> B
 *
 * funcTotal[A]: 2 (only the first two samples have A in them)
 * funcTotal[B]: 3 (all three samples have B in them)
 *
 * We compute these totals by propagating totals upwards in the non-inverted
 * call tree, and then on each node, also sum that node's total to the funcTotal
 * for its function, but *only if this function is not present in the node's
 * ancestors*.
 *
 * For the ancestor check we use the pre-computed `callNodeFuncIsDuplicate` bitset.
 *
 * - A (total: 2, self: 0, duplicate: no)
 *   - B (total: 2, self: 1, duplicate: no)
 *     - A (total: 1, self: 1, duplicate: yes)
 * - B (total: 1, self: 0, duplicate: no)
 *   - B (total: 1, self: 1, duplicate: yes)
 */
function _computeFuncTotal(
  callNodeTable: CallNodeTable,
  callNodeFuncIsDuplicate: CallNodeTableBitSet,
  callNodeSelf: Float64Array,
  funcCount: number
): { funcTotal: Float64Array, sortedFuncs: IndexIntoFuncTable[] } {
  const callNodeTableFuncCol = callNodeTable.func;
  const callNodeTablePrefixCol = callNodeTable.prefix;
  const callNodeCount = callNodeTable.length;

  const callNodeChildrenTotal = new Float64Array(callNodeCount);
  const funcTotal = new Float64Array(funcCount);

  // The set of "functions with potentially non-zero totals", stored as an array.
  const seenFuncs = [];
  // seenPerFunc[func] stores whether seenFuncs.includes(func).
  const seenPerFunc = new Uint8Array(funcCount);

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeCount - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    // callNodeChildrenTotal[callNodeIndex] is the sum of our children's totals.
    // Compute this node's total by adding this node's self.
    const total =
      callNodeChildrenTotal[callNodeIndex] + callNodeSelf[callNodeIndex];

    if (total === 0) {
      continue;
    }

    const prefix = callNodeTablePrefixCol[callNodeIndex];
    if (prefix !== -1) {
      callNodeChildrenTotal[prefix] += total;
    }

    // Accumulate this node's total to the funcTotal for this node's func.
    // But don't do it if this function is present in our ancestors! We don't
    // want to count the sample twice if the function is present in the stack
    // multiple times.
    // We've already propagated this node's total to our parent node (via
    // callNodeChildrenTotal[prefix]), so this node's total will keep propagating
    // upwards. At some point it will hit the shallowest ancestor node
    // with our function, where callNodeFuncIsDuplicate will be false, and we
    // will accumulate our total into funcTotal there.
    if (!checkBit(callNodeFuncIsDuplicate, callNodeIndex)) {
      // We now know that func is not present in any of this node's ancestors.
      const func = callNodeTableFuncCol[callNodeIndex];
      funcTotal[func] += total;

      // Add this func to the set of funcs with potentially non-zero totals.
      if (seenPerFunc[func] === 0) {
        seenPerFunc[func] = 1;
        seenFuncs.push(func);
      }
    }
  }

  const abs = Math.abs;
  seenFuncs.sort((a, b) => {
    const absDiff = abs(funcTotal[b]) - abs(funcTotal[a]);
    if (absDiff !== 0) {
      return absDiff;
    }
    return a - b;
  });

  return {
    funcTotal,
    sortedFuncs: seenFuncs,
  };
}

/**
 * For each function in the funcTable, computes the self time spent in that function,
 * i.e. the sum of sample weights of the samples whose call node's "self function" is that function.
 */
function _computeFuncSelf(
  callNodeTable: CallNodeTable,
  callNodeSelf: Float64Array,
  funcCount: number
): Float64Array {
  const callNodeTableFuncCol = callNodeTable.func;
  const callNodeCount = callNodeSelf.length;

  const funcSelf = new Float64Array(funcCount);
  for (let i = 0; i < callNodeCount; i++) {
    const self = callNodeSelf[i];
    if (self !== 0) {
      const func = callNodeTableFuncCol[i];
      funcSelf[func] += self;
    }
  }

  return funcSelf;
}

/**
 * Compute the timings for the function list.
 */
export function computeFunctionListTimings(
  callNodeTable: CallNodeTable,
  callNodeFuncIsDuplicate: CallNodeTableBitSet,
  { callNodeSelf, rootTotalSummary }: CallNodeSelfAndSummary,
  funcCount: number
): CallTreeTimingsFunctionList {
  const funcSelf = _computeFuncSelf(callNodeTable, callNodeSelf, funcCount);
  const { funcTotal, sortedFuncs } = _computeFuncTotal(
    callNodeTable,
    callNodeFuncIsDuplicate,
    callNodeSelf,
    funcCount
  );
  return {
    funcSelf,
    funcTotal,
    sortedFuncs,
    rootTotalSummary,
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
        const { timings } = callTreeTimings;
        return new CallTree(
          thread,
          categories,
          callNodeInfo,
          new CallTreeInternalNonInverted(callNodeInfo, timings),
          timings.rootTotalSummary,
          Boolean(thread.isJsTracer),
          weightType
        );
      }
      case 'FUNCTION_LIST': {
        const { timings } = callTreeTimings;
        return new CallTree(
          thread,
          categories,
          callNodeInfo,
          new CallTreeInternalFunctionList(timings),
          timings.rootTotalSummary,
          Boolean(thread.isJsTracer),
          weightType
        );
      }
      case 'INVERTED': {
        const { timings } = callTreeTimings;
        return new CallTree(
          thread,
          categories,
          callNodeInfo,
          new CallTreeInternalInverted(
            ensureExists(callNodeInfo.asInverted()),
            timings
          ),
          timings.rootTotalSummary,
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
 * Returns a table with the appropriate data for the call tree summary strategy,
 * for use by the call tree or flame graph.
 *
 * If the strategy is one of the native allocation strategies, the returned table
 * will be based on thread.nativeAllocations, but with a modified
 * stack column: Some samples will have a null stack, so that they are ignored.
 * For example, the returned table for `native-allocations` will have null stacks
 * for samples which are deallocations.
 *
 * The returned table has compatible indexes with the unfiltered table returned
 * by extractUnfilteredSamplesLikeTable.
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
 * Returns the samples, jsAllocations or nativeAllocations table, without
 * nulling out the stack for any of the samples.
 *
 * The stack column of the returned table can be used to look up sample
 * categories.
 */
export function extractUnfilteredSamplesLikeTable(
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
    case 'native-retained-allocations':
    case 'native-allocations':
    case 'native-deallocations-sites':
    case 'native-deallocations-memory':
      return ensureExists(
        thread.nativeAllocations,
        'Expected the NativeAllocationTable to exist when using a "native-allocation" strategy'
      );
    /* istanbul ignore next */
    default:
      throw assertExhaustiveCheck(strategy);
  }
}

/**
 * This function is extremely similar to computeCallNodeSelfAndSummary,
 * but is specialized for converting sample counts into traced timing. Samples
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
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>,
  callNodeCount: number,
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

  const callNodeSelf = new Float64Array(callNodeCount);
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
