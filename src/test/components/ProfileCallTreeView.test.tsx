/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';
// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getScrollToSelectionGeneration } from 'firefox-profiler/selectors/profile';
import { ProfileCallTreeView } from '../../components/calltree/ProfileCallTreeView';
import { CallNodeContextMenu } from '../../components/shared/CallNodeContextMenu';
import { processGeckoProfile } from '../../profile-logic/process-profile';
import { ensureExists } from '../../utils/types';
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
  selectTrackWithModifiers,
} from '../../actions/profile-view';

import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  changeSelect,
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
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { triggerResizeObservers } from '../fixtures/mocks/resize-observer';

import type { Profile, Store } from 'firefox-profiler/types';

autoMockCanvasContext();

// This makes the bounding box large enough so that we don't trigger
// VirtualList's virtualization. We assert this below.
autoMockElementSize({ width: 1000, height: 2000 });

describe('calltree/ProfileCallTreeView', function () {
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
    const { container } = renderResult;

    const getRowElement = (functionName: string, modifiers = {}) =>
      screen.getByRole('treeitem', {
        name: new RegExp(`^${functionName}`),
        ...modifiers,
      });

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

  it('renders an unfiltered call tree with filenames', () => {
    const { profile } = getProfileFromTextSamples(`
      A[file:hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28]
      B[file:git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b]
      C[lib:libC.so][file:s3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:]
      D[lib:libD.so]
    `);
    const { container } = setup(profile);
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

    act(() => {
      dispatch(changeCallTreeSearchString('C'));
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      dispatch(changeCallTreeSearchString('C,'));
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      dispatch(changeCallTreeSearchString('C, F'));
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      dispatch(changeCallTreeSearchString('C, F,E'));
    });
    expect(container.firstChild).toMatchSnapshot();

    act(() => {
      dispatch(changeCallTreeSearchString(' C , E   '));
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('computes a width for a call tree of a really deep stack', () => {
    const { profile } = getProfileFromTextSamples(
      Array(113).fill('name').join('\n')
    );

    const { container } = setup(profile);
    const treeBody = ensureExists(
      container.querySelector('.treeViewBodyInner1')
    ) as HTMLElement;
    const treeBodyWidth = parseInt(treeBody.style.minWidth);
    expect(treeBodyWidth).toBeGreaterThan(3000);
  });

  it('selects a node when left clicking', () => {
    const { getByText, getRowElement, getState } = setup();

    const initialScrollGeneration = getScrollToSelectionGeneration(getState());
    fireFullClick(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isSelected');

    fireFullClick(getByText('B'));
    expect(getRowElement('A')).not.toHaveClass('isSelected');
    expect(getRowElement('B')).toHaveClass('isSelected');

    // The scroll generation hasn't moved.
    expect(getScrollToSelectionGeneration(getState())).toEqual(
      initialScrollGeneration
    );
  });

  it('displays a context menu when right clicking', () => {
    // Fake timers are needed when dealing with the context menu.
    jest.useFakeTimers();

    const { getContextMenu, getByText, getRowElement } = setup();

    function checkMenuIsDisplayedForNode(str: string) {
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      // Note that selecting a menu item will close the menu.
      fireFullClick(getByText('Copy function name'));
      expect(copy).toHaveBeenLastCalledWith(str);
    }

    fireFullContextMenu(getByText('A'));
    expect(getRowElement('A')).toHaveClass('isRightClicked');
    checkMenuIsDisplayedForNode('A');

    // Wait that all timers are done before trying again.
    act(() => jest.runAllTimers());

    // Now try it again by right clicking 2 nodes in sequence.
    fireFullContextMenu(getByText('A'));
    fireFullContextMenu(getByText('C'));
    expect(getRowElement('C')).toHaveClass('isRightClicked');
    checkMenuIsDisplayedForNode('C');

    // Wait that all timers are done before trying again.
    act(() => jest.runAllTimers());

    // And now let's do it again, but this time waiting for timers before
    // clicking, because the timer can impact the menu being displayed.
    fireFullContextMenu(getByText('A'));
    fireFullContextMenu(getByText('C'));
    act(() => jest.runAllTimers());
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

    act(() => jest.runAllTimers());
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
    act(() => jest.runAllTimers());
    expect(getRowElement('A')).toHaveClass('isSelected');
    expect(getRowElement('A')).not.toHaveClass('isRightClicked');
  });

  it('procures an interesting selection, also when switching threads', () => {
    const { profile } = getProfileFromTextSamples(
      `
        A  A  A  A  A
        B  C  C  C  D
        E           E
      `,
      `
        G  G  G  G  G
        H  H  I  I  I
        J  J  K  L
      `
    );
    // Assign values so that these threads are considered global processes.
    Object.assign(profile.threads[0], {
      pid: '111',
      tid: 111,
      name: 'GeckoMain',
      isMainThread: true,
    });
    Object.assign(profile.threads[1], {
      pid: '112',
      tid: 112,
      name: 'GeckoMain',
      isMainThread: true,
    });
    const { getRowElement, dispatch } = setup(profile);
    expect(getRowElement('C', { selected: true })).toHaveClass('isSelected');
    expect(getRowElement('A', { expanded: true })).toBeInTheDocument();

    // now switch to the other thread
    act(() => {
      dispatch(selectTrackWithModifiers({ type: 'global', trackIndex: 1 }));
    });
    expect(getRowElement('K', { selected: true })).toHaveClass('isSelected');
    expect(getRowElement('I', { expanded: true })).toBeInTheDocument();
  });

  it('does not select the heaviest stack if it is idle', () => {
    const { profile } = getProfileFromTextSamples(`
      A  A            A            A            A
      B  C[cat:Idle]  C[cat:Idle]  C[cat:Idle]  D
      E                                         E
    `);
    const { getRowElement } = setup(profile);
    expect(getRowElement('E', { selected: true })).toHaveClass('isSelected');
    expect(getRowElement('B', { expanded: true })).toBeInTheDocument();
  });
});

describe('calltree/ProfileCallTreeView EmptyReasons', function () {
  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  E
  `);
  profile.threads[0].name = 'Thread with samples';

  function renderWithStore(store: Store) {
    return render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    ).container.firstChild;
  }

  it('shows a reason for a call tree with no samples', function () {
    const profile = getEmptyProfile();
    const thread = getEmptyThread();
    thread.name = 'Empty Thread';
    profile.threads.push(thread);

    const store = storeWithProfile(profile);
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for being out of range of a threads samples', function () {
    const store = storeWithProfile(profile);
    store.dispatch(commitRange(5, 10));
    expect(renderWithStore(store)).toMatchSnapshot();
  });

  it('shows reasons for when samples are completely filtered out', function () {
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

    // This automatically uses the bounding box set in autoMockElementSize.
    triggerResizeObservers();

    // Assert that we used a large enough bounding box to include all children.
    const renderedRows = container.querySelectorAll(
      '.treeViewRow.treeViewRowScrolledColumns'
    );
    expect(renderedRows.length).toBe(expectedRowsLength);

    return {
      ...store,
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      simulateKey: (param: string | { key: string; metaKey?: boolean }) => {
        const treeViewBody = ensureExists(
          container.querySelector('div.treeViewBody'),
          `Couldn't find the tree view body with selector div.treeViewBody`
        );
        fireEvent.keyDown(
          treeViewBody,
          typeof param === 'string' ? { key: param } : param
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
    const profileString = Array.from({ length: 100 }).reduce<string>(
      (result, _func, i, array) => {
        const funcName = `name${i + 1}  `;
        result += funcName.repeat(array.length - i);
        return result;
      },
      ''
    );

    const { simulateKey, selectedText, getState } = setup(profileString, 100);

    const initialScrollGeneration = getScrollToSelectionGeneration(getState());

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

    // Now we expect that the scroll generation increased, because scroll should
    // be triggered with the keyboard navigation.
    expect(getScrollToSelectionGeneration(getState())).toBeGreaterThan(
      initialScrollGeneration
    );
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
    const geckoProfile = createGeckoProfile();
    const processedProfile = processGeckoProfile(geckoProfile);
    const store = storeWithProfile(processedProfile);
    render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
  });
});

describe('ProfileCallTreeView with JS Allocations', function () {
  function setup() {
    const { profile } = getProfileWithJsAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );
    return { profile, ...renderResult, ...store };
  }

  it('can switch to JS allocations and back to timing', function () {
    const { getState } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // It switches to JS allocations.
    changeSelect({ from: 'Timings', to: 'JavaScript Allocations' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('js-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'JavaScript Allocations', to: 'Timings' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for JS allocations', function () {
    const { getByText, queryByText } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).not.toBeInTheDocument();
    expect(queryByText('Self (bytes)')).not.toBeInTheDocument();

    changeSelect({ from: 'Timings', to: 'JavaScript Allocations' });

    // After clicking, they do.
    expect(getByText('Total Size (bytes)')).toBeInTheDocument();
    expect(getByText('Self (bytes)')).toBeInTheDocument();
  });

  it('matches the snapshot for JS allocations', function () {
    const { container } = setup();
    changeSelect({ from: 'Timings', to: 'JavaScript Allocations' });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfileCallTreeView with unbalanced native allocations', function () {
  function setup() {
    const { profile } = getProfileWithUnbalancedNativeAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    return { profile, ...renderResult, ...store };
  }

  it('can switch to native allocations and back to timing', function () {
    const { getState } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // Switch to native allocations.
    changeSelect({ from: 'Timings', to: 'Allocated Memory' });

    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('native-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'Allocated Memory', to: 'Timings' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for native allocations', function () {
    const { getByText, queryByText } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).not.toBeInTheDocument();
    expect(queryByText('Self (bytes)')).not.toBeInTheDocument();

    changeSelect({ from: 'Timings', to: 'Allocated Memory' });

    // After changing to native allocations, they do.
    expect(getByText('Total Size (bytes)')).toBeInTheDocument();
    expect(getByText('Self (bytes)')).toBeInTheDocument();
  });

  it('does not have the retained memory option', function () {
    const { queryByText } = setup();
    expect(queryByText('Retained Memory')).not.toBeInTheDocument();
  });

  it('matches the snapshot for native allocations', function () {
    const { container } = setup();
    changeSelect({ from: 'Timings', to: 'Allocated Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for native deallocations', function () {
    const { container } = setup();
    changeSelect({ from: 'Timings', to: 'Deallocation Sites' });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfileCallTreeView with balanced native allocations', function () {
  function setup() {
    const { profile } = getProfileWithBalancedNativeAllocations();
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileCallTreeView />
      </Provider>
    );

    return { profile, ...renderResult, ...store };
  }

  it('can switch to retained memory and back to timing', function () {
    const { getState } = setup();

    // It starts out with timing.
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');

    // Switch to retained memory native allocations.
    changeSelect({ from: 'Timings', to: 'Retained Memory' });

    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('native-retained-allocations');

    // And finally it can be switched back.
    changeSelect({ from: 'Retained Memory', to: 'Timings' });
    expect(
      selectedThreadSelectors.getCallTreeSummaryStrategy(getState())
    ).toEqual('timing');
  });

  it('shows byte related labels for retained allocations', function () {
    const { getByText, queryByText } = setup();

    // These labels do not exist.
    expect(queryByText('Total Size (bytes)')).not.toBeInTheDocument();
    expect(queryByText('Self (bytes)')).not.toBeInTheDocument();

    changeSelect({ from: 'Timings', to: 'Retained Memory' });

    // After changing to retained allocations, they do.
    expect(getByText('Total Size (bytes)')).toBeInTheDocument();
    expect(getByText('Self (bytes)')).toBeInTheDocument();
  });

  it('matches the snapshot for retained allocations', function () {
    const { container } = setup();
    changeSelect({ from: 'Timings', to: 'Retained Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for deallocated memory', function () {
    const { container } = setup();
    changeSelect({ from: 'Timings', to: 'Deallocated Memory' });
    expect(container.firstChild).toMatchSnapshot();
  });
});
