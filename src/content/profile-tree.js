// @flow
import { timeCode } from '../common/time-code';
import { getSampleFuncStacks } from './profile-data';
import type { Thread, FuncTable, ResourceTable, StringTable } from '../common/types/profile';
import type { FuncStackTable, IndexIntoFuncStackTable, FuncStackInfo } from '../common/types/profile-derived';
import type { Milliseconds } from '../common/types/units';

type Node = {
  totalTime: string,
  totalTimePercent: string,
  selfTime: string,
  name: string,
  lib: string,
  dim: boolean,
};

type FuncStackChildren = IndexIntoFuncStackTable[];
type FuncStackTimes = { selfTime: Milliseconds, totalTime: Milliseconds };

class ProfileTree {

  _funcStackTable: FuncStackTable;
  _funcStackTimes: FuncStackTimes;
  _funcStackChildCount: Uint32Array; // A table column matching the funcStackTable
  _funcTable: FuncTable;
  _resourceTable: ResourceTable;
  _stringTable: StringTable;
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
    stringTable: StringTable,
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
      const childCount = funcStackIndex === -1 ? this._rootCount : this._funcStackChildCount[funcStackIndex];
      children = [];
      for (let childFuncStackIndex = funcStackIndex + 1;
           childFuncStackIndex < this._funcStackTable.length && children.length < childCount;
           childFuncStackIndex++) {
        if (this._funcStackTable.prefix[childFuncStackIndex] === funcStackIndex &&
            this._funcStackTimes.totalTime[childFuncStackIndex] !== 0) {
          children.push(childFuncStackIndex);
        }
      }
      children.sort((a, b) => this._funcStackTimes.totalTime[b] - this._funcStackTimes.totalTime[a]);
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
      const funcName = this._stringTable.getString(this._funcTable.name[funcIndex]);
      const libNameIndex = this._resourceTable.name[this._funcTable.resource[funcIndex]];
      const libName = libNameIndex !== undefined ? this._stringTable.getString(libNameIndex) : '';
      const isJS = this._funcTable.isJS[funcIndex];
      node = {
        totalTime: `${this._funcStackTimes.totalTime[funcStackIndex].toFixed(1)}ms`,
        totalTimePercent: `${(100 * this._funcStackTimes.totalTime[funcStackIndex] / this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._funcStackTimes.selfTime[funcStackIndex].toFixed(1)}ms`,
        name: funcName,
        lib: libName,
        // Dim platform pseudo-stacks.
        dim: !isJS && this._jsOnly,
      };
      this._nodes.set(funcStackIndex, node);
    }
    return node;
  }
}

export type ProfileTreeClass = ProfileTree;

export function getCallTree(
  thread: Thread, interval: Milliseconds, funcStackInfo: FuncStackInfo, jsOnly: boolean
): ProfileTree {
  return timeCode('getCallTree', () => {
    const { funcStackTable, stackIndexToFuncStackIndex } = funcStackInfo;
    const sampleFuncStacks = getSampleFuncStacks(thread.samples, stackIndexToFuncStackIndex);

    const funcStackSelfTime = new Float32Array(funcStackTable.length);
    const funcStackTotalTime = new Float32Array(funcStackTable.length);
    const numChildren = new Uint32Array(funcStackTable.length);
    for (let sampleIndex = 0; sampleIndex < sampleFuncStacks.length; sampleIndex++) {
      const funcStackIndex = sampleFuncStacks[sampleIndex];
      if (funcStackIndex !== null) {
        funcStackSelfTime[funcStackIndex] += interval;
      }
    }
    let rootTotalTime = 0;
    let numRoots = 0;
    for (let funcStackIndex = funcStackTotalTime.length - 1; funcStackIndex >= 0; funcStackIndex--) {
      funcStackTotalTime[funcStackIndex] += funcStackSelfTime[funcStackIndex];
      if (funcStackTotalTime[funcStackIndex] === 0) {
        continue;
      }
      const prefixFuncStack = funcStackTable.prefix[funcStackIndex];
      if (prefixFuncStack === -1) {
        rootTotalTime += funcStackTotalTime[funcStackIndex];
        numRoots++;
      } else {
        funcStackTotalTime[prefixFuncStack] += funcStackTotalTime[funcStackIndex];
        numChildren[prefixFuncStack]++;
      }
    }
    const funcStackTimes = { selfTime: funcStackSelfTime, totalTime: funcStackTotalTime };
    return new ProfileTree(funcStackTable, funcStackTimes, numChildren, thread.funcTable, thread.resourceTable, thread.stringTable, rootTotalTime, numRoots, jsOnly);
  });
}
