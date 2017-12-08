/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import {
  getCallTree,
  computeCallTreeCountsAndTimings,
  CallTree,
} from '../../profile-logic/call-tree';
import {
  getCallNodeInfo,
  invertCallstack,
  getCallNodeFromPath,
} from '../../profile-logic/profile-data';
import { formatTree } from '../fixtures/utils';

import type { Profile } from '../../types/profile';

describe('unfiltered call tree', function() {
  // These values are hoisted at the top for the ease of access. In the profile fixture
  // for the unfiltered call tree, the indexes for funcs, frames, stacks, and callNodes
  // all happen to share the same indexes as there is a 1 to 1 relationship between them.
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const E = 4;
  const F = 5;
  const G = 6;
  const H = 7;
  const I = 8;

  function getProfile() {
    return getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `).profile;
  }

  function callTreeFromProfile(profile: Profile): CallTree {
    const [thread] = profile.threads;
    const { interval } = profile.meta;
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );
    return getCallTree(thread, interval, callNodeInfo, 'combined', false);
  }

  /**
   * Before creating a CallTree instance some timings are pre-computed.
   * This test ensures that these generated values are correct.
   */
  describe('computed counts and timings', function() {
    const profile = getProfile();
    const [thread] = profile.threads;
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );

    it('does', function() {
      expect(
        computeCallTreeCountsAndTimings(
          thread,
          callNodeInfo,
          profile.meta.interval,
          false
        )
      ).toEqual({
        rootCount: 1,
        rootTotalTime: 3,
        callNodeChildCount: new Uint32Array([1, 2, 2, 1, 0, 1, 0, 1, 0]),
        callNodeTimes: {
          selfTime: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1]),
          totalTime: new Float32Array([3, 3, 2, 1, 1, 1, 1, 1, 1]),
        },
      });
    });
  });

  /**
   * Explicitly test the structure of the unfiltered call tree.
   */
  describe('computed structure', function() {
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
    const { profile } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `);
    const callTree = callTreeFromProfile(profile);
    it('computes an unfiltered call tree', function() {
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });

  /**
   * These tests provides coverage for every method of the CallTree. It's less about
   * correct tree structure, and more of simple assertions about how the interface
   * is supposed to behave. There is probably duplication of coverage with other tests.
   */
  describe('CallTree methods', function() {
    const { profile } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `);
    const callTree = callTreeFromProfile(profile);

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
      it("finds a callNode's parent", function() {
        expect(callTree.getParent(A)).toBe(-1);
        expect(callTree.getParent(B)).toBe(A);
      });
    });

    describe('getDepth()', function() {
      it('returns the depth of callNodes in the tree', function() {
        expect(callTree.getDepth(A)).toBe(0);
        expect(callTree.getDepth(B)).toBe(1);
      });
    });

    describe('hasSameNodeIds()', function() {
      it('determines if the node IDs are the same between two trees', function() {
        // This is tested through strict equality, so re-generating callNodes is
        // the only thing this method expects.
        const otherTree = callTreeFromProfile(
          getProfileFromTextSamples('A').profile
        );
        expect(callTree.hasSameNodeIds(callTree)).toBe(true);
        expect(callTree.hasSameNodeIds(otherTree)).toBe(false);
      });
    });

    describe('getDisplayData()', function() {
      it('gets a node for a given callNodeIndex', function() {
        expect(callTree.getDisplayData(A)).toEqual({
          dim: false,
          icon: null,
          lib: '',
          name: 'A',
          selfTime: '—',
          totalTime: '3',
          totalTimePercent: '100%',
        });
      });
    });
  });

  /**
   * While not specifically part of the call tree, this is a core function
   * to help navigate stacks through a list of functions.
   */
  describe('getCallNodeFromPath', function() {
    const profile = getProfile();
    const [thread] = profile.threads;
    const { callNodeTable } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );

    // Helper to make the assertions a little less verbose.
    function checkStack(callNodePath, index, name) {
      it(`finds stack that ends in ${name}`, function() {
        expect(getCallNodeFromPath(callNodePath, callNodeTable)).toBe(index);
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
      expect(getCallNodeFromPath([A, B, C, D, E, F, G], callNodeTable)).toBe(
        null
      );
    });
  });
});

describe('inverted call tree', function() {
  /**
   * Explicitly test the structure of the inverted call tree.
   */
  describe('computed structure', function() {
    const profile = getProfileFromTextSamples(`
      A A A
      B B B
      C X C
      D Y X
      E Z Y
          Z
    `).profile;
    const invertedThread = invertCallstack(profile.threads[0]);
    const { interval } = profile.meta;
    const callNodeInfo = getCallNodeInfo(
      invertedThread.stackTable,
      invertedThread.frameTable,
      invertedThread.funcTable
    );

    const callTree = getCallTree(
      invertedThread,
      interval,
      callNodeInfo,
      'combined',
      true
    );

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
    it('computes an inverted call tree', function() {
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });
});
