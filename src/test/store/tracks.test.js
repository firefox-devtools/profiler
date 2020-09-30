/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  getScreenshotTrackProfile,
  getNetworkTrackProfile,
} from '../fixtures/profiles/processed-profile';
import { getEmptyThread } from '../../profile-logic/data-structures';
import { storeWithProfile } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../selectors/profile';
import * as UrlStateSelectors from '../../selectors/url-state';
import {
  getHumanReadableTracks,
  getProfileWithNiceTracks,
  getStoreWithMemoryTrack,
} from '../fixtures/profiles/tracks';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import {
  changeGlobalTrackOrder,
  hideGlobalTrack,
  showGlobalTrack,
  isolateProcess,
  changeLocalTrackOrder,
  hideLocalTrack,
  changeSelectedThreads,
  showLocalTrack,
  isolateLocalTrack,
  isolateProcessMainThread,
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

  /**
   * This profile is a variant of getProfileWithNiceTracks, but there is no main
   * thread of the second process.
   *
   *  getHumanReadableTracks produces:
   *  [
   *    'show [thread GeckoMain process] SELECTED',
   *    'show [process]',                             // <- No main thread
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]'
   *  ]
   */
  function getProfileWithoutAProcessMainThread() {
    const profile = getProfileWithNiceTracks();
    profile.threads = profile.threads.filter(
      thread => !(thread.name === 'GeckoMain' && thread.processType === 'tab')
    );
    return profile;
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
        dispatch(isolateProcess(parentTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'isolate process',
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

    it('keeps the selected local track when isolating a global track', function() {
      const { getState, dispatch, tabTrackIndex, styleThreadIndex } = init();
      dispatch(changeSelectedThreads(new Set([styleThreadIndex])));
      dispatch(isolateProcess(tabTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('can isolate just the main thread of a process', function() {
      const { getState, dispatch, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateProcessMainThread(tabTrackIndex));
        expect(self.ga).toBeCalledWith('send', {
          eventAction: 'isolate process main thread',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('finds a good selectedThreadIndex when a selected global track is hidden', function() {
      const {
        getState,
        dispatch,
        tabTrackIndex,
        tabThreadIndex,
        parentThreadIndex,
      } = init();
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([tabThreadIndex])
      );
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
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
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([tabThreadIndex])
      );
      dispatch(isolateProcess(parentTrackIndex));
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
      );
    });

    it('will reselect a local thread track when no global track is available', function() {
      const profile = getProfileWithoutAProcessMainThread();
      const { getState, dispatch, parentTrackIndex, parentThreadIndex } = init(
        profile
      );
      dispatch(changeSelectedThreads(new Set([parentThreadIndex])));
      dispatch(hideGlobalTrack(parentTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can extract a screenshots track', function() {
      const { getState } = storeWithProfile(getScreenshotTrackProfile());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [process]',
        '  - show [thread Empty] SELECTED',
      ]);
    });

    describe('sorting of track types to ensure proper URL backwards compatibility', function() {
      const stableIndexOrder = [
        'process',
        'process',
        // Screenshots are last.
        'screenshots',
        'screenshots',
      ];
      const userFacingSortOrder = [
        // Screenshots are first.
        'screenshots',
        'screenshots',
        'process',
        'process',
      ];

      function setup() {
        const profile = getScreenshotTrackProfile();
        profile.threads.push(getEmptyThread());
        const [threadA, threadB] = profile.threads;
        threadA.name = 'GeckoMain';
        threadB.name = 'GeckoMain';
        threadA.processType = 'tab';
        threadB.processType = 'process';
        threadA.pid = 1;
        threadA.pid = 2;
        const { getState } = storeWithProfile(profile);
        return {
          globalTracks: ProfileViewSelectors.getGlobalTracks(getState()),
          globalTrackOrder: UrlStateSelectors.getGlobalTrackOrder(getState()),
        };
      }

      it('creates stable track indexes over time', function() {
        const { globalTracks } = setup();
        expect(globalTracks.map(track => track.type)).toEqual(stableIndexOrder);
      });

      it('creates a separate user-facing ordering that is different from the internal sortiong', function() {
        const { globalTracks, globalTrackOrder } = setup();
        expect(
          globalTrackOrder.map(trackIndex => globalTracks[trackIndex].type)
        ).toEqual(userFacingSortOrder);
      });
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

    it('can count hidden local tracks', function() {
      const { getState, dispatch, workerTrackIndex, tabPid } = init();
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(ProfileViewSelectors.getHiddenTrackCount(getState())).toEqual({
        hidden: 1,
        total: 4,
      });
    });

    it('can count hidden global tracks and their hidden local tracks', function() {
      const { getState, dispatch, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(ProfileViewSelectors.getHiddenTrackCount(getState())).toEqual({
        hidden: 3,
        total: 4,
      });
    });

    it('will hide the global track if hiding the last visible thread', function() {
      const profile = getProfileWithoutAProcessMainThread();
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
      dispatch(changeSelectedThreads(new Set([workerThreadIndex])));
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
      dispatch(changeSelectedThreads(new Set([workerThreadIndex])));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('will reselect a sibling thread index when a track is hidden 2', function() {
      const {
        getState,
        dispatch,
        tabPid,
        styleTrackIndex,
        styleThreadIndex,
      } = init();
      dispatch(changeSelectedThreads(new Set([styleThreadIndex])));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
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
      dispatch(changeSelectedThreads(new Set([workerThreadIndex])));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain process]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('will not hide the last visible thread', function() {
      const profile = getProfileWithoutAProcessMainThread();
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

    it('will not hide the last visible thread 2', function() {
      const profile = getProfileWithoutAProcessMainThread();
      const {
        getState,
        dispatch,
        workerTrackIndex,
        parentTrackIndex,
        tabPid,
        styleTrackIndex,
      } = init(profile);
      dispatch(hideGlobalTrack(parentTrackIndex));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain process]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
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

    it('can select the isolated track', function() {
      const {
        getState,
        dispatch,
        tabPid,
        workerTrackIndex,
        parentThreadIndex,
      } = init();
      dispatch(changeSelectedThreads(new Set([parentThreadIndex])));
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

    describe('sorting of track types to ensure proper URL backwards compatibility', function() {
      const stableIndexOrder = [
        'thread',
        // Network is last.
        'network',
      ];
      const userFacingSortOrder = [
        // Network is first.
        'network',
        'thread',
      ];

      function setup() {
        const profile = getNetworkTrackProfile();
        const pid = 1;
        profile.threads[0].pid = pid;
        const { getState } = storeWithProfile(profile);
        return {
          localTracks: ProfileViewSelectors.getLocalTracks(getState(), pid),
          localTrackOrder: UrlStateSelectors.getLocalTrackOrder(
            getState(),
            pid
          ),
        };
      }

      it('creates stable track indexes over time', function() {
        const { localTracks } = setup();
        expect(localTracks.map(track => track.type)).toEqual(stableIndexOrder);
      });

      it('creates a separate user-facing ordering that is different from the internal sortiong', function() {
        const { localTracks, localTrackOrder } = setup();
        expect(
          localTrackOrder.map(trackIndex => localTracks[trackIndex].type)
        ).toEqual(userFacingSortOrder);
      });
    });
  });
});

describe('ProfileViewSelectors.getProcessesWithMemoryTrack', function() {
  it('knows when a profile does not have a memory track', function() {
    const profile = getProfileWithNiceTracks();
    const [thread] = profile.threads;
    const { getState } = storeWithProfile(profile);
    const processesWithMemoryTrack = ProfileViewSelectors.getProcessesWithMemoryTrack(
      getState()
    );
    expect(processesWithMemoryTrack.has(thread.pid)).toEqual(false);
  });

  it('knows when a profile has a memory track', function() {
    const { getState, profile } = getStoreWithMemoryTrack();
    const [thread] = profile.threads;
    const processesWithMemoryTrack = ProfileViewSelectors.getProcessesWithMemoryTrack(
      getState()
    );
    expect(processesWithMemoryTrack.has(thread.pid)).toEqual(true);
  });
});
