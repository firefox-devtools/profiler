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
  selfTime: Float32Array,
  totalTime: Float32Array,
};

function extractFaviconFromLibname(libname: string): string | null {
  const url = new URL('/favicon.ico', libname);
  return url.href;
}

class ProfileTree {
  thread: Thread;
  _stackTimes: StackTimes;
  _stackChildCount: Uint32Array; // A table column matching the stackTable
  _rootTotalTime: number;
  _rootCount: number;
  _nodes: Map<IndexIntoStackTable, Node>;
  _children: Map<IndexIntoStackTable, StackChildren>;
  _jsOnly: boolean;

  constructor(
    thread: Thread,
    stackTimes: StackTimes,
    stackChildCount: Uint32Array,
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
    return this.getChildren(-1);
  }

  /**
   * Return an array of stackIndex for the children of the node with index stackIndex.
   */
  getChildren(stackIndex: IndexIntoStackTable): StackChildren {
    let children = this._children.get(stackIndex);
    if (children === undefined) {
      const { stackTable } = this.thread;
      const childCount =
        stackIndex === -1 ? this._rootCount : this._stackChildCount[stackIndex];
      children = [];
      for (
        let childStackIndex = stackIndex + 1;
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

function _getInvertedStackTimes(thread: Thread, interval: Milliseconds) {
  const { stackTable, samples } = thread;
  const stackSelfTime = new Float32Array(stackTable.length);
  const stackTotalTime = new Float32Array(stackTable.length);
  const stackToRoot = new Int32Array(stackTable.length);
  const stackLeafTime = new Float32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackToRoot.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    if (prefixStack !== null) {
      stackToRoot[stackIndex] = stackToRoot[prefixStack];
    } else {
      stackToRoot[stackIndex] = stackIndex;
    }
  }

  for (let sampleIndex = 0; sampleIndex < samples.stack.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex !== null) {
      const rootIndex = stackToRoot[stackIndex];
      stackSelfTime[rootIndex] += interval;
      stackLeafTime[stackIndex] += interval;
    }
  }

  return { stackSelfTime, stackTotalTime, stackLeafTime };
}

function _getStackTimes(thread: Thread, interval: Milliseconds) {
  const { stackTable, samples } = thread;
  const stackSelfTime = new Float32Array(stackTable.length);
  const stackTotalTime = new Float32Array(stackTable.length);
  const stackLeafTime = new Float32Array(stackTable.length);

  for (let sampleIndex = 0; sampleIndex < samples.stack.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex !== null) {
      stackSelfTime[stackIndex] += interval;
    }
  }

  return { stackSelfTime, stackTotalTime, stackLeafTime };
}

export function getCallTree(
  thread: Thread,
  interval: Milliseconds,
  implementationFilter: string,
  invertCallstack: boolean
): ProfileTree {
  return timeCode('getCallTree', () => {
    const { stackTable } = thread;

    const { stackSelfTime, stackTotalTime, stackLeafTime } = invertCallstack
      ? _getInvertedStackTimes(thread, interval)
      : _getStackTimes(thread, interval);

    const stackChildCount = new Uint32Array(stackTable.length);
    let rootTotalTime = 0;
    let routCount = 0;
    for (
      let stackIndex = stackTable.length - 1;
      stackIndex >= 0;
      stackIndex--
    ) {
      stackTotalTime[stackIndex] += stackLeafTime[stackIndex];
      if (stackTotalTime[stackIndex] === 0) {
        continue;
      }
      const prefixStack = stackTable.prefix[stackIndex];
      if (prefixStack === null) {
        rootTotalTime += stackTotalTime[stackIndex];
        routCount++;
      } else {
        stackTotalTime[prefixStack] += stackTotalTime[stackIndex];
        stackChildCount[prefixStack]++;
      }
    }

    const stackTimes = {
      selfTime: stackSelfTime,
      totalTime: stackTotalTime,
    };

    const jsOnly = implementationFilter === 'js';

    return new ProfileTree(
      thread,
      stackTimes,
      stackChildCount,
      rootTotalTime,
      routCount,
      jsOnly
    );
  });
}
