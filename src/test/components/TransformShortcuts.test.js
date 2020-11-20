/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { changeSelectedCallNode } from '../../actions/profile-view';
import { FlameGraph } from '../../components/flame-graph';
import { selectedThreadSelectors } from 'firefox-profiler/selectors';
import { ensureExists } from '../../utils/flow';
import { fireFullKeyPress } from '../fixtures/utils';
import { ProfileCallTreeView } from '../../components/calltree/ProfileCallTreeView';
import type { TransformType } from 'firefox-profiler/types';

type KeyPressOptions = { key: string, ... };

type TestSetup = {|
  getTransformType: () => null | TransformType,
  pressKey: (options: KeyPressOptions) => void,
|};

function testTransformKeyboardShortcuts(setup: () => TestSetup) {
  it('handles merge function', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'm' });
    expect(getTransformType()).toEqual('merge-function');
  });

  it('handles focus subtree', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'F' });
    expect(getTransformType()).toEqual('focus-subtree');
  });

  it('handles focus-function', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'f' });
    expect(getTransformType()).toEqual('focus-function');
  });

  it('handles merge call node', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'M' });
    expect(getTransformType()).toEqual('merge-call-node');
  });

  it('handles drop function', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'd' });
    expect(getTransformType()).toEqual('drop-function');
  });

  it('handles collapse resource', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'C' });
    expect(getTransformType()).toEqual('collapse-resource');
  });

  it('handles collapse direct recursion', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'r' });
    expect(getTransformType()).toEqual('collapse-direct-recursion');
  });

  it('handles collapse function subtree', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'c' });
    expect(getTransformType()).toEqual('collapse-function-subtree');
  });

  it('ignores shortcuts with modifiers', () => {
    const { pressKey, getTransformType } = setup();
    pressKey({ key: 'c', ctrlKey: true });
    pressKey({ key: 'c', metaKey: true });
    expect(getTransformType()).toEqual(null);
  });
}

describe('flame graph transform shortcuts', () => {
  testTransformKeyboardShortcuts(() => {
    const {
      profile,
      funcNamesDictPerThread: [{ A, B }],
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
    const { getState, dispatch } = store;

    dispatch(changeSelectedCallNode(0, [A, B]));

    const { container } = render(
      <Provider store={store}>
        <FlameGraph />
      </Provider>
    );

    return {
      getTransformType: () => {
        const stack = selectedThreadSelectors.getTransformStack(getState());
        switch (stack.length) {
          case 0:
            return null;
          case 1:
            return stack[0].type;
          default:
            throw new Error('This test assumes there is only one transform.');
        }
      },
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      pressKey: (options: KeyPressOptions) => {
        const div = ensureExists(
          container.querySelector('.flameGraphContent'),
          `Couldn't find the content div with selector .flameGraphContent`
        );
        fireFullKeyPress(div, options);
      },
    };
  });
});

describe('CallTree transform shortcuts', () => {
  testTransformKeyboardShortcuts(() => {
    const {
      profile,
      funcNamesDictPerThread: [{ A, B }],
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
    const { getState, dispatch } = store;

    dispatch(changeSelectedCallNode(0, [A, B]));

    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    return {
      getTransformType: () => {
        const stack = selectedThreadSelectors.getTransformStack(getState());
        switch (stack.length) {
          case 0:
            return null;
          case 1:
            return stack[0].type;
          default:
            throw new Error('This test assumes there is only one transform.');
        }
      },
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      pressKey: (options: KeyPressOptions) => {
        const treeViewBody = ensureExists(
          container.querySelector('div.treeViewBody'),
          `Couldn't find the tree view body with selector div.treeViewBody`
        );
        fireFullKeyPress(treeViewBody, options);
      },
    };
  });
});
