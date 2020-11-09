/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render, getByTestId, fireEvent } from '@testing-library/react';

import { TrackNetwork } from '../../components/timeline/TrackNetwork';
import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
} from '../../app-logic/constants';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getNetworkTrackProfile } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/flow';

// The graph is 400 pixels wide based on the getBoundingBox mock, and the graph height
// mimicks what is computed by the actual component.
const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = TRACK_NETWORK_ROW_HEIGHT * TRACK_NETWORK_ROW_REPEAT;

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

    // Send out the resize, and ensure we are drawing.
    window.dispatchEvent(new Event('resize'));
    expect(getContextDrawCalls().length > 0).toBe(true);
  });
});

describe('VerticalIndicators', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

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
    const tooltip = getByTestId(ensureExists(document.body), 'tooltip');
    expect(tooltip).toMatchSnapshot();
  });
});

function setup() {
  const profile = getNetworkTrackProfile();
  const store = storeWithProfile(profile);

  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

  const renderResult = render(
    <Provider store={store}>
      <TrackNetwork threadIndex={0} />
    </Provider>
  );

  const verticalIndicators = renderResult.getByTestId('vertical-indicators');

  const getIndicatorLines = () =>
    renderResult.getAllByTestId('vertical-indicator-line');

  // WithSize uses requestAnimationFrame
  flushRafCalls();

  /**
   * Coordinate the flushing of the requestAnimationFrame and the draw calls.
   */
  function getContextDrawCalls() {
    flushRafCalls();
    return ctx.__flushDrawLog();
  }

  return {
    ...renderResult,
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    getContextDrawCalls,
    verticalIndicators,
    getIndicatorLines,
  };
}
