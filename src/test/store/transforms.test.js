/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { formatTree } from '../fixtures/utils';
import { storeWithProfile } from '../fixtures/stores';
import {
  addTransformToStack,
  popTransformsFromStack,
  changeInvertCallstack,
  changeImplementationFilter,
  changeSelectedCallNode,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../reducers/profile-view';

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
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `);
    const { dispatch, getState } = storeWithProfile(profile);
    const originalCallTree = selectedThreadSelectors.getCallTree(getState());
    const threadIndex = 0;
    const A = funcNames.indexOf('A');
    const B = funcNames.indexOf('B');
    const C = funcNames.indexOf('C');

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
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A
      B B B
      C X C
      D Y X
      E Z Y
          Z
    `);
    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(changeInvertCallstack(true));

    it('starts as an inverted call tree', function() {
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });

    it('can be filtered to a subtree', function() {
      const threadIndex = 0;
      const X = funcNames.indexOf('X');
      const Y = funcNames.indexOf('Y');
      const Z = funcNames.indexOf('Z');

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
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `);
    const { dispatch, getState } = storeWithProfile(profile);
    const originalCallTree = selectedThreadSelectors.getCallTree(getState());
    const threadIndex = 0;
    const A = funcNames.indexOf('A');
    const B = funcNames.indexOf('B');
    const C = funcNames.indexOf('C');

    it('starts as an unfiltered call tree', function() {
      expect(formatTree(originalCallTree)).toMatchSnapshot();
    });

    it('call node [A, B, C] can be merged into [A, B]', function() {
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: [A, B, C],
          implementation: 'combined',
        })
      );
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });

  describe('on a JS call tree', function() {
    const { profile, funcNames } = getProfileFromTextSamples(`
      JS::RunScript.cpp  JS::RunScript.cpp       JS::RunScript.cpp
      onLoad.js          onLoad.js               onLoad.js
      a.js               js::jit::IonCannon.cpp  js::jit::IonCannon.cpp
      b.js               a.js                    a.js
                         b.js                    b.js
    `);
    const threadIndex = 0;

    // funcIndexes in the profile fixture.
    const RUN_SCRIPT = funcNames.indexOf('JS::RunScript.cpp');
    const ON_LOAD = funcNames.indexOf('onLoad.js');
    const A = funcNames.indexOf('a.js');

    const mergeJSPathAB = {
      type: 'merge-call-node',
      callNodePath: [ON_LOAD, A],
      implementation: 'js',
    };

    const mergeCombinedPathToA = {
      type: 'merge-call-node',
      callNodePath: [RUN_SCRIPT, ON_LOAD, A],
      implementation: 'combined',
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
  });
});

describe('"merge-function" transform', function() {
  describe('on a call tree', function() {
    /**
     * Assert this transformation:
     *
     *                     A:3,0                              A:3,0
     *                       |                                  |
     *                       v              merge C             v
     *                     B:3,0           -->                B:3,0
     *                     /    \                           /   |   \
     *                    v      v                         v    v    v
     *                C:2,0     H:1,0                 D:1,0   F:1,0   H:1,1
     *               /      \         \                 |       |
     *              v        v         v                v       v
     *            D:1,0     F:1,0     C:1,1           E:1,1   G:1,1
     *            |           |
     *            v           v
     *          E:1,1       G:1,1
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F C
      E G
    `);
    const threadIndex = 0;
    const C = funcNames.indexOf('C');

    const { dispatch, getState } = storeWithProfile(profile);
    const originalCallTree = selectedThreadSelectors.getCallTree(getState());

    it('starts as an unfiltered call tree', function() {
      expect(formatTree(originalCallTree)).toMatchSnapshot();
    });

    it('function C can be merged into callers', function() {
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'merge-function',
          funcIndex: C,
        })
      );
      const callTree = selectedThreadSelectors.getCallTree(getState());
      expect(formatTree(callTree)).toMatchSnapshot();
    });
  });
});

describe('"focus-function" transform', function() {
  describe('on a call tree', function() {
    /**
     * Assert this transformation:
     *
     *            A:3,0                        X:3,0
     *            /    \                         |
     *           v      v        Focus X         v
     *      X:1,0      B:2,0       ->          Y:3,0
     *        |          |                    /     \
     *        v          v                   v       v
     *      Y:1,0      X:2,0              C:1,1      X:2,0
     *        |          |                             |
     *        v          v                             v
     *      C:1,1      Y:2,0                         Y:2,0
     *                   |                             |
     *                   v                             v
     *                 X:2,0                         D:2,2
     *                   |
     *                   v
     *                 Y:2,0
     *                   |
     *                   v
     *                 D:2,2
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A
      X B B
      Y X X
      C Y Y
        X X
        Y Y
        D D
    `);

    const threadIndex = 0;
    const X = funcNames.indexOf('X');

    it('starts as an unfiltered call tree', function() {
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can be focused on a function', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(
        addTransformToStack(threadIndex, {
          type: 'focus-function',
          funcIndex: X,
        })
      );
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });
  });
});

describe('"collapse-resource" transform', function() {
  describe('combined implementation', function() {
    /**
     *               A                                   A
     *             /   \                                 |
     *            v     v        Collapse firefox        v
     *    B:firefox    E:firefox       ->             firefox
     *        |            |                         /       \
     *        v            v                        D        F
     *    C:firefox        F
     *        |
     *        v
     *        D
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A          A
      B:firefox  E:firefox
      C:firefox  F
      D
    `);
    const collapsedFuncNames = [...funcNames, 'firefox'];
    const threadIndex = 0;
    const thread = profile.threads[threadIndex];
    const firefoxNameIndex = thread.stringTable.indexForString('firefox');
    const firefoxResourceIndex = thread.resourceTable.name.findIndex(
      stringIndex => stringIndex === firefoxNameIndex
    );
    if (firefoxResourceIndex === -1) {
      throw new Error('Unable to find the firefox resource');
    }
    const collapseTransform = {
      type: 'collapse-resource',
      resourceIndex: firefoxResourceIndex,
      collapsedFuncIndex: thread.funcTable.length,
      implementation: 'combined',
    };

    it('starts as an unfiltered call tree', function() {
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can collapse the "firefox" library', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(addTransformToStack(threadIndex, collapseTransform));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can update apply the transform to the selected CallNodePaths', function() {
      // This transform requires a valid thread, unlike many of the others.
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(
        changeSelectedCallNode(
          threadIndex,
          ['A', 'B:firefox', 'C:firefox', 'D'].map(name =>
            collapsedFuncNames.indexOf(name)
          )
        )
      );
      dispatch(addTransformToStack(threadIndex, collapseTransform));
      expect(
        selectedThreadSelectors.getSelectedCallNodePath(getState())
      ).toEqual(
        ['A', 'firefox', 'D'].map(name => collapsedFuncNames.indexOf(name))
      );
    });
  });

  describe('specific implementation', function() {
    /**
     *                A.js                                       A.js
     *              /     \                                        |
     *             v       v               Collapse firefox        v
     *   B.cpp:firefox    H.cpp:firefox         ->              firefox
     *        |                 |                                  |
     *        v                 v                                  v
     *       C.js              I.js                              F.cpp
     *        |                                                    |
     *        v                                                    v
     *   D.cpp:firefox                                           G.js
     *        |
     *        v
     *       E.js
     *        |
     *        v
     *      F.cpp
     *        |
     *        v
     *      G.js
     *
     * This behavior may seem a bit surprising, but any stack that doesn't match the
     * current implementation AND has a callee that is collapsed, will itself be collapsed.
     * It may be obvious to collapse C.js in this case, as it's between two different
     * firefox library stacks, but E.js and I.js will be collapsed as well. The only
     * retained leaf "js" stack is G.js, because it follows a non-collapsed "cpp" stack.
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A.js           A.js
      B.cpp:firefox  H.cpp:firefox
      C.js           I.js
      D.cpp:firefox
      E.js
      F.cpp
      G.js
    `);
    const collapsedFuncNames = [...funcNames, 'firefox'];
    const threadIndex = 0;
    const thread = profile.threads[threadIndex];
    const firefoxNameIndex = thread.stringTable.indexForString('firefox');
    const firefoxResourceIndex = thread.resourceTable.name.findIndex(
      stringIndex => stringIndex === firefoxNameIndex
    );
    if (firefoxResourceIndex === -1) {
      throw new Error('Unable to find the firefox resource');
    }
    const collapseTransform = {
      type: 'collapse-resource',
      resourceIndex: firefoxResourceIndex,
      collapsedFuncIndex: thread.funcTable.length,
      implementation: 'cpp',
    };

    it('starts as an unfiltered call tree', function() {
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can collapse the "firefox" library as well as the C.js intermediate function', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(
        // Note the 'cpp' implementation filter.
        addTransformToStack(threadIndex, collapseTransform)
      );
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can update apply the transform to the selected CallNodePaths', function() {
      // This transform requires a valid thread, unlike many of the others.
      const { dispatch, getState } = storeWithProfile(profile);

      dispatch(
        changeSelectedCallNode(
          threadIndex,
          ['B.cpp:firefox', 'D.cpp:firefox'].map(name =>
            collapsedFuncNames.indexOf(name)
          )
        )
      );
      dispatch(changeImplementationFilter('cpp'));
      dispatch(addTransformToStack(threadIndex, collapseTransform));
      expect(
        selectedThreadSelectors.getSelectedCallNodePath(getState())
      ).toEqual(['firefox'].map(name => collapsedFuncNames.indexOf(name)));
    });
  });
});

describe('"collapse-direct-recursion" transform', function() {
  describe('combined implementation', function() {
    /**
     *              A    Collapse direct recursion     A
     *            ↙   ↘            Func B            ↙   ↘
     *          B       F            ->             B     F
     *        ↙   ↘                              ↙  ↓  ↘
     *       B     E                            C   D   E
     *     ↙   ↘
     *    B     D
     *    ↓
     *    C
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A A A A
      B B B F
      B B E
      B D
      C
    `);
    const B = funcNames.indexOf('B');
    const threadIndex = 0;
    const collapseDirectRecursion = {
      type: 'collapse-direct-recursion',
      funcIndex: B,
      implementation: 'combined',
    };

    it('starts as an unfiltered call tree', function() {
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can collapse the B function', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(addTransformToStack(threadIndex, collapseDirectRecursion));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can update apply the transform to the selected CallNodePaths', function() {
      // This transform requires a valid thread, unlike many of the others.
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(
        changeSelectedCallNode(
          threadIndex,
          ['A', 'B', 'B', 'B', 'C'].map(name => funcNames.indexOf(name))
        )
      );
      dispatch(addTransformToStack(threadIndex, collapseDirectRecursion));
      expect(
        selectedThreadSelectors.getSelectedCallNodePath(getState())
      ).toEqual(['A', 'B', 'C'].map(name => funcNames.indexOf(name)));
    });
  });

  describe('filtered implementation', function() {
    /**
     *                   A.js      Collapse direct recursion        A.js
     *                 ↙     ↘             Func B.js              ↙     ↘
     *               B.js     G.js            ->               B.js      G.js
     *             ↙    ↘                                    ↙   ↓   ↘
     *         B.js      F.js                            D.js   E.js   F.js
     *          ↓
     *        C.cpp
     *        ↙     ↘
     *    B.js       E.js
     *     ↓
     *    D.js
     */
    const { profile, funcNames } = getProfileFromTextSamples(`
      A.js   A.js   A.js   A.js   A.js
      B.js   B.js   B.js   B.js   G.js
      B.js   B.js   B.js   F.js
      C.cpp  C.cpp  C.cpp
      B.js   E.js
      D.js
    `);
    // Notice in the above fixture how `C.cpp` is actually a leaf stack for the third
    // sample. This stack still gets collapsed, along with any stack that follows
    // a recursion collapse.
    const B = funcNames.indexOf('B.js');
    const threadIndex = 0;
    const collapseDirectRecursion = {
      type: 'collapse-direct-recursion',
      funcIndex: B,
      implementation: 'js',
    };

    it('starts as an unfiltered call tree', function() {
      const { getState } = storeWithProfile(profile);
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });

    it('can collapse the B function', function() {
      const { dispatch, getState } = storeWithProfile(profile);
      dispatch(addTransformToStack(threadIndex, collapseDirectRecursion));
      expect(
        formatTree(selectedThreadSelectors.getCallTree(getState()))
      ).toMatchSnapshot();
    });
  });
});

describe('expanded and selected CallNodePaths', function() {
  const { profile, funcNames } = getProfileFromTextSamples(`
    A
    B
    C
    D
    E
  `);

  const threadIndex = 0;
  const A = funcNames.indexOf('A');
  const B = funcNames.indexOf('B');
  const C = funcNames.indexOf('C');
  const D = funcNames.indexOf('D');
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
  const { profile, funcNames } = getProfileFromTextSamples(`
    A
    B
    X
    Y
    Z
  `);

  const threadIndex = 0;
  const B = funcNames.indexOf('B');
  const X = funcNames.indexOf('X');
  const Y = funcNames.indexOf('Y');
  const Z = funcNames.indexOf('Z');

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
