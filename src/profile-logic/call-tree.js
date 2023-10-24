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
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeData,
  CallNodeDisplayData,
  Milliseconds,
  TracedTiming,
  SamplesTable,
  ExtraBadgeInfo,
  BottomBoxInfo,
} from 'firefox-profiler/types';

import ExtensionIcon from '../../res/img/svg/extension.svg';
import { formatCallNodeNumber, formatPercent } from '../utils/format-numbers';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import * as ProfileData from './profile-data';
import type { CallTreeSummaryStrategy } from '../types/actions';

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
    console.error(
      'Error while extracing the favicon from the libname',
      libname
    );
    return null;
  }
}

export class CallTree {
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
  _jsOnly: boolean;
  _interval: number;
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
    jsOnly: boolean,
    interval: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeInfo = callNodeInfo;
    this._callNodeTable = callNodeInfo.callNodeTable;
    this._callNodeSummary = callNodeSummary;
    this._callNodeChildCount = callNodeChildCount;
    this._thread = thread;
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
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>,
  { callNodeTable }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): CallTreeCountsAndSummary {
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
      callNodeInfo,
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
