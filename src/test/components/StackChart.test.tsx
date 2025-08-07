/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
  act,
  within,
} from 'firefox-profiler/test/fixtures/testing-library';
import * as UrlStateSelectors from '../../selectors/url-state';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { StackChart } from '../../components/stack-chart';
import { CallNodeContextMenu } from '../../components/shared/CallNodeContextMenu';
import {
  getEmptyThread,
  getEmptyProfile,
} from '../../profile-logic/data-structures';
import {
  changeSelectedCallNode,
  commitRange,
  changeImplementationFilter,
  changeCallTreeSummaryStrategy,
  updatePreviewSelection,
} from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/flow';

import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import type { FakeMouseEventInit } from '../fixtures/utils';
import {
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
  findFillTextPositionFromDrawLog,
  fireFullClick,
  fireFullContextMenu,
  fireFullKeyPress,
} from '../fixtures/utils';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getUserTiming,
  getProfileWithJsAllocations,
} from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

import type { CssPixels, Store } from 'firefox-profiler/types';

jest.useFakeTimers();

const GRAPH_BASE_WIDTH = 200;
const GRAPH_WIDTH =
  GRAPH_BASE_WIDTH + TIMELINE_MARGIN_LEFT + TIMELINE_MARGIN_RIGHT;
const GRAPH_HEIGHT = 300;

autoMockCanvasContext();
autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
beforeEach(addRootOverlayElement);
afterEach(removeRootOverlayElement);

describe('StackChart', function () {
  it('matches the snapshot and can display a tooltip', () => {
    const { container, getTooltip, moveMouse } = setupSamples();
    const drawCalls = flushDrawLog();
    expect(container.firstChild).toMatchSnapshot('dom');
    expect(drawCalls).toMatchSnapshot('draw calls');

    // It can also display a tooltip when hovering a stack.
    expect(getTooltip()).toBe(null);

    moveMouse(findFillTextPositionFromDrawLog(drawCalls, 'B'));
    expect(getTooltip()).toBeTruthy();
    expect(getTooltip()).toMatchSnapshot('tooltip');
  });

  it('matches the snapshot and can display a tooltip with the same widths option', () => {
    const samples = `
      A[cat:DOM]       A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
      B[cat:DOM]       B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
      C[cat:Graphics]  C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
      D[cat:Graphics]  F[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
      E[cat:Graphics]  G[cat:Graphics]  G[cat:Graphics]
    `;
    const { getTooltip, moveMouse, flushRafCalls, dispatch } =
      setupSamples(samples);
    useSameWidthsStackChart({ flushRafCalls });

    let drawCalls = flushDrawLog();
    expect(document.body).toMatchSnapshot('dom');
    expect(getDrawnFrames(drawCalls)).toEqual([
      'A',
      'B',
      'C',
      'H',
      'D',
      'F',
      'I',
      'E',
      'G',
    ]);
    expect(drawCalls).toMatchSnapshot('draw calls');

    // It can also display a tooltip when hovering a stack.
    expect(getTooltip()).toBe(null);

    moveMouse(findFillTextPositionFromDrawLog(drawCalls, 'I'));
    expect(getTooltip()).toBeTruthy();
    expect(getTooltip()).toMatchSnapshot('tooltip');

    // Let's add a preview selection and do it again.
    flushDrawLog();
    act(() =>
      dispatch(
        updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 3.1,
          selectionEnd: 3.4,
        })
      )
    );

    flushRafCalls();
    drawCalls = flushDrawLog();
    expect(getDrawnFrames(drawCalls)).toEqual([
      'A',
      'B',
      'C',
      'H',
      'F',
      'I',
      'G',
    ]);
    expect(drawCalls).toMatchSnapshot('draw calls for preview selection');

    // It can also display a tooltip when hovering a new stack.
    moveMouse(findFillTextPositionFromDrawLog(drawCalls, 'H'));
    expect(getTooltip()).toBeTruthy();
    expect(getTooltip()).toMatchSnapshot('tooltip after preview selection');
  });

  it('can select a call node when clicking the chart', function () {
    const { dispatch, getState, leftClick, findFillTextPosition } =
      setupSamples();

    // Start out deselected
    act(() => {
      dispatch(changeSelectedCallNode(0, []));
    });
    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    const { x, y } = findFillTextPosition('A');
    const callNodeAIndex = 0;

    // Click on function A's box.
    leftClick({ x, y });

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      callNodeAIndex
    );

    // Click on a region without any drawn box to deselect.
    leftClick({ x, y: y + GRAPH_HEIGHT });

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );
  });

  it('can display the source view when pressing enter on the chart', function () {
    const sourceViewFile =
      'git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b';
    const { dispatch, funcNames, getState, stackChartCanvas } = setupSamples(
      `A[file:${sourceViewFile}]`
    );
    act(() => {
      dispatch(changeSelectedCallNode(0, [funcNames.indexOf('A')]));
    });

    expect(UrlStateSelectors.getSourceViewFile(getState())).toBeNull();
    fireFullKeyPress(stackChartCanvas, { key: 'Enter' });
    expect(UrlStateSelectors.getSourceViewFile(getState())).toBe(
      sourceViewFile
    );
  });

  it('can display a context menu when right clicking the chart', function () {
    // Fake timers are indicated when dealing with the context menus.
    jest.useFakeTimers();

    const { rightClick, getContextMenu, clickMenuItem, findFillTextPosition } =
      setupSamples();

    rightClick(findFillTextPosition('A'));

    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('A');

    // The menu should be closed now.
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    // Run the timers to have a clean state.
    act(() => jest.runAllTimers());

    // Try another to make sure the menu works for other stacks too.
    rightClick(findFillTextPosition('B'));

    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');
    clickMenuItem('Copy function name');
    expect(copy).toHaveBeenLastCalledWith('B');
  });

  it('can scroll into view when selecting a node', function () {
    // Create a stack deep enough to not have all its rendered frames
    // fit within GRAPH_HEIGHT.
    const frames = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(
      ' '
    );
    const { dispatch, funcNames, flushRafCalls } = setupSamples(
      frames.join('\n')
    );
    flushDrawLog();

    // Select the last frame, 'Z', and then make sure we can "see" the
    // drawn 'Z', but not 'A'.
    act(() => {
      dispatch(
        changeSelectedCallNode(
          0,
          frames.map((name) => funcNames.indexOf(name))
        )
      );
    });
    flushRafCalls();

    let drawnFrames = getDrawnFrames();
    expect(drawnFrames).toContain('Z');
    expect(drawnFrames).not.toContain('A');

    // Now select the first frame, 'A', and check that we also can
    // scroll up again and see 'A', but not 'Z'.
    act(() => {
      dispatch(changeSelectedCallNode(0, [funcNames.indexOf('A')]));
    });
    flushRafCalls();

    drawnFrames = getDrawnFrames();
    expect(drawnFrames).toContain('A');
    expect(drawnFrames).not.toContain('Z');
  });

  describe('EmptyReasons', () => {
    it('shows reasons when a profile has no samples', () => {
      const profile = getEmptyProfile();
      const thread = getEmptyThread();
      thread.name = 'Empty Thread';
      profile.threads.push(thread);

      const store = storeWithProfile(profile);
      const container = render(
        <Provider store={store}>
          <>
            <StackChart />
          </>
        </Provider>
      ).container;

      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples are out of range', () => {
      const { dispatch, container } = setupSamples();
      act(() => {
        dispatch(commitRange(5, 10));
      });
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when samples have been completely filtered out', function () {
      const { dispatch, container } = setupSamples();
      act(() => {
        dispatch(changeImplementationFilter('js'));
      });
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });

  it('works when the user selects the JS allocations option', function () {
    setupAllocations();
    const drawCalls = flushDrawLog();
    expect(document.body).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });
});

describe('MarkerChart', function () {
  it('can turn on the show user timings', () => {
    const { getByLabelText, getState } = setupUserTimings({
      isShowUserTimingsClicked: false,
    });

    const checkbox = getByLabelText('Show user timing') as HTMLElement;

    expect(UrlStateSelectors.getShowUserTimings(getState())).toBe(false);
    expect(getCheckedState(checkbox)).toBe(false);

    fireFullClick(checkbox);

    expect(UrlStateSelectors.getShowUserTimings(getState())).toBe(true);
    expect(getCheckedState(checkbox)).toBe(true);
  });

  it('matches the snapshots for the component and draw log', () => {
    const { container } = setupUserTimings({
      isShowUserTimingsClicked: true,
    });

    expect(container.firstChild).toMatchSnapshot();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  // TODO implement selecting user timing markers #2355
  it.todo('can select a marker when clicking the chart');

  // TODO implement selecting user timing markers #2355
  it.todo('can right click a marker and show a context menu');

  it('shows a tooltip when hovering', () => {
    const { getTooltip, moveMouse, findFillTextPosition, flushRafCalls } =
      setupUserTimings({
        isShowUserTimingsClicked: true,
      });

    expect(getTooltip()).toBe(null);

    moveMouse(findFillTextPosition('componentB'));
    let tooltip = getTooltip();
    expect(
      within(ensureExists(tooltip)).getByText('componentB')
    ).toBeInTheDocument();
    expect(tooltip).toMatchSnapshot();

    // This still matches markers with the same widths option
    useSameWidthsStackChart({ flushRafCalls });
    moveMouse(findFillTextPosition('componentA'));
    tooltip = getTooltip();
    expect(
      within(ensureExists(tooltip)).getByText('componentA')
    ).toBeInTheDocument();
    expect(tooltip).toMatchSnapshot();
  });
});

describe('CombinedChart', function () {
  it('renders combined stack chart', () => {
    const { container } = setupCombinedTimings();

    expect(container.firstChild).toMatchSnapshot();
    expect(flushDrawLog()).toMatchSnapshot();
  });
});

function showUserTimings({ getByLabelText, flushRafCalls }: Setup) {
  flushDrawLog();
  const checkbox = getByLabelText('Show user timing') as HTMLElement;
  fireFullClick(checkbox);
  flushRafCalls();
}

function useSameWidthsStackChart({
  flushRafCalls,
}: Pick<Setup, 'flushRafCalls'>) {
  flushDrawLog();
  const checkbox = screen.getByLabelText(
    'Use the same width for each stack'
  ) as HTMLElement;
  fireFullClick(checkbox);
  flushRafCalls();
}

function getDrawnFrames(drawCalls = flushDrawLog()) {
  return drawCalls.filter(([fn]) => fn === 'fillText').map(([, arg]) => arg);
}

function setupCombinedTimings() {
  const userTimingsProfile = getProfileWithMarkers([
    getUserTiming('renderFunction', 0, 10),
    getUserTiming('componentA', 1, 8),
    getUserTiming('componentB', 2, 4),
    getUserTiming('componentC', 3, 1),
    getUserTiming('componentD', 7, 1),
  ]);

  const { profile } = getProfileFromTextSamples(`
    A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
    B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
    C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
    D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
    E[cat:Graphics]  G[cat:Graphics]
  `);

  profile.threads[0].markers = userTimingsProfile.threads[0].markers;
  const results = setup(storeWithProfile(profile));
  showUserTimings(results);
  return results;
}

function setupUserTimings(config: { isShowUserTimingsClicked: boolean }) {
  // Approximately generate this type of graph with the following user timings.
  //
  // [renderFunction---------------------]
  //   [componentA---------------------]
  //     [componentB----]  [componentD]
  //      [componentC-]
  const profile = getProfileWithMarkers([
    getUserTiming('renderFunction', 0, 10),
    getUserTiming('componentA', 1, 8),
    getUserTiming('componentB', 2, 4),
    getUserTiming('componentC', 3, 1),
    getUserTiming('componentD', 7, 1),
  ]);

  const results = setup(storeWithProfile(profile));

  if (config.isShowUserTimingsClicked) {
    showUserTimings(results);
  }

  return results;
}

/**
 * Currently the stack chart only accepts samples, but in the future it will accept
 * markers, see PR #2345.
 */
function setupSamples(
  samples: string = `
    A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
    B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
    C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
    D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
    E[cat:Graphics]  G[cat:Graphics]
  `
): Setup {
  const {
    profile,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(samples);

  return setup(storeWithProfile(profile), funcNames);
}

function setupAllocations() {
  const { profile, funcNames } = getProfileWithJsAllocations();
  const store = storeWithProfile(profile);
  store.dispatch(changeCallTreeSummaryStrategy('js-allocations'));
  return setup(store, funcNames);
}

type Setup = ReturnType<typeof setup>;

/**
 * Setup the stack chart component with a profile.
 */
function setup(store: Store, funcNames: string[] = []) {
  const flushRafCalls = mockRaf();

  store.dispatch(changeSelectedTab('stack-chart'));

  const renderResult = render(
    <Provider store={store}>
      <>
        <CallNodeContextMenu />
        <StackChart />
      </>
    </Provider>
  );
  const { container } = renderResult;

  flushRafCalls();

  const stackChartCanvas = ensureExists(
    container.querySelector('.chartCanvas.stackChartCanvas'),
    `Couldn't find the stack chart canvas, with selector .chartCanvas.stackChartCanvas`
  ) as HTMLElement;

  // Mouse event tools
  function getPositioningOptions({ x, y }: { x: number; y: number }) {
    // These positioning options will be sent to all our mouse events. Note
    // that the values aren't really consistent, especially offsetY and
    // pageY shouldn't be the same, but in the context of our test this will
    // be good enough.
    // pageX/Y values control the position of the tooltip so it's not super
    // important.
    // offsetX/Y are more important as they're used to find which node is
    // actually clicked.
    // clientX/Y is used in the Viewport HOC when dragging and zooming.
    const positioningOptions = {
      offsetX: x,
      offsetY: y,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
    };

    return positioningOptions;
  }

  function fireMouseEvent(eventName: string, options: FakeMouseEventInit) {
    fireEvent(stackChartCanvas, getMouseEvent(eventName, options));
  }

  /**
   * The tooltip is in a portal, and created in the root overlay elements.
   */
  function getTooltip(): HTMLElement | null {
    return document.querySelector(
      '#root-overlay .tooltip'
    ) as HTMLElement | null;
  }

  type Position = { x: CssPixels; y: CssPixels };

  // Use findFillTextPosition to determin the position.
  function leftClick(where: Position) {
    const positioningOptions = getPositioningOptions(where);

    fireMouseEvent('mousemove', positioningOptions);
    fireFullClick(stackChartCanvas, positioningOptions);
    flushRafCalls();
  }

  function rightClick(where: Position) {
    const positioningOptions = getPositioningOptions(where);

    fireMouseEvent('mousemove', positioningOptions);
    fireFullContextMenu(stackChartCanvas, positioningOptions);
    flushRafCalls();
  }

  function moveMouse(where: Position) {
    fireMouseEvent('mousemove', getPositioningOptions(where));
    flushRafCalls();
  }

  // Context menu tools
  const getContextMenu = () =>
    ensureExists(
      container.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    ) as HTMLElement;

  function clickMenuItem(strOrRegexp: string | RegExp) {
    fireFullClick(screen.getByText(strOrRegexp));
  }

  function findFillTextPosition(fillText: string): Position {
    return findFillTextPositionFromDrawLog(flushDrawLog(), fillText);
  }

  return {
    ...renderResult,
    ...store,
    funcNames,
    flushRafCalls,
    stackChartCanvas,
    moveMouse,
    leftClick,
    rightClick,
    clickMenuItem,
    getContextMenu,
    getTooltip,
    findFillTextPosition,
  };
}

/**
 * Get around the type constraints of refining an HTMLElement into a radio input.
 */
function getCheckedState(element: HTMLElement): unknown {
  return (element as any).checked;
}
