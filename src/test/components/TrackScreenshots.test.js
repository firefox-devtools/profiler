/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import TrackScreenshots, {
  TRACK_HEIGHT,
} from '../../components/timeline/TrackScreenshots';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';

import { getScreenshotTrackProfile } from '../fixtures/profiles/make-profile';

// Mock out the getBoundingBox to have a 400 pixel width.
const TRACK_WIDTH = 400;
const LEFT = 5;
const TOP = 7;

describe('timeline/TrackScreenshots', function() {
  it('matches the component snapshot', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    view.unmount();
  });

  it('shows a hover when moving the mouse', () => {
    const { view } = setup();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(0);

    view.simulate('mousemove', { pageX: LEFT + 0 });
    view.update();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(1);
  });

  it('removes the hover when moving the mouse out', () => {
    const { view } = setup();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(0);

    view.simulate('mousemove', { pageX: LEFT + 0 });
    view.update();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(1);

    view.simulate('mouseout');
    view.update();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(0);
  });

  it('moves the hover when moving the mouse', () => {
    const { moveMouseAndGetLeft } = setup();
    expect(moveMouseAndGetLeft(LEFT)).toBe(LEFT);
    expect(moveMouseAndGetLeft(LEFT + 10)).toBe(LEFT + 10);
    expect(moveMouseAndGetLeft(LEFT + 20)).toBe(LEFT + 20);
  });

  it('makes sure the hover image does not go off the end of the container', () => {
    const { moveMouseAndGetLeft } = setup();
    const pageX = LEFT + TRACK_WIDTH - 1;
    expect(pageX > moveMouseAndGetLeft(pageX)).toBe(true);
  });
});

function setup() {
  const profile = getScreenshotTrackProfile();
  const store = storeWithProfile(profile);
  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => {
      const rect = getBoundingBox(TRACK_WIDTH, TRACK_HEIGHT);
      // Add some arbitrary X offset.
      rect.left += LEFT;
      rect.right += LEFT;
      rect.x += LEFT;
      rect.y += TOP;
      rect.top += TOP;
      rect.bottom += TOP;
      return rect;
    });

  const view = mount(
    <Provider store={store}>
      <TrackScreenshots
        threadIndex={0}
        screenshotId="0"
        overlayElement={document.createElement('div')}
      />
    </Provider>
  );

  // WithSize uses requestAnimationFrame
  flushRafCalls();
  view.update();

  function moveMouseAndGetLeft(pageX: number): number {
    view.simulate('mousemove', { pageX });
    view.update();
    return view.find('.timelineTrackScreenshotHover').get(0).props.style.left;
  }

  return {
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    view,
    moveMouseAndGetLeft,
  };
}
