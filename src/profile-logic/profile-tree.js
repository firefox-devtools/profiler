/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../utils/time-code';
import { getSampleFuncStacks, resourceTypes } from './profile-data';
import { UniqueStringArray } from '../utils/unique-string-array';
import type {
  Thread,
  FuncTable,
  ResourceTable,
  IndexIntoFuncTable,
} from '../types/profile';
import type {
  FuncStackTable,
  IndexIntoFuncStackTable,
  FuncStackInfo,
  Node,
} from '../types/profile-derived';
import type { Milliseconds } from '../types/units';

type FuncStackChildren = IndexIntoFuncStackTable[];
type FuncStackTimes = {
  selfTime: Float32Array,
  totalTime: Float32Array,
};

function extractFaviconFromLibname(libname: string): string | null {
  const url = new URL('/favicon.ico', libname);
  return url.href;
}

class ProfileTree {
  _funcStackTable: FuncStackTable;
  _funcStackTimes: FuncStackTimes;
  _funcStackChildCount: Uint32Array; // A table column matching the funcStackTable
  _funcTable: FuncTable;
  _resourceTable: ResourceTable;
  _stringTable: UniqueStringArray;
  _rootTotalTime: number;
  _rootCount: number;
  _nodes: Map<IndexIntoFuncStackTable, Node>;
  _children: Map<IndexIntoFuncStackTable, FuncStackChildren>;
  _jsOnly: boolean;

  constructor(
    funcStackTable: FuncStackTable,
    funcStackTimes: FuncStackTimes,
    funcStackChildCount: Uint32Array,
    funcTable: FuncTable,
    resourceTable: ResourceTable,
    stringTable: UniqueStringArray,
    rootTotalTime: number,
    rootCount: number,
    jsOnly: boolean
  ) {
    this._funcStackTable = funcStackTable;
    this._funcStackTimes = funcStackTimes;
    this._funcStackChildCount = funcStackChildCount;
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
   * Return an array of funcStackIndex for the children of the node with index funcStackIndex.
   * @param  {[type]} funcStackIndex [description]
   * @return {[type]}                [description]
   */
  getChildren(funcStackIndex: IndexIntoFuncStackTable): FuncStackChildren {
    let children = this._children.get(funcStackIndex);
    if (children === undefined) {
      const childCount =
        funcStackIndex === -1
          ? this._rootCount
          : this._funcStackChildCount[funcStackIndex];
      children = [];
      for (
        let childFuncStackIndex = funcStackIndex + 1;
        childFuncStackIndex < this._funcStackTable.length &&
        children.length < childCount;
        childFuncStackIndex++
      ) {
        if (
          this._funcStackTable.prefix[childFuncStackIndex] === funcStackIndex &&
          this._funcStackTimes.totalTime[childFuncStackIndex] !== 0
        ) {
          children.push(childFuncStackIndex);
        }
      }
      children.sort(
        (a, b) =>
          this._funcStackTimes.totalTime[b] - this._funcStackTimes.totalTime[a]
      );
      this._children.set(funcStackIndex, children);
    }
    return children;
  }

  hasChildren(funcStackIndex: IndexIntoFuncStackTable): boolean {
    return this.getChildren(funcStackIndex).length !== 0;
  }

  getParent(funcStackIndex: IndexIntoFuncStackTable): IndexIntoFuncStackTable {
    return this._funcStackTable.prefix[funcStackIndex];
  }

  getDepth(funcStackIndex: IndexIntoFuncStackTable): number {
    return this._funcStackTable.depth[funcStackIndex];
  }

  hasSameNodeIds(tree: ProfileTree): boolean {
    return this._funcStackTable === tree._funcStackTable;
  }

  /**
   * Return an object with information about the node with index funcStackIndex.
   * @param  {[type]} funcStackIndex [description]
   * @return {[type]}                [description]
   */
  getNode(funcStackIndex: IndexIntoFuncStackTable): Node {
    let node = this._nodes.get(funcStackIndex);
    if (node === undefined) {
      const funcIndex = this._funcStackTable.func[funcStackIndex];
      const funcName = this._stringTable.getString(
        this._funcTable.name[funcIndex]
      );
      const resourceIndex = this._funcTable.resource[funcIndex];
      const resourceType = this._resourceTable.type[resourceIndex];
      const isJS = this._funcTable.isJS[funcIndex];
      const libName = this._getOriginAnnotation(funcIndex);

      node = {
        totalTime: `${this._funcStackTimes.totalTime[funcStackIndex].toFixed(
          1
        )}ms`,
        totalTimePercent: `${(100 *
          this._funcStackTimes.totalTime[funcStackIndex] /
          this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._funcStackTimes.selfTime[funcStackIndex].toFixed(
          1
        )}ms`,
        name: funcName,
        lib: libName,
        // Dim platform pseudo-stacks.
        dim: !isJS && this._jsOnly,
        icon:
          resourceType === resourceTypes.webhost
            ? extractFaviconFromLibname(libName)
            : null,
      };
      this._nodes.set(funcStackIndex, node);
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

export function getCallTree(
  thread: Thread,
  interval: Milliseconds,
  funcStackInfo: FuncStackInfo,
  implementationFilter: string,
  invertCallstack: boolean
): ProfileTree {
  return timeCode('getCallTree', () => {
    const { funcStackTable, stackIndexToFuncStackIndex } = funcStackInfo;
    const sampleFuncStacks = getSampleFuncStacks(
      thread.samples,
      stackIndexToFuncStackIndex
    );

    const funcStackSelfTime = new Float32Array(funcStackTable.length);
    const funcStackTotalTime = new Float32Array(funcStackTable.length);
    let funcStackToRoot;
    let funcStackLeafTime;
    const numChildren = new Uint32Array(funcStackTable.length);
    if (invertCallstack) {
      funcStackToRoot = new Int32Array(funcStackTable.length);
      funcStackLeafTime = new Float32Array(funcStackTable.length);
      for (
        let funcStackIndex = 0;
        funcStackIndex < funcStackToRoot.length;
        funcStackIndex++
      ) {
        const prefixFuncStack = funcStackTable.prefix[funcStackIndex];
        if (prefixFuncStack !== -1) {
          funcStackToRoot[funcStackIndex] = funcStackToRoot[prefixFuncStack];
        } else {
          funcStackToRoot[funcStackIndex] = funcStackIndex;
        }
      }

      for (
        let sampleIndex = 0;
        sampleIndex < sampleFuncStacks.length;
        sampleIndex++
      ) {
        const funcStackIndex = sampleFuncStacks[sampleIndex];
        if (funcStackIndex !== null) {
          const rootIndex = funcStackToRoot[funcStackIndex];
          funcStackSelfTime[rootIndex] += interval;
          funcStackLeafTime[funcStackIndex] += interval;
        }
      }
    } else {
      funcStackLeafTime = funcStackSelfTime;
      for (
        let sampleIndex = 0;
        sampleIndex < sampleFuncStacks.length;
        sampleIndex++
      ) {
        const funcStackIndex = sampleFuncStacks[sampleIndex];
        if (funcStackIndex !== null) {
          funcStackSelfTime[funcStackIndex] += interval;
        }
      }
    }
    let rootTotalTime = 0;
    let numRoots = 0;
    for (
      let funcStackIndex = funcStackTotalTime.length - 1;
      funcStackIndex >= 0;
      funcStackIndex--
    ) {
      funcStackTotalTime[funcStackIndex] += funcStackLeafTime[funcStackIndex];
      if (funcStackTotalTime[funcStackIndex] === 0) {
        continue;
      }
      const prefixFuncStack = funcStackTable.prefix[funcStackIndex];
      if (prefixFuncStack === -1) {
        rootTotalTime += funcStackTotalTime[funcStackIndex];
        numRoots++;
      } else {
        funcStackTotalTime[prefixFuncStack] +=
          funcStackTotalTime[funcStackIndex];
        numChildren[prefixFuncStack]++;
      }
    }
    const funcStackTimes = {
      selfTime: funcStackSelfTime,
      totalTime: funcStackTotalTime,
    };
    const jsOnly = implementationFilter === 'js';
    return new ProfileTree(
      funcStackTable,
      funcStackTimes,
      numChildren,
      thread.funcTable,
      thread.resourceTable,
      thread.stringTable,
      rootTotalTime,
      numRoots,
      jsOnly
    );
  });
}
