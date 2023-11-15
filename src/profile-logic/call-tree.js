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
  callNodeChildCount: Uint32Array,
  callNodeSummary: CallNodeSummary,
  rootCount: number,
  rootTotalSummary: number,
};

export type InvertedCallTreeRootWithTotal = {|
  total: number,
  func: IndexIntoFuncTable,
|};

export type CallTreeTimingsInverted = {|
  callNodeSelf: Float32Array,
  rootTotalSummary: number,
  sortedRoots: InvertedCallTreeRootWithTotal[],
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

export class CallTreeNonInverted implements CallTree {
  _categories: CategoryList;
  _callNodeInfo: CallNodeInfo;
  _callNodeTable: CallNodeTable;
  _callNodeSummary: CallNodeSummary;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _thread: Thread;
  _rootTotalSummary: number;
  _rootCount: number;
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
    callNodeSummary: CallNodeSummary,
    callNodeChildCount: Uint32Array,
    rootTotalSummary: number,
    rootCount: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    this._callNodeSummary = callNodeSummary;
    this._callNodeChildCount = callNodeChildCount;
    this._thread = thread;
    this._rootTotalSummary = rootTotalSummary;
    this._rootCount = rootCount;
    this._displayDataByIndex = new Map();
    this._children = [];
    this._isHighPrecision = isHighPrecision;
    this._weightType = weightType;
  }

  _getFirstChildIndex(
    callNodeIndex: IndexIntoCallNodeTable | -1
  ): IndexIntoCallNodeTable | -1 {
    if (callNodeIndex === -1) {
      return this._callNodeTable.length !== 0 ? 0 : -1;
    }
    const nextAfterDescendants =
      this._callNodeTable.nextAfterDescendants[callNodeIndex];
    if (nextAfterDescendants !== callNodeIndex + 1) {
      return callNodeIndex + 1;
    }
    return -1;
  }

  getRoots() {
    return this.getChildren(-1);
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children[callNodeIndex];
    if (children === undefined) {
      children = [];
      const firstChild = this._getFirstChildIndex(callNodeIndex);
      for (
        let childCallNodeIndex = firstChild;
        childCallNodeIndex !== -1;
        childCallNodeIndex = this._callNodeTable.nextSibling[childCallNodeIndex]
      ) {
        const childTotalSummary =
          this._callNodeSummary.total[childCallNodeIndex];
        const childChildCount = this._callNodeChildCount[childCallNodeIndex];

        if (childTotalSummary !== 0 || childChildCount !== 0) {
          children.push(childCallNodeIndex);
        }
      }
      children.sort(
        (a, b) =>
          Math.abs(this._callNodeSummary.total[b]) -
          Math.abs(this._callNodeSummary.total[a])
      );
      this._children[callNodeIndex] = children;
    }
    return children;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this.getChildren(callNodeIndex).length !== 0;
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
    return this._callNodeTable.prefix[callNodeIndex];
  }

  getDepth(callNodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeTable.depth[callNodeIndex];
  }

  getNodeData(callNodeIndex: IndexIntoCallNodeTable): CallNodeData {
    const funcIndex = this._callNodeTable.func[callNodeIndex];
    const funcName = this._thread.stringTable.getString(
      this._thread.funcTable.name[funcIndex]
    );
    const total = this._callNodeSummary.total[callNodeIndex];
    const totalRelative = total / this._rootTotalSummary;
    const self = this._callNodeSummary.self[callNodeIndex];
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
      this._callNodeTable.sourceFramesInlinedIntoSymbol[callNodeIndex];
    if (inlinedIntoNativeSymbol === null) {
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
      const funcIndex = this._callNodeTable.func[callNodeIndex];
      const categoryIndex = this._callNodeTable.category[callNodeIndex];
      const subcategoryIndex = this._callNodeTable.subcategory[callNodeIndex];
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
    let parentSelf = 0;
    let children = [callNodeIndex];
    const pathToLeaf = [];
    do {
      // Walk down the tree's depth to construct a path to the leaf node, this should
      // be the heaviest branch of the tree.
      const firstChild = children[0];
      const { total, self } = this.getNodeData(firstChild);
      if (total < parentSelf) {
        break;
      }
      callNodeIndex = firstChild;
      parentSelf = self;
      pathToLeaf.push(callNodeIndex);
      children = this.getChildren(callNodeIndex);
    } while (children && children.length > 0);

    return (
      pathToLeaf
        // Map the CallNodeIndex to FuncIndex.
        .map((index) => this._callNodeTable.func[index])
        // Reverse it so that it's in the proper inverted order.
        .reverse()
    );
  }
}

type CallNodeIndex = IndexIntoCallNodeTable; // into inverted call node table

export class CallTreeInverted implements CallTree {
  _categories: CategoryList;
  _callNodeInfo: ProfileData.CallNodeInfoInverted;
  _nonInvertedCallNodeTable: CallNodeTable;
  _callNodeSelf: Float32Array;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _rootTotalSummary: number;
  _rootNodes: CallNodeIndex[];
  _thread: Thread;
  _displayDataByIndex: Map<CallNodeIndex, CallNodeDisplayData>;
  _totalPerNode: Map<CallNodeIndex, number>;
  _children: Map<CallNodeIndex | -1, CallNodeChildren>;
  _isHighPrecision: boolean;
  _weightType: WeightType;

  constructor(
    thread: Thread,
    categories: CategoryList,
    callNodeInfo: ProfileData.CallNodeInfoInverted,
    callTreeTimingsInverted: CallTreeTimingsInverted,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeInfo = callNodeInfo;
    this._nonInvertedCallNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    this._callNodeSelf = callTreeTimingsInverted.callNodeSelf;
    this._thread = thread;
    this._displayDataByIndex = new Map();
    this._rootTotalSummary = callTreeTimingsInverted.rootTotalSummary;
    const { sortedRoots } = callTreeTimingsInverted;
    this._totalPerNode = new Map(
      sortedRoots.map(({ func, total }) => [func, total])
    );
    this._rootNodes = sortedRoots.map(({ func }) => func);
    this._children = new Map();
    this._isHighPrecision = isHighPrecision;
    this._weightType = weightType;
  }

  getRoots(): CallNodeIndex[] {
    return this._rootNodes;
  }

  _prepareChildrenOfNode(parentNodeIndex: CallNodeIndex): CallNodeIndex[] {
    const orderedSelfNodes = this._callNodeInfo.getOrderedSelfNodes();
    const allChildCallNodeIndexes =
      this._callNodeInfo.getChildren(parentNodeIndex);
    const childCallNodes = [];
    for (let i = 0; i < allChildCallNodeIndexes.length; i++) {
      const callNodeIndex = allChildCallNodeIndexes[i];
      let total = 0;
      const [rangeStart, rangeEnd] =
        this._callNodeInfo.getOrderingIndexRangeForNode(callNodeIndex);
      for (
        let orderingIndex = rangeStart;
        orderingIndex < rangeEnd;
        orderingIndex++
      ) {
        const selfNode = orderedSelfNodes[orderingIndex];
        total += this._callNodeSelf[selfNode];
      }
      if (total !== 0) {
        childCallNodes.push({ callNodeIndex, total });
        this._totalPerNode.set(callNodeIndex, total);
      }
    }
    childCallNodes.sort((a, b) => b.total - a.total);
    const childCallNodeIndexes = childCallNodes.map(
      ({ callNodeIndex }) => callNodeIndex
    );
    this._children.set(parentNodeIndex, childCallNodeIndexes);
    return childCallNodeIndexes;
  }

  getChildren(nodeIndex: CallNodeIndex): CallNodeChildren {
    const children = this._children.get(nodeIndex);
    if (children !== undefined) {
      return children;
    }

    return this._prepareChildrenOfNode(nodeIndex);
  }

  _getTotal(nodeIndex: CallNodeIndex): number {
    const total = this._totalPerNode.get(nodeIndex);
    if (total !== undefined) {
      return total;
    }
    const parent = ensureExists(
      this._callNodeInfo.getParentCallNodeIndex(nodeIndex),
      'Roots are always present in _totalPerNode'
    );
    this._prepareChildrenOfNode(parent);
    return ensureExists(
      this._totalPerNode.get(nodeIndex),
      'Preparing the children of our parent should have created our entry in _total'
    );
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this.getChildren(callNodeIndex).length !== 0;
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
    const total = this._getTotal(nodeIndex);
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
    if (inlinedIntoNativeSymbol === null) {
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

    const unpackedCallNodes =
      this._callNodeInfo.getOrderedCallNodePairsForInvertedNode(callNodeIndex);

    // Find the nodeNode in unpackedCallNodes with the highest self time.
    let heaviestNonInvertedNode = -1;
    let heaviestNonInvertedNodeSelf = 0;
    for (let i = 0; i < unpackedCallNodes.length; i++) {
      const { selfNode, nodeNode } = unpackedCallNodes[i];
      const nodeSelf = this._callNodeSelf[selfNode];
      if (
        heaviestNonInvertedNode === -1 ||
        nodeSelf > heaviestNonInvertedNodeSelf
      ) {
        heaviestNonInvertedNode = nodeNode;
        heaviestNonInvertedNodeSelf = nodeSelf;
      }
    }

    // Turn the found node into a call path that's valid in the non-inverted tree.
    const callPath = [];
    for (
      let currentNode = heaviestNonInvertedNode;
      currentNode !== -1;
      currentNode = this._nonInvertedCallNodeTable.prefix[currentNode]
    ) {
      callPath.push(this._nonInvertedCallNodeTable.func[currentNode]);
    }
    return callPath.reverse();
  }
}

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

function _getInvertedTreeNodeTotal(
  callNodeSortIndexRangeStart: ProfileData.IndexIntoInvertedOrdering,
  callNodeSortIndexRangeEnd: ProfileData.IndexIntoInvertedOrdering,
  orderedCallNodes: Uint32Array,
  callNodeSelf: Float32Array
): number {
  let total = 0;
  for (
    let callNodeSortIndex = callNodeSortIndexRangeStart;
    callNodeSortIndex < callNodeSortIndexRangeEnd;
    callNodeSortIndex++
  ) {
    const callNodeIndex = orderedCallNodes[callNodeSortIndex];
    total += callNodeSelf[callNodeIndex];
  }
  return total;
}

export function computeCallTreeTimingsInverted(
  { callNodeSelf, rootTotalSummary }: CallNodeSelfAndSummary,
  callNodeInfo: ProfileData.CallNodeInfoInverted
): CallTreeTimingsInverted {
  const orderedSelfNodes = callNodeInfo.getOrderedSelfNodes();
  const rootCount = callNodeInfo.getRootCount();
  const sortedRoots = [];
  for (let func = 0; func < rootCount; func++) {
    const [callNodeSortIndexRangeStart, callNodeSortIndexRangeEnd] =
      callNodeInfo.getOrderingIndexRangeForNode(func);
    const total = _getInvertedTreeNodeTotal(
      callNodeSortIndexRangeStart,
      callNodeSortIndexRangeEnd,
      orderedSelfNodes,
      callNodeSelf
    );
    if (total !== 0) {
      sortedRoots.push({ func, total });
    }
  }
  sortedRoots.sort((a, b) => b.total - a.total);
  return {
    callNodeSelf,
    rootTotalSummary,
    sortedRoots,
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
  const callNodeChildCount = new Uint32Array(callNodeTable.length);
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
    const hasChildren = callNodeChildCount[callNodeIndex] !== 0;
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
      callNodeChildCount[prefixCallNode]++;
    }
  }

  return {
    callNodeSummary: {
      self: callNodeSelf,
      total: callNodeTotalSummary,
    },
    callNodeChildCount,
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
        const {
          callNodeSummary,
          callNodeChildCount,
          rootTotalSummary,
          rootCount,
        } = callTreeTimings.timings;

        return new CallTreeNonInverted(
          thread,
          categories,
          callNodeInfo,
          callNodeSummary,
          callNodeChildCount,
          rootTotalSummary,
          rootCount,
          Boolean(thread.isJsTracer),
          weightType
        );
      }
      case 'INVERTED': {
        return new CallTreeInverted(
          thread,
          categories,
          ensureExists(callNodeInfo.asInverted()),
          callTreeTimings.timings,
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
      const { sortedRoots, callNodeSelf } = callTreeTimings.timings;
      const callNodeInfoInverted = ensureExists(callNodeInfo.asInverted());
      if (callNodeIndex < callNodeInfoInverted.getRootCount()) {
        // This is a root node.
        const rootFunc = callNodeIndex;
        const root = sortedRoots.find((root) => root.func === rootFunc);
        if (root === undefined) {
          return { self: 0, total: 0 };
        }
        return { self: root.total, total: root.total };
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
