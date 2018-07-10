/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { storeWithProfile } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import {
  getHumanReadableTracks,
  getProfileWithNiceTracks,
} from '../fixtures/profiles/tracks';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import {
  changeGlobalTrackOrder,
  hideGlobalTrack,
  showGlobalTrack,
  isolateGlobalTrack,
  changeLocalTrackOrder,
  hideLocalTrack,
  changeSelectedThread,
  showLocalTrack,
  isolateLocalTrack,
} from '../../actions/profile-view';

describe('ordering and hiding', function() {
  function init(profile = getProfileWithNiceTracks()) {
    const { dispatch, getState } = storeWithProfile(profile);

    // Find all of the indexes.
    const parentThreadIndex = profile.threads.findIndex(
      thread => thread.name === 'GeckoMain' && thread.processType === 'process'
    );
    const tabThreadIndex = profile.threads.findIndex(
      thread => thread.name === 'GeckoMain' && thread.processType === 'tab'
    );
    const workerThreadIndex = profile.threads.findIndex(
      thread => thread.name === 'DOM Worker'
    );
    const styleThreadIndex = profile.threads.findIndex(
      thread => thread.name === 'Style'
    );
    const parentPid = profile.threads[parentThreadIndex].pid;
    const tabPid = profile.threads[workerThreadIndex].pid;
    const globalTracks = ProfileViewSelectors.getGlobalTracks(getState());
    const parentTrackIndex = globalTracks.findIndex(
      track =>
        track.type === 'process' && track.mainThreadIndex === parentThreadIndex
    );
    const tabTrackIndex = globalTracks.findIndex(
      track =>
        track.type === 'process' && track.mainThreadIndex === tabThreadIndex
    );
    profile.threads.findIndex(
      thread => thread.name === 'GeckoMain' && thread.processType === 'tab'
    );
    let styleTrackIndex, workerTrackIndex;
    for (const [, tracks] of ProfileViewSelectors.getLocalTracksByPid(
      getState()
    )) {
      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        if (track.type === 'thread') {
          switch (track.threadIndex) {
            case styleThreadIndex:
              styleTrackIndex = trackIndex;
              break;
            case workerThreadIndex:
              workerTrackIndex = trackIndex;
              break;
            default:
              break;
          }
        }
      }
    }
    if (
      typeof styleTrackIndex !== 'number' ||
      typeof workerTrackIndex !== 'number'
    ) {
      throw new Error('A local track index could not be found');
    }

    return {
      // Store:
      dispatch,
      getState,
      // Indexes:
      parentThreadIndex,
      parentTrackIndex,
      tabThreadIndex,
      tabTrackIndex,
      styleTrackIndex,
      styleThreadIndex,
      workerTrackIndex,
      workerThreadIndex,
      parentPid,
      tabPid,
    };
  }

  describe('global tracks', function() {
    it('starts out with the initial sorting', function() {
      const { getState } = init();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can hide a global track', function() {
      const { getState, dispatch, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(hideGlobalTrack(tabTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'hide global track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('cannot hide the last global track', function() {
      const { getState, dispatch, parentTrackIndex, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(parentTrackIndex));
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can show a global track', function() {
      const { getState, dispatch, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(tabTrackIndex));
      withAnalyticsMock(() => {
        dispatch(showGlobalTrack(tabTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'show global track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can change the global track order', function() {
      const { getState, dispatch, parentTrackIndex, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(changeGlobalTrackOrder([tabTrackIndex, parentTrackIndex]));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'change global track order',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain process]',
      ]);
    });

    it('can isolate a global process track', function() {
      const { getState, dispatch, parentTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateGlobalTrack(parentTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'isolate global track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('reselects the selectedThreadIndex when the selected global track is hidden', function() {
      const {
        getState,
        dispatch,
        tabTrackIndex,
        tabThreadIndex,
        parentThreadIndex,
      } = init();
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
        tabThreadIndex
      );
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
        parentThreadIndex
      );
    });

    it('selects the mainThreadIndex when isolating a process track', function() {
      const {
        getState,
        dispatch,
        tabThreadIndex,
        parentThreadIndex,
        parentTrackIndex,
      } = init();
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
        tabThreadIndex
      );
      dispatch(isolateGlobalTrack(parentTrackIndex));
      expect(UrlStateSelectors.getSelectedThreadIndex(getState())).toEqual(
        parentThreadIndex
      );
    });

    it('will reselect a local thread track when no global track is available', function() {
      const profile = getProfileWithNiceTracks();
      profile.threads = profile.threads.filter(
        thread => !(thread.name === 'GeckoMain' && thread.processType === 'tab')
      );
      const { getState, dispatch, parentTrackIndex, parentThreadIndex } = init(
        profile
      );
      dispatch(changeSelectedThread(parentThreadIndex));
      dispatch(hideGlobalTrack(parentTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });
  });

  describe('local tracks', function() {
    it('can hide a local track', function() {
      const { getState, dispatch, workerTrackIndex, tabPid } = init();
      withAnalyticsMock(() => {
        dispatch(hideLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'hide local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('will hide the global track if hiding the last visible thread', function() {
      const profile = getProfileWithNiceTracks();
      profile.threads = profile.threads.filter(
        thread => !(thread.name === 'GeckoMain' && thread.processType === 'tab')
      );
      const {
        getState,
        dispatch,
        workerTrackIndex,
        tabPid,
        styleTrackIndex,
      } = init(profile);
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'hide [process]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can select a local track's thread", function() {
      const { getState, dispatch, workerThreadIndex } = init();
      dispatch(changeSelectedThread(workerThreadIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('will reselect a sibling thread index when a track is hidden', function() {
      const {
        getState,
        dispatch,
        tabPid,
        workerTrackIndex,
        workerThreadIndex,
      } = init();
      dispatch(changeSelectedThread(workerThreadIndex));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('will reselect the main thread index when all local tracks are hidden', function() {
      const {
        getState,
        dispatch,
        tabPid,
        styleTrackIndex,
        workerTrackIndex,
        workerThreadIndex,
      } = init();
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      dispatch(changeSelectedThread(workerThreadIndex));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('will not hide the last visible thread', function() {
      const profile = getProfileWithNiceTracks();
      profile.threads = profile.threads.filter(
        thread => !(thread.name === 'GeckoMain' && thread.processType === 'tab')
      );
      const {
        getState,
        dispatch,
        workerTrackIndex,
        parentTrackIndex,
        tabPid,
        styleTrackIndex,
      } = init(profile);
      dispatch(hideGlobalTrack(parentTrackIndex));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [process]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('can show a local track', function() {
      const { getState, dispatch, tabPid, workerTrackIndex } = init();
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      withAnalyticsMock(() => {
        dispatch(showLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'show local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can change the local track order', function() {
      const {
        getState,
        dispatch,
        styleTrackIndex,
        workerTrackIndex,
        tabPid,
      } = init();
      dispatch(
        changeLocalTrackOrder(tabPid, [styleTrackIndex, workerTrackIndex])
      );
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);
    });

    it('can isolate a local track', function() {
      const { getState, dispatch, tabPid, workerTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'isolate local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can selects the isolated track', function() {
      const {
        getState,
        dispatch,
        tabPid,
        workerTrackIndex,
        parentThreadIndex,
      } = init();
      dispatch(changeSelectedThread(parentThreadIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
      dispatch(isolateLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });
  });
});
