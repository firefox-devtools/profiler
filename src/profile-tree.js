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
    nodes.set(-1, root);
    const { data, schema } = thread.funcStackTable;
    data.twoFieldsForEach(schema.prefix, schema.func, (prefix, funcIndex, funcStackIndex) => {
      let parentNode = nodes.get(prefix);
      let funcNameStringIndex = thread.funcTable.data.getValue(funcIndex, thread.funcTable.schema.name);
      let funcName = thread.stringTable.getString(funcNameStringIndex);
      let node = new TreeNode(funcName, parentNode);
      parentNode.addChild(node);
      nodes.set(funcStackIndex, node);
    });
    thread.samples.data.oneFieldForEach(thread.samples.schema.funcStack, funcStack => {
      nodes.get(funcStack).incrementSampleCountBy(1);
    });
    root.postProcess();
    return root;
  });
}
