import { timeCode } from '../common/time-code';
import { getSampleFuncStacks } from './profile-data';

class ProfileTree {
  constructor(funcStackTable, funcStackTimes, funcStackChildCount, funcTable, resourceTable, stringTable, rootTotalTime, rootCount, jsOnly) {
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
  getChildren(funcStackIndex) {
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

  hasChildren(funcStackIndex) {
    return this.getChildren(funcStackIndex).length !== 0;
  }

  getParent(funcStackIndex) {
    return this._funcStackTable.prefix[funcStackIndex];
  }

  getDepth(funcStackIndex) {
    return this._funcStackTable.depth[funcStackIndex];
  }

  hasSameNodeIds(tree) {
    return this._funcStackTable === tree._funcStackTable;
  }

  /**
   * Return an object with information about the node with index funcStackIndex.
   * @param  {[type]} funcStackIndex [description]
   * @return {[type]}                [description]
   */
  getNode(funcStackIndex) {
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

export function getCallTree(thread, interval, funcStackInfo, jsOnly) {
  return timeCode('getCallTree', () => {
    const { funcStackTable, stackIndexToFuncStackIndex } = funcStackInfo;
    const sampleFuncStacks = getSampleFuncStacks(thread.samples, stackIndexToFuncStackIndex);

    const funcStackSelfTime = new Float32Array(funcStackTable.length);
    const funcStackTotalTime = new Float32Array(funcStackTable.length);
    const numChildren = new Uint32Array(funcStackTable.length);
    for (let sampleIndex = 0; sampleIndex < sampleFuncStacks.length; sampleIndex++) {
      funcStackSelfTime[sampleFuncStacks[sampleIndex]] += interval;
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
