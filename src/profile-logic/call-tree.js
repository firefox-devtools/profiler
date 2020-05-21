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
import { UniqueStringArray } from '../utils/unique-string-array';
import type {
  CategoryList,
  Thread,
  FuncTable,
  ResourceTable,
  IndexIntoFuncTable,
  SamplesLikeTable,
  WeightType,
  CallNodeTable,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeData,
  CallNodeDisplayData,
  Milliseconds,
} from 'firefox-profiler/types';

import ExtensionIcon from '../../res/img/svg/extension.svg';
import { formatCallNodeNumber, formatPercent } from '../utils/format-numbers';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import * as ProfileData from './profile-data';
import type { CallTreeSummaryStrategy } from '../types/actions';

type CallNodeChildren = IndexIntoCallNodeTable[];
type CallNodeTimes = {
  selfTime: Float32Array,
  totalTime: Float32Array,
};
export type CallTreeCountsAndTimings = {
  callNodeChildCount: Uint32Array,
  callNodeTimes: CallNodeTimes,
  rootCount: number,
  rootTotalTime: number,
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
  _callNodeTable: CallNodeTable;
  _callNodeTimes: CallNodeTimes;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _funcTable: FuncTable;
  _resourceTable: ResourceTable;
  _stringTable: UniqueStringArray;
  _rootTotalTime: number;
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
    { funcTable, resourceTable, stringTable }: Thread,
    categories: CategoryList,
    callNodeTable: CallNodeTable,
    callNodeTimes: CallNodeTimes,
    callNodeChildCount: Uint32Array,
    rootTotalTime: number,
    rootCount: number,
    jsOnly: boolean,
    interval: number,
    isHighPrecision: boolean,
    weightType: WeightType
  ) {
    this._categories = categories;
    this._callNodeTable = callNodeTable;
    this._callNodeTimes = callNodeTimes;
    this._callNodeChildCount = callNodeChildCount;
    this._funcTable = funcTable;
    this._resourceTable = resourceTable;
    this._stringTable = stringTable;
    this._rootTotalTime = rootTotalTime;
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
        const childTotalTime = this._callNodeTimes.totalTime[
          childCallNodeIndex
        ];
        const childChildCount = this._callNodeChildCount[childCallNodeIndex];

        if (
          childPrefixIndex === callNodeIndex &&
          (childTotalTime !== 0 || childChildCount !== 0)
        ) {
          children.push(childCallNodeIndex);
        }
      }
      children.sort(
        (a, b) =>
          Math.abs(this._callNodeTimes.totalTime[b]) -
          Math.abs(this._callNodeTimes.totalTime[a])
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
    const totalTime = this._callNodeTimes.totalTime[callNodeIndex];
    const totalTimeRelative = totalTime / this._rootTotalTime;
    const selfTime = this._callNodeTimes.selfTime[callNodeIndex];
    const selfTimeRelative = selfTime / this._rootTotalTime;

    return {
      funcName,
      totalTime,
      totalTimeRelative,
      selfTime,
      selfTimeRelative,
    };
  }

  getDisplayData(callNodeIndex: IndexIntoCallNodeTable): CallNodeDisplayData {
    let displayData = this._displayDataByIndex.get(callNodeIndex);
    if (displayData === undefined) {
      const {
        funcName,
        totalTime,
        totalTimeRelative,
        selfTime,
      } = this.getNodeData(callNodeIndex);
      const funcIndex = this._callNodeTable.func[callNodeIndex];
      const categoryIndex = this._callNodeTable.category[callNodeIndex];
      const subcategoryIndex = this._callNodeTable.subcategory[callNodeIndex];
      const resourceIndex = this._funcTable.resource[funcIndex];
      const resourceType = this._resourceTable.type[resourceIndex];
      const isFrameLabel = resourceIndex === -1;
      const libName = this._getOriginAnnotation(funcIndex);
      const weightType = this._weightType;

      let icon = null;
      if (resourceType === resourceTypes.webhost) {
        icon = extractFaviconFromLibname(libName);
      } else if (resourceType === resourceTypes.addon) {
        icon = ExtensionIcon;
      }

      const formattedTotalTime = formatCallNodeNumber(
        weightType,
        this._isHighPrecision,
        totalTime
      );
      const formattedSelfTime = formatCallNodeNumber(
        weightType,
        this._isHighPrecision,
        selfTime
      );
      const totalTimePercent = `${formatPercent(totalTimeRelative)}`;

      let ariaLabel;
      let totalTimeWithUnit;
      let selfTimeWithUnit;
      switch (weightType) {
        case 'tracing-ms': {
          totalTimeWithUnit = `${formattedTotalTime}ms`;
          selfTimeWithUnit = `${formattedSelfTime}ms`;
          ariaLabel = oneLine`
              ${funcName},
              running time is ${totalTimeWithUnit} (${totalTimePercent}),
              self time is ${selfTimeWithUnit}
            `;
          break;
        }
        case 'samples': {
          // TODO - L10N pluralization
          totalTimeWithUnit =
            totalTime === 1
              ? `${formattedTotalTime} sample`
              : `${formattedTotalTime} samples`;
          selfTimeWithUnit =
            selfTime === 1
              ? `${formattedSelfTime} sample`
              : `${formattedSelfTime} samples`;
          ariaLabel = oneLine`
            ${funcName},
            running count is ${totalTimeWithUnit} (${totalTimePercent}),
            self count is ${selfTimeWithUnit}
          `;
          break;
        }
        case 'bytes': {
          totalTimeWithUnit = `${formattedTotalTime} bytes`;
          selfTimeWithUnit = `${formattedSelfTime} bytes`;
          ariaLabel = oneLine`
            ${funcName},
            total size is ${totalTimeWithUnit} (${totalTimePercent}),
            self size is ${selfTimeWithUnit}
          `;
          break;
        }
        default:
          throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
      }

      displayData = {
        totalTime: totalTime === 0 ? '—' : formattedTotalTime,
        totalTimeWithUnit: totalTime === 0 ? '—' : totalTimeWithUnit,
        selfTime: selfTime === 0 ? '—' : formattedSelfTime,
        selfTimeWithUnit: selfTime === 0 ? '—' : selfTimeWithUnit,
        totalTimePercent,
        name: funcName,
        lib: libName.slice(0, 1000),
        // Dim platform pseudo-stacks.
        isFrameLabel,
        categoryName: getCategoryPairLabel(
          this._categories,
          categoryIndex,
          subcategoryIndex
        ),
        categoryColor: this._categories[categoryIndex].color,
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
}

function _getInvertedStackSelfTimes(
  // The samples could either be a SamplesTable, or a JsAllocationsTable.
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<IndexIntoCallNodeTable | null>
): {
  // In an inverted profile, all the self time is accounted to the root nodes.
  // So `callNodeSelfTime` will be 0 for all non-root nodes.
  callNodeSelfTime: Float32Array,
  // This property stores the time spent in the stacks' leaf nodes.
  // Later these values will make it possible to compute the running times for
  // all nodes by summing up the values up the tree.
  callNodeLeafTime: Float32Array,
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
  const callNodeSelfTime = new Float32Array(callNodeTable.length);
  const callNodeLeafTime = new Float32Array(callNodeTable.length);
  for (
    let sampleIndex = 0;
    sampleIndex < sampleIndexToCallNodeIndex.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const rootIndex = callNodeToRoot[callNodeIndex];
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelfTime[rootIndex] += weight;
      callNodeLeafTime[callNodeIndex] += weight;
    }
  }

  return { callNodeSelfTime, callNodeLeafTime };
}

/**
 * This is a helper function to get the stack timings for un-inverted call trees.
 */
function _getStackSelfTimes(
  samples: SamplesLikeTable,
  callNodeTable: CallNodeTable,
  sampleIndexToCallNodeIndex: Array<null | IndexIntoCallNodeTable>
): {
  callNodeSelfTime: Float32Array, // Milliseconds[]
  callNodeLeafTime: Float32Array, // Milliseconds[]
} {
  const callNodeSelfTime = new Float32Array(callNodeTable.length);

  for (
    let sampleIndex = 0;
    sampleIndex < sampleIndexToCallNodeIndex.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleIndexToCallNodeIndex[sampleIndex];
    if (callNodeIndex !== null) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      callNodeSelfTime[callNodeIndex] += weight;
    }
  }

  return { callNodeSelfTime, callNodeLeafTime: callNodeSelfTime };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 */
export function computeCallTreeCountsAndTimings(
  samples: SamplesLikeTable,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): CallTreeCountsAndTimings {
  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(
    samples.stack,
    stackIndexToCallNodeIndex
  );
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelfTime, callNodeLeafTime } = invertCallstack
    ? _getInvertedStackSelfTimes(
        samples,
        callNodeTable,
        sampleIndexToCallNodeIndex
      )
    : _getStackSelfTimes(samples, callNodeTable, sampleIndexToCallNodeIndex);

  // Compute the following variables:
  const callNodeTotalTime = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);
  let rootTotalTime = 0;
  let rootCount = 0;

  // We loop the call node table in reverse, so that we find the children
  // before their parents, and the total time is known at the time we reach a
  // node.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    callNodeTotalTime[callNodeIndex] += callNodeLeafTime[callNodeIndex];
    rootTotalTime += Math.abs(callNodeLeafTime[callNodeIndex]);
    const hasChildren = callNodeChildCount[callNodeIndex] !== 0;
    const hasTotalTime = callNodeTotalTime[callNodeIndex] !== 0;

    if (!hasChildren && !hasTotalTime) {
      continue;
    }

    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      rootCount++;
    } else {
      callNodeTotalTime[prefixCallNode] += callNodeTotalTime[callNodeIndex];
      callNodeChildCount[prefixCallNode]++;
    }
  }

  return {
    callNodeTimes: {
      selfTime: callNodeSelfTime,
      totalTime: callNodeTotalTime,
    },
    callNodeChildCount,
    rootTotalTime,
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
  callTreeCountsAndTimings: CallTreeCountsAndTimings,
  weightType: WeightType
): CallTree {
  return timeCode('getCallTree', () => {
    const {
      callNodeTimes,
      callNodeChildCount,
      rootTotalTime,
      rootCount,
    } = callTreeCountsAndTimings;

    const jsOnly = implementationFilter === 'js';
    // By default add a single decimal value, e.g 13.1, 0.3, 5234.4
    return new CallTree(
      thread,
      categories,
      callNodeInfo.callNodeTable,
      callNodeTimes,
      callNodeChildCount,
      rootTotalTime,
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
