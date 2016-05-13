import { timeCode } from './time-code';

class ProfileTree {
  constructor(funcStackTable, funcStackTimes, funcStackChildCount, funcTable, stringTable, rootTotalTime, rootCount) {
    this._funcStackTable = funcStackTable;
    this._funcStackTimes = funcStackTimes;
    this._funcStackChildCount = funcStackChildCount;
    this._funcTable = funcTable;
    this._stringTable = stringTable;
    this._rootTotalTime = rootTotalTime;
    this._rootCount = rootCount;
    this._nodes = new Map();
    this._children = new Map();
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
        if (this._funcStackTable.prefix[childFuncStackIndex] === funcStackIndex) {
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
      node = {
        totalTime: `${this._funcStackTimes.totalTime[funcStackIndex].toFixed(1)}ms`,
        totalTimePercent: `${(100 * this._funcStackTimes.totalTime[funcStackIndex] / this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._funcStackTimes.selfTime[funcStackIndex].toFixed(1)}ms`,
        name: this._stringTable.getString(this._funcTable.name[this._funcStackTable.func[funcStackIndex]]),
      };
      this._nodes.set(funcStackIndex, node);
    }
    return node;
  }
}

export function getCallTree(thread, interval, funcStackInfo) {
  return timeCode('getCallTree', () => {
    const { funcStackTable, sampleFuncStacks } = funcStackInfo;

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
    return new ProfileTree(funcStackTable, funcStackTimes, numChildren, thread.funcTable, thread.stringTable, rootTotalTime, numRoots);
  });
}
