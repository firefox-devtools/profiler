/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { FlameGraph } from '../../components/flame-graph';
import { selectedThreadSelectors } from 'firefox-profiler/selectors';
import { ensureExists } from '../../utils/flow';
import { fireFullKeyPress } from '../fixtures/utils';
import { ProfileCallTreeView } from '../../components/calltree/ProfileCallTreeView';
import { StackChart } from 'firefox-profiler/components/stack-chart';
import type {
  Transform,
  CallNodePath,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
} from 'firefox-profiler/types';

type KeyPressOptions = { key: string, ... };

type TestSetup = {|
  getTransform: () => null | Transform,
  pressKey: (options: KeyPressOptions) => void,
  expectedCallNodePath: CallNodePath,
  // This should be expectedCallNodePath[expectedCallNodePath.length - 1], but this simplifies tests a bit.
  expectedFuncIndex: IndexIntoFuncTable,
  expectedResourceIndex: IndexIntoResourceTable,
|};

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

  it('handles collapse direct recursion', () => {
    const { pressKey, getTransform, expectedFuncIndex } = setup();
    pressKey({ key: 'r' });
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
function setupStore(childrenToRender) {
  const {
    profile,
    funcNamesDictPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A               A               A
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    B[lib:XUL]  B[lib:XUL]  B[lib:XUL]
    C               C               H
    D               F               I
    E               E
  `);
  const store = storeWithProfile(profile);
  const { getState } = store;

  render(<Provider store={store}>{childrenToRender}</Provider>);

  return {
    ...store,
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
const pressKeyBuilder = className => (options: KeyPressOptions) => {
  const div = ensureExists(
    document.querySelector('.' + className),
    `Couldn't find the content div with selector .${className}`
  );
  fireFullKeyPress(div, options);
};

describe('flame graph transform shortcuts', () => {
  testTransformKeyboardShortcuts(() => {
    const {
      dispatch,
      funcNames: { A, B },
      getTransform,
    } = setupStore(<FlameGraph />);

    dispatch(changeSelectedCallNode(0, [A, B]));

    return {
      getTransform,
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      pressKey: pressKeyBuilder('flameGraphContent'),
      expectedCallNodePath: [A, B],
      expectedFuncIndex: B,
      expectedResourceIndex: 0,
    };
  });
});

describe('CallTree transform shortcuts', () => {
  testTransformKeyboardShortcuts(() => {
    const {
      dispatch,
      funcNames: { A, B },
      getTransform,
    } = setupStore(<ProfileCallTreeView />);

    dispatch(changeSelectedCallNode(0, [A, B]));

    return {
      getTransform,
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      pressKey: pressKeyBuilder('treeViewBody'),
      expectedCallNodePath: [A, B],
      expectedFuncIndex: B,
      expectedResourceIndex: 0,
    };
  });
});

describe('stack chart transform shortcuts', () => {
  testTransformKeyboardShortcuts(() => {
    const {
      dispatch,
      funcNames: { A, B },
      getTransform,
    } = setupStore(<StackChart />);

    dispatch(changeSelectedCallNode(0, [A, B]));

    return {
      getTransform,
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      pressKey: pressKeyBuilder('stackChartContent'),
      expectedCallNodePath: [A, B],
      expectedFuncIndex: B,
      expectedResourceIndex: 0,
    };
  });
});
