import { timeCode } from './time-code';

class TreeNode {
  constructor(name, parent) {
    this._name = name;
    this._parent = parent;
    this._children = [];
    this._leafSampleCount = 0;
    this._totalSampleCount = 0;
  }

  addChild(node) {
    this._children.push(node);
  }

  incrementSampleCountBy(increment) {
    this._leafSampleCount += increment;
  }

  postProcess() {
    this._children = this._children.filter(child => {
      child.postProcess();
      return child._totalSampleCount !== 0
    });
    this._children.sort((a, b) => b._totalSampleCount - a._totalSampleCount);
    this._totalSampleCount = this._leafSampleCount +
      this._children.reduce((acc, child) => acc + child._totalSampleCount, 0);
  }
}

export function getCallTree(thread) {
  return timeCode('getCallTree', () => {
    let root = new TreeNode('(root)');
    let nodes = new Map();
    nodes.set(null, root);
    for (let funcStackIndex = 0; funcStackIndex < thread.funcStackTable.length; funcStackIndex++) {
      const prefix = thread.funcStackTable.prefix[funcStackIndex];
      const funcIndex = thread.funcStackTable.func[funcStackIndex];
      if (funcIndex === null) {
        console.log('funcIndex is null', funcStackIndex, data);
      }
      let parentNode = nodes.get(prefix);
      let funcNameStringIndex = thread.funcTable.name[funcIndex];
      let funcName = thread.stringTable.getString(funcNameStringIndex);
      let node = new TreeNode(funcName, parentNode);
      parentNode.addChild(node);
      nodes.set(funcStackIndex, node);
    }
    for (let sampleIndex = 0; sampleIndex < thread.samples.length; sampleIndex++) {
      const funcStack = thread.samples.funcStack[sampleIndex];
      nodes.get(funcStack).incrementSampleCountBy(1);
    }
    root.postProcess();
    return root;
  });
}
