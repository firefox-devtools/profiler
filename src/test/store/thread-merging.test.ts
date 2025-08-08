/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  selectedThreadSelectors,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors';
import {
  changeSelectedThreads,
  addTransformToStack,
  changeSelectedCallNode,
} from 'firefox-profiler/actions/profile-view';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { formatTree } from '../fixtures/utils';
import type { CallNodePath } from 'firefox-profiler/types';

describe('thread merging', function () {
  function setup() {
    const {
      profile,
      // Select the second func dictionary, as it will contain all the funcs in the
      // same order as the merged thread, which is laid out alphabetically.
      funcNamesDictPerThread: [, func],
    } = getProfileFromTextSamples(
      `
        A  A  A  A
        B  B  B  B
        C  C  C  C
              D  D
      `,
      `
        A  A  F  F
        B  B  G  G
        C  C
        D  D
        E  E
      `
    );
    const store = storeWithProfile(profile);
    return { ...store, func };
  }

  it('can merge threads when multiple threads are selected', function () {
    const { dispatch, getState } = setup();
    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 4, self: —)',
        '  - B (total: 4, self: —)',
        '    - C (total: 4, self: 2)',
        '      - D (total: 2, self: 2)',
      ]
    );

    dispatch(changeSelectedThreads(new Set([0, 1])));

    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 6, self: —)',
        '  - B (total: 6, self: —)',
        '    - C (total: 6, self: 2)',
        '      - D (total: 4, self: 2)',
        '        - E (total: 2, self: 2)',
        '- F (total: 2, self: —)',
        '  - G (total: 2, self: 2)',
      ]
    );
  });

  it('can use thread keys for transforms', function () {
    const { dispatch, getState, func } = setup();
    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 4, self: —)',
        '  - B (total: 4, self: —)',
        '    - C (total: 4, self: 2)',
        '      - D (total: 2, self: 2)',
      ]
    );

    // Apply a transform:
    dispatch(
      addTransformToStack(0, {
        type: 'merge-function',
        funcIndex: func.B,
      })
    );

    // Verify the call tree is modified.
    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 4, self: —)',
        '  - C (total: 4, self: 2)',
        '    - D (total: 2, self: 2)',
      ]
    );

    // Now select multiple threads
    dispatch(changeSelectedThreads(new Set([0, 1])));

    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 6, self: —)',
        '  - B (total: 6, self: —)',
        '    - C (total: 6, self: 2)',
        '      - D (total: 4, self: 2)',
        '        - E (total: 2, self: 2)',
        '- F (total: 2, self: —)',
        '  - G (total: 2, self: 2)',
      ]
    );

    dispatch(
      addTransformToStack(getSelectedThreadsKey(getState()), {
        type: 'merge-function',
        funcIndex: func.C,
      })
    );

    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 6, self: —)',
        '  - B (total: 6, self: 2)',
        '    - D (total: 4, self: 2)',
        '      - E (total: 2, self: 2)',
        '- F (total: 2, self: —)',
        '  - G (total: 2, self: 2)',
      ]
    );

    dispatch(changeSelectedThreads(new Set([0])));

    // It retains the old transform.
    expect(formatTree(selectedThreadSelectors.getCallTree(getState()))).toEqual(
      [
        '- A (total: 4, self: —)',
        '  - C (total: 4, self: 2)',
        '    - D (total: 2, self: 2)',
      ]
    );
  });

  it('respects the ThreadViewOptions by using a ThreadsKey, with selected call nodes', function () {
    const { dispatch, getState, func } = setup();

    // Some simple helpers to make this test more terse:
    const changePath = (path: CallNodePath) =>
      dispatch(changeSelectedCallNode(getSelectedThreadsKey(getState()), path));
    const getPath = () =>
      selectedThreadSelectors.getSelectedCallNodePath(getState());

    const singleThread = new Set([0]);
    const mergedThreads = new Set([0, 1]);

    const noPath: CallNodePath = [];
    const singlePath = [func.A, func.B];
    const mergedPath = [func.F, func.G];

    // Start by adding a path to the single thread.
    expect(getPath()).toEqual(noPath);
    changePath(singlePath);
    expect(getPath()).toEqual(singlePath);

    // Merge some threads.
    dispatch(changeSelectedThreads(mergedThreads));

    // Add a path to the merged threads.
    expect(getPath()).toEqual(noPath);
    changePath(mergedPath);
    expect(getPath()).toEqual(mergedPath);

    // Switch back to the single thread.
    dispatch(changeSelectedThreads(singleThread));
    expect(getPath()).toEqual(singlePath);

    // Then double check the merged thread.
    dispatch(changeSelectedThreads(mergedThreads));
    expect(getPath()).toEqual(mergedPath);
  });
});
