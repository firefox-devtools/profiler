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

  /**
   * Return an object with information about the node with index funcStackIndex.
   * @param  {[type]} funcStackIndex [description]
   * @return {[type]}                [description]
   */
  getNode(funcStackIndex) {
    let node = this._nodes.get(funcStackIndex);
    if (node === undefined) {
      node = {
        leafTime: this._funcStackTable.leafTime[funcStackIndex],
        totalTime: this._funcStackTable.totalTime[funcStackIndex],
        name: this._stringTable.getString(this._funcTable.name[this._funcStackTable.func[funcStackIndex]]),
      };
      this._nodes.set(funcStackIndex, node);
    }
    return node;
  }
};

export function getCallTree(thread) {
  return timeCode('getCallTree', () => {
    const { funcStackTable, sampleFuncStacks } =
      createFuncStackTableAndFixupSamples(thread.stackTable, thread.frameTable, thread.funcTable, thread.samples);

    const funcStackLeafTime = new Float32Array(funcStackTable.length);
    const funcStackTotalTime = new Float32Array(funcStackTable.length);
    const interval = 1;
    for (let sampleIndex = 0; sampleIndex < sampleFuncStacks.length; sampleIndex++) {
      funcStackLeafTime[sampleFuncStacks[sampleIndex]] += interval;
    }
    let rootTotalTime = 0;
    for (let funcStackIndex = funcStackTotalTime.length - 1; funcStackIndex >= 0; funcStackIndex--) {
      funcStackTotalTime[funcStackIndex] += funcStackLeafTime[funcStackIndex];
      const prefixFuncStack = funcStackTable.prefix[funcStackIndex];
      if (prefixFuncStack === -1) {
        rootTotalTime += funcStackTotalTime[funcStackIndex];
      } else {
        funcStackTotalTime[prefixFuncStack] += funcStackTotalTime[funcStackIndex];
      }
    }
    const newFuncStackTable = Object.assign({}, funcStackTable, { leafTime: funcStackLeafTime, totalTime: funcStackTotalTime });
    return new ProfileTree(newFuncStackTable, thread.funcTable, thread.stringTable, rootTotalTime);
  });
}
