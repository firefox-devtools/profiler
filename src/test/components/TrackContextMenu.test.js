/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import {
  changeSelectedThread,
  changeRightClickedTrack,
} from '../../actions/profile-view';
import TrackContextMenu from '../../components/timeline/TrackContextMenu';
import { getGlobalTracks, getLocalTracks } from '../../selectors/profile-view';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracks,
} from '../../selectors/url-state';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
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

    const view = mount(
      <Provider store={store}>
        <TrackContextMenu />
      </Provider>
    );

    return {
      dispatch,
      getState,
      profile,
      store,
      view,
    };
  }

  describe('selected global track', function() {
    function setupGlobalTrack(profile) {
      const results = setup(profile);
      const { view, dispatch, getState } = results;

      const trackIndex = 1;
      const trackReference = {
        type: 'global',
        trackIndex: trackIndex,
      };
      const track = getGlobalTracks(getState())[trackIndex];
      if (track.type !== 'process') {
        throw new Error('Expected a process track.');
      }
      const threadIndex = track.mainThreadIndex;
      if (threadIndex !== null) {
        // Explicitly select the global thread. Tests can pass in a custom profile,
        // so don't fail if this doesn't exist.
        dispatch(changeSelectedThread(threadIndex));
      }
      dispatch(changeRightClickedTrack(trackReference));
      view.update();

      const isolateProcessItem = view.find(
        '[data-test-id="isolate-track-process"]'
      );
      const isolateProcessMainThreadItem = view.find(
        '[data-test-id="isolate-process-main-thread"]'
      );
      const trackItem = view.find(
        `[data-test-id="global-track-${trackIndex}"]`
      );

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
      const { view } = setupGlobalTrack();
      expect(view).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const {
        isolateProcessMainThreadItem,
        isolateProcessItem,
        trackItem,
        getState,
      } = setupGlobalTrack();
      expect(isolateProcessMainThreadItem.text()).toBe(
        'Only show "Content Process"'
      );
      expect(isolateProcessItem.text()).toBe('Only show this process');
      expect(trackItem.text()).toBe('Content Process');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the process', function() {
      const { isolateProcessItem, getState } = setupGlobalTrack();
      isolateProcessItem.simulate('click');
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can isolate the process's main thread", function() {
      const { isolateProcessMainThreadItem, getState } = setupGlobalTrack();
      isolateProcessMainThreadItem.simulate('click');
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

      expect(isolateProcessMainThreadItem.length).toBe(0);
      expect(isolateProcessItem.length).toBe(1);
      isolateProcessItem.simulate('click');
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
      trackItem.simulate('click');
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(true);
      trackItem.simulate('click');
      expect(getHiddenGlobalTracks(getState()).has(trackIndex)).toBe(false);
    });

    xit('can present a disabled isolate item on non-process tracks', function() {
      // TODO - We should wait until we have some real tracks without a thread index.
    });
  });

  describe('selected local track', function() {
    function setupLocalTrack() {
      const results = setup();
      const { view, dispatch, getState } = results;

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
      view.update();

      const isolateLocalTrackItem = view.find(
        '[data-test-id="isolate-local-track"]'
      );
      const trackItem = view.find(
        `[data-test-id="local-track-${pid}-${trackIndex}"]`
      );

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
      const { view } = setupLocalTrack();
      expect(view).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const { isolateLocalTrackItem, trackItem, getState } = setupLocalTrack();
      expect(isolateLocalTrackItem.text()).toBe('Only show "DOM Worker"');
      expect(trackItem.text()).toBe('DOM Worker');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the local track', function() {
      const { isolateLocalTrackItem, getState } = setupLocalTrack();
      isolateLocalTrackItem.simulate('click');
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
      trackItem.simulate('click');
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(true);
      trackItem.simulate('click');
      expect(getHiddenLocalTracks(getState(), pid).has(trackIndex)).toBe(false);
    });

    xit('can isolate a non-thread track, as long as there process has a thread index', function() {
      // TODO - We should wait until we have some real non-thread tracks
    });
  });
});
