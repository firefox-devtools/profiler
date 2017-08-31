// @flow
import { CallTree } from '../../profile-logic/call-tree';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';

export function getBoundingBox(width: number, height: number) {
  return {
    width,
    height,
    left: 0,
    x: 0,
    top: 0,
    y: 0,
    right: width,
    bottom: height,
  };
}

export function formatTree(
  callTree: CallTree,
  children: IndexIntoCallNodeTable[] = callTree.getRoots(),
  depth: number = 0,
  previousString: string = ''
) {
  const whitespace = Array(depth * 2).join(' ');

  return children.reduce((string, callNodeIndex) => {
    const { name, totalTime, selfTime } = callTree.getNode(callNodeIndex);
    const text = `\n${whitespace}- ${name} (total: ${totalTime}, self:${selfTime})`;
    return formatTree(
      callTree,
      callTree.getChildren(callNodeIndex),
      depth + 1,
      string + text
    );
  }, previousString);
}
