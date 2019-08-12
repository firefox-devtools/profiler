/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from 'react-testing-library';
import { ensureExists } from '../../utils/flow';

import {
  changeSelectedThread,
  changeRightClickedTrack,
} from '../../actions/profile-view';
import TrackContextMenu from '../../components/timeline/TrackContextMenu';
import { getGlobalTracks, getLocalTracks } from '../../selectors/profile';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracks,
} from '../../selectors/url-state';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { getScreenshotTrackProfile } from '../fixtures/profiles/processed-profile';

import { storeWithProfile } from '../fixtures/stores';

describe('timeline/TrackContextMenu', function() {
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
        <TrackContextMenu />
      </Provider>
    );

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      store,
    };
  }

  describe('selected global track', function() {
    function setupGlobalTrack(profile) {
      const results = setup(profile);
      const { getByText, dispatch, getState } = results;

      const trackIndex = 1;
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
        dispatch(changeSelectedThread(threadIndex));
      }
      dispatch(changeRightClickedTrack(trackReference));

      const isolateProcessItem = () => getByText(/Only show this process/);
      const isolateProcessMainThreadItem = () =>
        getByText(/Only show "Content Process"/);
      const trackItem = () => getByText('Content Process');

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateProcessItem,
        isolateProcessMainThreadItem,
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

    it('has the correct selectors into useful parts of the component', function() {
      const { getState } = setupGlobalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the process', function() {
      const { isolateProcessItem, getState } = setupGlobalTrack();
      fireEvent.click(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can isolate the process's main thread", function() {
      const { isolateProcessMainThreadItem, getState } = setupGlobalTrack();
      fireEvent.click(isolateProcessMainThreadItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('isolates a process track without a main thread', function() {
      const profile = getProfileWithNiceTracks();
      // Remove the thread [thread GeckoMain tab]
      profile.threads.splice(1, 1);
      const {
        isolateProcessMainThreadItem,
        isolateProcessItem,
        getState,
      } = setupGlobalTrack(profile);

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [process]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);

      expect(isolateProcessMainThreadItem).toThrow();
      fireEvent.click(isolateProcessItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can toggle a global track by clicking it', function() {
      const { trackItem, trackIndex, getState } = setupGlobalTrack();
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
      fireEvent.click(trackItem());
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(true);
      fireEvent.click(trackItem());
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
    });

    xit('can present a disabled isolate item on non-process tracks', function() {
      // TODO - We should wait until we have some real tracks without a thread index.
    });
  });

  describe('selected local track', function() {
    function setupLocalTrack() {
      const results = setup();
      const { getByText, dispatch, getState } = results;

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
      dispatch(changeSelectedThread(threadIndex));
      dispatch(changeRightClickedTrack(trackReference));

      const isolateLocalTrackItem = () => getByText('Only show "DOM Worker"');
      const trackItem = () => getByText('DOM Worker');

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateLocalTrackItem,
        trackItem,
        pid,
      };
    }

    it('matches the snapshot of a local track', () => {
      const { container } = setupLocalTrack();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const { getState } = setupLocalTrack();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the local track', function() {
      const { isolateLocalTrackItem, getState } = setupLocalTrack();
      fireEvent.click(isolateLocalTrackItem());
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can toggle a local track by clicking it', function() {
      const { trackItem, pid, trackIndex, getState } = setupLocalTrack();
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(false);
      fireEvent.click(trackItem());
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(true);
      fireEvent.click(trackItem());
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(false);
    });

    xit('can isolate a non-thread track, as long as there process has a thread index', function() {
      // TODO - We should wait until we have some real non-thread tracks
    });
  });

  describe('global / local track visibility interplay', function() {
    function setupTracks() {
      const results = setup();
      const { getByText, dispatch, getState } = results;

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

      dispatch(changeSelectedThread(threadIndex));
      dispatch(changeRightClickedTrack(trackReference));

      const globalTrackItem = () => getByText('Content Process');
      const localTrackItem = () => getByText('DOM Worker');

      return {
        ...results,
        globalTrackItem,
        localTrackItem,
      };
    }

    it('will unhide the global track when unhiding one of its local tracks', function() {
      const { getState, globalTrackItem, localTrackItem } = setupTracks();
      // Hide the global track.
      fireEvent.click(globalTrackItem());
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
      fireEvent.click(localTrackItem());
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
});
