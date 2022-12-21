/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import { timeCode } from '../utils/time-code';
import {
  getSampleIndexToCallNodeIndex,
  getOriginAnnotationForFunc,
  getCategoryPairLabel,
} from './profile-data';
import { resourceTypes } from './data-structures';
import { getFunctionName } from './function-info';
import { UniqueStringArray } from '../utils/unique-string-array';
import type {
  CategoryList,
  Thread,
  FuncTable,
  ResourceTable,
  NativeSymbolTable,
  IndexIntoFuncTable,
  SamplesLikeTable,
  WeightType,
  CallNodeTable,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeData,
  CallNodeDisplayData,
  Milliseconds,
  TracedTiming,
  SamplesTable,
  ExtraBadgeInfo,
  IndexIntoStackTable,
} from 'firefox-profiler/types';

import ExtensionIcon from '../../res/img/svg/extension.svg';
import { formatCallNodeNumber, formatPercent } from '../utils/format-numbers';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import memoize from 'memoize-immutable';
import * as ProfileData from './profile-data';
import type { CallTreeSummaryStrategy } from '../types/actions';
import type { CallNodeInfoWithFuncMapping } from './profile-data';

type CallNodeChildren = IndexIntoCallNodeTable[];
type CallNodeSummary = {
  self: Float32Array,
  total: Float32Array,
};
export type CallTreeCountsAndSummary = {
  callNodeChildCount: Uint32Array,
  callNodeSummary: CallNodeSummary,
  rootCount: number,
  rootTotalSummary: number,
};

function extractFaviconFromLibname(libname: string): string | null {
  try {
    const url = new URL('/favicon.ico', libname);
    if (url.protocol === 'http:') {
      // Upgrade http requests.
      url.protocol = 'https:';
    }
    return url.href;
  } catch (e) {
    return null;
  }
}

export class CallTree {
  _categories: CategoryList;
  _callNodeTable: CallNodeTable;
  _callNodeSummary: CallNodeSummary;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _funcTable: FuncTable;
  _resourceTable: ResourceTable;
  _nativeSymbols: NativeSymbolTable;
  _stringTable: UniqueStringArray;
  _rootTotalSummary: number;
  _rootCount: number;
  _displayDataByIndex: Map<IndexIntoCallNodeTable, CallNodeDisplayData>;
  // _children is indexed by IndexIntoCallNodeTable. Since they are
  // integers, using an array directly is faster than going through a Map.
  _children: Array<CallNodeChildren>;
  _jsOnly: boolean;
  _interval: number;
  _isHighPrecision: boolean;
  _weightType: WeightType;

  constructor(
    { funcTable, resourceTable, nativeSymbols, stringTable }: Thread,
    categories: CategoryList,
    callNodeTable: CallNodeTable,
    callNodeSummary: CallNodeSummary,
    callNodeChildCount: Uint32Array,
    rootTotalSummary: number,
    rootCount: number,
    jsOnly: boolean,
    interval: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeTable = callNodeTable;
    this._callNodeSummary = callNodeSummary;
    this._callNodeChildCount = callNodeChildCount;
    this._funcTable = funcTable;
    this._resourceTable = resourceTable;
    this._nativeSymbols = nativeSymbols;
    this._stringTable = stringTable;
    this._rootTotalSummary = rootTotalSummary;
    this._rootCount = rootCount;
    this._displayDataByIndex = new Map();
    this._children = [];
    this._jsOnly = jsOnly;
    this._interval = interval;
    this._isHighPrecision = isHighPrecision;
    this._weightType = weightType;
  }

  getRoots() {
    return this.getChildren(-1);
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children[callNodeIndex];
    if (children === undefined) {
      const childCount =
        callNodeIndex === -1
          ? this._rootCount
          : this._callNodeChildCount[callNodeIndex];
      children = [];
      for (
        let childCallNodeIndex = callNodeIndex + 1;
        childCallNodeIndex < this._callNodeTable.length &&
        children.length < childCount;
        childCallNodeIndex++
      ) {
        const childPrefixIndex = this._callNodeTable.prefix[childCallNodeIndex];
        const childTotalSummary =
          this._callNodeSummary.total[childCallNodeIndex];
        const childChildCount = this._callNodeChildCount[childCallNodeIndex];
        if (
          childPrefixIndex === callNodeIndex &&
          (childTotalSummary !== 0 || childChildCount !== 0)
        ) {
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

  hasSameNodeIds(tree: CallTree): boolean {
    return this._callNodeTable === tree._callNodeTable;
  }

  getNodeData(callNodeIndex: IndexIntoCallNodeTable): CallNodeData {
    const funcIndex = this._callNodeTable.func[callNodeIndex];
    const funcName = this._stringTable.getString(
      this._funcTable.name[funcIndex]
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
      this._stringTable.getString(
        this._nativeSymbols.name[inlinedIntoNativeSymbol]
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
      const resourceIndex = this._funcTable.resource[funcIndex];
      const resourceType = this._resourceTable.type[resourceIndex];
      const isFrameLabel = resourceIndex === -1;
      const libName = this._getOriginAnnotation(funcIndex);
      const weightType = this._weightType;

      let iconSrc = null;
      let icon = null;

      if (resourceType === resourceTypes.webhost) {
        icon = iconSrc = extractFaviconFromLibname(libName);
      } else if (resourceType === resourceTypes.addon) {
        iconSrc = ExtensionIcon;

        const resourceNameIndex = this._resourceTable.name[resourceIndex];
        const iconText = this._stringTable.getString(resourceNameIndex);
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
      this._funcTable,
      this._resourceTable,
      this._stringTable
    );
  }

  getRawFileNameForCallNode(
    callNodeIndex: IndexIntoCallNodeTable
  ): string | null {
    const funcIndex = this._callNodeTable.func[callNodeIndex];
    const fileName = this._funcTable.fileName[funcIndex];
    if (fileName === null) {
      return null;
    }
    return this._stringTable.getString(fileName);
  }
}

function _getInvertedStackSelf(
  // The samples could either be a SamplesTable, or a JsAllocationsTable.
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>
): {
  // In an inverted profile, all the amount of self unit (time, bytes, count, etc.) is
  // accounted to the root nodes. So `callNodeSelf` will be 0 for all non-root nodes.
  callNodeSelf: Float32Array,
  // This property stores the amount of unit (time, bytes, count, etc.) spent in the
  // stacks' leaf nodes. Later these values will make it possible to compute the
  // total for all nodes by summing up the values up the tree.
  callNodeLeaf: Float32Array,
} {
  // Compute an array that maps the callNodeIndex to its root.
  const callNodeToRoot = new Int32Array(callNodeTable.length);
  for (
    let callNodeIndex = 0;
    callNodeIndex < callNodeTable.length;
    callNodeIndex++
  ) {
    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      // callNodeIndex is a root node
      callNodeToRoot[callNodeIndex] = callNodeIndex;
    } else {
      // The callNodeTable guarantees that a callNode's prefix always comes
      // before the callNode; prefix references are always to lower callNode
      // indexes and never to higher indexes.
      // We are iterating the callNodeTable in forwards direction (starting at
      // index 0) so we know that we have already visited the current call
      // node's prefix call node and can reuse its stored root node, which
      // recursively is the value we're looking for.
      callNodeToRoot[callNodeIndex] = callNodeToRoot[prefixCallNode];
    }
  }

  // Calculate the timing information by going through each sample.
  const callNodeSelf = new Float32Array(callNodeTable.length);
  const callNodeLeaf = new Float32Array(callNodeTable.length);
  for (
    let sampleIndex = 0;
    sampleIndex < sampleIndexToCallNodeIndex.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const rootIndex = callNodeToRoot[callNodeIndex];
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelf[rootIndex] += weight;
      callNodeLeaf[callNodeIndex] += weight;
    }
  }

  return { callNodeSelf, callNodeLeaf };
}

/**
 * This is a helper function to get the stack timings for un-inverted call trees.
 */
function _getStackSelf(
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<null | IndexIntoCallNodeTable>
): {
  callNodeSelf: Float32Array, // Milliseconds[]
  callNodeLeaf: Float32Array, // Milliseconds[]
} {
  const callNodeSelf = new Float32Array(callNodeTable.length);

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

  return { callNodeSelf, callNodeLeaf: callNodeSelf };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 *
 * Note: The "timionmgs" could have a number of different meanings based on the
 * what type of weight is in the SamplesLikeTable. For instance, it could be
 * milliseconds, sample counts, or bytes.
 */
export function computeCallTreeCountsAndSummary(
  samples: SamplesLikeTable,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): CallTreeCountsAndSummary {
  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(
    samples.stack,
    stackIndexToCallNodeIndex
  );
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelf, callNodeLeaf } = invertCallstack
    ? _getInvertedStackSelf(samples, callNodeTable, sampleIndexToCallNodeIndex)
    : _getStackSelf(samples, callNodeTable, sampleIndexToCallNodeIndex);

  // Compute the following variables:
  const callNodeTotalSummary = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);
  let rootTotalSummary = 0;
  let rootCount = 0;

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    callNodeTotalSummary[callNodeIndex] += callNodeLeaf[callNodeIndex];
    rootTotalSummary += Math.abs(callNodeLeaf[callNodeIndex]);
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
 * This handles computing timing information, and passing it all into
 * the CallTree constructor.
 */
export function getCallTree(
  thread: Thread,
  interval: Milliseconds,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  implementationFilter: string,
  callTreeCountsAndSummary: CallTreeCountsAndSummary,
  weightType: WeightType
): CallTree {
  return timeCode('getCallTree', () => {
    const { callNodeSummary, callNodeChildCount, rootTotalSummary, rootCount } =
      callTreeCountsAndSummary;
    const jsOnly = implementationFilter === 'js';
    // By default add a single decimal value, e.g 13.1, 0.3, 5234.4
    return new CallTree(
      thread,
      categories,
      callNodeInfo.callNodeTable,
      callNodeSummary,
      callNodeChildCount,
      rootTotalSummary,
      rootCount,
      jsOnly,
      interval,
      Boolean(thread.isJsTracer),
      weightType
    );
  });
}

type _SummaryPerFunction = {|
  callNodeSelf: Float32Array, // Milliseconds[]
  callNodeTotal: Float32Array, // Milliseconds[]
|};

function _combineSummaryPerFunctions(
  summaryPerFunctions: _SummaryPerFunction[]
): _SummaryPerFunction {
  ensureExists(summaryPerFunctions[0]);
  if (summaryPerFunctions.length === 1) {
    return summaryPerFunctions[0];
  }
  const callNodeSelf = new Float32Array(summaryPerFunctions[0].callNodeSelf);
  const callNodeTotal = new Float32Array(summaryPerFunctions[0].callNodeTotal);
  for (let i = 1; i < summaryPerFunctions.length; i++) {
    const { callNodeSelf: self, callNodeTotal: total } = summaryPerFunctions[i];
    for (let j = 0; j < self.length; j++) {
      callNodeSelf[j] += self[j];
      callNodeTotal[j] += total[j];
    }
  }
  return { callNodeSelf, callNodeTotal };
}

function _subtractSummaryPerFunctions(
  initial: _SummaryPerFunction,
  subtracted: _SummaryPerFunction
) {
  const callNodeSelf = new Float32Array(initial.callNodeSelf);
  const callNodeTotal = new Float32Array(initial.callNodeTotal);
  for (let j = 0; j < callNodeSelf.length; j++) {
    callNodeSelf[j] -= subtracted.callNodeSelf[j];
    callNodeTotal[j] -= subtracted.callNodeTotal[j];
  }
  return { callNodeSelf, callNodeTotal };
}

/**
 * The following code belongs to an optimization that improves the performance of the call tree
 * significantly, by caching lots of computed data.
 * It was implemented in https://github.com/firefox-devtools/profiler/pull/4227
 */

/** ensures that the slices are not to large for any reasonably sized sample */
const MAX_SAMPLE_SLICE_NUMBER = 300;
const MAX_SLICES_PER_LEVEL = 5;

type SummarySpecificFuncs<T> = {|
  /** compute the summary information for the sample range (the end index is not included) */
  compute: (startIndex: number, endIndex: number) => T,
  /** combine several instances to one */
  combine: (summaryPerFunctions: T[]) => T,
  /** subtract second instance from the first */
  subtract: (initial: T, subtracted: T) => T,
|};

/**
 * Node in the multilevel cache for the function list information
 * (a mapping of functions to the number of stack samples they appear in) over time:
 *
 * The whole sample range is split into slices of equal size.
 * We store for every slice the function list information.
 * The slices are further split recursively into smaller, non overlapping,
 * slides until the slices contain at mosty MAX_SAMPLE_SLICE_NUMBER samples.
 *
 * Now when we want to get the function list information for a specific range,
 * we combine the information from all tree nodes on the root level
 * that are fully contained in the range. We use the sub slices to recursively
 * add the information for the borders.
 * This way we only compute new information for at most 2 * (MAX_SLICES_PER_LEVEL - 1) slices.
 * Which speeds up the computation.
 *
 * The information in the tree nodes themselfes is only computed when needed,
 * and then cached.
 *
 * @param T The type of the information that is stored in the tree nodes,
 *          e.g. the function list information (_SummaryPerFunction).
 */
class SummaryCacheTreeNode<T> {
  _startIndex: number;
  /** exclusive end index */
  _endIndex: number;
  /** combined information of all children, only non null
   * if the information of all children is computed */
  _sums: T | null;
  /** children of this node if their information is already computed
   * (the _sums of children objects is non null) */
  _children: (SummaryCacheTreeNode<T> | null)[];
  /** functions to compute, combine and subtract Ts */
  _funcs: SummarySpecificFuncs<T>;
  /** size of the leaf samples in this subtree (right border slices might be smaller) */
  _finalSliceSize: number;
  /** size of the slices of the direct children (right border slices might be smaller) */
  _sliceSize: number;
  /** we cache a single computation */
  _lastComputation: {| start: number, end: number, sums: T |} | null;

  constructor(
    startIndex: number,
    endIndex: number,
    funcs: SummarySpecificFuncs<T>,
    finalSliceSize: number
  ) {
    this._startIndex = startIndex;
    this._endIndex = endIndex;
    this._sums = null;
    this._funcs = funcs;
    this._finalSliceSize = finalSliceSize;
    const finalSliceCount =
      finalSliceSize < endIndex - startIndex
        ? Math.ceil((this._endIndex - this._startIndex) / this._finalSliceSize)
        : 0;
    const numberOfChildren = Math.min(finalSliceCount, MAX_SLICES_PER_LEVEL);
    this._sliceSize =
      numberOfChildren > 0
        ? Math.ceil((this._endIndex - this._startIndex) / numberOfChildren)
        : 0;
    this._children = new Array(numberOfChildren).fill(null);
    this._lastComputation = null;
  }

  computeCached(start: number, end: number): T {
    if (this._lastComputation === null) {
      this._lastComputation = { start, end, sums: this._compute(start, end) };
      return this._lastComputation.sums;
    }
    const {
      start: lastStart,
      end: lastEnd,
      sums: lastSums,
    } = this._lastComputation;
    if (lastStart === start && lastEnd === end) {
      return lastSums;
    }
    // check whether just computing looks at less samples
    const rangeForCachedComputation =
      Math.abs(lastStart - start) + Math.abs(lastEnd - end);
    if (rangeForCachedComputation > Math.abs(start - end)) {
      this._lastComputation = { start, end, sums: this._compute(start, end) };
    } else {
      let result = lastSums;
      const applySlice = (start: number, end: number) => {
        if (start === end) {
          return;
        }
        const sum = this._compute(Math.min(start, end), Math.max(start, end));
        if (start < end) {
          // we added a slice
          result = this._funcs.combine([result, sum]);
        } else {
          // we removed a slice
          result = this._funcs.subtract(result, sum);
        }
      };
      applySlice(start, lastStart);
      applySlice(lastEnd, end);
      this._lastComputation = { start, end, sums: result };
    }
    return this._lastComputation.sums;
  }

  _compute(start: number, end: number): T {
    if (start === end) {
      return this._funcs.compute(start, end);
    }
    if (start === this._startIndex && end === this._endIndex) {
      // we use this._sums
      return this._computeAll();
    }
    if (this._children.length === 0) {
      return this._funcs.compute(start, end);
    }
    // so it is something in between

    const startChildIndex = this._getChildIndex(start);
    const endChildIndex = this._getChildIndex(end - 1);
    const slices: T[] = [];
    for (let i = startChildIndex; i <= endChildIndex; i++) {
      const child = this._getChild(i);
      const childStart = Math.max(start, child._startIndex);
      const childEnd = Math.min(end, child._endIndex);
      slices.push(child.computeCached(childStart, childEnd));
    }
    return this._funcs.combine(slices);
  }

  _rangeOfChild(childIndex: number): [number, number] {
    if (childIndex === this._children.length - 1) {
      return [this._startIndex + childIndex * this._sliceSize, this._endIndex];
    }
    return [
      this._startIndex + childIndex * this._sliceSize,
      this._startIndex + (childIndex + 1) * this._sliceSize,
    ];
  }

  _computeAll(): T {
    if (this._sums === null) {
      if (this._endIndex - this._startIndex <= this._finalSliceSize) {
        // leaf node
        return this._funcs.compute(this._startIndex, this._endIndex);
      }
      // we need to split the node as it consists of at least 2 slices
      this._sums = this._funcs.combine(
        this._children.map((child, index) =>
          this._getChild(index)._computeAll()
        )
      );
    }
    return this._sums;
  }

  _getChild(childIndex: number): SummaryCacheTreeNode<T> {
    if (this._children[childIndex] === null) {
      this._initChild(childIndex);
    }
    // $FlowExpectError
    return this._children[childIndex];
  }

  _initChild(childIndex: number) {
    const [start, end] = this._rangeOfChild(childIndex);
    this._children[childIndex] = new SummaryCacheTreeNode(
      start,
      end,
      this._funcs,
      this._finalSliceSize
    );
  }

  _getChildIndex(sampleIndex: number): number {
    return Math.floor((sampleIndex - this._startIndex) / this._sliceSize);
  }
}

/**
 * Return the self and total per call node index
 */
function _getSummaryPerFunctionSlice(
  thread: Thread,
  samples: SamplesLikeTable,
  funcToCallNodeIndex: Int32Array,
  startIndex: number,
  endIndex: number
): _SummaryPerFunction {
  const { frameTable, stackTable } = thread;
  const callNodeSelf = new Float32Array(funcToCallNodeIndex.length); // intialized to 0
  const callNodeTotal = new Float32Array(funcToCallNodeIndex.length);

  for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    const weight = samples.weight ? samples.weight[sampleIndex] : 1;
    let stackStart: IndexIntoStackTable | null = stackIndex;
    const alreadyCountedFuncs: Set<IndexIntoFuncTable> = new Set();
    while (stackStart !== null) {
      const funcIndex = frameTable.func[stackTable.frame[stackStart]];
      if (!alreadyCountedFuncs.has(funcIndex)) {
        alreadyCountedFuncs.add(funcIndex);
        const callNodeIndex = funcToCallNodeIndex[funcIndex];
        callNodeSelf[callNodeIndex] += stackStart === stackIndex ? weight : 0;
        callNodeTotal[callNodeIndex] += weight;
      }
      stackStart = stackTable.prefix[stackStart];
    }
  }

  return { callNodeSelf, callNodeTotal };
}

function _createSummaryCacheTree(
  thread: Thread,
  samples: SamplesLikeTable,
  funcToCallNodeIndex: Int32Array
): SummaryCacheTreeNode<_SummaryPerFunction> {
  return new SummaryCacheTreeNode<_SummaryPerFunction>(
    0,
    samples.length,
    {
      compute: (startIndex, endIndex) =>
        _getSummaryPerFunctionSlice(
          thread,
          samples,
          funcToCallNodeIndex,
          startIndex,
          endIndex
        ),
      combine: _combineSummaryPerFunctions,
      subtract: _subtractSummaryPerFunctions,
    },
    Math.min(samples.length, MAX_SAMPLE_SLICE_NUMBER)
  );
}

const _createSummaryCacheTreeMemoized = memoize(_createSummaryCacheTree, {
  limit: 1,
});

/**
 * This computes all of the count and timing information displayed in the method table view.
 *
 * It does only use the stackTable and the frameTable from the thread, and not the samples table.
 * The samples should include all samples of the whole range of the thread.
 *
 * Note: The "timionmgs" could have a number of different meanings based on the
 * what type of weight is in the SamplesLikeTable. For instance, it could be
 * milliseconds, sample counts, or bytes.
 */
export function computeFunctionTableCallTreeCountsAndSummary(
  thread: Thread,
  samples: SamplesLikeTable,
  {
    callNodeInfo: { callNodeTable },
    funcToCallNodeIndex,
  }: CallNodeInfoWithFuncMapping,
  startIndex: number,
  endIndex: number
): CallTreeCountsAndSummary {
  const { callNodeSelf, callNodeTotal } = _createSummaryCacheTreeMemoized(
    thread,
    samples,
    funcToCallNodeIndex
  ).computeCached(startIndex, endIndex);

  // one call node for each function

  // Compute the following variables:
  const callNodeTotalSummary = callNodeTotal;
  const callNodeChildCount = new Uint32Array(callNodeTable.length).fill(0);
  const rootTotalSummary = samples.length;
  const rootCount = callNodeTable.length;

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
 * This handles computing timing information, and passing it all into
 * the CallTree constructor.
 */
export function getFunctionTableCallTree(
  thread: Thread,
  interval: Milliseconds,
  { callNodeInfo }: CallNodeInfoWithFuncMapping,
  categories: CategoryList,
  implementationFilter: string,
  callTreeCountsAndSummary: CallTreeCountsAndSummary,
  weightType: WeightType
): CallTree {
  return timeCode('getFunctionTableCallTree', () => {
    const { callNodeSummary, callNodeChildCount, rootTotalSummary, rootCount } =
      callTreeCountsAndSummary;
    const jsOnly = implementationFilter === 'js';
    // By default add a single decimal value, e.g 13.1, 0.3, 5234.4
    return new CallTree(
      thread,
      categories,
      callNodeInfo.callNodeTable,
      callNodeSummary,
      callNodeChildCount,
      rootTotalSummary,
      rootCount,
      jsOnly,
      interval,
      Boolean(thread.isJsTracer),
      weightType
    );
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
 * This function is extremely similar to computeCallTreeCountsAndSummary,
 * but is specialized for converting sample counts into traced timing. Samples
 * don't have duration information associated with them, it's mostly how long they
 * were observed to be running. This function computes the timing the exact same
 * way that the stack chart will display the information, so that timing information
 * will agree. In the past, timing was computed by samplingInterval * sampleCount.
 * This caused confusion when switching to the trace-based views when the numbers
 * did not agree. In order to remove confusion, we can show the sample counts,
 * plus the traced timing, which is a compromise between correctness, and consistency.
 */
export function computeTracedTiming(
  samples: SamplesLikeTable,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): TracedTiming | null {
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

  // Compute the timing duration, which is the time between this sample and the next.
  const weight = [];
  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
    weight.push(samples.time[sampleIndex + 1] - samples.time[sampleIndex]);
  }
  if (samples.length > 0) {
    // Use the sampling interval for the last sample.
    weight.push(interval);
  }
  const samplesWithWeight: SamplesTable = {
    ...samples,
    weight,
  };

  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(
    samples.stack,
    stackIndexToCallNodeIndex
  );
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelf, callNodeLeaf } = invertCallstack
    ? _getInvertedStackSelf(
        samplesWithWeight,
        callNodeTable,
        sampleIndexToCallNodeIndex
      )
    : _getStackSelf(
        samplesWithWeight,
        callNodeTable,
        sampleIndexToCallNodeIndex
      );

  // Compute the following variables:
  const callNodeTotalSummary = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total time is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    callNodeTotalSummary[callNodeIndex] += callNodeLeaf[callNodeIndex];
    const hasChildren = callNodeChildCount[callNodeIndex] !== 0;
    const hasTotalValue = callNodeTotalSummary[callNodeIndex] !== 0;

    if (!hasChildren && !hasTotalValue) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode !== -1) {
      callNodeTotalSummary[prefixCallNode] +=
        callNodeTotalSummary[callNodeIndex];
      callNodeChildCount[prefixCallNode]++;
    }
  }

  return {
    self: callNodeSelf,
    running: callNodeTotalSummary,
  };
}
