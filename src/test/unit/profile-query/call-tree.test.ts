/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FunctionMap } from '../../../profile-query/function-map';
import { collectCallTree } from '../../../profile-query/formatters/call-tree';
import type { CallTreeNode } from '../../../profile-query/types';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';

describe('call-tree collection', function () {
  describe('simple linear tree', function () {
    it('respects node budget', function () {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        D
        E
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // Collect with budget of 3 nodes
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 3,
        }
      );

      // Count nodes (excluding virtual root)
      const nodeCount = countNodes(result) - 1;
      expect(nodeCount).toBeLessThanOrEqual(3);
    });

    it('includes high-score nodes even when deep', function () {
      const { profile } = getProfileFromTextSamples(`
        A  A  A
        B  B  B
        C  C  C
        D  D  D
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // With small budget, should still include D (100% at depth 3)
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 4,
        }
      );

      // Should include: A, B, C, D
      const nodeNames = collectNodeNames(result);
      expect(nodeNames).toContain('A');
      expect(nodeNames).toContain('B');
      expect(nodeNames).toContain('C');
      expect(nodeNames).toContain('D');
    });
  });

  describe('branching tree', function () {
    it('explores hot paths first', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A
        B    B    C    C
        D    D
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // With budget of 4: should get A, B (50%), D (50%), C (50%)
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 4,
        }
      );

      const nodeNames = collectNodeNames(result);
      expect(nodeNames).toContain('A');
      expect(nodeNames).toContain('B'); // Hot child (50%)
      expect(nodeNames).toContain('C'); // Also 50%
      // D might or might not be included depending on score ordering
    });

    it('computes elided children stats', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A    A
        B    B    C    D    E
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // With budget of 2: A and B, should show C/D/E as elided
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 2,
        }
      );

      const aNode = result.children[0];
      expect(aNode.name).toBe('A');
      expect(aNode.childrenTruncated).toBeDefined();
      expect(aNode.childrenTruncated?.count).toBeGreaterThan(0);
    });
  });

  describe('scoring strategies', function () {
    it('exponential-0.9 balances depth and breadth', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    B
        C    C
        D    D
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 4,
          scoringStrategy: 'exponential-0.9',
        }
      );

      const nodeNames = collectNodeNames(result);
      expect(nodeNames).toContain('A'); // 66% at depth 0
      expect(nodeNames).toContain('B'); // 33% at depth 0
    });

    it('percentage-only ignores depth', function () {
      const { profile } = getProfileFromTextSamples(`
        A
        B
        C
        D
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 4,
          scoringStrategy: 'percentage-only',
        }
      );

      // All nodes should have same priority (100%), so all included
      const nodeCount = countNodes(result) - 1;
      expect(nodeCount).toBe(4);
    });
  });

  describe('complex branching trees', function () {
    it('handles multiple levels of branching correctly', function () {
      const { profile } = getProfileFromTextSamples(`
        A      A      A      A      A      A      B      B      C
        D      D      E      E      F      F      G      G
        H      H      I      I
        J      J
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 10,
          scoringStrategy: 'exponential-0.9',
        }
      );

      const nodeNames = collectNodeNames(result);
      // Should include high-percentage nodes
      expect(nodeNames).toContain('A'); // 66% at depth 0
      expect(nodeNames).toContain('B'); // 22% at depth 0
      expect(nodeNames).toContain('D'); // 22% under A
      expect(nodeNames).toContain('E'); // 22% under A

      const nodeCount = countNodes(result) - 1;
      expect(nodeCount).toBeLessThanOrEqual(10);
    });

    it('correctly computes elided children percentages', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A    A    A    A    A    A    A
        B    B    C    C    D    D    E    F    G    H
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // Small budget to force truncation
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 3,
        }
      );

      const aNode = result.children[0];
      expect(aNode.name).toBe('A');
      expect(aNode.childrenTruncated).toBeDefined();

      // Verify the count and percentages are correct
      const truncInfo = aNode.childrenTruncated!;
      expect(truncInfo.count).toBeGreaterThan(0);
      expect(truncInfo.combinedPercentage).toBeGreaterThan(0);
      expect(truncInfo.maxPercentage).toBeGreaterThan(0);
      // Max percentage should be <= combined percentage
      expect(truncInfo.maxPercentage).toBeLessThanOrEqual(
        truncInfo.combinedPercentage
      );
    });

    it('handles wide trees with many children', function () {
      // Create a wide tree: A has 15 children
      const samples = `
        A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A
        B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q
      `;

      const { profile } = getProfileFromTextSamples(samples);
      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // First verify that A has many children
      const roots = callTree.getRoots();
      expect(roots.length).toBe(1);
      const aCallNode = roots[0];
      const aChildren = callTree.getChildren(aCallNode);
      expect(aChildren.length).toBe(16); // B through Q

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 5, // Small budget to ensure truncation
          maxChildrenPerNode: 10,
        }
      );

      const aNode = result.children[0];
      expect(aNode.name).toBe('A');

      // A has 16 children, but we can only expand 10 (maxChildrenPerNode)
      // With budget of 5 total nodes (A + 4 children), we should have truncation
      // Either from the 10 expanded children (6 not included) + 6 not expanded = 12 total
      // Or if fewer than 4 children included, even more truncated
      expect(aNode.childrenTruncated).toBeDefined();
      expect(aNode.childrenTruncated!.count).toBeGreaterThan(0);
    });

    it('preserves correct ordering by sample count', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A    A    A    A    A
        B    B    B    C    C    D
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 10,
        }
      );

      const aNode = result.children[0];
      expect(aNode.name).toBe('A');

      // Children should be ordered B (3 samples), C (2 samples), D (1 sample)
      expect(aNode.children.length).toBeGreaterThanOrEqual(2);
      expect(aNode.children[0].name).toBe('B'); // Highest sample count
      expect(aNode.children[1].name).toBe('C');
    });
  });

  describe('deep nested structures', function () {
    it('includes deep hot paths over shallow cold paths', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A    A    A    A    A    B    C
        D    D    D    D    D    D    D    D
        E    E    E    E    E    E    E    E
        F    F    F    F    F    F    F    F
        G    G    G    G    G    G    G    G
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 8,
          scoringStrategy: 'exponential-0.9',
        }
      );

      const nodeNames = collectNodeNames(result);
      // Should include deep path A->D->E->F->G even though it's deep
      // because it's 80% of all samples
      expect(nodeNames).toContain('A');
      expect(nodeNames).toContain('D');
      expect(nodeNames).toContain('E');
      expect(nodeNames).toContain('F');
      expect(nodeNames).toContain('G');
    });

    it('respects maxDepth parameter', function () {
      // Create deeply nested tree
      const samples = Array(50)
        .fill(null)
        .map((_, i) => `Func${i}`)
        .join('\n');

      const { profile } = getProfileFromTextSamples(samples);
      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 100,
          maxDepth: 20,
        }
      );

      const maxDepth = findMaxDepth(result);
      expect(maxDepth).toBeLessThanOrEqual(20);
    });
  });

  describe('elided children statistics', function () {
    it('correctly sums elided children samples', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A    A    A    A    A    A    A
        B    B    B    C    C    D    E    F    G    H
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      // Budget that includes A and B, but not the other children
      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 2,
        }
      );

      const aNode = result.children[0];
      expect(aNode.name).toBe('A');
      expect(aNode.children.length).toBe(1);
      expect(aNode.children[0].name).toBe('B');

      // Should have truncated info for C, D, E, F, G, H
      expect(aNode.childrenTruncated).toBeDefined();
      expect(aNode.childrenTruncated!.count).toBe(6);

      // Combined samples should be 7 (C:2, D:1, E:1, F:1, G:1, H:1)
      expect(aNode.childrenTruncated!.combinedSamples).toBe(7);
      // Combined percentage should be 70% of total 10 samples (not relative to A)
      expect(aNode.childrenTruncated!.combinedPercentage).toBeCloseTo(70, 0);

      // Max samples should be 2 (from C)
      expect(aNode.childrenTruncated!.maxSamples).toBe(2);
      // Max percentage should be 20% of total 10 samples (not relative to A)
      expect(aNode.childrenTruncated!.maxPercentage).toBeCloseTo(20, 0);
    });

    it('correctly identifies depth where children were truncated', function () {
      const { profile } = getProfileFromTextSamples(`
        A    A    A    A
        B    B    B    B
        C    D    E    F
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 2,
        }
      );

      const aNode = result.children[0];
      const bNode = aNode.children[0];
      expect(bNode.name).toBe('B');

      // B's children were truncated at depth 2
      expect(bNode.childrenTruncated).toBeDefined();
      expect(bNode.childrenTruncated!.depth).toBe(2);
    });
  });

  describe('depth limit', function () {
    it('stops expanding beyond maxDepth', function () {
      // Very deep tree
      const samples = Array(100)
        .fill(null)
        .map((_, i) => `Func${i}`)
        .join('\n');

      const { profile } = getProfileFromTextSamples(samples);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const threadSelectors = getThreadSelectors(0);
      const callTree = threadSelectors.getCallTree(state);
      const functionMap = new FunctionMap();
      const threadIndexes = new Set([0]);
      const libs = profile.libs;

      const result = collectCallTree(
        callTree,
        functionMap,
        threadIndexes,
        libs,
        {
          maxNodes: 1000, // High budget
          maxDepth: 10, // But limited depth
        }
      );

      const maxDepthFound = findMaxDepth(result);
      expect(maxDepthFound).toBeLessThanOrEqual(10);
    });
  });
});

/**
 * Count total nodes in tree (including root).
 */
function countNodes(node: CallTreeNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * Collect all node names in tree.
 */
function collectNodeNames(node: CallTreeNode): string[] {
  const names = [node.name];
  for (const child of node.children) {
    names.push(...collectNodeNames(child));
  }
  return names;
}

/**
 * Find maximum depth in tree.
 */
function findMaxDepth(node: CallTreeNode): number {
  if (node.children.length === 0) {
    return node.originalDepth;
  }
  return Math.max(...node.children.map((child) => findMaxDepth(child)));
}
