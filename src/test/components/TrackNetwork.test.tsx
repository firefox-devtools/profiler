/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  fireEvent,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';

import { TrackNetwork } from 'firefox-profiler/components/timeline/TrackNetwork';
import { MaybeMarkerContextMenu } from 'firefox-profiler/components/shared/MarkerContextMenu';
import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
} from 'firefox-profiler/app-logic/constants';
import { ensureExists } from 'firefox-profiler/utils/types';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { changeSelectedNetworkMarker } from 'firefox-profiler/actions/profile-view';

import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { triggerResizeObservers } from '../fixtures/mocks/resize-observer';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getMouseEvent,
  fireFullClick,
  fireFullContextMenu,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { getNetworkTrackProfile } from '../fixtures/profiles/processed-profile';
import {
  autoMockElementSize,
  setMockedElementSize,
} from '../fixtures/mocks/element-size';

// The graph is 400 pixels wide based on the element size mock, and the graph
// height mimicks what is computed by the actual component.
const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = TRACK_NETWORK_ROW_HEIGHT * TRACK_NETWORK_ROW_REPEAT;

autoMockCanvasContext();
autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });

beforeEach(addRootOverlayElement);
afterEach(removeRootOverlayElement);

describe('timeline/TrackNetwork', function () {
  it('matches the component snapshot', () => {
    const { container, unmount } = setup();
    expect(container.firstChild).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    unmount();
  });

  it('matches the 2d context snapshot', () => {
    const { getContextDrawCalls } = setup();
    expect(getContextDrawCalls()).toMatchSnapshot();
  });

  it('redraws on a resize', () => {
    const { getContextDrawCalls } = setup();
    // Flush out any existing draw calls.
    getContextDrawCalls();
    // Ensure we start out with 0.
    expect(getContextDrawCalls()).toHaveLength(0);

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH - 100, height: GRAPH_HEIGHT });
    triggerResizeObservers();
    expect(getContextDrawCalls()).not.toHaveLength(0);
  });

  it('draws differently a request and displays a tooltip when hovered', () => {
    const { getContextDrawCalls } = setup();
    // Flush out any existing draw calls.
    getContextDrawCalls();

    const canvas = ensureExists(document.querySelector('canvas'));
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 2,
        offsetY: 2,
      })
    );

    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toMatchSnapshot();

    const drawCalls = getContextDrawCalls();
    // We draw at least one hovered request with a different stroke style.
    expect(drawCalls).toContainEqual(['set strokeStyle', '#0069aa']);
    expect(drawCalls).toMatchSnapshot();
  });

  it('changes the hovered marker information in the redux store', () => {
    const { getState } = setup();

    const canvas = ensureExists(document.querySelector('canvas'));

    // Hover marker 0
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 2,
        offsetY: 2,
      })
    );

    expect(selectedThreadSelectors.getHoveredMarkerIndex(getState())).toBe(0);

    // Hover marker 1
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 30,
        offsetX: 30,
        pageY: 7,
        offsetY: 7,
      })
    );
    expect(selectedThreadSelectors.getHoveredMarkerIndex(getState())).toBe(1);

    // Hover some blank space
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 10,
        offsetY: 10,
      })
    );
    expect(selectedThreadSelectors.getHoveredMarkerIndex(getState())).toBe(
      null
    );
  });

  it('displays a context menu when right clicking', () => {
    // Always use fake timers when dealing with context menus.
    jest.useFakeTimers();

    const { getContextMenu, clickOnMenuItem, getContextDrawCalls } = setup();
    const canvas = ensureExists(document.querySelector('canvas'));

    // First the user hovers the track.
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 2,
        offsetY: 2,
      })
    );

    expect(screen.getByTestId('tooltip')).toBeInTheDocument();

    // Flush existing draw calls, to check that we redraw properly.
    getContextDrawCalls();

    // Then the user right clicks.
    fireFullContextMenu(canvas);

    expect(getContextMenu()).toBeInTheDocument();
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();

    // Check that we redrew with a different style.
    const drawCalls = getContextDrawCalls();
    // We draw at least one hovered request with a different stroke style.
    expect(drawCalls).toContainEqual(['set strokeStyle', '#0069aa']);

    // The user clicks on an item.
    clickOnMenuItem('Copy description');
    expect(copy).toHaveBeenLastCalledWith('Load 0: https://mozilla.org');
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    act(() => jest.runAllTimers());

    expect(document.querySelector('.react-contextmenu')).toBeFalsy();
  });

  it('displays a context menu when right clicking, and hides it when clicking in blank space', () => {
    // Always use fake timers when dealing with context menus.
    jest.useFakeTimers();

    const { getContextMenu } = setup();
    const canvas = ensureExists(document.querySelector('canvas'));

    // First the user hovers the track.
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 2,
        offsetY: 2,
      })
    );

    expect(screen.getByTestId('tooltip')).toBeInTheDocument();

    // Then the user right clicks.
    fireFullContextMenu(canvas);

    expect(getContextMenu()).toBeInTheDocument();
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();

    // The user hovers some blank space
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        offsetX: 12,
        pageY: 20,
        offsetY: 20,
      })
    );

    // And then right clicks again => In this case the context menu should disappear!
    fireFullContextMenu(canvas);
    act(() => jest.runAllTimers());
    expect(document.querySelector('.react-contextmenu')).toBeFalsy();
  });

  it('selects the network marker when left clicking', () => {
    const { getContextDrawCalls, getState } = setup();

    const canvas = ensureExists(document.querySelector('canvas'));

    // First the user hovers the track.
    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        pageX: 12,
        pageY: 2,
      })
    );

    // Check that nothing is selected yet.
    expect(
      selectedThreadSelectors.getSelectedNetworkMarkerIndex(getState())
    ).toBe(null);

    // Then the user left clicks.
    fireFullClick(canvas);
    expect(
      selectedThreadSelectors.getSelectedNetworkMarkerIndex(getState())
    ).toBe(0);

    // Flush out any existing draw calls as we're interested in what comes news.
    getContextDrawCalls();
    // Ensure we start out with 0.
    expect(getContextDrawCalls().length).toEqual(0);
    getContextDrawCalls();

    // The mouse leaves the track.
    fireEvent.mouseLeave(canvas);

    const drawCalls = getContextDrawCalls();
    // We draw at least one hovered request with a different stroke style.
    expect(drawCalls).toContainEqual(['set strokeStyle', '#0069aa']);
  });

  it('draws the selected network marker when it changes elsewhere', () => {
    const { getContextDrawCalls, getState, dispatch } = setup();

    // Flush out any existing draw calls.
    getContextDrawCalls();
    // Ensure we start out with 0.
    expect(getContextDrawCalls().length).toEqual(0);

    // Check that nothing is selected yet.
    expect(
      selectedThreadSelectors.getSelectedNetworkMarkerIndex(getState())
    ).toBe(null);

    act(() => {
      dispatch(changeSelectedNetworkMarker(0, 2));
    });

    // Check that we redrew with a selected style.
    const drawCalls = getContextDrawCalls();
    // We draw at least one hovered request with a different stroke style.
    expect(drawCalls).toContainEqual(['set strokeStyle', '#0069aa']);
  });
});

describe('VerticalIndicators', function () {
  it('creates the vertical indicators', function () {
    const { getIndicatorLines, getState } = setup();
    const markerIndexes =
      selectedThreadSelectors.getTimelineVerticalMarkerIndexes(getState());
    const markerCount = 5;
    expect(markerIndexes).toHaveLength(markerCount);
    expect(getIndicatorLines()).toHaveLength(markerCount);
  });

  it('displays tooltips', function () {
    const { getIndicatorLines } = setup();
    const [firstIndicator] = getIndicatorLines();
    fireEvent.mouseOver(firstIndicator);
    fireEvent(
      firstIndicator,
      getMouseEvent('mousemove', {
        pageX: 11,
        pageY: 22,
      })
    );

    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toMatchSnapshot();
  });

  it('displays a context menu when right clicking', () => {
    // Always use fake timers when dealing with context menus.
    jest.useFakeTimers();

    const { getIndicatorLines, getContextMenu, clickOnMenuItem } = setup();

    // We're looking at the third indicator only to change from the previous test.
    const [, , thirdIndicator] = getIndicatorLines();
    fireEvent.mouseOver(thirdIndicator);
    // Note: we don't need to specify pageX/pageY here, as we don't test the
    // position of the tooltip, but only its presence.
    fireEvent.mouseMove(thirdIndicator);

    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toBeInTheDocument();

    // Then the user right clicks.
    fireFullContextMenu(thirdIndicator);
    expect(getContextMenu()).toBeInTheDocument();
    expect(tooltip).not.toBeInTheDocument();

    // The user clicks on an item.
    clickOnMenuItem('Copy description');
    expect(copy).toHaveBeenLastCalledWith('DOMContentLoaded');
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    act(() => jest.runAllTimers());

    expect(document.querySelector('.react-contextmenu')).toBeFalsy();
  });
});

function setup() {
  const profile = getNetworkTrackProfile();
  const store = storeWithProfile(profile);

  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();

  const renderResult = render(
    <Provider store={store}>
      <TrackNetwork threadIndex={0} />
      <MaybeMarkerContextMenu />
    </Provider>
  );

  const getIndicatorLines = () =>
    screen.getAllByTestId('vertical-indicator-line');

  // WithSize uses requestAnimationFrame
  flushRafCalls();

  /**
   * Coordinate the flushing of the requestAnimationFrame and the draw calls.
   */
  function getContextDrawCalls() {
    flushRafCalls();
    return (window as any).__flushDrawLog();
  }

  function getContextMenu() {
    return ensureExists(
      document.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    );
  }

  function clickOnMenuItem(stringOrRegexp: string | RegExp) {
    fireFullClick(screen.getByText(stringOrRegexp));
  }

  return {
    ...renderResult,
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    getContextDrawCalls,
    getIndicatorLines,
    getContextMenu,
    clickOnMenuItem,
  };
}
