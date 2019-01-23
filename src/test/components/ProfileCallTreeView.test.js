/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from 'react-testing-library';

import ProfileCallTreeView from '../../components/calltree/ProfileCallTreeView';
import { ensureExists } from '../../utils/flow';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeCallTreeSearchString,
  changeImplementationFilter,
  changeInvertCallstack,
  commitRange,
} from '../../actions/profile-view';
import { mockPrototype } from '../fixtures/mocks/prototype';

describe('calltree/ProfileCallTreeView', function() {
  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  E
  `);

  beforeEach(() => {
    // Mock out the 2d canvas for the loupe view.
    mockPrototype(HTMLCanvasElement.prototype, 'getContext', () =>
      mockCanvasContext()
    );
  });

  it('renders an unfiltered call tree', () => {
    const { container } = render(
      <Provider store={storeWithProfile(profile)}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders an inverted call tree', () => {
    const profileForInvertedTree = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  X  C
      D  Y  X
      E  Z  Y
            Z
    `).profile;
    const store = storeWithProfile(profileForInvertedTree);
    store.dispatch(changeInvertCallstack(true));

    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders call tree with some search strings', () => {
    const store = storeWithProfile(profile);
    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C'));
    expect(container.firstChild).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C,'));
    expect(container.firstChild).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C, F'));
    expect(container.firstChild).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString('C, F,E'));
    expect(container.firstChild).toMatchSnapshot();

    store.dispatch(changeCallTreeSearchString(' C , E   '));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('computes a width for a call tree of a really deep stack', () => {
    const { profile } = getProfileFromTextSamples(
      Array(113)
        .fill('name')
        .join('\n')
    );
    const store = storeWithProfile(profile);
    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('calltree/ProfileCallTreeView EmptyReasons', function() {
  beforeEach(() => {
    // Mock out the 2d canvas for the loupe view.
    mockPrototype(HTMLCanvasElement.prototype, 'getContext', () =>
      mockCanvasContext()
    );
  });

  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  E
  `);
  profile.threads[0].name = 'Thread with samples';

  function renderWithStore(store) {
    return render(
      <Provider store={store}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    ).container.firstChild;
  }

  it('shows a reason for a call tree with no samples', function() {
    const profile = getEmptyProfile();
    const thread = getEmptyThread();
    thread.name = 'Empty Thread';
    profile.threads.push(thread);

    const store = storeWithProfile(profile);
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for being out of range of a threads samples', function() {
    const store = storeWithProfile(profile);
    store.dispatch(commitRange(5, 10));
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for when samples are completely filtered out', function() {
    const store = storeWithProfile(profile);
    store.dispatch(changeImplementationFilter('js'));
    expect(renderWithStore(store)).toMatchSnapshot();
  });
});

describe('calltree/ProfileCallTreeView navigation keys', () => {
  function setup(profileString: string, expectedRowsLength: number) {
    // Mock out the 2d canvas for the loupe view.
    mockPrototype(HTMLCanvasElement.prototype, 'getContext', () =>
      mockCanvasContext()
    );

    // This makes the bounding box large enough so that we don't trigger
    // VirtualList's virtualization. We assert this above.
    mockPrototype(HTMLElement.prototype, 'getBoundingClientRect', () =>
      getBoundingBox(1000, 2000)
    );

    const { profile } = getProfileFromTextSamples(profileString);
    const store = storeWithProfile(profile);
    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView hideThreadActivityGraph={true} />
      </Provider>
    );

    // Assert that we used a large enough bounding box to include all children.
    const renderedRows = container.querySelectorAll(
      '.treeViewRow.treeViewRowScrolledColumns'
    );
    expect(renderedRows.length).toBe(expectedRowsLength);

    return {
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      simulateKey: (param: string | { key: string }) => {
        const treeViewBody = ensureExists(
          container.querySelector('div.treeViewBody'),
          `Couldn't find the tree view body with selector div.treeViewBody`
        );
        fireEvent.keyDown(
          treeViewBody,
          // There's a shortcoming in either Flow or the flow type for the
          // `keyDown` method. $FlowExpectError
          param.key ? param : { key: param }
        );
      },
      selectedText: () =>
        ensureExists(
          container.querySelector('.treeViewRowScrolledColumns.selected'),
          `Couldn't find the selected column with selector .treeViewRowScrolledColumns.selected`
        ).textContent,
    };
  }

  it('reacts properly to up/down navigation keys', () => {
    // This generates a profile where function "name<i + 1>" is present
    // <length - i> times, which means it will have a self time of <length - i>
    // ms. This is a good way to control the order we'll get in the call tree
    // view: function "name1" will be first, etc.
    const profileString = Array.from({ length: 100 }).reduce(
      (result, func, i, array) => {
        const funcName = `name${i + 1}  `;
        result += funcName.repeat(array.length - i);
        return result;
      },
      ''
    );

    const { simulateKey, selectedText } = setup(profileString, 100);

    expect(selectedText()).toBe('name1');
    simulateKey('ArrowDown');
    expect(selectedText()).toBe('name2');
    simulateKey('PageDown');
    expect(selectedText()).toBe('name17'); // 15 rows below
    simulateKey('End');
    expect(selectedText()).toBe('name100');
    simulateKey('ArrowUp');
    expect(selectedText()).toBe('name99');
    simulateKey('PageUp');
    expect(selectedText()).toBe('name84'); // 15 rows above
    simulateKey('Home');
    expect(selectedText()).toBe('name1');

    // These are MacOS shortcuts.
    simulateKey({ key: 'ArrowDown', metaKey: true });
    expect(selectedText()).toBe('name100');
    simulateKey({ key: 'ArrowUp', metaKey: true });
    expect(selectedText()).toBe('name1');
  });
});
