/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';
import { showMenu } from 'react-contextmenu';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { ensureExists } from '../../utils/flow';
import {
  changeSelectedThreads,
  changeRightClickedTrack,
} from '../../actions/profile-view';
import { TimelineTrackContextMenu } from '../../components/timeline/TrackContextMenu';
import { getGlobalTracks, getLocalTracks } from '../../selectors/profile';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracks,
} from '../../selectors/url-state';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import {
  getScreenshotTrackProfile,
  getNetworkTrackProfile,
} from '../fixtures/profiles/processed-profile';

import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick, fireFullKeyPress } from '../fixtures/utils';

describe('timeline/TrackContextMenu', function () {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain process]',
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
      showMenu({
        data: null,
        id: 'TimelineTrackContextMenu',
        position: { x: 0, y: 0 },
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

  describe('showed all tracks', function () {
    function setupAllTracks() {
      const results = setup();
      const selectAllTracksItem = () => screen.getByText('Show all tracks');

      const hideAllTracks = () => {
        // To hide the tracks before testing 'Show all tracks'
        fireFullClick(screen.getByText('GeckoMain'));
        fireFullClick(screen.getByText('DOM Worker'));
        fireFullClick(screen.getByText('Style'));
      };

      return {
        ...results,
        selectAllTracksItem,
        hideAllTracks,
      };
    }

    it('selects all tracks', () => {
      const { getState, selectAllTracksItem, hideAllTracks } = setupAllTracks();
      // Test behavior when all tracks are already shown
      fireFullClick(selectAllTracksItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Hide all tracks to test behavior
      hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // All tracks should be visible now
      fireFullClick(selectAllTracksItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });
  });

  describe('show all tracks below', function () {
    function setupAllTracks() {
      const results = setup();
      const selectAllTracksBelowItem = () =>
        screen.getByText('Show all tracks below');

      const hideAllTracks = () => {
        // To hide the tracks before testing 'Show all tracks'
        fireFullClick(screen.getByText('GeckoMain'));
        fireFullClick(screen.getByText('DOM Worker'));
        fireFullClick(screen.getByText('Style'));
      };

      return {
        ...results,
        selectAllTracksBelowItem,
        hideAllTracks,
      };
    }

    it('shows a single track', () => {
      const {
        getState,
        selectAllTracksBelowItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain process]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('GeckoMain');
      // Click the button.
      fireFullClick(selectAllTracksBelowItem());

      // GeckoMain should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('shows children of a global track', () => {
      const {
        getState,
        selectAllTracksBelowItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain process]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('Content Process');
      // Click the button.
      fireFullClick(selectAllTracksBelowItem());

      // Children of Content Process should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('shows a local track', () => {
      const {
        getState,
        selectAllTracksBelowItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain process]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks.
      changeSearchFilter('DOM Worker');
      // Click the button.
      fireFullClick(selectAllTracksBelowItem());

      // DOM Worker track should be visible now.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('does not show anything if the list is empty', () => {
      const {
        getState,
        selectAllTracksBelowItem,
        hideAllTracks,
        changeSearchFilter,
      } = setupAllTracks();
      // Hide all tracks to test the behavior.
      hideAllTracks();
      expect(getHumanReadableTracks(getState())).toEqual([
        // Check if the tracks have been hidden.
        'hide [thread GeckoMain process]',
        // There must be at least one visible track.
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);

      // Search something to filter the tracks. This time it's something random.
      changeSearchFilter('this should not be in the tracks list');
      // Click the button.
      fireFullClick(selectAllTracksBelowItem());

      // No new track should be visible.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });
  });

  describe('selected global track', function () {
    function setupGlobalTrack(profile, trackIndex = 1) {
      const results = setup(profile);
      const { dispatch, getState } = results;

      const trackReference = {
        type: 'global',
        trackIndex: trackIndex,
      };
      const track = getGlobalTracks(getState())[trackIndex];
      const threadIndex =
        track.type === 'process' ? track.mainThreadIndex : null;
      if (threadIndex !== null) {
        // Explicitly select the global thread. Tests can pass in a custom profile,
        // so don't fail if this doesn't exist.
        dispatch(changeSelectedThreads(new Set([threadIndex])));
      }
      dispatch(changeRightClickedTrack(trackReference));

      const isolateProcessItem = () =>
        screen.getByText(/Only show this process/);
      // Fluent adds isolation characters \u2068 and \u2069 around Content Process.
      const isolateProcessMainThreadItem = () =>
        screen.getByText(/Only show “\u2068Content Process\u2069”/);
      const trackItem = () => screen.getByText('Content Process');
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
        trackItem,
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
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the process', function () {
      const { isolateProcessItem, getState } = setupGlobalTrack();
      fireFullClick(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can isolate the process's main thread", function () {
      const { isolateProcessMainThreadItem, getState } = setupGlobalTrack();
      fireFullClick(isolateProcessMainThreadItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
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
        'show [thread GeckoMain process] SELECTED',
        'show [process]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      expect(isolateProcessMainThreadItem).toThrow();
      fireFullClick(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
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
        'show [process]',
        '  - show [thread Empty] SELECTED',
      ]);
    });

    it('can hide the process', function () {
      const { hideContentProcess, getState } = setupGlobalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      fireFullClick(hideContentProcess());

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can toggle a global track by clicking it', function () {
      const { trackItem, trackIndex, getState } = setupGlobalTrack();
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
      fireFullClick(trackItem());
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(true);
      fireFullClick(trackItem());
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('can present a disabled isolate item on non-process tracks', function () {
      // TODO - We should wait until we have some real tracks without a thread index.
    });

    it('network track will be displayed when a number is not set for ctxId', () => {
      const { container } = setupGlobalTrack(getNetworkTrackProfile(), 0);
      // We can't use getHumanReadableTracks here because that function doesn't
      // use the functions used by context menu directly and gives us wrong results.
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('selected local track', function () {
    function setupLocalTrack() {
      const results = setup();
      const { dispatch, getState } = results;

      // In getProfileWithNiceTracks, the two pids are 111 and 222 for the
      // "GeckoMain process" and "GeckoMain tab" respectively. Use 222 since it has
      // local tracks.
      const pid = 222;
      const trackIndex = 0;
      const trackReference = {
        type: 'local',
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
      dispatch(changeSelectedThreads(new Set([threadIndex])));
      dispatch(changeRightClickedTrack(trackReference));

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
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the local track', function () {
      const { isolateLocalTrackItem, getState } = setupLocalTrack();
      fireFullClick(isolateLocalTrackItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can hide the DOM worker thread', function () {
      const { hideDOMWorker, getState } = setupLocalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);

      fireFullClick(hideDOMWorker());

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('can isolate a non-thread track, as long as there process has a thread index', function () {
      // TODO - We should wait until we have some real non-thread tracks
    });
  });

  describe('global / local track visibility interplay', function () {
    function setupTracks() {
      const results = setup();
      const { dispatch, getState } = results;

      const trackIndex = 1;
      const trackReference = {
        type: 'global',
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

      dispatch(changeSelectedThreads(new Set([threadIndex])));
      dispatch(changeRightClickedTrack(trackReference));

      const globalTrackItem = () => screen.getByText('Content Process');
      const localTrackItem = () => screen.getByText('DOM Worker');

      return {
        ...results,
        globalTrackItem,
        localTrackItem,
      };
    }

    it('will unhide the global track when unhiding one of its local tracks', function () {
      const { getState, globalTrackItem, localTrackItem } = setupTracks();
      // Hide the global track.
      fireFullClick(globalTrackItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        // The "GeckoMain tab" process is now hidden.
        'hide [thread GeckoMain tab]',
        // These are still shown as visible, which reflects their
        // internal state, but in the UI they'll appear hidden.
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      // Unhide "DOM Worker" local track.
      fireFullClick(localTrackItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
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
      const searchText = 'GeckoMain';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only the GeckoMain is in the document and not the others.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.queryByText('Content Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();
    });

    it('can filter a global track with its local track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'Content Process';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only Content Process and its children are in the document.
      expect(screen.queryByText('GeckoMain')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('can filter a local track with its global track', () => {
      const { changeSearchFilter } = setup();
      const searchText = 'Style';

      // Check if all the tracks are visible at first.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only Content Process and its children are in the document.
      expect(screen.queryByText('GeckoMain')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('can filter a track with pid or processType', () => {
      const { changeSearchFilter } = setup();
      let searchText = '111'; // pid of GeckoMain

      // Check if all the tracks are visible at first.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();

      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if only GeckoMain is in the document.
      expect(screen.getByText('GeckoMain')).toBeInTheDocument();
      expect(screen.queryByText('Content Process')).not.toBeInTheDocument();
      expect(screen.queryByText('Style')).not.toBeInTheDocument();

      searchText = 'tab'; // processType of Content Process
      changeSearchFilter(searchText);

      jest.runAllTimers();

      // Check if Content Process and its children are in the document.
      expect(screen.queryByText('GeckoMain')).not.toBeInTheDocument();
      expect(screen.getByText('Content Process')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
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
  });
});
