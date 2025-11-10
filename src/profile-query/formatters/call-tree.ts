/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';
import type {
  IndexIntoCallNodeTable,
  ThreadIndex,
  Lib,
} from 'firefox-profiler/types';
import type { CallTreeNode, CallTreeScoringStrategy } from '../types';
import type { FunctionMap } from '../function-map';
import { formatFunctionNameWithLibrary } from '../function-list';

/**
 * Compute inclusion score for a call tree node.
 * The score determines priority for node budget selection.
 * Property: score(child) ≤ score(parent) for any parent-child pair.
 */
function computeInclusionScore(
  totalPercentage: number,
  depth: number,
  strategy: CallTreeScoringStrategy
): number {
  switch (strategy) {
    case 'exponential-0.95':
      return totalPercentage * Math.pow(0.95, depth);
    case 'exponential-0.9':
      return totalPercentage * Math.pow(0.9, depth);
    case 'exponential-0.8':
      return totalPercentage * Math.pow(0.8, depth);
    case 'harmonic-0.1':
      return totalPercentage / (1 + 0.1 * depth);
    case 'harmonic-0.5':
      return totalPercentage / (1 + 0.5 * depth);
    case 'harmonic-1.0':
      return totalPercentage / (1 + depth);
    case 'percentage-only':
      return totalPercentage;
    default:
      // Default to exponential-0.9
      return totalPercentage * Math.pow(0.94, depth);
  }
}

/**
 * Simple max-heap implementation for priority queue.
 */
class MaxHeap<T> {
  private items: Array<{ item: T; priority: number }> = [];

  push(item: T, priority: number): void {
    this.items.push({ item, priority });
    this._bubbleUp(this.items.length - 1);
  }

  popMax(): T | null {
    if (this.items.length === 0) {
      return null;
    }
    if (this.items.length === 1) {
      return this.items.pop()!.item;
    }

    const max = this.items[0].item;
    this.items[0] = this.items.pop()!;
    this._bubbleDown(0);
    return max;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  private _bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.items[index].priority <= this.items[parentIndex].priority) {
        break;
      }
      // Swap
      [this.items[index], this.items[parentIndex]] = [
        this.items[parentIndex],
        this.items[index],
      ];
      index = parentIndex;
    }
  }

  private _bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      if (
        leftChild < this.items.length &&
        this.items[leftChild].priority > this.items[largest].priority
      ) {
        largest = leftChild;
      }

      if (
        rightChild < this.items.length &&
        this.items[rightChild].priority > this.items[largest].priority
      ) {
        largest = rightChild;
      }

      if (largest === index) {
        break;
      }

      // Swap
      [this.items[index], this.items[largest]] = [
        this.items[largest],
        this.items[index],
      ];
      index = largest;
    }
  }
}

/**
 * Internal node used during collection.
 */
type CollectionNode = {
  callNodeIndex: IndexIntoCallNodeTable;
  depth: number;
};

/**
 * Options for call tree collection.
 */
export type CallTreeCollectionOptions = {
  /** Maximum number of nodes to include. Default: 100 */
  maxNodes?: number;
  /** Scoring strategy for node selection. Default: 'exponential-0.9' */
  scoringStrategy?: CallTreeScoringStrategy;
  /** Maximum depth to traverse (safety limit). Default: 200 */
  maxDepth?: number;
  /** Maximum children to expand per node. Default: 100 */
  maxChildrenPerNode?: number;
};

/**
 * Collect call tree data using heap-based expansion.
 * This works for both top-down and bottom-up (inverted) trees.
 */
export function collectCallTree(
  tree: CallTree,
  functionMap: FunctionMap,
  threadIndexes: Set<ThreadIndex>,
  libs: Lib[],
  options: CallTreeCollectionOptions = {}
): CallTreeNode {
  const maxNodes = options.maxNodes ?? 100;
  const scoringStrategy = options.scoringStrategy ?? 'exponential-0.9';
  const maxDepth = options.maxDepth ?? 200;
  const maxChildrenPerNode = options.maxChildrenPerNode ?? 100;

  // Map from call node index to our collection node
  const includedNodes = new Set<IndexIntoCallNodeTable>();
  const expansionFrontier = new MaxHeap<CollectionNode>();

  // Start with root nodes
  // For inverted (bottom-up) trees, there can be many roots (all leaf functions).
  // Reserve some budget for expanding children by limiting initial roots to ~70% of budget.
  const roots = tree.getRoots();
  const maxInitialRoots = Math.min(roots.length, Math.ceil(maxNodes * 0.7));
  for (let i = 0; i < maxInitialRoots; i++) {
    const rootIndex = roots[i];
    const nodeData = tree.getNodeData(rootIndex);
    const totalPercentage = nodeData.totalRelative * 100;
    const score = computeInclusionScore(totalPercentage, 0, scoringStrategy);

    const collectionNode: CollectionNode = {
      callNodeIndex: rootIndex,
      depth: 0,
    };

    expansionFrontier.push(collectionNode, score);
  }

  // Expand nodes in score order until budget reached
  while (includedNodes.size < maxNodes) {
    const node = expansionFrontier.popMax();
    if (!node) {
      break;
    }

    // node is the next highest candidate; none of the other nodes in expansionFronteer, or
    // any of their descendants, will have a higher score than node. Add it to the included
    // set.
    includedNodes.add(node.callNodeIndex);

    // Skip children if we've reached max depth
    if (node.depth >= maxDepth || !tree.hasChildren(node.callNodeIndex)) {
      continue;
    }

    const childDepth = node.depth + 1;

    const children = tree.getChildren(node.callNodeIndex);
    // Limit children per node to prevent budget explosion
    const childrenToExpand = children.slice(0, maxChildrenPerNode);

    for (const childIndex of childrenToExpand) {
      const childData = tree.getNodeData(childIndex);
      const totalPercentage = childData.totalRelative * 100;
      const childScore = computeInclusionScore(
        totalPercentage,
        childDepth,
        scoringStrategy
      );

      const childNode: CollectionNode = {
        callNodeIndex: childIndex,
        depth: childDepth,
      };

      expansionFrontier.push(childNode, childScore);
    }
  }

  return buildTreeStructure(
    tree,
    includedNodes,
    functionMap,
    threadIndexes,
    libs
  );
}

/**
 * Build tree structure from the set of included nodes.
 */
function buildTreeStructure(
  tree: CallTree,
  includedNodes: Set<IndexIntoCallNodeTable>,
  functionMap: FunctionMap,
  threadIndexes: Set<ThreadIndex>,
  libs: Lib[]
): CallTreeNode {
  // Get total sample count from the tree for percentage calculations
  const totalSampleCount = tree.getTotal();

  // Create virtual root
  const rootNode: CallTreeNode = {
    name: '<root>',
    nameWithLibrary: '<root>',
    totalSamples: totalSampleCount,
    totalPercentage: 100,
    selfSamples: 0,
    selfPercentage: 0,
    originalDepth: -1,
    children: [],
  };

  const pendingNodes = [rootNode];

  // Create tree nodes for all included nodes.
  // Traverse the tree until we run out of pendingNodes.
  while (true) {
    const node = pendingNodes.pop();
    if (node === undefined) {
      break;
    }

    const childrenCallNodeIndexes =
      node.callNodeIndex !== undefined
        ? tree.getChildren(node.callNodeIndex)
        : tree.getRoots();
    const elidedChildren = [];
    const childrenDepth = node.originalDepth + 1;
    for (const callNodeIndex of childrenCallNodeIndexes) {
      if (!includedNodes.has(callNodeIndex)) {
        elidedChildren.push(callNodeIndex);
        continue;
      }
      const childNodeData = tree.getNodeData(callNodeIndex);
      const funcIndex = tree._callNodeInfo.funcForNode(callNodeIndex);
      const totalPercentage = childNodeData.totalRelative * 100;

      // Format function name with library prefix
      const nameWithLibrary = formatFunctionNameWithLibrary(
        funcIndex,
        tree._thread,
        libs
      );

      const childNode: CallTreeNode = {
        callNodeIndex,
        functionHandle: functionMap.handleForFunction(threadIndexes, funcIndex),
        functionIndex: funcIndex,
        name: childNodeData.funcName,
        nameWithLibrary,
        totalSamples: childNodeData.total,
        totalPercentage,
        selfSamples: childNodeData.self,
        selfPercentage: childNodeData.selfRelative * 100,
        originalDepth: childrenDepth,
        children: [],
      };

      node.children.push(childNode);
      pendingNodes.push(childNode);
    }

    // Create elision marker if there are any elided or unexpanded children
    if (elidedChildren.length > 0) {
      let combinedSamples = 0;
      let maxSamples = 0;

      // Stats for elided children that were expanded
      for (const childIdx of elidedChildren) {
        const childData = tree.getNodeData(childIdx);
        combinedSamples += childData.total;
        maxSamples = Math.max(maxSamples, childData.total);
      }

      const combinedRelative = combinedSamples / totalSampleCount;
      const maxRelative = maxSamples / totalSampleCount;
      node.childrenTruncated = {
        count: elidedChildren.length,
        combinedSamples,
        combinedPercentage: combinedRelative * 100,
        maxSamples,
        maxPercentage: maxRelative * 100,
        depth: childrenDepth,
      };
    }
  }

  return rootNode;
}
