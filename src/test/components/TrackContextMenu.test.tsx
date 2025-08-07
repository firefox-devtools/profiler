/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';
import { showMenu } from '@firefox-devtools/react-contextmenu';

import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { ensureExists } from '../../utils/flow';
import {
  changeSelectedThreads,
  changeRightClickedTrack,
  showLocalTrack,
} from '../../actions/profile-view';
import { TimelineTrackContextMenu } from '../../components/timeline/TrackContextMenu';
import {
  getGlobalTracks,
  getLocalTracks,
  getLocalTracksByPid,
} from '../../selectors/profile';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracks,
} from '../../selectors/url-state';
import {
  getProfileWithNiceTracks,
  getProfileWithMoreNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import {
  getScreenshotTrackProfile,
  getNetworkTrackProfile,
  addIPCMarkerPairToThreads,
  getThreadWithMarkers,
  getScreenshotMarkersForWindowId,
} from '../fixtures/profiles/processed-profile';

import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick, fireFullKeyPress } from '../fixtures/utils';

import type { Profile, TrackReference } from 'firefox-profiler/types';

describe('timeline/TrackContextMenu', function () {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  const clickTracksWithExpectation = async (
    matchers: Array<string | RegExp>,
    expectations: {
      readonly checked: boolean;
    }
  ) => {
    const elements = matchers.map((matcher) =>
      screen.getByRole('menuitemcheckbox', { name: matcher })
    );
    elements.forEach((element) => fireFullClick(element));

    await waitFor(() => {
      for (const element of elements) {
        const menuItem = element.closest('.react-contextmenu-item');
        expect(menuItem).toHaveAttribute(
          'aria-checked',
          String(expectations.checked)
        );
        if (expectations.checked) {
          expect(menuItem).toBeChecked();
        } else {
          expect(menuItem).not.toBeChecked();
        }
      }
    });
  };
  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain default]',
   *    'show [thread GeckoMain tab]',       <- use this global track.
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]',
   *  ]
   */
  function setup(profile = getProfileWithNiceTracks()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    const renderResult = render(
      <Provider store={store}>
        <TimelineTrackContextMenu />
      </Provider>
    );

    const changeSearchFilter = (searchText: string) => {
      fireEvent.change(screen.getByPlaceholderText(/Enter filter terms/), {
        target: { value: searchText },
      });

      jest.runAllTimers();
    };

    const isContextMenuVisible = (): boolean => {
      const contextMenu = ensureExists(
        document.querySelector('.react-contextmenu'),
        `Couldn't find the context menu.`
      );
      return contextMenu.classList.contains('react-contextmenu--visible');
    };

    const showContextMenu = () => {
      act(() => {
        showMenu({
          data: null,
          id: 'TimelineTrackContextMenu',
          position: { x: 0, y: 0 },
        });
      });
    };

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      store,
      changeSearchFilter,
      isContextMenuVisible,
      showContextMenu,
    };
  }

  describe('the "show all tracks" menu item', function () {
    function setupAllTracks() {
      const results = setup();
      const selectAllTracksItem = () => screen.getByText('Show all tracks');

      const hideAllTracks = async () => {
        // We want to hide this tracks before testing 'Show all tracks'
        const matchers = [/Parent Process/, 'DOM Worker', 'Style'];
        await clickTracksWithExpectation(matchers, { checked: false });
      };

      return {
        ...results,
        selectAllTracksItem,
        hideAllTracks,
      };
    }

    it('selects all tracks', async () => {
      const { getState, selectAllTracksItem, hideAllTracks } = setupAllTracks();
      // Test behavior when all tracks are already shown
      fireFullClick(selectAllTracksItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Hide all tracks to test behavior
      await hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // All tracks should be visible now
      fireFullClick(selectAllTracksItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });
  });

  describe('show all matching tracks', function () {
    function setupAllTracks() {
      const results = setup();
      const selectShowAllMatchingTracksItem = () =>
        screen.getByText('Show all matching tracks');

      const hideAllTracks = async () => {
        // To hide the tracks before testing 'Show all tracks'
        const matchers = [/Parent Process/, 'DOM Worker', 'Style'];
        await clickTracksWithExpectation(matchers, { checked: false });
      };

      const hideAllTracksExceptMain = async () => {
        const matchers = [/Content Process/, 'DOM Worker', 'Style'];
        await clickTracksWithExpectation(matchers, { checked: false });
      };

      return {
        ...results,
        selectShowAllMatchingTracksItem,
        hideAllTracks,
        hideAllTracksExceptMain,
      };
    }

    it('shows a single track', async () => {
      const {
        getState,
        selectShowAllMatchingTracksItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      await hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain default]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Parent Process');
      // Click the button.
      fireFullClick(selectShowAllMatchingTracksItem());

      // GeckoMain should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('shows children of a global track', async () => {
      const {
        getState,
        selectShowAllMatchingTracksItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      await hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain default]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Content Process');
      // Click the button.
      fireFullClick(selectShowAllMatchingTracksItem());

      // Children of Content Process should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('shows a local track', async () => {
      const {
        getState,
        selectShowAllMatchingTracksItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      await hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain default]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('DOM Worker');
      // Click the button.
      fireFullClick(selectShowAllMatchingTracksItem());

      // DOM Worker track should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('does not show anything if the list is empty', async () => {
      const {
        getState,
        selectShowAllMatchingTracksItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      await hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain default]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks. This time it's something random.
      changeSearchFilter('this should not be in the tracks list');
      // Click the button.
      fireFullClick(selectShowAllMatchingTracksItem());

      // No new track should be visible.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it("shows local track's global track even if it wasn't visible before", async () => {
      const {
        getState,
        selectShowAllMatchingTracksItem,
        hideAllTracksExceptMain,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide the local tracks and tehe global track with children for this behavior.
      await hideAllTracksExceptMain();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        // These tracks must be hidden at the start.
        'hide [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search a local track.
      changeSearchFilter('DOM Worker');
      // Click the button.
      fireFullClick(selectShowAllMatchingTracksItem());

      // DOM Worker and its global process should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('hide all matching tracks', function () {
    function setupAllTracks(profile?: Profile) {
      const setupResults = setup(profile);
      const hideAllMatchingTracksItem = () =>
        screen.getByText('Hide all matching tracks');

      const hideAllTracksExceptMain = async () => {
        const matchers = [/Content Process/, 'DOM Worker', 'Style'];
        await clickTracksWithExpectation(matchers, { checked: false });
      };

      return {
        ...setupResults,
        hideAllMatchingTracksItem,
        hideAllTracksExceptMain,
      };
    }

    it('hides a global track', () => {
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks();
      // Make sure all the tracks are visible at first.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Parent Process');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // GeckoMain should be hidden now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('hides a local track', () => {
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks();
      // Make sure all the tracks are visible at first.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('DOM Worker');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // DOM Worker track should be hidden now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('does not hide anything if search filter does not match', () => {
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks();
      // Make sure all the tracks are visible at first.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks. This time it's something random.
      changeSearchFilter('this should not be in the tracks list');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // No new track should be hidden.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('does not hide if it is the last visible track', async () => {
      const {
        getState,
        hideAllMatchingTracksItem,
        hideAllTracksExceptMain,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks except the main to test the behavior.
      await hideAllTracksExceptMain();
      expect(getHumanReadableTracks(getState())).toEqual([
        // This must be the only visible track.
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Parent Process');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // GeckoMain should still be visible.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('selects another visible track when the selected one becomes hidden', () => {
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks();
      // Make sure all the tracks are visible at first.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('tab');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // GeckoMain should be visible and selected.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('hides process tracks without a main thread', function () {
      const profile = getProfileWithNiceTracks();
      // Remove the thread [thread GeckoMain tab]
      profile.threads.splice(1, 1);
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks(profile);

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [process]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('DOM Worker');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // DOM Worker track should be hidden now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [process]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Style');
      // Click the button.
      fireFullClick(hideAllMatchingTracksItem());

      // Style and process tracks should be hidden now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [process]',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('does not hide if the process without a main thread has only one visible track left', function () {
      const profile = getProfileWithNiceTracks();
      // Remove the thread [thread GeckoMain tab]
      profile.threads.splice(0, 2);
      const { getState, hideAllMatchingTracksItem, changeSearchFilter } =
        setupAllTracks(profile);
      fireFullClick(screen.getByText('Style'));

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);

      // Search "DOM Worker" to filter the tracks.
      changeSearchFilter('DOM Worker');
      // Try to click the button. But it should be disabled and not clickable.
      const hideAllMatchingTracksMenuItem = hideAllMatchingTracksItem();
      expect(hideAllMatchingTracksMenuItem).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      fireFullClick(hideAllMatchingTracksMenuItem);

      // Clicking on the "hide all matching tracks" button should not hide the
      // DOM Worker or process track.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('when a global track is right clicked', function () {
    function setupGlobalTrack(profile?: Profile, trackIndex = 1) {
      const results = setup(profile);
      const { dispatch, getState } = results;

      const trackReference = {
        type: 'global' as const,
        trackIndex: trackIndex,
      };
      const track = getGlobalTracks(getState())[trackIndex];
      const threadIndex =
        track.type === 'process' ? track.mainThreadIndex : null;
      if (threadIndex !== null) {
        // Explicitly select the global thread. Tests can pass in a custom profile,
        // so don't fail if this doesn't exist.
        act(() => {
          dispatch(changeSelectedThreads(new Set([threadIndex])));
        });
      }
      act(() => {
        dispatch(changeRightClickedTrack(trackReference));
      });

      const isolateProcessItem = () =>
        screen.getByText(/Only show this process/);
      // Fluent adds isolation characters \u2068 and \u2069 around Content Process.
      const isolateProcessMainThreadItem = () =>
        screen.getByText(/Only show “\u2068Content Process\u2069”/);
      const isolateScreenshotTrack = () =>
        screen.getByText(/Hide other Screenshots tracks/);
      // Fluent adds isolation characters \u2068 and \u2069 around Content Process.
      const hideContentProcess = () =>
        screen.getByText(/Hide “\u2068Content Process\u2069”/);

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateProcessItem,
        isolateProcessMainThreadItem,
        isolateScreenshotTrack,
        hideContentProcess,
      };
    }

    it('matches the snapshot of a global track', () => {
      const { container } = setupGlobalTrack();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot of a global non-process track', () => {
      const { container } = setupGlobalTrack(getScreenshotTrackProfile());
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function () {
      const { getState } = setupGlobalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the process', function () {
      const { isolateProcessItem, getState } = setupGlobalTrack();
      fireFullClick(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can isolate the process's main thread", function () {
      const { isolateProcessMainThreadItem, getState } = setupGlobalTrack();
      fireFullClick(isolateProcessMainThreadItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('isolates a process track without a main thread', function () {
      const profile = getProfileWithNiceTracks();
      // Remove the thread [thread GeckoMain tab]
      profile.threads.splice(1, 1);
      const { isolateProcessMainThreadItem, isolateProcessItem, getState } =
        setupGlobalTrack(profile);

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [process]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      expect(isolateProcessMainThreadItem).toThrow();
      fireFullClick(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('isolates a screenshot track', () => {
      const { isolateScreenshotTrack, getState } = setupGlobalTrack(
        getScreenshotTrackProfile()
      );
      fireFullClick(isolateScreenshotTrack());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'hide [screenshots]',
        'hide [screenshots]',
        'show [process]',
        '  - show [thread Empty] SELECTED',
      ]);
    });

    it('can hide the process', function () {
      const { hideContentProcess, getState } = setupGlobalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      fireFullClick(hideContentProcess());

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can toggle a global track by clicking it', async function () {
      const { trackIndex, getState } = setupGlobalTrack();
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
      await clickTracksWithExpectation([/^Content Process/], {
        checked: false,
      });
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(true);
      await clickTracksWithExpectation([/^Content Process/], { checked: true });
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
    });

    // TODO - We should wait until we have some real tracks without a thread index.
    it.todo('can present a disabled isolate item on non-process tracks');

    it('network track will be displayed when a number is not set for ctxId', () => {
      const { container } = setupGlobalTrack(getNetworkTrackProfile(), 0);
      // We can't use getHumanReadableTracks here because that function doesn't
      // use the functions used by context menu directly and gives us wrong results.
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('when a local track is right clicked', function () {
    function setupLocalTrack(profile?: Profile) {
      const results = setup(profile);
      const { dispatch, getState } = results;

      // In getProfileWithNiceTracks, the two pids are 111 and 222 for the
      // "GeckoMain process" and "GeckoMain tab" respectively. Use 222 since it has
      // local tracks.
      const pid = '222';
      const trackIndex = 0;
      const trackReference = {
        type: 'local' as const,
        pid,
        trackIndex,
      };
      const localTracks = getLocalTracks(getState(), pid);
      const localTrack = localTracks[trackIndex];
      if (localTrack.type !== 'thread') {
        throw new Error('Expected a thread track');
      }
      const threadIndex = localTrack.threadIndex;

      // Explicitly select the global thread.
      act(() => {
        dispatch(changeSelectedThreads(new Set([threadIndex])));
      });
      act(() => {
        dispatch(changeRightClickedTrack(trackReference));
      });

      // Fluent adds isolation characters \u2068 and \u2069 around DOM Worker.
      const isolateLocalTrackItem = () =>
        screen.getByText('Only show “\u2068DOM Worker\u2069”');
      const hideDOMWorker = () =>
        screen.getByText('Hide “\u2068DOM Worker\u2069”');
      const trackItem = () => screen.getByText('DOM Worker');

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateLocalTrackItem,
        hideDOMWorker,
        trackItem,
        pid,
      };
    }

    it('matches the snapshot of a local track', () => {
      const { container } = setupLocalTrack();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function () {
      const { getState } = setupLocalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the local track', function () {
      const { isolateLocalTrackItem, getState } = setupLocalTrack();
      fireFullClick(isolateLocalTrackItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can hide the DOM worker thread', function () {
      const { hideDOMWorker, getState } = setupLocalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);

      fireFullClick(hideDOMWorker());

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('can toggle a local track by clicking it', function () {
      const { trackItem, pid, trackIndex, getState } = setupLocalTrack();
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(false);
      fireFullClick(trackItem());
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(true);
      fireFullClick(trackItem());
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(false);
    });

    // TODO - We should wait until we have some real non-thread tracks
    it.todo(
      'can isolate a non-thread track, as long as there process has a thread index'
    );
  });

  describe('show all local tracks in a process', function () {
    function setupMoreTracks() {
      const profile = getProfileWithMoreNiceTracks();
      const store = storeWithProfile(profile);

      render(
        <Provider store={store}>
          <TimelineTrackContextMenu />
        </Provider>
      );

      function clickAllThreadPoolTracks() {
        const threadPoolTracks = screen.getAllByText(/^ThreadPool#\d$/);
        for (const track of threadPoolTracks) {
          fireFullClick(track);
        }
      }

      return {
        ...store,
        clickAllThreadPoolTracks,
        profile,
      };
    }

    // This runs 2 tests: the first right clicks a global track, the second
    // right clicks the local track.
    it.each([
      { type: 'global' as const, trackIndex: 0 },
      {
        type: 'local' as const,
        pid: '1000',
        trackIndex: 0,
      },
    ])(
      `from the $type track's context menu`,
      (rightClickedTrackReference: TrackReference) => {
        const { getState, dispatch, clickAllThreadPoolTracks } =
          setupMoreTracks();

        act(() => {
          dispatch(changeRightClickedTrack(rightClickedTrackReference));
        });
        clickAllThreadPoolTracks();

        // First, check that the initial state is what we expect.
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default]',
          '  - hide [thread ThreadPool#1]',
          '  - hide [thread ThreadPool#2]',
          '  - hide [thread ThreadPool#3]',
          '  - hide [thread ThreadPool#4]',
          '  - hide [thread ThreadPool#5]',
          'show [thread GeckoMain tab] SELECTED',
          '  - show [thread DOM Worker]',
          '  - show [thread Style]',
          'show [thread GeckoMain tab]',
          '  - show [thread AudioPool#1]',
          '  - show [thread AudioPool#2]',
          '  - show [thread Renderer]',
        ]);

        // This ensures that the displayed tracks are only from the first process.
        // Please make sure the test here is the same than in the next test.
        expect(screen.queryByText('DOM Worker')).not.toBeInTheDocument();

        // Carry on the test
        fireFullClick(screen.getByText('Show all tracks in this process'));
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default]',
          '  - show [thread ThreadPool#1]',
          '  - show [thread ThreadPool#2]',
          '  - show [thread ThreadPool#3]',
          '  - show [thread ThreadPool#4]',
          '  - show [thread ThreadPool#5]',
          'show [thread GeckoMain tab] SELECTED',
          '  - show [thread DOM Worker]',
          '  - show [thread Style]',
          'show [thread GeckoMain tab]',
          '  - show [thread AudioPool#1]',
          '  - show [thread AudioPool#2]',
          '  - show [thread Renderer]',
        ]);
      }
    );

    it('by double clicking the global process item', () => {
      const { getState, clickAllThreadPoolTracks } = setupMoreTracks();
      clickAllThreadPoolTracks();
      // First, check that the initial state is what we expect.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        '  - hide [thread ThreadPool#1]',
        '  - hide [thread ThreadPool#2]',
        '  - hide [thread ThreadPool#3]',
        '  - hide [thread ThreadPool#4]',
        '  - hide [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
      ]);

      // This ensures that the displayed tracks are for the whole profile.
      // Please make sure the test here is the same than in the previous test.
      expect(screen.getByText('DOM Worker')).toBeInTheDocument();

      // Then carry one with the test.
      const globalTrack = screen.getByText('Parent Process');
      fireFullClick(globalTrack, { detail: 1 });
      fireFullClick(globalTrack, { detail: 2 });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        '  - show [thread ThreadPool#1]',
        '  - show [thread ThreadPool#2]',
        '  - show [thread ThreadPool#3]',
        '  - show [thread ThreadPool#4]',
        '  - show [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
      ]);
    });
  });

  describe('global / local track visibility interplay', function () {
    function setupTracks() {
      const setupResult = setup();
      const { dispatch, getState } = setupResult;

      const trackIndex = 1;
      const trackReference = {
        type: 'global' as const,
        trackIndex: trackIndex,
      };
      const track = getGlobalTracks(getState())[trackIndex];
      if (track.type !== 'process') {
        throw new Error('Expected a process track.');
      }
      const threadIndex = ensureExists(
        track.mainThreadIndex,
        `Couldn't get the mainThreadIndex of global track`
      );

      act(() => {
        dispatch(changeSelectedThreads(new Set([threadIndex])));
      });
      act(() => {
        dispatch(changeRightClickedTrack(trackReference));
      });

      return setupResult;
    }

    it('will unhide the global track when unhiding one of its local tracks', async function () {
      const { getState } = setupTracks();
      // Hide the global track.
      await clickTracksWithExpectation([/^Content Process/], {
        checked: false,
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        // The "GeckoMain tab" process is now hidden.
        'hide [thread GeckoMain tab]',
        // These are still shown as visible, which reflects their
        // internal state, but in the UI they'll appear hidden.
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Unhide "DOM Worker" local track.
      fireFullClick(screen.getByText('DOM Worker'));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        // The "GeckoMain tab" process is visible again.
        'show [thread GeckoMain tab]',
        // Only the "DOM Worker" local track is visible.
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('track search', function () {
    it('can filter a single global track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'Parent Process';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only the GeckoMain is in the document and not the others.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.queryByText('Content Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();
    });

    it('can filter a global track with its local track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'Content Process';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only Content Process and its children are in the document.
      expect(screen.queryByText('Parent Process')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('can filter a local track with its global track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'Style';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only Content Process and its children are in the document.
      expect(screen.queryByText('Parent Process')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('can filter a track with pid or processType', () => {
      const { changeSearchFilter } = setup();
      let searchText = '111'; // pid of GeckoMain

      // Check if all the tracks are visible at first.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only GeckoMain is in the document.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.queryByText('Content Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();

      searchText = 'tab'; // processType of Content Process
      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if Content Process and its children are in the document.
      expect(screen.queryByText('Parent Process')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('shows a message when search filter does not match any track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'search term';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('Parent Process')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      // Change the search filter with something that doesn't match any track.
      changeSearchFilter(searchText);

      jest.runAllTimers();

      // There shouldn't be any tracks visible now.
      expect(screen.queryByText('Parent Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Content Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();

      // Also there should be a text explaining that there is no results found
      // for that text.
      expect(screen.getByText(/No results found for/)).toBeInTheDocument();
    });
  });

  describe('keyboard controls', function () {
    it('enter key would not close the context menu', () => {
      const { showContextMenu, isContextMenuVisible } = setup();
      showContextMenu();
      // Make sure that the context menu is open.
      expect(isContextMenuVisible()).toBeTruthy();

      // Now press enter to test this behavior.
      fireFullKeyPress(screen.getByPlaceholderText('Enter filter terms'), {
        key: 'Enter',
      });

      // Make sure that the context menu is still visible.
      expect(isContextMenuVisible()).toBeTruthy();
    });

    it('escape key closes the context menu', () => {
      const { showContextMenu, isContextMenuVisible } = setup();
      showContextMenu();
      // Make sure that the context menu is open.
      expect(isContextMenuVisible()).toBeTruthy();

      // Now press escape to test this behavior.
      fireFullKeyPress(screen.getByPlaceholderText('Enter filter terms'), {
        key: 'Escape',
      });

      // Make sure that the context menu is closed now.
      expect(isContextMenuVisible()).toBeFalsy();
    });
  });

  describe('hide all tracks by type', function () {
    function setupTracks() {
      const profile = getProfileWithMoreNiceTracks();

      // add a couple local ipc tracks
      addIPCMarkerPairToThreads(
        {
          startTime: 1,
          endTime: 10,
          messageSeqno: 1,
        },
        profile.threads[1], // Parent process
        profile.threads[6], // tab process
        profile.shared
      );
      addIPCMarkerPairToThreads(
        {
          startTime: 11,
          endTime: 20,
          messageSeqno: 2,
        },
        profile.threads[1], // Parent process
        profile.threads[7], // DOM Worker
        profile.shared
      );

      // add a couple of global screenshots tracks
      profile.threads.push({
        ...getThreadWithMarkers(
          profile.shared,
          getScreenshotMarkersForWindowId('0', 5)
        ),
        tid: profile.threads.length,
      });
      profile.threads.push({
        ...getThreadWithMarkers(
          profile.shared,
          getScreenshotMarkersForWindowId('1', 5)
        ),
        tid: profile.threads.length,
      });

      const { store } = setup(profile);

      // show all tracks
      const localTracksByPid = getLocalTracksByPid(store.getState());
      for (const [pid, localTracks] of localTracksByPid) {
        for (
          let trackIndex = 0;
          trackIndex < localTracks.length;
          trackIndex++
        ) {
          act(() => {
            store.dispatch(showLocalTrack(pid, trackIndex));
          });
        }
      }

      const localTrackWithTypeReference = {
        type: 'local' as const,
        pid: '1001',
        trackIndex: 3,
      };
      const globalTrackWithTypeReference = {
        type: 'global' as const,
        trackIndex: 4,
      };

      return {
        ...store,
        localTrackWithTypeReference,
        globalTrackWithTypeReference,
        profile,
      };
    }

    it('on click a global track', () => {
      const { getState, dispatch, globalTrackWithTypeReference } =
        setupTracks();
      // First, check that the initial state is what we expect.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [thread GeckoMain default]',
        '  - show [thread ThreadPool#1]',
        '  - show [ipc ThreadPool#1]',
        '  - show [thread ThreadPool#2]',
        '  - show [thread ThreadPool#3]',
        '  - show [thread ThreadPool#4]',
        '  - show [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [ipc DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
        'hide [process]',
        '  - show [thread Empty]',
        '  - show [thread Empty]',
      ]);

      act(() => {
        dispatch(changeRightClickedTrack(globalTrackWithTypeReference));
      });

      // Note: Fluent adds isolation characters \u2068 and \u2069 around variables.
      const localIPCTrack = screen.getByText(
        'Hide all tracks of type “\u2068screenshots\u2069”'
      );

      fireFullClick(localIPCTrack);

      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [screenshots]',
        'hide [screenshots]',
        'show [thread GeckoMain default]',
        '  - show [thread ThreadPool#1]',
        '  - show [ipc ThreadPool#1]',
        '  - show [thread ThreadPool#2]',
        '  - show [thread ThreadPool#3]',
        '  - show [thread ThreadPool#4]',
        '  - show [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [ipc DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
        'hide [process]',
        '  - show [thread Empty]',
        '  - show [thread Empty]',
      ]);
    });

    it('hides a local track', () => {
      const { getState, dispatch, localTrackWithTypeReference } = setupTracks();

      // First, check that the initial state is what we expect.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [thread GeckoMain default]',
        '  - show [thread ThreadPool#1]',
        '  - show [ipc ThreadPool#1]',
        '  - show [thread ThreadPool#2]',
        '  - show [thread ThreadPool#3]',
        '  - show [thread ThreadPool#4]',
        '  - show [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [ipc DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
        'hide [process]',
        '  - show [thread Empty]',
        '  - show [thread Empty]',
      ]);
      act(() => {
        dispatch(changeRightClickedTrack(localTrackWithTypeReference));
      });

      // Note: Fluent adds isolation characters \u2068 and \u2069 around variables.
      const localIPCTrack = screen.getByText(
        'Hide all tracks of type “\u2068ipc\u2069”'
      );

      fireFullClick(localIPCTrack);

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [thread GeckoMain default]',
        '  - show [thread ThreadPool#1]',
        '  - hide [ipc ThreadPool#1]',
        '  - show [thread ThreadPool#2]',
        '  - show [thread ThreadPool#3]',
        '  - show [thread ThreadPool#4]',
        '  - show [thread ThreadPool#5]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        '  - hide [ipc DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain tab]',
        '  - show [thread AudioPool#1]',
        '  - show [thread AudioPool#2]',
        '  - show [thread Renderer]',
        'hide [process]',
        '  - show [thread Empty]',
        '  - show [thread Empty]',
      ]);
    });
  });
});
