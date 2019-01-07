/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Profile,
  Thread,
  IndexIntoRawMarkerTable,
} from '../../types/profile';

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import { commitRange } from '../../actions/profile-view';
import TrackScreenshots, {
  TRACK_HEIGHT,
} from '../../components/timeline/TrackScreenshots';
import Timeline from '../../components/timeline';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { getScreenshotTrackProfile } from '../fixtures/profiles/processed-profile';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';

// Mock out the getBoundingBox to have a 400 pixel width.
const TRACK_WIDTH = 400;
const LEFT = 5;
const TOP = 7;

describe('timeline/TrackScreenshots', function() {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

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

    view.simulate('mouseleave');
    view.update();
    expect(view.find('.timelineTrackScreenshotHover').length).toBe(0);
  });

  it('moves the hover when moving the mouse', () => {
    const { moveMouseAndGetLeft } = setup();
    const base = moveMouseAndGetLeft(LEFT);
    expect(moveMouseAndGetLeft(LEFT + 10)).toBe(base + 10);
    expect(moveMouseAndGetLeft(LEFT + 20)).toBe(base + 20);
  });

  it('makes sure the hover image does not go off the end of the container', () => {
    const { moveMouseAndGetLeft } = setup();
    const pageX = LEFT + TRACK_WIDTH - 1;
    expect(pageX > moveMouseAndGetLeft(pageX)).toBe(true);
  });

  it('renders a screenshot images when zooming into a range without a screenshot start time actually in the range', () => {
    const profile = getScreenshotTrackProfile();
    const [thread] = profile.threads;
    const markerIndexA = thread.markers.length - 2;
    const markerIndexB = thread.markers.length - 1;

    _setScreenshotMarkersToUnknown(thread, markerIndexA, markerIndexB);

    const { dispatch, view } = setup(profile);
    dispatch(
      commitRange(
        thread.markers.time[markerIndexA],
        thread.markers.time[markerIndexB]
      )
    );
    view.update();
    expect(view.find('.timelineTrackScreenshotImg').length).toBeGreaterThan(0);
  });

  it('renders a no images when zooming into a range before screenshots', () => {
    const profile = getScreenshotTrackProfile();
    const [thread] = profile.threads;

    const markerIndexA = 0;
    const markerIndexB = 1;

    _setScreenshotMarkersToUnknown(thread, markerIndexA, markerIndexB);

    const { dispatch, view } = setup(profile);
    dispatch(
      commitRange(
        thread.markers.time[markerIndexA],
        thread.markers.time[markerIndexB]
      )
    );
    view.update();
    expect(view.find('.timelineTrackScreenshotImg').length).toBe(0);
  });

  it('is created in the <Timeline /> with a profile with screenshots', function() {
    const { view } = setup(getScreenshotTrackProfile(), <Timeline />);
    expect(view.find(TrackScreenshots).length).toBe(1);
  });

  it('is not created in the <Timeline /> with a profile with no screenshots', function() {
    const { view } = setup(getProfileWithNiceTracks(), <Timeline />);
    expect(view.find(TrackScreenshots).length).toBe(0);
  });
});

function setup(
  profile: Profile = getScreenshotTrackProfile(),
  component = <TrackScreenshots threadIndex={0} windowId="0" />
) {
  const store = storeWithProfile(profile);
  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);
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

  const view = mount(<Provider store={store}>{component}</Provider>);

  // WithSize uses requestAnimationFrame
  flushRafCalls();
  view.update();

  function moveMouseAndGetLeft(pageX: number): number {
    view.simulate('mousemove', { pageX });
    view.update();
    return view.find('.timelineTrackScreenshotHover').prop('style').left;
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

/**
 * Take a thread full screenshot markers, and set some to "Unknown" in order to
 * create gaps in a screenshot track.
 */
function _setScreenshotMarkersToUnknown(
  thread: Thread,
  ...markerIndexes: IndexIntoRawMarkerTable[]
) {
  // Remove off the last few screenshot markers
  const unknownStringIndex = thread.stringTable.indexForString('Unknown');
  const screenshotStringIndex = thread.stringTable.indexForString(
    'CompositorScreenshot'
  );
  for (const markerIndex of markerIndexes) {
    // Double check that we've actually got screenshot markers:
    if (thread.markers.name[markerIndex] !== screenshotStringIndex) {
      throw new Error('This is not a screenshot marker.');
    }
    thread.markers.name[markerIndex] = unknownStringIndex;
    thread.markers.data[markerIndex] = null;
  }
}
