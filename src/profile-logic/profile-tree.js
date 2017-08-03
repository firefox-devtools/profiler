/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../utils/time-code';
import { getSampleCallNodes, resourceTypes } from './profile-data';
import { UniqueStringArray } from '../utils/unique-string-array';
import type {
  Thread,
  FuncTable,
  ResourceTable,
  IndexIntoFuncTable,
} from '../types/profile';
import type {
  CallNodeTable,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  Node,
} from '../types/profile-derived';
import type { Milliseconds } from '../types/units';

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
  return url.href;
}

class ProfileTree {
  _callNodeTable: CallNodeTable;
  _callNodeTimes: CallNodeTimes;
  _callNodeChildCount: Uint32Array; // A table column matching the callNodeTable
  _funcTable: FuncTable;
  _resourceTable: ResourceTable;
  _stringTable: UniqueStringArray;
  _rootTotalTime: number;
  _rootCount: number;
  _nodes: Map<IndexIntoCallNodeTable, Node>;
  _children: Map<IndexIntoCallNodeTable, CallNodeChildren>;
  _jsOnly: boolean;

  constructor(
    { funcTable, resourceTable, stringTable }: Thread,
    callNodeTable: CallNodeTable,
    callNodeTimes: CallNodeTimes,
    callNodeChildCount: Uint32Array,
    rootTotalTime: number,
    rootCount: number,
    jsOnly: boolean
  ) {
    this._callNodeTable = callNodeTable;
    this._callNodeTimes = callNodeTimes;
    this._callNodeChildCount = callNodeChildCount;
    this._funcTable = funcTable;
    this._resourceTable = resourceTable;
    this._stringTable = stringTable;
    this._rootTotalTime = rootTotalTime;
    this._rootCount = rootCount;
    this._nodes = new Map();
    this._children = new Map();
    this._jsOnly = jsOnly;
  }

  getRoots() {
    return this.getChildren(-1);
  }

  /**
   * Return an array of callNodeIndex for the children of the node with index callNodeIndex.
   * @param  {[type]} callNodeIndex [description]
   * @return {[type]}                [description]
   */
  getChildren(callNodeIndex: IndexIntoCallNodeTable): CallNodeChildren {
    let children = this._children.get(callNodeIndex);
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
      this._children.set(callNodeIndex, children);
    }
    return children;
  }

  hasChildren(callNodeIndex: IndexIntoCallNodeTable): boolean {
    return this.getChildren(callNodeIndex).length !== 0;
  }

  getParent(callNodeIndex: IndexIntoCallNodeTable): IndexIntoCallNodeTable {
    return this._callNodeTable.prefix[callNodeIndex];
  }

  getDepth(callNodeIndex: IndexIntoCallNodeTable): number {
    return this._callNodeTable.depth[callNodeIndex];
  }

  hasSameNodeIds(tree: ProfileTree): boolean {
    return this._callNodeTable === tree._callNodeTable;
  }

  /**
   * Return an object with information about the node with index callNodeIndex.
   * @param  {[type]} callNodeIndex [description]
   * @return {[type]}                [description]
   */
  getNode(callNodeIndex: IndexIntoCallNodeTable): Node {
    let node = this._nodes.get(callNodeIndex);
    if (node === undefined) {
      const funcIndex = this._callNodeTable.func[callNodeIndex];
      const funcName = this._stringTable.getString(
        this._funcTable.name[funcIndex]
      );
      const resourceIndex = this._funcTable.resource[funcIndex];
      const resourceType = this._resourceTable.type[resourceIndex];
      const isJS = this._funcTable.isJS[funcIndex];
      const libName = this._getOriginAnnotation(funcIndex);

      node = {
        totalTime: `${this._callNodeTimes.totalTime[callNodeIndex].toFixed(
          1
        )}ms`,
        totalTimePercent: `${(100 *
          this._callNodeTimes.totalTime[callNodeIndex] /
          this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._callNodeTimes.selfTime[callNodeIndex].toFixed(1)}ms`,
        name: funcName,
        lib: libName,
        // Dim platform pseudo-stacks.
        dim: !isJS && this._jsOnly,
        icon:
          resourceType === resourceTypes.webhost
            ? extractFaviconFromLibname(libName)
            : null,
      };
      this._nodes.set(callNodeIndex, node);
    }
    return node;
  }

  _getOriginAnnotation(funcIndex: IndexIntoFuncTable): string {
    const fileNameIndex = this._funcTable.fileName[funcIndex];
    if (fileNameIndex !== null) {
      const fileName = this._stringTable.getString(fileNameIndex);
      const lineNumber = this._funcTable.lineNumber[funcIndex];
      if (lineNumber !== null) {
        return fileName + ':' + lineNumber;
      }
      return fileName;
    }

    const resourceIndex = this._funcTable.resource[funcIndex];
    const resourceNameIndex = this._resourceTable.name[resourceIndex];
    if (resourceNameIndex !== undefined) {
      return this._stringTable.getString(resourceNameIndex);
    }

    return '';
  }
}

export type ProfileTreeClass = ProfileTree;

function _getInvertedStackSelfTimes(
  thread: Thread,
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  interval: Milliseconds
): {
  callNodeSelfTime: Float32Array,
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
    if (prefixCallNode !== -1) {
      callNodeToRoot[callNodeIndex] = callNodeToRoot[prefixCallNode];
    } else {
      callNodeToRoot[callNodeIndex] = callNodeIndex;
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
 * An exported interface to get an instance of the ProfileTree class.
 * This handles computing timing information, and passing it all into
 * the ProfileTree constructor.
 */
export function getCallTree(
  thread: Thread,
  interval: Milliseconds,
  callNodeInfo: CallNodeInfo,
  implementationFilter: string,
  invertCallstack: boolean
): ProfileTree {
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

    return new ProfileTree(
      thread,
      callNodeInfo.callNodeTable,
      callNodeTimes,
      callNodeChildCount,
      rootTotalTime,
      rootCount,
      jsOnly
    );
  });
}
