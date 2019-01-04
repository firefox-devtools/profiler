/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import TrackNetwork, {
  ROW_HEIGHT,
  ROW_REPEAT,
} from '../../components/timeline/TrackNetwork';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';

import { getNetworkTrackProfile } from '../fixtures/profiles/processed-profile';

// The graph is 400 pixels wide based on the getBoundingBox mock, and the graph height
// mimicks what is computed by the actual component.
const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = ROW_HEIGHT * ROW_REPEAT;

describe('timeline/TrackNetwork', function() {
  it('matches the component snapshot', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    view.unmount();
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

function setup() {
  const profile = getNetworkTrackProfile();
  const store = storeWithProfile();
  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

  const view = mount(
    <Provider store={store}>
      <TrackNetwork threadIndex={0} />
    </Provider>
  );

  // WithSize uses requestAnimationFrame
  flushRafCalls();
  view.update();

  /**
   * Coordinate the flushing of the requestAnimationFrame and the draw calls.
   */
  function getContextDrawCalls() {
    flushRafCalls();
    return ctx.__flushDrawLog();
  }

  return {
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    view,
    getContextDrawCalls,
  };
}
