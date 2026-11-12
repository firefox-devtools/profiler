/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// When a transform is applied, the selected call node can disappear, for
// example because the user dropped or merged its function. The functions in
// this file pick a replacement selection that is "visually close" to the old
// one: preferably the node that moves into the old node's position.

import {
  applyTransformToCallNodePath,
  applyTransformToFuncIndex,
} from './transforms';

import type {
  CallNodePath,
  IndexIntoCallNodeTable,
  IndexIntoFuncTable,
  Thread,
  Transform,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from './call-node-info';
import type { CallTree } from './call-tree';
/**
 * Returns whether the call node is displayed in the tree. Call nodes can exist
 * in the call node table without being displayed, for example when a transform
 * removed all of their samples.
 */
function _isCallNodeDisplayedInTree(
  tree: CallTree,
  callNodeIndex: IndexIntoCallNodeTable
): boolean {
  let node = callNodeIndex;
  while (true) {
    const parent = tree.getParent(node);
    const siblings = parent === -1 ? tree.getRoots() : tree.getChildren(parent);
    if (!siblings.includes(node)) {
      return false;
    }
    if (parent === -1) {
      return true;
    }
    node = parent;
  }
}

/**
 * Pick the call node path that should be selected after a transform has been
 * applied. This keeps the selected node if it survives the transform.
 * Otherwise, it picks a node that is close to it. Returns an empty path if
 * there is no suitable node.
 *
 * If the selected node is merged, we pick its caller, so that users can merge a
 * chain of callers by pressing "m" repeatedly. Otherwise, or if there is no
 * caller, we pick the node that is now in the selected node's position among
 * its siblings, or the last sibling if there are fewer, or the parent if there
 * are none. We go by position because the siblings can be re-sorted.
 *
 * The "old" arguments describe the state before the transform was applied, and
 * the "new" arguments describe the state after.
 */
export function findCallNodePathToSelectAfterTransform(
  transform: Transform,
  oldTransformedThread: Thread,
  oldCallNodeInfo: CallNodeInfo,
  oldTree: CallTree,
  oldSelectedCallNodeIndex: IndexIntoCallNodeTable,
  newCallNodeInfo: CallNodeInfo,
  newTree: CallTree
): CallNodePath {
  const mapAndCheck = (
    oldCallNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable | null => {
    const newPath = applyTransformToCallNodePath(
      oldCallNodeInfo.getCallNodePathFromIndex(oldCallNodeIndex),
      transform,
      oldTransformedThread,
      oldCallNodeInfo
    );
    if (newPath.length === 0) {
      return null;
    }
    const newCallNodeIndex = newCallNodeInfo.getCallNodeIndexFromPath(newPath);
    if (
      newCallNodeIndex === null ||
      !_isCallNodeDisplayedInTree(newTree, newCallNodeIndex)
    ) {
      return null;
    }
    return newCallNodeIndex;
  };

  // Keep the selected node if it survives. The transform can change the path
  // of the selected node, for example when it merges one of its ancestors. But
  // if the transform changes the last function of the path, the path now
  // refers to a different node, for example to the parent when the selected
  // node gets merged. In that case, we prefer a node from the neighborhood.
  // An exception is "collapse-resource", which replaces the selected function
  // with the function for the collapsed resource. That node does take the
  // place of the selected node.
  const selectedNode = mapAndCheck(oldSelectedCallNodeIndex);
  if (
    selectedNode !== null &&
    (newCallNodeInfo.funcForNode(selectedNode) ===
      oldCallNodeInfo.funcForNode(oldSelectedCallNodeIndex) ||
      transform.type === 'collapse-resource')
  ) {
    return newCallNodeInfo.getCallNodePathFromIndex(selectedNode);
  }

  // If the selected node was merged, select its caller. In the inverted tree,
  // the callers are the children. We pick the heaviest one, which takes the
  // place of the merged node.
  const isMerge =
    transform.type === 'merge-function' || transform.type === 'merge-call-node';
  if (isMerge && oldCallNodeInfo.isInverted()) {
    const oldCaller = oldTree.getChildren(oldSelectedCallNodeIndex)[0];
    const newCaller = oldCaller === undefined ? null : mapAndCheck(oldCaller);
    if (newCaller !== null) {
      return newCallNodeInfo.getCallNodePathFromIndex(newCaller);
    }
  }

  // Find the closest ancestor that survives. Its position in the new tree can
  // differ from its old position, for example when the transform merges one of
  // its ancestors. oldChildOnPath is the ancestor's child that leads to the
  // selected node. It's the selected node itself unless the transform removed
  // more ancestors, for example when the user drops the parent's function.
  let oldChildOnPath = oldSelectedCallNodeIndex;
  let oldAncestor = oldTree.getParent(oldSelectedCallNodeIndex);
  let newAncestor = -1;
  while (oldAncestor !== -1) {
    const node = mapAndCheck(oldAncestor);
    if (node !== null) {
      newAncestor = node;
      break;
    }
    oldChildOnPath = oldAncestor;
    oldAncestor = oldTree.getParent(oldAncestor);
  }

  // In the non-inverted tree, the caller is the closest ancestor.
  if (isMerge && !oldCallNodeInfo.isInverted() && newAncestor !== -1) {
    return newCallNodeInfo.getCallNodePathFromIndex(newAncestor);
  }

  const oldSiblings =
    oldAncestor === -1 ? oldTree.getRoots() : oldTree.getChildren(oldAncestor);
  const newSiblings =
    newAncestor === -1 ? newTree.getRoots() : newTree.getChildren(newAncestor);
  const oldPosition = oldSiblings.indexOf(oldChildOnPath);
  if (oldPosition !== -1 && newSiblings.length > 0) {
    const sibling = newSiblings[Math.min(oldPosition, newSiblings.length - 1)];
    return newCallNodeInfo.getCallNodePathFromIndex(sibling);
  }

  return newAncestor === -1
    ? []
    : newCallNodeInfo.getCallNodePathFromIndex(newAncestor);
}

/**
 * Pick the function that should be selected in the function list after a
 * transform has been applied. This keeps the selected function if it
 * survives. Otherwise, it picks the function that is now in the selected
 * function's row, or the last function if the list got shorter. This lets
 * users drop functions one after the other without moving the selection.
 * Returns null if there is no suitable function.
 *
 * We pick by position rather than by picking the old neighbor of the selected
 * function. The transform changes the totals of other functions too, and the
 * list is re-sorted. Functions that shared stacks with the removed function
 * lose the most samples, so the old neighbor can end up far down the list.
 *
 * oldRows and newRows are the functions in the order in which they're
 * displayed, before and after the transform.
 */
export function findFunctionToSelectAfterTransform(
  transform: Transform,
  oldTransformedThread: Thread,
  oldSelectedFunc: IndexIntoFuncTable,
  oldRows: IndexIntoFuncTable[],
  newRows: IndexIntoFuncTable[]
): IndexIntoFuncTable | null {
  const selectedFunc = applyTransformToFuncIndex(
    oldSelectedFunc,
    transform,
    oldTransformedThread
  );
  if (selectedFunc !== null && newRows.includes(selectedFunc)) {
    return selectedFunc;
  }

  const selectedRow = oldRows.indexOf(oldSelectedFunc);
  if (selectedRow === -1 || newRows.length === 0) {
    return null;
  }
  return newRows[Math.min(selectedRow, newRows.length - 1)];
}
