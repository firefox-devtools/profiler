/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../utils/time-code';
import { resourceTypes } from './profile-data';
import type {
  Thread,
  IndexIntoFuncTable,
  IndexIntoStackTable,
} from '../types/profile';
import type { Node } from '../types/profile-derived';
import type { Milliseconds } from '../types/units';

type StackChildren = IndexIntoStackTable[];
type StackTimes = {
  selfTime: Milliseconds[],
  totalTime: Milliseconds[],
};

function extractFaviconFromLibname(libname: string): string | null {
  const url = new URL('/favicon.ico', libname);
  return url.href;
}

class ProfileTree {
  thread: Thread;
  _stackTimes: StackTimes;
  _stackChildCount: number[]; // A table column matching the stackTable
  _rootTotalTime: number;
  _rootCount: number;
  _nodes: Map<IndexIntoStackTable, Node>;
  _children: Map<IndexIntoStackTable | null, StackChildren>;
  _jsOnly: boolean;

  constructor(
    thread: Thread,
    stackTimes: StackTimes,
    stackChildCount: number[],
    rootTotalTime: number,
    rootCount: number,
    jsOnly: boolean
  ) {
    this.thread = thread;
    this._stackTimes = stackTimes;
    this._stackChildCount = stackChildCount;
    this._rootTotalTime = rootTotalTime;
    this._rootCount = rootCount;
    this._nodes = new Map();
    this._children = new Map();
    this._jsOnly = jsOnly;
  }

  getRoots(): StackChildren {
    return this.getChildren(null);
  }

  /**
   * Return an array of stackIndex for the children of the node with index stackIndex.
   */
  getChildren(stackIndex: IndexIntoStackTable | null): StackChildren {
    let children = this._children.get(stackIndex);
    if (children === undefined) {
      const { stackTable } = this.thread;
      const childCount =
        stackIndex === null
          ? this._rootCount
          : this._stackChildCount[stackIndex];
      children = [];
      for (
        let childStackIndex = stackIndex === null ? -1 : stackIndex + 1;
        childStackIndex < stackTable.length && children.length < childCount;
        childStackIndex++
      ) {
        if (
          stackTable.prefix[childStackIndex] === stackIndex &&
          this._stackTimes.totalTime[childStackIndex] !== 0
        ) {
          children.push(childStackIndex);
        }
      }
      children.sort(
        (a, b) => this._stackTimes.totalTime[b] - this._stackTimes.totalTime[a]
      );
      this._children.set(stackIndex, children);
    }
    return children;
  }

  hasChildren(stackIndex: IndexIntoStackTable): boolean {
    return this.getChildren(stackIndex).length !== 0;
  }

  getParent(stackIndex: IndexIntoStackTable): IndexIntoStackTable | null {
    return this.thread.stackTable.prefix[stackIndex];
  }

  getDepth(stackIndex: IndexIntoStackTable): number {
    return this.thread.stackTable.depth[stackIndex];
  }

  hasSameNodeIds(tree: ProfileTree): boolean {
    return this.thread.stackTable === tree.thread.stackTable;
  }

  /**
   * Return an object with information about the node with index stackIndex.
   */
  getNode(stackIndex: IndexIntoStackTable): Node {
    let node = this._nodes.get(stackIndex);
    if (node === undefined) {
      const {
        stackTable,
        frameTable,
        stringTable,
        funcTable,
        resourceTable,
      } = this.thread;
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      const funcName = stringTable.getString(funcTable.name[funcIndex]);
      const resourceIndex = funcTable.resource[funcIndex];
      const resourceType = resourceTable.type[resourceIndex];
      const isJS = funcTable.isJS[funcIndex];
      const libName = this._getOriginAnnotation(funcIndex);

      node = {
        totalTime: `${this._stackTimes.totalTime[stackIndex].toFixed(1)}ms`,
        totalTimePercent: `${(100 *
          this._stackTimes.totalTime[stackIndex] /
          this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._stackTimes.selfTime[stackIndex].toFixed(1)}ms`,
        name: funcName,
        lib: libName,
        // Dim platform pseudo-stacks.
        dim: !isJS && this._jsOnly,
        icon:
          resourceType === resourceTypes.webhost
            ? extractFaviconFromLibname(libName)
            : null,
      };
      this._nodes.set(stackIndex, node);
    }
    return node;
  }

  _getOriginAnnotation(funcIndex: IndexIntoFuncTable): string {
    const { funcTable, stringTable, resourceTable } = this.thread;
    const fileNameIndex = funcTable.fileName[funcIndex];
    if (fileNameIndex !== null) {
      const fileName = stringTable.getString(fileNameIndex);
      const lineNumber = funcTable.lineNumber[funcIndex];
      if (lineNumber !== null) {
        return fileName + ':' + lineNumber;
      }
      return fileName;
    }

    const resourceIndex = funcTable.resource[funcIndex];
    const resourceNameIndex = resourceTable.name[resourceIndex];
    if (resourceNameIndex !== undefined) {
      return stringTable.getString(resourceNameIndex);
    }

    return '';
  }
}

export type ProfileTreeClass = ProfileTree;

function _getInvertedStackSelfTimes(
  thread: Thread,
  interval: Milliseconds
): {
  stackSelfTime: Milliseconds[],
  stackLeafTime: Milliseconds[],
} {
  const { stackTable, samples } = thread;

  // Compute an array that maps the stackIndex to its root.
  const stackToRoot = [];
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    if (prefixStack !== null) {
      stackToRoot[stackIndex] = stackToRoot[prefixStack];
    } else {
      stackToRoot[stackIndex] = stackIndex;
    }
  }

  // Calculate the timing information by going through each sample.
  const stackSelfTime = Array(stackTable.length).fill(0);
  const stackLeafTime = Array(stackTable.length).fill(0);
  for (let sampleIndex = 0; sampleIndex < samples.stack.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex !== null) {
      const rootIndex = stackToRoot[stackIndex];
      stackSelfTime[rootIndex] += interval;
      stackLeafTime[stackIndex] += interval;
    }
  }

  return { stackSelfTime, stackLeafTime };
}

/**
 * This is a helper function to get the stack timings for un-inverted call trees.
 */
function _getStackSelfTimes(
  thread: Thread,
  interval: Milliseconds
): {
  stackSelfTime: Milliseconds[],
  stackLeafTime: Milliseconds[],
} {
  const { stackTable, samples } = thread;
  const stackSelfTime = Array(stackTable.length).fill(0);

  for (let sampleIndex = 0; sampleIndex < samples.stack.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex !== null) {
      stackSelfTime[stackIndex] += interval;
    }
  }

  return { stackSelfTime, stackLeafTime: stackSelfTime };
}

/**
 * This computes all of the count and timing information displayed in the calltree.
 * It takes into account both the normal tree, and the inverted tree.
 */
export function computeCallTreeCountsAndTimings(
  thread: Thread,
  interval: Milliseconds,
  invertCallstack: boolean
) {
  // Inverted trees need a different method for computing the timing.
  const { stackSelfTime, stackLeafTime } = invertCallstack
    ? _getInvertedStackSelfTimes(thread, interval)
    : _getStackSelfTimes(thread, interval);

  // Compute the following variables:
  const stackTotalTime = Array(thread.stackTable.length).fill(0);
  const stackChildCount = Array(thread.stackTable.length).fill(0);
  let rootTotalTime = 0;
  let rootCount = 0;

  for (
    let stackIndex = thread.stackTable.length - 1;
    stackIndex >= 0;
    stackIndex--
  ) {
    stackTotalTime[stackIndex] += stackLeafTime[stackIndex];
    if (stackTotalTime[stackIndex] === 0) {
      continue;
    }
    const prefixStack = thread.stackTable.prefix[stackIndex];
    if (prefixStack === null) {
      rootTotalTime += stackTotalTime[stackIndex];
      rootCount++;
    } else {
      stackTotalTime[prefixStack] += stackTotalTime[stackIndex];
      stackChildCount[prefixStack]++;
    }
  }

  return {
    stackTimes: {
      selfTime: stackSelfTime,
      totalTime: stackTotalTime,
    },
    stackChildCount,
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
  implementationFilter: string,
  invertCallstack: boolean
): ProfileTree {
  return timeCode('getCallTree', () => {
    const {
      stackTimes,
      stackChildCount,
      rootTotalTime,
      rootCount,
    } = computeCallTreeCountsAndTimings(thread, interval, invertCallstack);

    const jsOnly = implementationFilter === 'js';

    return new ProfileTree(
      thread,
      stackTimes,
      stackChildCount,
      rootTotalTime,
      rootCount,
      jsOnly
    );
  });
}
