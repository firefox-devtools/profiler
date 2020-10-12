/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from '@testing-library/react';
// This module is mocked.
import copy from 'copy-to-clipboard';

import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ProfileCallTreeView } from '../../components/calltree/ProfileCallTreeView';
import CallNodeContextMenu from '../../components/shared/CallNodeContextMenu';
import { processProfile } from '../../profile-logic/process-profile';
import { ensureExists } from '../../utils/flow';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  createSelectChanger,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import {
  getProfileFromTextSamples,
  getProfileWithJsAllocations,
  getProfileWithUnbalancedNativeAllocations,
  getProfileWithBalancedNativeAllocations,
} from '../fixtures/profiles/processed-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';

import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeCallTreeSearchString,
  changeImplementationFilter,
  changeInvertCallstack,
  commitRange,
  addTransformToStack,
} from '../../actions/profile-view';

import type { Profile } from 'firefox-profiler/types';

beforeEach(() => {
  // Mock out the 2d canvas for the loupe view.
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => mockCanvasContext());
  // This makes the bounding box large enough so that we don't trigger
  // VirtualList's virtualization. We assert this above.
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBox(1000, 2000));
});

describe('calltree/ProfileCallTreeView', function() {
  function setup(profile?: Profile) {
    if (!profile) {
      profile = getProfileFromTextSamples(`
        A  A  A
        B  B  B
        C  C  H[lib:libH.so]
        D  F  I
        E  E
      `).profile;
    }

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <>
          <CallNodeContextMenu />
          <ProfileCallTreeView />
        </>
      </Provider>
    );
    const { container, getByText } = renderResult;

    const getRowElement = functionName =>
      ensureExists(
        getByText(functionName).closest('.treeViewRow'),
        `Couldn't find the row for node ${functionName}.`
      );
    const getContextMenu = () =>
      ensureExists(
        container.querySelector('.react-contextmenu'),
        `Couldn't find the context menu.`
      );

    return {
      ...store,
      ...renderResult,
      getRowElement,
      getContextMenu,
    };
  }

  it('renders an unfiltered call tree', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders an inverted call tree', () => {
    const profileForInvertedTree = getProfileFromTextSamples(`
      A  A               A
      B  B               B
      C  X[lib:libX.so]  C
      D  Y               X[lib:libX.so]
      E  Z               Y
                         Z
    `).profile;

    // Note: we're not using the setup function because we want to change the
    // invertCallstack flag before rendering, so that we get the initial
    // expanded selection in this case too.
    const store = storeWithProfile(profileForInvertedTree);
    store.dispatch(changeInvertCallstack(true));

    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders call tree with some search strings', () => {
    const { container, dispatch } = setup();

    expect(container.firstChild).toMatchSnapshot();

    dispatch(changeCallTreeSearchString('C'));
    expect(container.firstChild).toMatchSnapshot();

    dispatch(changeCallTreeSearchString('C,'));
    expect(container.firstChild).toMatchSnapshot();

    dispatch(changeCallTreeSearchString('C, F'));
    expect(container.firstChild).toMatchSnapshot();

    dispatch(changeCallTreeSearchString('C, F,E'));
    expect(container.firstChild).toMatchSnapshot();

    dispatch(changeCallTreeSearchString(' C , E   '));
    expect(container.firstChild).toMatchSnapshot();
  });

  it('computes a width for a call tree of a really deep stack', () => {
    const { profile } = getProfileFromTextSamples(
      Array(113)
        .fill('name')
        .join('\n')
    );

    const { container } = setup(profile);
    const treeBody = ensureExists(
      container.querySelector('.treeViewBodyInner1')
    );
    const treeBodyWidth = parseInt(treeBody.style.minWidth);
    expect(treeBodyWidth).toBeGreaterThan(3000);
  });

  it('selects a node when left clicking', () => {
    const { getByText, getRowElement } = setup();

    fireFullClick(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isSelected');

    fireFullClick(getByText('B'));
    expect(getRowElement('A')).not.toHaveClass('isSelected');
    expect(getRowElement('B')).toHaveClass('isSelected');
  });

  it('displays a context menu when right clicking', () => {
    // Fake timers are needed when dealing with the context menu.
    jest.useFakeTimers();

    const { getContextMenu, getByText, getRowElement } = setup();

    function checkMenuIsDisplayedForNode(str) {
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      // Note that selecting a menu item will close the menu.
      fireFullClick(getByText('Copy function name'));
      expect(copy).toHaveBeenLastCalledWith(str);
    }

    fireFullContextMenu(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isRightClicked');
    checkMenuIsDisplayedForNode('A');

    // Wait that all timers are done before trying again.
    jest.runAllTimers();

    // Now try it again by right clicking 2 nodes in sequence.
    fireFullContextMenu(getByText('A'));
    fireFullContextMenu(getByText('C'));
    expect(getRowElement('C')).toHaveClass('isRightClicked');
    checkMenuIsDisplayedForNode('C');

    // Wait that all timers are done before trying again.
    jest.runAllTimers();

    // And now let's do it again, but this time waiting for timers before
    // clicking, because the timer can impact the menu being displayed.
    fireFullContextMenu(getByText('A'));
    fireFullContextMenu(getByText('C'));
    jest.runAllTimers();
    expect(getRowElement('C')).toHaveClass('isRightClicked');
    checkMenuIsDisplayedForNode('C');
  });

  it('hides the context menu by left clicking somewhere else', () => {
    // Fake timers are needed when dealing with the context menu.
    jest.useFakeTimers();

    const { getContextMenu, getByText, container } = setup();
    fireFullContextMenu(getByText('A'));
    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

    fireFullClick(getByText('C'));
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    jest.runAllTimers();
    expect(container.querySelector('.react-contextmenu')).toBeFalsy();
  });

  it('highlights the row properly when rightclicking a selected row', () => {
    // Fake timers are needed when dealing with the context menu.
    jest.useFakeTimers();

    const { getByText, getRowElement } = setup();

    fireFullClick(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isSelected');
    expect(getRowElement('A')).not.toHaveClass('isRightClicked');

    fireFullContextMenu(getByText('A'));
    // Both classes will be set, but our CSS styles `rightClicked` only when
    // `selected` is not present either.
    expect(getRowElement('A')).toHaveClass('isSelected');
    expect(getRowElement('A')).toHaveClass('isRightClicked');
  });

  it('highlights the row properly when selecting a rightclicked row', () => {
    // Fake timers are needed when dealing with the context menu.
    jest.useFakeTimers();

    const { getByText, getRowElement } = setup();

    fireFullContextMenu(getByText('A'));
    expect(getRowElement('A')).not.toHaveClass('isSelected');
    expect(getRowElement('A')).toHaveClass('isRightClicked');

    // When the node is highlighted from a right click, left clicking it will
    // chnage its highlight style.
    fireFullClick(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isSelected');
    expect(getRowElement('A')).toHaveClass('isRightClicked');

    // After a timeout, the menu publicizes that it's hidden and the right click
    // information is removed.
    jest.runAllTimers();
    expect(getRowElement('A')).toHaveClass('isSelected');
    expect(getRowElement('A')).not.toHaveClass('isRightClicked');
  });

  it('selects the heaviest stack if it is not idle', () => {
    const { profile } = getProfileFromTextSamples(`
      A  A  A  A  A
      B  C  C  C  D
      E           E
    `);
    const { getRowElement } = setup(profile);
    expect(getRowElement('C')).toHaveClass('isSelected');
  });

  it('does not select the heaviest stack if it is idle', () => {
    const { profile } = getProfileFromTextSamples(`
      A  A            A            A            A
      B  C[cat:Idle]  C[cat:Idle]  C[cat:Idle]  D
      E                                         E
    `);
    const { container } = setup(profile);
    expect(container.querySelector('.treeViewRow.isSelected')).toBeFalsy();
  });
});

describe('calltree/ProfileCallTreeView EmptyReasons', function() {
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
        <ProfileCallTreeView />
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
    const { profile } = getProfileFromTextSamples(profileString);
    const store = storeWithProfile(profile);
    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView />
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
          container.querySelector('.treeViewRowScrolledColumns.isSelected'),
          `Couldn't find the selected column with selector .treeViewRowScrolledColumns.isSelected`
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

describe('calltree/ProfileCallTreeView TransformNavigator', () => {
  it('renders with multiple transforms applied', () => {
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  E
    `);
    profile.threads[0].name = 'Thread with samples';
    const store = storeWithProfile(profile);

    // Applying some transforms
    const A = funcNames.indexOf('A');
    const B = funcNames.indexOf('B');
    const C = funcNames.indexOf('C');
    store.dispatch(
      addTransformToStack(0, {
        type: 'focus-subtree',
        callNodePath: [A],
        implementation: 'combined',
        inverted: false,
      })
    );
    store.dispatch(
      addTransformToStack(0, {
        type: 'focus-subtree',
        callNodePath: [B],
        implementation: 'combined',
        inverted: false,
      })
    );
    store.dispatch(
      addTransformToStack(0, {
        type: 'focus-subtree',
        callNodePath: [C],
        implementation: 'combined',
        inverted: false,
      })
    );

    const { container } = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
    expect(
      container.querySelector('.calltreeTransformNavigator')
    ).toMatchSnapshot();
  });
});

describe('ProfileCallTreeView/end-to-end', () => {
  // This next test explicitly does not have an assertion, disable the eslint rule
  // requiring one.
  // eslint-disable-next-line jest/expect-expect
  it('can display a gecko profile without crashing', () => {
    // We use the fake indexeddb in this test because the symbolication kicks
    // in. The fake indexeddb relies on setImmediate to run events. That's why
    // we use useFakeTimers so that pending event handlers are canceled when the
    // test runs and we don't get spurious messages.
    jest.useFakeTimers();

    const geckoProfile = createGeckoProfile();
    const processedProfile = processProfile(geckoProfile);
    const store = storeWithProfile(processedProfile);
    render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
  });
});

describe('ProfileCallTreeView with JS Allocations', function() {
  function setup() {
    const { profile } = getProfileWithJsAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
    const changeSelect = createSelectChanger(renderResult);

    return { profile, changeSelect, ...renderResult, ...store };
  }

  it('can switch to JS allocations and back to timing', function() {
    const { changeSelect, getState } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // It switches to JS allocations.
    changeSelect({ from: 'Timing Data', to: 'JavaScript Allocations' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('js-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'JavaScript Allocations', to: 'Timing Data' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for JS allocations', function() {
    const { getByText, queryByText, changeSelect } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).toBe(null);
    expect(queryByText('Self (bytes)')).toBe(null);

    changeSelect({ from: 'Timing Data', to: 'JavaScript Allocations' });

    // After clicking, they do.
    getByText('Total Size (bytes)');
    getByText('Self (bytes)');
  });

  it('matches the snapshot for JS allocations', function() {
    const { changeSelect, container } = setup();
    changeSelect({ from: 'Timing Data', to: 'JavaScript Allocations' });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfileCallTreeView with unbalanced native allocations', function() {
  function setup() {
    const { profile } = getProfileWithUnbalancedNativeAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
    const changeSelect = createSelectChanger(renderResult);

    return { profile, ...renderResult, changeSelect, ...store };
  }

  it('can switch to native allocations and back to timing', function() {
    const { getState, changeSelect } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // Switch to native allocations.
    changeSelect({ from: 'Timing Data', to: 'Allocated Memory' });

    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('native-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'Allocated Memory', to: 'Timing Data' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for native allocations', function() {
    const { getByText, queryByText, changeSelect } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).toBe(null);
    expect(queryByText('Self (bytes)')).toBe(null);

    changeSelect({ from: 'Timing Data', to: 'Allocated Memory' });

    // After changing to native allocations, they do.
    getByText('Total Size (bytes)');
    getByText('Self (bytes)');
  });

  it('does not have the retained memory option', function() {
    const { queryByText } = setup();
    expect(queryByText('Retained Memory')).toBeFalsy();
  });

  it('matches the snapshot for native allocations', function() {
    const { container, changeSelect } = setup();
    changeSelect({ from: 'Timing Data', to: 'Allocated Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for native deallocations', function() {
    const { container, changeSelect } = setup();
    changeSelect({ from: 'Timing Data', to: 'Deallocation Sites' });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfileCallTreeView with balanced native allocations', function() {
  function setup() {
    const { profile } = getProfileWithBalancedNativeAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
    const changeSelect = createSelectChanger(renderResult);

    return { profile, ...renderResult, changeSelect, ...store };
  }

  it('can switch to retained memory and back to timing', function() {
    const { getState, changeSelect } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // Switch to retained memory native allocations.
    changeSelect({ from: 'Timing Data', to: 'Retained Memory' });

    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('native-retained-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'Retained Memory', to: 'Timing Data' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for retained allocations', function() {
    const { getByText, queryByText, changeSelect } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).toBe(null);
    expect(queryByText('Self (bytes)')).toBe(null);

    changeSelect({ from: 'Timing Data', to: 'Retained Memory' });

    // After changing to retained allocations, they do.
    getByText('Total Size (bytes)');
    getByText('Self (bytes)');
  });

  it('matches the snapshot for retained allocations', function() {
    const { container, changeSelect } = setup();
    changeSelect({ from: 'Timing Data', to: 'Retained Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for deallocated memory', function() {
    const { container, changeSelect } = setup();
    changeSelect({ from: 'Timing Data', to: 'Deallocated Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });
});
