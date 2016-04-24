import { timeCode } from './time-code';
import { createFuncStackTableAndFixupSamples } from './profile-data';

class ProfileTree {
  constructor(funcStackTable, funcTable, stringTable, rootTotalTime) {
    this._funcStackTable = funcStackTable;
    this._funcTable = funcTable;
    this._stringTable = stringTable;
    this._rootTotalTime = rootTotalTime;
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
      children = this._funcStackTable.prefix.reduce((arr, prefix, childFuncStackIndex) => prefix === funcStackIndex ? arr.concat(childFuncStackIndex) : arr, []);
      children.sort((a, b) => this._funcStackTable.totalTime[b] - this._funcStackTable.totalTime[a]);
      this._children.set(funcStackIndex, children);
    }
    return children;
  }

  hasChildren(funcStackIndex) {
    return this.getChildren(funcStackIndex).length !== 0;
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
        totalTime: `${this._funcStackTable.totalTime[funcStackIndex].toFixed(1)}ms`,
        totalTimePercent: `${(100 * this._funcStackTable.totalTime[funcStackIndex] / this._rootTotalTime).toFixed(1)}%`,
        selfTime: `${this._funcStackTable.selfTime[funcStackIndex].toFixed(1)}ms`,
        name: this._stringTable.getString(this._funcTable.name[this._funcStackTable.func[funcStackIndex]]),
      };
      this._nodes.set(funcStackIndex, node);
    }
    return node;
  }
};

export function getCallTree(thread, interval) {
  return timeCode('getCallTree', () => {
    const { funcStackTable, sampleFuncStacks } =
      createFuncStackTableAndFixupSamples(thread.stackTable, thread.frameTable, thread.funcTable, thread.samples);

    const funcStackSelfTime = new Float32Array(funcStackTable.length);
    const funcStackTotalTime = new Float32Array(funcStackTable.length);
    for (let sampleIndex = 0; sampleIndex < sampleFuncStacks.length; sampleIndex++) {
      funcStackSelfTime[sampleFuncStacks[sampleIndex]] += interval;
    }
    let rootTotalTime = 0;
    for (let funcStackIndex = funcStackTotalTime.length - 1; funcStackIndex >= 0; funcStackIndex--) {
      funcStackTotalTime[funcStackIndex] += funcStackSelfTime[funcStackIndex];
      const prefixFuncStack = funcStackTable.prefix[funcStackIndex];
      if (prefixFuncStack === -1) {
        rootTotalTime += funcStackTotalTime[funcStackIndex];
      } else {
        funcStackTotalTime[prefixFuncStack] += funcStackTotalTime[funcStackIndex];
      }
    }
    const newFuncStackTable = Object.assign({}, funcStackTable, { selfTime: funcStackSelfTime, totalTime: funcStackTotalTime });
    return new ProfileTree(newFuncStackTable, thread.funcTable, thread.stringTable, rootTotalTime);
  });
}
