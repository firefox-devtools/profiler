/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  Profile,
  RawThread,
  RawProfileSharedData,
  IndexIntoRawMarkerTable,
} from 'firefox-profiler/types';
import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { commitRange } from '../../actions/profile-view';
import { TimelineTrackScreenshots } from '../../components/timeline/TrackScreenshots';
import { Timeline } from '../../components/timeline';
import { StringTable } from '../../utils/string-table';
import { ensureExists } from '../../utils/types';
import { FULL_TRACK_SCREENSHOT_HEIGHT } from '../../app-logic/constants';

import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import {
  getMouseEvent,
  addScreenshotHoverlement,
  removeScreenshotHoverElement,
  fireFullClick,
} from '../fixtures/utils';
import { getScreenshotTrackProfile } from '../fixtures/profiles/processed-profile';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getPreviewSelection } from '../../selectors/profile';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect';
import {
  autoMockElementSize,
  setMockedElementSize,
} from '../fixtures/mocks/element-size';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

// Mock out the element size to have a 400 pixel width and some left/top
// positioning.
const TRACK_WIDTH = 400;
const LEFT = 100;
const TOP = 7;
const INITIAL_ELEMENT_SIZE = {
  width: TRACK_WIDTH,
  height: FULL_TRACK_SCREENSHOT_HEIGHT,
  offsetX: LEFT,
  offsetY: TOP,
};

describe('timeline/TrackScreenshots', function () {
  autoMockDomRect();
  autoMockCanvasContext();
  autoMockElementSize(INITIAL_ELEMENT_SIZE);
  autoMockIntersectionObserver();

  beforeEach(addScreenshotHoverlement);
  afterEach(removeScreenshotHoverElement);

  it('matches the component snapshot', () => {
    const { container, unmount } = setup();
    expect(container.firstChild).toMatchSnapshot();
    // Trigger any unmounting behavior handlers, just make sure it doesn't
    // throw any errors.
    unmount();
  });

  it('shows a hover when moving the mouse', () => {
    const { screenshotHover, moveMouseAndGetImageSize } = setup();

    expect(screenshotHover).toThrow();
    const size = moveMouseAndGetImageSize(LEFT + 0);
    expect(screenshotHover()).toBeTruthy();
    expect(size).toEqual({ width: 350, height: 175 });
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

  it(`displays a smaller screenshot when preview selecting, and doesn't change it when clicking if a selection is already present`, () => {
    const {
      selectionOverlay,
      screenshotTrack,
      moveMouseAndGetImageSize,
      getState,
    } = setup(undefined, <Timeline />);

    const track = screenshotTrack();
    expect(selectionOverlay).toThrow();

    // Mousedown then Mousemove will do a selection.
    fireEvent(track, getMouseEvent('mousedown', { pageX: LEFT, pageY: TOP }));
    const screenShotSize = moveMouseAndGetImageSize(LEFT + 200);

    expect(selectionOverlay()).toBeTruthy();

    // And we should see a small screenshot hover while preview selecting.
    expect(screenShotSize).toEqual({ width: 100, height: 50 });

    // click should keep this existing selection
    const previouslySelectedPreviewSelection = getPreviewSelection(getState());
    fireEvent(
      track,
      getMouseEvent('mouseup', { pageX: LEFT + 200, pageY: TOP })
    );
    fireEvent(track, getMouseEvent('click', { pageX: LEFT + 200, pageY: TOP }));

    expect(getPreviewSelection(getState())).toEqual({
      ...previouslySelectedPreviewSelection,
      isModifying: false,
    });
    expect(selectionOverlay()).toBeTruthy();

    // but the screenshot hover size should now be bigger
    const screenshotSize = moveMouseAndGetImageSize(LEFT + 210);
    expect(screenshotSize).toEqual({ width: 350, height: 175 });
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
    const { moveMouseAndGetTop } = setup();
    const containerTop = 100;
    const screenshotHeight = 175; // This is the height of the zoomed-in screenshot.
    setMockedElementSize({
      ...INITIAL_ELEMENT_SIZE,
      offsetX: LEFT, // repeating this property for more clarity
      offsetY: containerTop,
    });
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
    const { shared, threads } = profile;
    const [thread] = threads;
    const markerIndexA = thread.markers.length - 3;
    const markerIndexB = thread.markers.length - 2;
    // We keep the last marker so that the profile's root range is correct.

    _setScreenshotMarkersToUnknown(thread, shared, markerIndexA, markerIndexB);

    const { dispatch, container } = setup(profile);
    act(() => {
      dispatch(
        commitRange(
          ensureExists(thread.markers.startTime[markerIndexA]),
          ensureExists(thread.markers.startTime[markerIndexB])
        )
      );
    });

    const firstImage = ensureExists(
      container.querySelector('.timelineTrackScreenshotImgContainer'),
      `Couldn't find at least one screenshot image.`
    ) as HTMLElement;
    expect(parseInt(firstImage.style.left)).toBeGreaterThanOrEqual(0);
  });

  it('renders a no images when zooming into a range before screenshots', () => {
    const profile = getScreenshotTrackProfile();
    const { shared, threads } = profile;
    const [thread] = threads;

    const markerIndexA = 0;
    const markerIndexB = 1;

    _setScreenshotMarkersToUnknown(thread, shared, markerIndexA, markerIndexB);

    const { dispatch, container } = setup(profile);
    act(() => {
      dispatch(
        commitRange(
          ensureExists(thread.markers.startTime[markerIndexA]),
          ensureExists(thread.markers.startTime[markerIndexB])
        )
      );
    });
    expect(container.querySelector('.timelineTrackScreenshotImg')).toBeFalsy();
  });

  it('is created in the <Timeline /> with a profile with screenshots', function () {
    setup(getScreenshotTrackProfile(), <Timeline />);

    // The function `getAllByText` throws already if none are found, with a useful Error,
    // if it can't find any elements. But we still use `expect` to keep a "test-like"
    // assertion, even if it's useless.
    expect(screen.getAllByRole('button', { name: 'Screenshots' })).toHaveLength(
      3
    );

    const screenshotTracks = document.querySelectorAll(
      '.timelineTrackScreenshot'
    );
    expect(screenshotTracks).toHaveLength(3);

    // Tracks 1 and 3 are rendered in the full length because these windows are
    // not closed. They should have the same number of elements.
    expect(screenshotTracks[0].childElementCount).toBe(
      screenshotTracks[2].childElementCount
    );

    // Track 2 is closed before the end and therefore should have less DOM elements.
    expect(screenshotTracks[1].childElementCount).toBeLessThan(
      screenshotTracks[0].childElementCount
    );
  });

  it('is not created in the <Timeline /> with a profile with no screenshots', function () {
    const { queryByText } = setup(getProfileWithNiceTracks(), <Timeline />);
    expect(queryByText('Screenshots')).not.toBeInTheDocument();
  });
});

function setup(
  profile: Profile = getScreenshotTrackProfile(),
  component = <TimelineTrackScreenshots threadIndex={0} windowId="0" />
) {
  const store = storeWithProfile(profile);
  const { getState, dispatch } = store;
  const flushRafCalls = mockRaf();

  // getBoundingClientRect is already mocked by autoMockElementSize.
  // @ts-expect-error - '() => DOMRect[]' is not assignable to '() => DOMRectList'
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

  const renderResult = render(<Provider store={store}>{component}</Provider>);
  const { container } = renderResult;

  // WithSize uses requestAnimationFrame
  flushRafCalls();

  function screenshotHover() {
    return ensureExists(
      document.querySelector('.timelineTrackScreenshotHover'),
      `Couldn't find the screenshot hover element, with selector .timelineTrackScreenshotHover`
    ) as HTMLElement;
  }

  function screenshotHoverImage() {
    return ensureExists(
      document.querySelector('.timelineTrackScreenshotHoverImg'),
      `Couldn't find the screenshot hover element, with selector .timelineTrackScreenshotHoverImg`
    ) as HTMLElement;
  }

  function selectionOverlay() {
    return ensureExists(
      document.querySelector('.timelineSelectionOverlay'),
      `Couldn't find the selection element, with selector .timelineSelectionOverlay`
    ) as HTMLElement;
  }

  function screenshotClick(pageX: number) {
    fireFullClick(screenshotTrack(), { pageX, pageY: TOP });
  }

  function screenshotTrack() {
    return ensureExists(
      container.querySelector('.timelineTrackScreenshot'),
      `Couldn't find the screenshot track, with selector .timelineTrackScreenshot`
    ) as HTMLElement;
  }

  function moveMouse(pageX: number) {
    fireEvent(
      screenshotTrack(),
      getMouseEvent('mousemove', { pageX, pageY: TOP, buttons: 1 })
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

  function moveMouseAndGetImageSize(pageX: number): {
    width: number;
    height: number;
  } {
    moveMouse(pageX);
    const style = screenshotHoverImage().style;
    return {
      width: parseInt(style.width),
      height: parseInt(style.height),
    };
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
    moveMouseAndGetImageSize,
    selectionOverlay,
    screenshotClick,
  };
}

/**
 * Take a thread full screenshot markers, and set some to "Unknown" in order to
 * create gaps in a screenshot track.
 */
function _setScreenshotMarkersToUnknown(
  thread: RawThread,
  shared: RawProfileSharedData,
  ...markerIndexes: IndexIntoRawMarkerTable[]
) {
  // Remove off the last few screenshot markers
  const stringTable = StringTable.withBackingArray(shared.stringArray);
  const unknownStringIndex = stringTable.indexForString('Unknown');
  const screenshotStringIndex = stringTable.indexForString(
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
