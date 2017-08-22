/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  getProfileForUnfilteredCallTree,
  getProfileForInvertedCallTree,
  getProfileWithMixedJSImplementation,
} from '../fixtures/profiles/profiles-for-call-trees';

import { storeWithProfile } from '../fixtures/stores';
import {
  addTransformToStack,
  popTransformsFromStack,
  changeInvertCallstack,
  changeImplementationFilter,
  changeSelectedCallNode,
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

describe('"focus-subtree" transform', function() {
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

describe('"merge-call-node" transform', function() {
  describe('on a call tree', function() {
    /**
     * Assert this transformation:
     *
     *                     A:3,0                              A:3,0
     *                       |                                  |
     *                       v       Focus [A, B, C]            v
     *                     B:3,0           -->                B:3,0
     *                     /    \                           /   |   \
     *                    v      v                         v    v    v
     *                C:2,0     H:1,0                 D:1,0   F:1,0   I:1,1
     *               /      \         \                 |       |
     *              v        v         v                v       v
     *            D:1,0     F:1,0     I:1,1           E:1,1   G:1,1
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

    it('call node [A, B, C] can be merged into [A, B]', function() {
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: [A, B, C],
          implementation: 'combined',
          inverted: false,
        })
      );
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });

  describe('on a JS call tree', function() {
    const profile = getProfileWithMixedJSImplementation();
    const threadIndex = 0;

    // funcIndexes in the profile fixture.
    /* eslint-disable no-unused-vars */
    const RUN_SCRIPT = 0;
    const ON_LOAD = 1;
    const A = 2;
    const B = 3;
    const ION_CANNON = 4;
    /* eslint-enable no-unused-vars */

    const mergeJSPathAB = {
      type: 'merge-call-node',
      callNodePath: [ON_LOAD, A],
      implementation: 'js',
      inverted: false,
    };

    const mergeCombinedPathToA = {
      type: 'merge-call-node',
      callNodePath: [RUN_SCRIPT, ON_LOAD, A],
      implementation: 'combined',
      inverted: false,
    };

    it('starts as an untransformed call tree', function() {
      /**
       *     JS::RunScript
       *          ↓
       *        onLoad
       *      ↙       ↘
       *     a        js::jit::IonCannon
       *     ↓             ↓
       *     b             a
       *                   ↓
       *                   b
       */
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('has an untransformed JS only view', function() {
      /**
       *    onLoad
       *      ↓
       *      a
       *      ↓
       *      b
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeImplementationFilter('js'));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can merge the node at JS path "onLoad" -> "A"', function() {
      /**
       *    onLoad
       *      ↓
       *      b
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeImplementationFilter('js'));
      dispatch(addTransformToStack(threadIndex, mergeJSPathAB));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can merge the node at JS path "onLoad" -> "A" on an combined call tree', function() {
      /**
       *     JS::RunScript
       *          ↓
       *        onLoad
       *      ↙       ↘
       *     b        js::jit::IonCannon
       *                   ↓
       *                   b
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(addTransformToStack(threadIndex, mergeJSPathAB));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can merge a combined CallNodePath, and display a correct JS call tree', function() {
      /**
       *    onLoad
       *   ↙      ↘
       *  b        a
       *           ↓
       *           b
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeImplementationFilter('js'));
      dispatch(addTransformToStack(threadIndex, mergeCombinedPathToA));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('starts as an inverted call tree', function() {
      /**
       *                       b
       *                       ↓
       *                       a
       *                   ↙       ↘
       *  js::jit::IonCannon      onLoad
       *          ↓                 ↓
       *       onLoad          JS::RunScript
       *          ↓
       *    JS::RunScript
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeInvertCallstack(true));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can merge path [b, a, js::jit::IonCannon] on an inverted call tree', function() {
      /**
       *          b
       *          ↓
       *          a
       *          ↓
       *        onLoad
       *          ↓
       *    JS::RunScript
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeInvertCallstack(true));
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: [B, A, ION_CANNON],
          implementation: 'combined',
          inverted: true,
        })
      );

      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can merge path [b, a, onLoad] on an inverted JS call tree', function() {
      /**
       *                       b
       *                       ↓
       *                       a
       *                   ↙       ↘
       *  js::jit::IonCannon       JS::RunScript
       *           ↓
       *    JS::RunScript
       */
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(changeInvertCallstack(true));
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: [B, A, ON_LOAD],
          implementation: 'js',
          inverted: true,
        })
      );

      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });
  });
});

describe('expanded and selected CallNodePaths', function() {
  const profile = getProfileForUnfilteredCallTree();
  const threadIndex = 0;
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const selectedCallNodePath = [A, B, C, D];

  it('can select a path and expand the nodes to that path', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));
    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([A, B, C, D]);

    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [A],
      [A, B],
      [A, B, C],
    ]);
  });

  it('can update call node references for focusing a subtree', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeSelectedCallNode(threadIndex, [A, B, C, D]));
    dispatch(
      addTransformToStack(threadIndex, {
        type: 'focus-subtree',
        callNodePath: [A, B],
        implementation: 'combined',
        inverted: false,
      })
    );

    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([B, C, D]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [B],
      [B, C],
    ]);
  });

  it('can update call node references for merging a node', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeSelectedCallNode(threadIndex, [A, B, C, D]));
    dispatch(
      addTransformToStack(threadIndex, {
        type: 'merge-call-node',
        callNodePath: [A, B],
        implementation: 'combined',
        inverted: false,
      })
    );

    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([A, C, D]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [A],
      [A, C],
    ]);
  });
});

describe('expanded and selected CallNodePaths on inverted trees', function() {
  const profile = getProfileForUnfilteredCallTree();
  const threadIndex = 0;
  const B = 1;
  const X = 5;
  const Y = 6;
  const Z = 7;

  const selectedCallNodePath = [Z, Y, X, B];

  it('can select an inverted path and expand the nodes to that path', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeInvertCallstack(true));
    dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));

    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([Z, Y, X, B]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [Z],
      [Z, Y],
      [Z, Y, X],
    ]);
  });

  it('can update call node references for focusing a subtree', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));
    dispatch(changeInvertCallstack(true));
    dispatch(
      addTransformToStack(threadIndex, {
        type: 'focus-subtree',
        callNodePath: [Z, Y],
        implementation: 'combined',
        inverted: false,
      })
    );

    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([Y, X, B]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [Y],
      [Y, X],
    ]);
  });

  it('can update call node references for merging a call node', function() {
    const { dispatch, getState } = storeWithProfile(profile);
    // This opens expands the call nodes up to this point.
    dispatch(changeSelectedCallNode(threadIndex, selectedCallNodePath));
    dispatch(changeInvertCallstack(true));
    dispatch(
      addTransformToStack(threadIndex, {
        type: 'merge-call-node',
        callNodePath: [Z, Y],
        implementation: 'combined',
        inverted: false,
      })
    );

    expect(
      selectedThreadSelectors.getSelectedCallNodePath(getState())
    ).toEqual([Z, X, B]);
    expect(
      selectedThreadSelectors.getExpandedCallNodePaths(getState())
    ).toEqual([
      // Expanded nodes:
      [Z],
      [Z, X],
    ]);
  });
});
