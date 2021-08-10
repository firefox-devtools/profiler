/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  fireEvent,
  screen,
} from 'firefox-profiler/test/fixtures/testing-library';

import { TrackNetwork } from '../../components/timeline/TrackNetwork';
import { MaybeMarkerContextMenu } from '../../components/shared/MarkerContextMenu';
import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
} from '../../app-logic/constants';
import { ensureExists } from 'firefox-profiler/utils/flow';

import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getMouseEvent,
  fireFullClick,
  fireFullContextMenu,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { selectedThreadSelectors } from '../../selectors/per-thread';
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

describe('timeline/TrackNetwork', function() {
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
    expect(getContextDrawCalls().length).toEqual(0);

    // Send out the resize with a width change.
    // By changing the "fake" result of getBoundingClientRect, we ensure that
    // the pure components rerender because their `width` props change.
    setMockedElementSize({ width: GRAPH_WIDTH - 100, height: GRAPH_HEIGHT });
    window.dispatchEvent(new Event('resize'));
    expect(getContextDrawCalls().length > 0).toBe(true);
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

  it('displays a context menu when right clicking', () => {
    // Always use fake timers when dealing with context menus.
    jest.useFakeTimers();

    const { getContextMenu, clickOnMenuItem } = setup();
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

    // The user clicks on an item.
    clickOnMenuItem('Copy description');
    expect(copy).toHaveBeenLastCalledWith('Load 0: https://mozilla.org');
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    jest.runAllTimers();

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
    jest.runAllTimers();
    expect(document.querySelector('.react-contextmenu')).toBeFalsy();
  });
});

describe('VerticalIndicators', function() {
  it('creates the vertical indicators', function() {
    const { getIndicatorLines, getState } = setup();
    const markerIndexes = selectedThreadSelectors.getTimelineVerticalMarkerIndexes(
      getState()
    );
    const markerCount = 5;
    expect(markerIndexes).toHaveLength(markerCount);
    expect(getIndicatorLines()).toHaveLength(markerCount);
  });

  it('displays tooltips', function() {
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

    jest.runAllTimers();

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
    return (window: any).__flushDrawLog();
  }

  function getContextMenu() {
    return ensureExists(
      document.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    );
  }

  function clickOnMenuItem(stringOrRegexp) {
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
