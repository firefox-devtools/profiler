/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../utils/time-code';
import {
  getSampleCallNodes,
  resourceTypes,
  getOriginAnnotationForFunc,
} from './profile-data';
import { UniqueStringArray } from '../utils/unique-string-array';
import type {
  CategoryList,
  Thread,
  FuncTable,
  ResourceTable,
  IndexIntoFuncTable,
} from '../types/profile';
import type {
  CallNodeTable,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeData,
  CallNodeDisplayData,
} from '../types/profile-derived';
import type { Milliseconds } from '../types/units';
import ExtensionIcon from '../../res/img/svg/extension.svg';

type CallNodeChildren = IndexIntoCallNodeTable[];
type CallNodeTimes = {
  selfTime: Float32Array,
  totalTime: Float32Array,
};
type CallTreeCountsAndTimings = {
  callNodeChildCount: Uint32Array,
  callNodeTimes: CallNodeTimes,
  rootCount: number,
  rootTotalTime: number,
};

function extractFaviconFromLibname(libname: string): string | null {
  const url = new URL('/favicon.ico', libname);
  if (url.protocol === 'http:') {
    // Upgrade http requests.
    url.protocol = 'https:';
  }
  return url.href;
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
  _isChildrenCachePreloaded: boolean;
  _jsOnly: boolean;
  _isIntegerInterval: boolean;

  constructor(
    { funcTable, resourceTable, stringTable }: Thread,
    categories: CategoryList,
    callNodeTable: CallNodeTable,
    callNodeTimes: CallNodeTimes,
    callNodeChildCount: Uint32Array,
    rootTotalTime: number,
    rootCount: number,
    jsOnly: boolean,
    isIntegerInterval: boolean
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
    this._isChildrenCachePreloaded = false;
    this._jsOnly = jsOnly;
    this._isIntegerInterval = isIntegerInterval;
  }

  getRoots() {
    return this.getChildren(-1);
  }

  /**
   * Preload the internal cache of children so that subsequent calls
   * to getChildren() return in constant time.
   *
   * This is an essential optimization for the flame graph since it
   * needs to traverse all children of the call tree in one pass.
   */
  preloadChildrenCache() {
    if (!this._isChildrenCachePreloaded) {
      this._children = new Array(this._callNodeTable.length);
      // -1 is the parent of the roots. This one negative number will
      // be converted to a string and added as an extra property to
      // the array.
      this._children[-1] = [];

      for (
        let callNodeIndex = 0;
        callNodeIndex < this._callNodeTable.length;
        callNodeIndex++
      ) {
        // This loop assumes parents always come before their children
        // in the call node table. For every call node index, we set
        // its children to be an empty array. Then we always have an
        // array to append to when any call node acts as a parent
        // through the prefix.
        this._children[callNodeIndex] = [];

        if (this._callNodeTimes.totalTime[callNodeIndex] === 0) {
          continue;
        }

        const siblings = this._children[
          this._callNodeTable.prefix[callNodeIndex]
        ];
        if (siblings === undefined) {
          // We should definitely have created a children array for
          // the parent in an earlier iteration of this loop. Add this
          // condition to satisfy flow.
          throw new Error(
            "Failed to retrieve array of children. This shouldn't happen."
          );
        }
        siblings.push(callNodeIndex);
        siblings.sort(
          (a, b) =>
            this._callNodeTimes.totalTime[b] - this._callNodeTimes.totalTime[a]
        );
      }
      this._isChildrenCachePreloaded = true;
    }
  }

  getAllChildren() {
    /* The `children` array contains all children for all callnodes in
     * a large, flat array. Siblings are always next to each other in
     * contiguous slices. To find the children for a particular
     * callnode, we need to use the arrays `pointers` and `lengths` to
     * find out where a slice starts and how long it is,
     * respectively. */
    const children = new Uint32Array(this._callNodeTable.length);
    const pointers = new Uint32Array(this._callNodeTable.length);
    const lengths = new Uint32Array(this._callNodeTable.length);

    /* For performance reasons `children` is of type Uint32Array. This
     * means we cannot use values such as `undefined` or `null` to
     * indicate uninitialized values, as we build up the array. But
     * since `this._callNodeTable` is ordered is such a way that a
     * given callnode index always comes _after_ its parent callnode
     * index, we know that callnode index zero never can be a
     * child. It is always a root. (Not counting the special -1 root,
     * but we don't need it here). Hence, we are free to use the value
     * 0 in the children array to mark elements as not initialized,
     * since 0 is never a valid child. Since the default values of
     * Uint32Array is 0, we conveniently get an array where all its
     * values are uninitialized from start. */

    for (
      let callNodeIndex = 0, ptr = 0;
      callNodeIndex < this._callNodeTable.length;
      callNodeIndex++
    ) {
      pointers[callNodeIndex] = ptr;

      const length = this._callNodeChildCount[callNodeIndex];
      lengths[callNodeIndex] = length;
      /* Now that we know how many children the current callnode has,
       * we can prepare the pointer for the next callnode. */
      ptr += length;

      if (this._callNodeTimes.totalTime[callNodeIndex] === 0) {
        continue;
      }

      const parent = this._callNodeTable.prefix[callNodeIndex];
      if (parent === -1) {
        /* This means the current callnode is a root. It will not go
         * into the array. */
        continue;
      }

      /* From the parent, we can now know the slice allotted for all
       * its children. */
      const start = pointers[parent];
      const end = pointers[parent] + lengths[parent] - 1;

      /* Find the place in `children` where this callnode should be
       * inserted, swapping elements in the array as we go
       * along. Continue as long as this callnode's function name is
       * lexically smaller than the function names of the callnodes
       * already placed in the array. This ensures that all slices
       * have children in ascending order. Any callnode indices equal
       * to 0 means that they are uninitialized, so just breeze
       * through them. When we stop, when have found the right
       * position to insert our callnode.
       *
       * This effectively is an insertion sort, which is O(n^2), but
       * since n is typically small (the number of children of a given
       * call node), it should be just fine.
       */
      const funcName = this._stringTable.getString(
        this._funcTable.name[this._callNodeTable.func[callNodeIndex]]
      );

      let i = start;
      while (
        i < end &&
        (children[i + 1] === 0 ||
          funcName <
            this._stringTable.getString(
              this._funcTable.name[this._callNodeTable.func[children[i + 1]]]
            ))
      ) {
        children[i] = children[i + 1];
        i++;
      }
      children[i] = callNodeIndex;
    }
    return [children, pointers, lengths];
  }

  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children[callNodeIndex];
    if (children === undefined) {
      if (this._isChildrenCachePreloaded) {
        console.error(
          `Children for callNodeIndex ${callNodeIndex} not found in cache despite having a preloaded cache.`
        );
      }
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
        if (
          this._callNodeTable.prefix[childCallNodeIndex] === callNodeIndex &&
          this._callNodeTimes.totalTime[childCallNodeIndex] !== 0
        ) {
          children.push(childCallNodeIndex);
        }
      }
      children.sort(
        (a, b) =>
          this._callNodeTimes.totalTime[b] - this._callNodeTimes.totalTime[a]
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
      const resourceIndex = this._funcTable.resource[funcIndex];
      const resourceType = this._resourceTable.type[resourceIndex];
      const isJS = this._funcTable.isJS[funcIndex];
      const libName = this._getOriginAnnotation(funcIndex);
      const precision = this._isIntegerInterval ? 0 : 1;

      let icon = null;
      if (resourceType === resourceTypes.webhost) {
        icon = extractFaviconFromLibname(libName);
      } else if (resourceType === resourceTypes.addon) {
        icon = ExtensionIcon;
      }

      const formatNumber = this._isIntegerInterval
        ? _formatIntegerNumber
        : _formatDecimalNumber;

      displayData = {
        totalTime: formatNumber(totalTime),
        selfTime: selfTime === 0 ? '—' : formatNumber(selfTime),
        totalTimePercent: `${(100 * totalTimeRelative).toFixed(precision)}%`,
        name: funcName,
        lib: libName,
        // Dim platform pseudo-stacks.
        dim: !isJS && this._jsOnly,
        categoryName: this._categories[categoryIndex].name,
        categoryColor: this._categories[categoryIndex].color,
        icon,
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
  thread: Thread,
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  interval: Milliseconds
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
    sampleIndex < sampleCallNodes.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleCallNodes[sampleIndex];
    if (callNodeIndex !== null) {
      const rootIndex = callNodeToRoot[callNodeIndex];
      callNodeSelfTime[rootIndex] += interval;
      callNodeLeafTime[callNodeIndex] += interval;
    }
  }

  return { callNodeSelfTime, callNodeLeafTime };
}

/**
 * This is a helper function to get the stack timings for un-inverted call trees.
 */
function _getStackSelfTimes(
  thread: Thread,
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<null | IndexIntoCallNodeTable>,
  interval: Milliseconds
): {
  callNodeSelfTime: Float32Array, // Milliseconds[]
  callNodeLeafTime: Float32Array, // Milliseconds[]
} {
  const callNodeSelfTime = new Float32Array(callNodeTable.length);

  for (
    let sampleIndex = 0;
    sampleIndex < sampleCallNodes.length;
    sampleIndex++
  ) {
    const callNodeIndex = sampleCallNodes[sampleIndex];
    if (callNodeIndex !== null) {
      callNodeSelfTime[callNodeIndex] += interval;
    }
  }

  return { callNodeSelfTime, callNodeLeafTime: callNodeSelfTime };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 */
export function computeCallTreeCountsAndTimings(
  thread: Thread,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: Milliseconds,
  invertCallstack: boolean
): CallTreeCountsAndTimings {
  const sampleCallNodes = getSampleCallNodes(
    thread.samples,
    stackIndexToCallNodeIndex
  );
  // Inverted trees need a different method for computing the timing.
  const { callNodeSelfTime, callNodeLeafTime } = invertCallstack
    ? _getInvertedStackSelfTimes(
        thread,
        callNodeTable,
        sampleCallNodes,
        interval
      )
    : _getStackSelfTimes(thread, callNodeTable, sampleCallNodes, interval);

  // Compute the following variables:
  const callNodeTotalTime = new Float32Array(callNodeTable.length);
  const callNodeChildCount = new Uint32Array(callNodeTable.length);
  let rootTotalTime = 0;
  let rootCount = 0;

  // We loop the call node table in reverse, so that we find the children
  // before their parents.
  for (
    let callNodeIndex = callNodeTable.length - 1;
    callNodeIndex >= 0;
    callNodeIndex--
  ) {
    callNodeTotalTime[callNodeIndex] += callNodeLeafTime[callNodeIndex];
    if (callNodeTotalTime[callNodeIndex] === 0) {
      continue;
    }
    const prefixCallNode = callNodeTable.prefix[callNodeIndex];
    if (prefixCallNode === -1) {
      rootTotalTime += callNodeTotalTime[callNodeIndex];
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
  invertCallstack: boolean
): CallTree {
  return timeCode('getCallTree', () => {
    const {
      callNodeTimes,
      callNodeChildCount,
      rootTotalTime,
      rootCount,
    } = computeCallTreeCountsAndTimings(
      thread,
      callNodeInfo,
      interval,
      invertCallstack
    );

    const jsOnly = implementationFilter === 'js';
    const isIntegerInterval = Math.floor(interval) === interval;

    return new CallTree(
      thread,
      categories,
      callNodeInfo.callNodeTable,
      callNodeTimes,
      callNodeChildCount,
      rootTotalTime,
      rootCount,
      jsOnly,
      isIntegerInterval
    );
  });
}

const LOCALE_WITH_DECIMAL_POINT = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};
function _formatDecimalNumber(number: number): string {
  return number.toLocaleString(undefined, LOCALE_WITH_DECIMAL_POINT);
}

function _formatIntegerNumber(number: number): string {
  return number.toLocaleString();
}
