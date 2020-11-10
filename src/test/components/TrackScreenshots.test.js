/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Profile,
  Thread,
  IndexIntoRawMarkerTable,
} from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from '@testing-library/react';

import { commitRange } from '../../actions/profile-view';
import TrackScreenshots from '../../components/timeline/TrackScreenshots';
import { Timeline } from '../../components/timeline';
import { ensureExists } from '../../utils/flow';
import { FULL_TRACK_SCREENSHOT_HEIGHT } from '../../app-logic/constants';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
  fireFullClick,
} from '../fixtures/utils';
import { getScreenshotTrackProfile } from '../fixtures/profiles/processed-profile';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getPreviewSelection } from '../../selectors/profile';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect.js';

// Mock out the getBoundingBox to have a 400 pixel width.
const TRACK_WIDTH = 400;
const LEFT = 100;
const TOP = 7;

describe('timeline/TrackScreenshots', function() {
  autoMockDomRect();

  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('matches the component snapshot', () => {
    const { container, unmount } = setup();
    expect(container.firstChild).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    unmount();
  });

  it('shows a hover when moving the mouse', () => {
    const { screenshotHover, moveMouse } = setup();

    expect(screenshotHover).toThrow();
    moveMouse(LEFT + 0);
    expect(screenshotHover()).toBeTruthy();
  });

  it('sets a preview selection when clicking with the mouse', () => {
    const { selectionOverlay, screenshotClick, getState } = setup(
      undefined,
      <Timeline />
    );
    expect(selectionOverlay).toThrow();
    screenshotClick(LEFT);

    const expectedPreviewSelection = {
      hasSelection: true,
      isModifying: false,
      selectionEnd: 1,
      selectionStart: 0,
    };
    expect(getPreviewSelection(getState())).toEqual(expectedPreviewSelection);
    expect(selectionOverlay()).toBeTruthy();
  });

  it('does not change the preview selection when clicking if a selection is already present', () => {
    const { selectionOverlay, screenshotTrack, getState } = setup(
      undefined,
      <Timeline />
    );

    const track = screenshotTrack();
    expect(selectionOverlay).toThrow();

    // Mousedown then Mousemove will do a selection.
    fireEvent(track, getMouseEvent('mousedown', { pageX: LEFT, pageY: TOP }));
    fireEvent(
      track,
      getMouseEvent('mousemove', { pageX: LEFT + 200, pageY: TOP })
    );

    expect(selectionOverlay()).toBeTruthy();
    const selectedPreviewSelection = getPreviewSelection(getState());

    // Mouseup should keep this selection.
    fireEvent(
      track,
      getMouseEvent('mouseup', { pageX: LEFT + 200, pageY: TOP })
    );
    fireEvent(track, getMouseEvent('click', { pageX: LEFT + 200, pageY: TOP }));
    expect(getPreviewSelection(getState())).toEqual({
      ...selectedPreviewSelection,
      isModifying: false,
    });
    expect(selectionOverlay()).toBeTruthy();
  });

  it('removes the hover when moving the mouse out', () => {
    const { screenshotHover, screenshotTrack, moveMouse } = setup();

    expect(screenshotHover).toThrow();

    moveMouse(LEFT + 0);
    expect(screenshotHover()).toBeTruthy();

    fireEvent.mouseLeave(screenshotTrack());
    expect(screenshotHover).toThrow();
  });

  it('moves the hover when moving the mouse', () => {
    const { moveMouseAndGetLeft } = setup();
    //Considering base to be 150, this value is big enough as a base
    const base = moveMouseAndGetLeft(150);
    // LEFT is 100 and the zoomed in screenshot's width is 350px.
    // So hovering between 100 and 175px should give a result of left == 0.
    // As soon as we pass 175px the left value should also move up.
    expect(moveMouseAndGetLeft(175 + 10)).toBe(base + 10);
    expect(moveMouseAndGetLeft(175 + 20)).toBe(base + 20);
  });

  it('places the hover image in the center of the track if there is enough space', () => {
    const { setBoundingClientRectOffset, moveMouseAndGetTop } = setup();
    const containerTop = 100;
    const screenshotHeight = 175; // This is the height of the zoomed-in screenshot.
    setBoundingClientRectOffset({ left: LEFT, top: containerTop });
    const pageX = LEFT;
    const expectedTop = Math.floor(
      containerTop + FULL_TRACK_SCREENSHOT_HEIGHT / 2 - screenshotHeight / 2
    );
    expect(moveMouseAndGetTop(pageX)).toBe(expectedTop);
  });

  it('makes sure the hover image does not go off the end of the container', () => {
    const { moveMouseAndGetLeft } = setup();
    const pageX = LEFT + TRACK_WIDTH - 1;
    expect(pageX > moveMouseAndGetLeft(pageX)).toBe(true);
  });

  it('makes sure the hover image does not go off the left side of screen', () => {
    const { moveMouseAndGetLeft } = setup();

    // Because the zoomed in hover screenshot's size is 350px, it's stuck at the
    // left of the window when the mouse is between 100 (the left of
    // the track) and 175px.
    expect(moveMouseAndGetLeft(100)).toBe(0);
    expect(moveMouseAndGetLeft(150)).toBe(0);
    expect(moveMouseAndGetLeft(175)).toBe(0);

    // Starting at 176px, the hover tooltip starts to move.
    expect(moveMouseAndGetLeft(176)).toBe(1);
  });

  it('makes sure the hover image does not go off the top side of screen', () => {
    const { moveMouseAndGetTop } = setup();
    const pageX = LEFT;
    expect(moveMouseAndGetTop(pageX)).toBe(0);
  });

  it('renders a screenshot images when zooming into a range without a screenshot start time actually in the range', () => {
    const profile = getScreenshotTrackProfile();
    const [thread] = profile.threads;
    const markerIndexA = thread.markers.length - 3;
    const markerIndexB = thread.markers.length - 2;
    // We keep the last marker so that the profile's root range is correct.

    _setScreenshotMarkersToUnknown(thread, markerIndexA, markerIndexB);

    const { dispatch, container } = setup(profile);
    dispatch(
      commitRange(
        ensureExists(thread.markers.startTime[markerIndexA]),
        ensureExists(thread.markers.startTime[markerIndexB])
      )
    );

    const firstImage = ensureExists(
      container.querySelector('.timelineTrackScreenshotImgContainer'),
      `Couldn't find at least one screenshot image.`
    );
    expect(parseInt(firstImage.style.left)).toBeGreaterThanOrEqual(0);
  });

  it('renders a no images when zooming into a range before screenshots', () => {
    const profile = getScreenshotTrackProfile();
    const [thread] = profile.threads;

    const markerIndexA = 0;
    const markerIndexB = 1;

    _setScreenshotMarkersToUnknown(thread, markerIndexA, markerIndexB);

    const { dispatch, container } = setup(profile);
    dispatch(
      commitRange(
        ensureExists(thread.markers.startTime[markerIndexA]),
        ensureExists(thread.markers.startTime[markerIndexB])
      )
    );
    expect(container.querySelector('.timelineTrackScreenshotImg')).toBeFalsy();
  });

  it('is created in the <Timeline /> with a profile with screenshots', function() {
    const { getAllByText } = setup(getScreenshotTrackProfile(), <Timeline />);

    // The function `getAllByText` throws already if none are found, with a useful Error,
    // if it can't find any elements. But we still use `expect` to keep a "test-like"
    // assertion, even if it's useless.
    expect(getAllByText('Screenshots').length).toBeGreaterThan(0);
  });

  it('is not created in the <Timeline /> with a profile with no screenshots', function() {
    const { queryByText } = setup(getProfileWithNiceTracks(), <Timeline />);
    expect(queryByText('Screenshots')).toBeFalsy();
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
  let leftOffset = LEFT;
  let topOffset = TOP;
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => {
      const rect = getBoundingBox(TRACK_WIDTH, FULL_TRACK_SCREENSHOT_HEIGHT);
      // Add some arbitrary X offset.
      rect.left += leftOffset;
      rect.right += leftOffset;
      rect.x += leftOffset;
      rect.y += topOffset;
      rect.top += topOffset;
      rect.bottom += topOffset;
      return rect;
    });

  jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => {
    return [
      new DOMRect(
        LEFT,
        TOP,
        LEFT + TRACK_WIDTH,
        TOP + FULL_TRACK_SCREENSHOT_HEIGHT
      ),
    ];
  });

  function setBoundingClientRectOffset({
    left,
    top,
  }: {
    left: number,
    top: number,
  }) {
    leftOffset = left;
    topOffset = top;
  }

  const renderResult = render(<Provider store={store}>{component}</Provider>);
  const { container } = renderResult;

  // WithSize uses requestAnimationFrame
  flushRafCalls();

  function screenshotHover() {
    return ensureExists(
      document.querySelector('.timelineTrackScreenshotHover'),
      `Couldn't find the screenshot hover element, with selector .timelineTrackScreenshotHover`
    );
  }

  function selectionOverlay() {
    return ensureExists(
      document.querySelector('.timelineSelectionOverlay'),
      `Couldn't find the selection element, with selector .timelineSelectionOverlay`
    );
  }

  function screenshotClick(pageX: number) {
    fireFullClick(screenshotTrack(), { pageX, pageY: TOP });
  }

  function screenshotTrack() {
    return ensureExists(
      container.querySelector('.timelineTrackScreenshot'),
      `Couldn't find the screenshot track, with selector .timelineTrackScreenshot`
    );
  }

  function moveMouse(pageX: number) {
    fireEvent(
      screenshotTrack(),
      getMouseEvent('mousemove', { pageX, pageY: TOP })
    );
  }

  function moveMouseAndGetLeft(pageX: number): number {
    moveMouse(pageX);
    return parseInt(screenshotHover().style.left);
  }

  function moveMouseAndGetTop(pageX: number): number {
    moveMouse(pageX);
    return parseInt(screenshotHover().style.top);
  }

  return {
    ...renderResult,
    dispatch,
    getState,
    thread: profile.threads[0],
    store,
    screenshotHover,
    screenshotTrack,
    moveMouse,
    moveMouseAndGetLeft,
    moveMouseAndGetTop,
    setBoundingClientRectOffset,
    selectionOverlay,
    screenshotClick,
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
