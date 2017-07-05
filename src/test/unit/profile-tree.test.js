/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  getProfileForInvertedCallTree,
  getProfileForUnfilteredCallTree,
} from '.././fixtures/profiles/profiles-for-call-trees';
import {
  getCallTree,
  computeCallTreeCountsAndTimings,
} from '../../profile-logic/profile-tree';
import {
  invertCallstack,
  getStackFromFuncArray,
  getProfileWithTransformTables,
} from '../../profile-logic/profile-data';
import type { ProfileTreeClass } from '../../profile-logic/profile-tree';
import type { IndexIntoStackTable } from '../../types/profile';

describe('unfiltered call tree', function() {
  // These values are hoisted at the top for the ease of access. In the profile fixture
  // for the unfiltered call tree, the indexes for funcs, frames, and stacks all happen
  // to share the same indexes as there is a 1 to 1 relationship between them.
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const E = 4;
  const F = 5;
  const G = 6;
  const H = 7;
  const I = 8;

  function getUnfilteredCallTree(): ProfileTreeClass {
    const profile = getProfileForUnfilteredCallTree();
    const [thread] = profile.threads;
    const { interval } = profile.meta;
    return getCallTree(thread, interval, 'combined', false);
  }

  /**
   * Before creating a ProfileTree instance some timings are pre-computed.
   * This test ensures that these generated values are correct.
   */
  describe('computed counts and timings', function() {
    const profile = getProfileForUnfilteredCallTree();
    it('does', function() {
      expect(
        computeCallTreeCountsAndTimings(
          profile.threads[0],
          profile.meta.interval,
          false
        )
      ).toEqual({
        rootCount: 1,
        rootTotalTime: 3,
        stackChildCount: [1, 2, 2, 1, 0, 1, 0, 1, 0],
        stackTimes: {
          selfTime: [0, 0, 0, 0, 1, 0, 1, 0, 1],
          totalTime: [3, 3, 2, 1, 1, 1, 1, 1, 1],
        },
      });
    });
  });

  /**
   * Explicitly test the structure of the unfiltered call tree.
   */
  describe('computed structure', function() {
    const callTree = getUnfilteredCallTree();
    /**
     * The profile samples have the following structure:
     *
     *         A -> A -> A
     *         |    |    |
     *         v    v    v
     *         B    B    B
     *         |    |    |
     *         v    v    v
     *         C    C    H
     *         |    |    |
     *         v    v    v
     *         D    F    I
     *         |    |
     *         v    v
     *         E    G
     *
     * Assert this form for each node where (FuncName:TotalTime,SelfTime)
     *
     *             A:3,0
     *               |
     *               v
     *             B:3,0
     *             /    \
     *            v      v
     *        C:2,0     H:1,0
     *       /      \         \
     *      v        v         v
     *    D:1,0     F:1,0     I:1,1
     *    |           |
     *    v           v
     *  E:1,1       G:1,1
     */

    describe('root node A', function() {
      const roots = callTree.getRoots();
      it('is the root of the call tree', function() {
        expect(roots).toEqual([A]);
      });
      const rootStackIndex = roots[0];
      _assertNode(callTree, rootStackIndex, {
        children: [B],
        parent: null,
        selfTime: 0,
        totalTime: 3,
      });
    });
    describe('intermediate node B', function() {
      _assertNode(callTree, B, {
        children: [C, H],
        parent: A,
        selfTime: 0,
        totalTime: 3,
      });
    });
    describe('intermediate node C', function() {
      _assertNode(callTree, C, {
        children: [D, F],
        parent: B,
        selfTime: 0,
        totalTime: 2,
      });
    });
    describe('intermediate node D', function() {
      _assertNode(callTree, D, {
        children: [E],
        parent: C,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('leaf node E', function() {
      _assertNode(callTree, E, {
        children: [],
        parent: D,
        selfTime: 1,
        totalTime: 1,
      });
    });
    describe('intermediate node F', function() {
      _assertNode(callTree, F, {
        children: [G],
        parent: C,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('leaf node G', function() {
      _assertNode(callTree, G, {
        children: [],
        parent: F,
        selfTime: 1,
        totalTime: 1,
      });
    });
    describe('intermediate node H', function() {
      _assertNode(callTree, H, {
        children: [I],
        parent: B,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('leaf node I', function() {
      _assertNode(callTree, I, {
        children: [],
        parent: H,
        selfTime: 1,
        totalTime: 1,
      });
    });
  });

  /**
   * These tests provides coverage for every method of the ProfileTree. It's less about
   * correct tree structure, and more of simple assertions about how the interface
   * is supposed to behave. There is probably duplication of coverage with other tests.
   */
  describe('ProfileTree methods', function() {
    const callTree = getUnfilteredCallTree();

    describe('getRoots()', function() {
      it('returns an array with the root indexes', function() {
        expect(callTree.getRoots()).toEqual([A]);
      });
    });

    describe('getChildren()', function() {
      it('returns an array with the children indexes', function() {
        expect(callTree.getChildren(C)).toEqual([D, F]);
        expect(callTree.getChildren(E)).toEqual([]);
      });
    });

    describe('hasChildren()', function() {
      it('determines if nodes have children', function() {
        expect(callTree.hasChildren(C)).toEqual(true);
        expect(callTree.hasChildren(E)).toEqual(false);
      });
    });

    describe('getParent()', function() {
      it("finds a stacks's parent", function() {
        expect(callTree.getParent(A)).toBe(null);
        expect(callTree.getParent(B)).toBe(A);
      });
    });

    describe('getDepth()', function() {
      it('returns the depth of stacks in the tree', function() {
        expect(callTree.getDepth(A)).toBe(0);
        expect(callTree.getDepth(B)).toBe(1);
      });
    });

    describe('hasSameNodeIds()', function() {
      it('determines if the node IDs are the same between two trees', function() {
        // This is tested through strict equality, so re-generating a StackTable is
        // the only thing this method expects.
        const otherTree = getUnfilteredCallTree();
        expect(callTree.hasSameNodeIds(callTree)).toBe(true);
        expect(callTree.hasSameNodeIds(otherTree)).toBe(false);
      });
    });

    describe('getNode()', function() {
      it('gets a node for a given stackIndex', function() {
        expect(callTree.getNode(A)).toEqual({
          dim: false,
          icon: null,
          lib: '',
          name: 'A',
          selfTime: '0.0ms',
          totalTime: '3.0ms',
          totalTimePercent: '100.0%',
        });
      });
    });
  });

  /**
   * While not specifically part of the call tree, this is a core function
   * to help navigate stacks through a list of functions.
   */
  describe('getStackFromFuncArray', function() {
    const profile = getProfileForUnfilteredCallTree();
    const [thread] = profile.threads;
    // Helper to make the assertions a little less verbose.
    function checkStack(funcArray, index, name) {
      it(`finds stack that ends in ${name}`, function() {
        expect(getStackFromFuncArray(funcArray, thread)).toBe(index);
      });
    }
    checkStack([A], A, 'A');
    checkStack([A, B], B, 'B');
    checkStack([A, B, C], C, 'C');
    checkStack([A, B, C, D], D, 'D');
    checkStack([A, B, C, D, E], E, 'E');

    checkStack([A, B, C, F], F, 'F');
    checkStack([A, B, C, F, G], G, 'G');

    checkStack([A, B, H], H, 'H');
    checkStack([A, B, H, I], I, 'I');

    it(`doesn't find a non-existent stack`, function() {
      expect(getStackFromFuncArray([A, B, C, D, E, F, G], thread)).toBe(null);
    });
  });
});

describe('inverted call tree', function() {
  // These indexes were saved by observing the generated inverted stackTable.
  const stackA_branchR = 12;
  const stackB_branchR = 11;
  const stackC_branchR = 10;

  const stackA_branchM = 9;
  const stackB_branchM = 8;

  const stackX_branchRM = 7;
  const stackY_branchRM = 6;
  const stackZ_branchRM = 5;

  const stackA_branchL = 4;
  const stackB_branchL = 3;
  const stackC_branchL = 2;
  const stackD_branchL = 1;
  const stackE_branchL = 0;

  function getInvertedCallTreeFromProfile(): ProfileTreeClass {
    const profile = getProfileWithTransformTables(
      getProfileForInvertedCallTree()
    );
    const invertedThread = invertCallstack(profile.threads[0]);
    const { interval } = profile.meta;

    return getCallTree(invertedThread, interval, 'combined', true);
  }

  /**
   * Before creating a ProfileTree instance some timings are pre-computed.
   * This test ensures that these generated values are correct.
   */
  describe('computed counts and timings', function() {
    const profile = getProfileForInvertedCallTree();
    it('does', function() {
      expect(
        computeCallTreeCountsAndTimings(
          profile.threads[0],
          profile.meta.interval,
          false
        )
      ).toEqual({
        rootCount: 1,
        rootTotalTime: 3,
        stackChildCount: [1, 2, 2, 1, 0, 1, 1, 0, 1, 1, 0],
        stackTimes: {
          selfTime: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
          totalTime: [3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1],
        },
      });
    });
  });

  /**
   * Explicitly test the structure of the inverted call tree.
   */
  describe('computed structure', function() {
    const callTree = getInvertedCallTreeFromProfile();

    /**
     * Assert this tree form for each node.
     *
     *     E:1,1         Z:2,2
     *       |             |
     *       v             v
     *     D:1,0         Y:2,0
     *       |             |
     *       v             v
     *     C:1,0         X:2,0
     *       |          /    \
     *       v         v      v
     *     B:1,0    B:1,0    C:1,0
     *       |        |        |
     *       v        v        v
     *     A:1,0    A:1,0    B:1,0
     *                         |
     *                         v
     *                       A:1,0
     *
     *      ^         ^         ^
     *      |         |         |
     *      L         M         R   <- Label the branches. (left, middle, right)
     */

    describe('roots', function() {
      it('has the roots Z and E', function() {
        expect(callTree.getRoots()).toEqual([stackZ_branchRM, stackE_branchL]);
      });
    });

    // Go from root to tip of branch L
    describe('branch L - intermediate node E', function() {
      _assertNode(callTree, stackE_branchL, {
        children: [stackD_branchL],
        parent: null,
        selfTime: 1,
        totalTime: 1,
      });
    });
    describe('branch L - intermediate node D', function() {
      _assertNode(callTree, stackD_branchL, {
        children: [stackC_branchL],
        parent: stackE_branchL,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch L - intermediate node C', function() {
      _assertNode(callTree, stackC_branchL, {
        children: [stackB_branchL],
        parent: stackD_branchL,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch L - intermediate node B', function() {
      _assertNode(callTree, stackB_branchL, {
        children: [stackA_branchL],
        parent: stackC_branchL,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch L - intermediate node B', function() {
      _assertNode(callTree, stackB_branchL, {
        children: [stackA_branchL],
        parent: stackC_branchL,
        selfTime: 0,
        totalTime: 1,
      });
    });

    // Go from root to tip of branch M
    describe('branch RM - root node Z', function() {
      _assertNode(callTree, stackZ_branchRM, {
        children: [stackY_branchRM],
        parent: null,
        selfTime: 2,
        totalTime: 2,
      });
    });
    describe('branch RM - intermediate node Y', function() {
      _assertNode(callTree, stackY_branchRM, {
        children: [stackX_branchRM],
        parent: stackZ_branchRM,
        selfTime: 0,
        totalTime: 2,
      });
    });
    describe('branch RM - branching node X', function() {
      _assertNode(callTree, stackX_branchRM, {
        children: [stackB_branchR, stackC_branchR],
        parent: stackY_branchRM,
        selfTime: 0,
        totalTime: 2,
      });
    });
    describe('branch M - intermediate node B', function() {
      _assertNode(callTree, stackB_branchM, {
        children: [stackA_branchM],
        parent: stackX_branchRM,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch M - intermediate node A', function() {
      _assertNode(callTree, stackA_branchM, {
        children: [],
        parent: stackB_branchM,
        selfTime: 0,
        totalTime: 1,
      });
    });

    // Go back down to branch R branching point
    describe('branch R - intermediate node C', function() {
      _assertNode(callTree, stackC_branchR, {
        children: [stackB_branchR],
        parent: stackX_branchRM,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch R - intermediate node B', function() {
      _assertNode(callTree, stackB_branchR, {
        children: [stackA_branchR],
        parent: stackC_branchR,
        selfTime: 0,
        totalTime: 1,
      });
    });
    describe('branch R - intermediate node A', function() {
      _assertNode(callTree, stackA_branchR, {
        children: [],
        parent: stackB_branchR,
        selfTime: 0,
        totalTime: 1,
      });
    });
  });
});

/**
 * This is a simpler interface to make verbose assertions against a call tree
 * node, so that the error messages are nice and helpful for when things fail.
 */
function _assertNode(
  callTree: ProfileTreeClass,
  stackIndex: IndexIntoStackTable,
  expected: {
    children: IndexIntoStackTable[],
    parent: IndexIntoStackTable | null,
    selfTime: number,
    totalTime: number,
  }
) {
  // Transform any StackIndexes into ProfileTree nodes.
  const getNode = (stackIndex: IndexIntoStackTable | null) =>
    stackIndex === null ? null : callTree.getNode(stackIndex);

  const children = callTree.getChildren(stackIndex).map(getNode);
  const parent = getNode(callTree.getParent(stackIndex));
  const node = getNode(stackIndex);
  const expectedParent = getNode(expected.parent);
  const expectedChildren = expected.children.map(getNode);
  if (!node) {
    throw new Error('Could not find a node');
  }
  const { selfTime, totalTime } = node;

  it('has the correct number of children', function() {
    expect(children.length).toBe(expectedChildren.length);
  });
  it('has the expected children', function() {
    expect(children).toEqual(expectedChildren);
  });
  it('has the expected parent', function() {
    expect(parent).toBe(expectedParent);
  });
  it('has the expected self time', function() {
    expect(selfTime).toBe(`${expected.selfTime.toFixed(1)}ms`);
  });
  it('has the expected total time', function() {
    expect(totalTime).toBe(`${expected.totalTime.toFixed(1)}ms`);
  });
}
