/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  getProfileForUnfilteredCallTree,
  getProfileForInvertedCallTree,
} from '../fixtures/profiles/profiles-for-call-trees';
import { storeWithProfile } from '../fixtures/stores';
import {
  addTransformToStack,
  popTransformsFromStack,
  changeInvertCallstack,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { CallTree } from '../../profile-logic/call-tree';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';

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

describe('focus subtree transform', function() {
  describe('on a call tree', function() {
    /**
     * Assert this transformation:
     *
     *                     A:3,0                              C:2,0
     *                       |                               /      \
     *                       v       Focus [A, B, C]        v        v
     *                     B:3,0           -->           D:1,0     F:1,0
     *                     /    \                         |           |
     *                    v      v                        v           v
     *                C:2,0     H:1,0                   E:1,1       G:1,1
     *               /      \         \
     *              v        v         v
     *            D:1,0     F:1,0     I:1,1
     *            |           |
     *            v           v
     *          E:1,1       G:1,1
     */
    const profile = getProfileForUnfilteredCallTree();
    const { dispatch, getState } = storeWithProfile(profile);
    const originalCallTree = selectedThreadSelectors.getCallTree(getState());
    const threadIndex = 0;
    const A = 0;
    const B = 1;
    const C = 2;

    it('starts as an unfiltered call tree', function() {
      expect(formatTree(originalCallTree)).toMatchSnapshot();
    });

    it('can be filtered to a subtree', function() {
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'focus-subtree',
          callNodePath: [A, B, C],
          implementation: 'combined',
          inverted: false,
        })
      );
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });

    it('can remove the transform', function() {
      dispatch(popTransformsFromStack(threadIndex, 0));
      const callTree = selectedThreadSelectors.getCallTree(getState());
      const formattedTree = formatTree(callTree);
      expect(formattedTree).toMatchSnapshot();
      expect(formattedTree).toEqual(formatTree(originalCallTree));
    });
  });

  describe('on an inverted call tree', function() {
    /**
     *           1. Starting call tree         ->       2. Invert call tree        ->
     *
     *                  A:3,0                             Z:2,2         E:1,1
     *                    ↓                                 ↓             ↓
     *                  B:3,0                             Y:2,0         D:1,0
     *                 ↙     ↘                              ↓             ↓
     *             X:1,0     C:1,0                        X:2,0         C:1,0
     *            ↙         ↙      ↘                     ↙     ↘          ↓
     *         Y:1,0     X:1,0     D:1,0             B:1,0     C:1,0    B:1,0
     *           ↓         ↓         ↓                 ↓         ↓        ↓
     *        Z:1,1      Y:1,0     E:1,0             A:1,0     B:1,0    A:1,0
     *                     ↓                                     ↓
     *                   Z:1,1                                  A:1,0
     *
     *  --------------------------------------------------------------------------------
     *
     *   ->    3. Focus [Z, Y, X]      ->      4. Un-invert call tree
     *
     *                 X:2,2                           A:2,0
     *                ↙     ↘                            ↓
     *            B:1,0     C:1,0                      B:2,0
     *              ↓         ↓                       ↙     ↘
     *            A:1,0     B:1,0                 X:1,1     C:1,0
     *                        ↓                               ↓
     *                      A:1,0                           X:1,1
     */
    const profile = getProfileForInvertedCallTree();
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(changeInvertCallstack(true));

    it('starts as an inverted call tree', function() {
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });

    it('can be filtered to a subtree', function() {
      const threadIndex = 0;
      const X = 5;
      const Y = 6;
      const Z = 7;

      dispatch(
        addTransformToStack(threadIndex, {
          type: 'focus-subtree',
          callNodePath: [Z, Y, X],
          implementation: 'combined',
          inverted: true,
        })
      );
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });

    it('can be un-inverted and keep the transform', function() {
      dispatch(changeInvertCallstack(false));
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });
});
