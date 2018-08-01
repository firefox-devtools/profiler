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
import { getGlobalTracks, getLocalTracks } from '../../reducers/profile-view';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracks,
} from '../../reducers/url-state';
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
  function setup() {
    const profile = getProfileWithNiceTracks();
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
    function setupGlobalTrack() {
      const results = setup();
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
      if (threadIndex === null) {
        throw new Error('Expected the track to have a thread index.');
      }

      // Explicitly select the global thread.
      dispatch(changeSelectedThread(threadIndex));
      view.update();
      dispatch(changeRightClickedTrack(trackReference));

      const isolateTrackItem = view.find('[data-test-id="isolate-track"]');
      const trackItem = view.find(
        `[data-test-id="global-track-${trackIndex}"]`
      );

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateTrackItem,
        trackItem,
      };
    }

    it('matches the snapshot of a global track', () => {
      const { view } = setupGlobalTrack();
      expect(view).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const { isolateTrackItem, trackItem, getState } = setupGlobalTrack();
      expect(isolateTrackItem.text()).toBe('Only show: "Content"');
      expect(trackItem.text()).toBe('Content');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the global track', function() {
      const { isolateTrackItem, getState } = setupGlobalTrack();
      isolateTrackItem.simulate('click');
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
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
      view.update();
      dispatch(changeRightClickedTrack(trackReference));

      const isolateTrackItem = view.find('[data-test-id="isolate-track"]');
      const trackItem = view.find(
        `[data-test-id="local-track-${pid}-${trackIndex}"]`
      );

      return {
        ...results,
        trackReference,
        trackIndex,
        threadIndex,
        isolateTrackItem,
        trackItem,
        pid,
      };
    }

    it('matches the snapshot of a local track', () => {
      const { view } = setupLocalTrack();
      expect(view).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const { isolateTrackItem, trackItem, getState } = setupLocalTrack();
      expect(isolateTrackItem.text()).toBe('Only show: "DOM Worker"');
      expect(trackItem.text()).toBe('DOM Worker');
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can isolate the local track', function() {
      const { isolateTrackItem, getState } = setupLocalTrack();
      isolateTrackItem.simulate('click');
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
  });
});
