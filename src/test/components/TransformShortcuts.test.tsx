/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import type { FuncNamesDict } from '../fixtures/profiles/processed-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
} from '../../actions/profile-view';
import { FlameGraph } from '../../components/flame-graph';
import { selectedThreadSelectors } from 'firefox-profiler/selectors';
import { ensureExists, objectEntries } from '../../utils/types';
import { fireFullKeyPress } from '../fixtures/utils';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { ProfileCallTreeView } from '../../components/calltree/ProfileCallTreeView';
import { StackChart } from 'firefox-profiler/components/stack-chart';
import type {
  Transform,
  CallNodePath,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoCategoryList,
  Store,
} from 'firefox-profiler/types';

type KeyPressOptions = { key: string; ctrlKey?: boolean; metaKey?: boolean };

type TestSetup = {
  getTransform: () => null | Transform;
  pressKey: (options: KeyPressOptions) => void;
  expectedCallNodePath: CallNodePath;
  // This should be expectedCallNodePath[expectedCallNodePath.length - 1], but this simplifies tests a bit.
  expectedFuncIndex: IndexIntoFuncTable;
  expectedResourceIndex: IndexIntoResourceTable;
  expectedCategory: IndexIntoCategoryList;
};

function testTransformKeyboardShortcuts(setup: () => TestSetup) {
  it('handles focus subtree', () => {
    const { pressKey, getTransform, expectedCallNodePath } = setup();
    pressKey({ key: 'F' });
    expect(getTransform()).toMatchObject({
      type: 'focus-subtree',
      callNodePath: expectedCallNodePath,
    });
  });

  it('handles focus-function', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'f' });
    expect(getTransform()).toEqual({
      type: 'focus-function',
      funcIndex: expectedFuncIndex,
    });
  });

  it('handles focus-category', () => {
    const { pressKey, getTransform, expectedCategory } = setup();
    pressKey({ key: 'g' });
    expect(getTransform()).toEqual({
      type: 'focus-category',
      category: expectedCategory,
    });
  });

  it('handles merge call node', () => {
    const { pressKey, getTransform, expectedCallNodePath } = setup();
    pressKey({ key: 'M' });
    expect(getTransform()).toMatchObject({
      type: 'merge-call-node',
      callNodePath: expectedCallNodePath,
    });
  });

  it('handles merge function', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'm' });
    const transform = getTransform();
    expect(transform).toEqual({
      type: 'merge-function',
      funcIndex: expectedFuncIndex,
    });
  });

  it('handles drop function', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'd' });
    expect(getTransform()).toEqual({
      type: 'drop-function',
      funcIndex: expectedFuncIndex,
    });
  });

  it('handles collapse resource', () => {
    const { pressKey, getTransform, expectedResourceIndex } = setup();
    pressKey({ key: 'C' });
    expect(getTransform()).toMatchObject({
      type: 'collapse-resource',
      resourceIndex: expectedResourceIndex,
    });
  });

  it('handles collapse recursion', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'r' });
    expect(getTransform()).toMatchObject({
      type: 'collapse-recursion',
      funcIndex: expectedFuncIndex,
    });
  });

  it('handles collapse direct recursion', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'R' });
    expect(getTransform()).toMatchObject({
      type: 'collapse-direct-recursion',
      funcIndex: expectedFuncIndex,
    });
  });

  it('handles collapse function subtree', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'c' });
    expect(getTransform()).toEqual({
      type: 'collapse-function-subtree',
      funcIndex: expectedFuncIndex,
    });
  });

  it('ignores shortcuts with modifiers', () => {
    const { pressKey, getTransform } = setup();
    pressKey({ key: 'c', ctrlKey: true });
    pressKey({ key: 'c', metaKey: true });
    expect(getTransform()).toEqual(null);
  });
}

// This is a generic setup that's used in all of our testcases.
function setupStore(childrenToRender: React.ReactNode) {
  const {
    profile,
    funcNamesDictPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A           A           A
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    C           C           H
    D           F           I
    E           E
  `);
  const store = storeWithProfile(profile);
  const { getState } = store;

  render(<Provider store={store}>{childrenToRender}</Provider>);

  return {
    store,
    funcNames,
    getTransform: () => {
      const stack = selectedThreadSelectors.getTransformStack(getState());
      switch (stack.length) {
        case 0:
          return null;
        case 1:
          return stack[0];
        default:
          throw new Error('This test assumes there is only one transform.');
      }
    },
  };
}

// This returns a function that makes it easy to simulate a keypress on a
// specific element identified by a class name.
const pressKeyBuilder = (className: string) => (options: KeyPressOptions) => {
  const div = ensureExists(
    document.querySelector('.' + className),
    `Couldn't find the content div with selector .${className}`
  ) as HTMLElement;
  fireFullKeyPress(div, options);
};

/* eslint-disable jest/no-standalone-expect */
// Disable the jest/no-standalone-expect rule because eslint doesn't know that
// these expectations will run in a test block later.
// These actions will be used to generate use cases for each of the supported panels.
const actions = {
  'a selected node': (
    { dispatch, getState }: Store,
    { A, B }: FuncNamesDict
  ) => {
    act(() => {
      dispatch(changeSelectedCallNode(0, [A, B]));
    });

    // We also check expectations after these dispatch, because if the node path
    // is invalid, we can have null values, which would give a useless test.
    expect(
      selectedThreadSelectors.getSelectedCallNodeIndex(getState())
    ).not.toBeNull();
    expect(
      selectedThreadSelectors.getRightClickedCallNodeIndex(getState())
    ).toBeNull();
  },
  'a right clicked node': (
    { dispatch, getState }: Store,
    { A, B }: FuncNamesDict
  ) => {
    act(() => {
      dispatch(changeSelectedCallNode(0, []));
    });
    act(() => {
      dispatch(changeRightClickedCallNode(0, [A, B]));
    });

    // We also check expectations after these dispatch, because if the node path
    // is invalid, we can have null values, which would give a useless test.
    expect(
      selectedThreadSelectors.getSelectedCallNodeIndex(getState())
    ).toBeNull();
    expect(
      selectedThreadSelectors.getRightClickedCallNodeIndex(getState())
    ).not.toBeNull();
  },
  'both a selected and a right clicked node': (
    { dispatch, getState }: Store,
    { A, B, H }: FuncNamesDict
  ) => {
    act(() => {
      dispatch(changeSelectedCallNode(0, [A, B, B, B, H]));
    });
    act(() => {
      dispatch(changeRightClickedCallNode(0, [A, B]));
    });

    // We also check expectations after these dispatch, because if the node path
    // is invalid, we can have null values, which would give a useless test.
    expect(
      selectedThreadSelectors.getSelectedCallNodeIndex(getState())
    ).not.toBeNull();
    expect(
      selectedThreadSelectors.getRightClickedCallNodeIndex(getState())
    ).not.toBeNull();
  },
};
/* eslint-enable jest/no-standalone-expect */

autoMockCanvasContext();

describe('flame graph transform shortcuts', () => {
  for (const [name, action] of objectEntries(actions)) {
    describe(`with ${name}`, () => {
      testTransformKeyboardShortcuts(() => {
        const { store, funcNames, getTransform } = setupStore(<FlameGraph />);

        const { A, B } = funcNames;
        action(store, funcNames);

        return {
          getTransform,
          // take either a key as a string, or a full event if we need more
          // information like modifier keys.
          pressKey: pressKeyBuilder('flameGraphContent'),
          expectedCallNodePath: [A, B],
          expectedFuncIndex: B,
          expectedResourceIndex: 0,
          expectedCategory: 0,
        };
      });
    });
  }
});

describe('CallTree transform shortcuts', () => {
  for (const [name, action] of objectEntries(actions)) {
    describe(`with ${name}`, () => {
      testTransformKeyboardShortcuts(() => {
        const { store, funcNames, getTransform } = setupStore(
          <ProfileCallTreeView />
        );

        const { A, B } = funcNames;
        action(store, funcNames);

        return {
          getTransform,
          // take either a key as a string, or a full event if we need more
          // information like modifier keys.
          pressKey: pressKeyBuilder('treeViewBody'),
          expectedCallNodePath: [A, B],
          expectedFuncIndex: B,
          expectedResourceIndex: 0,
          expectedCategory: 0,
        };
      });
    });
  }
});

describe('stack chart transform shortcuts', () => {
  for (const [name, action] of objectEntries(actions)) {
    describe(`with ${name}`, () => {
      testTransformKeyboardShortcuts(() => {
        const { store, funcNames, getTransform } = setupStore(<StackChart />);

        const { A, B } = funcNames;
        action(store, funcNames);

        return {
          getTransform,
          // take either a key as a string, or a full event if we need more
          // information like modifier keys.
          pressKey: pressKeyBuilder('stackChartContent'),
          expectedCallNodePath: [A, B],
          expectedFuncIndex: B,
          expectedResourceIndex: 0,
          expectedCategory: 0,
        };
      });
    });
  }
});
