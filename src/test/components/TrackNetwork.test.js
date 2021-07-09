/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
} from 'firefox-profiler/test/fixtures/testing-library';

import { TrackNetwork } from '../../components/timeline/TrackNetwork';
import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
} from '../../app-logic/constants';
import { ensureExists } from 'firefox-profiler/utils/flow';

import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getMouseEvent,
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
        pageY: 2,
      })
    );

    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toMatchSnapshot();

    const drawCalls = getContextDrawCalls();
    // We draw at least one hovered request with a different stroke style.
    expect(drawCalls).toContainEqual(['set strokeStyle', '#0069aa']);
    expect(drawCalls).toMatchSnapshot();
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
    // The tooltip is rendered in a portal, so it is not a child of the container.
    const tooltip = screen.getByTestId('tooltip');
    expect(tooltip).toMatchSnapshot();
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

  return {
    ...renderResult,
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    getContextDrawCalls,
    getIndicatorLines,
  };
}
