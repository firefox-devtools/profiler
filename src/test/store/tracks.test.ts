/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getScreenshotTrackProfile,
  getNetworkTrackProfile,
  addIPCMarkerPairToThreads,
  getProfileWithMarkers,
  getProfileFromTextSamples,
  getProfileWithThreadCPUDelta,
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
import type { MarkerSchema } from 'firefox-profiler/types';

describe('ordering and hiding', function () {
  function init(profile = getProfileWithNiceTracks()) {
    const { dispatch, getState } = storeWithProfile(profile);

    // Find all of the indexes.
    const parentThreadIndex = profile.threads.findIndex(
      (thread) =>
        thread.name === 'GeckoMain' && thread.processType === 'default'
    );
    const tabThreadIndex = profile.threads.findIndex(
      (thread) => thread.name === 'GeckoMain' && thread.processType === 'tab'
    );
    const workerThreadIndex = profile.threads.findIndex(
      (thread) => thread.name === 'DOM Worker'
    );
    const styleThreadIndex = profile.threads.findIndex(
      (thread) => thread.name === 'Style'
    );
    const parentPid = profile.threads[parentThreadIndex].pid;
    const tabPid = profile.threads[workerThreadIndex].pid;
    const globalTracks = ProfileViewSelectors.getGlobalTracks(getState());
    const parentTrackIndex = globalTracks.findIndex(
      (track) =>
        track.type === 'process' && track.mainThreadIndex === parentThreadIndex
    );
    const tabTrackIndex = globalTracks.findIndex(
      (track) =>
        track.type === 'process' && track.mainThreadIndex === tabThreadIndex
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
   *    'show [thread GeckoMain default] SELECTED',
   *    'show [process]',                             // <- No main thread
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]'
   *  ]
   */
  function getProfileWithoutAProcessMainThread() {
    const profile = getProfileWithNiceTracks();
    profile.threads = profile.threads.filter(
      (thread) => !(thread.name === 'GeckoMain' && thread.processType === 'tab')
    );
    return profile;
  }

  function getProfileWithCustomMarkerTracks() {
    const profile = getProfileWithMarkers([
      ['Marker', 1, 2, { type: 'Marker', first: 5 }],
      ['NoGraphMarker', 3, 4, { type: 'NoGraphMarker', first: 6 }],
    ]);

    const extraMarkerSchemas: MarkerSchema[] = [
      {
        name: 'Marker',
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        fields: [{ key: 'first', label: 'first', format: 'integer' }],
        graphs: [
          {
            key: 'first',
            type: 'line',
          },
        ],
      },
      {
        name: 'NoGraphMarker',
        display: ['marker-chart', 'marker-table'],
        fields: [{ key: 'first', label: 'first', format: 'integer' }],
        // An empty array should behave just as if the property isn't present.
        graphs: [],
      },
    ];
    profile.meta.markerSchema.push(...extraMarkerSchemas);

    return profile;
  }

  describe('global tracks', function () {
    it('starts out with the initial sorting', function () {
      const { getState } = init();
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can hide a global track', function () {
      const { getState, dispatch, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(hideGlobalTrack(tabTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'hide global track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('cannot hide the last global track', function () {
      const { getState, dispatch, parentTrackIndex, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(parentTrackIndex));
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can show a global track', function () {
      const { getState, dispatch, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(tabTrackIndex));
      withAnalyticsMock(() => {
        dispatch(showGlobalTrack(tabTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'show global track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can change the global track order', function () {
      const { getState, dispatch, parentTrackIndex, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(changeGlobalTrackOrder([tabTrackIndex, parentTrackIndex]));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'change global track order',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
        'show [thread GeckoMain default]',
      ]);
    });

    it('can isolate a global process track', function () {
      const { getState, dispatch, parentTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateProcess(parentTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'isolate process',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('keeps the selected local track when isolating a global track', function () {
      const { getState, dispatch, tabTrackIndex, styleThreadIndex } = init();
      dispatch(changeSelectedThreads(new Set([styleThreadIndex])));
      dispatch(isolateProcess(tabTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('can isolate just the main thread of a process', function () {
      const { getState, dispatch, tabTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateProcessMainThread(tabTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'isolate process main thread',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('finds a good selectedThreadIndex when a selected global track is hidden', function () {
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

    it('selects the mainThreadIndex when isolating a process track', function () {
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

    it('will reselect a local thread track when no global track is available', function () {
      const profile = getProfileWithoutAProcessMainThread();
      const { getState, dispatch, parentTrackIndex, parentThreadIndex } =
        init(profile);
      dispatch(changeSelectedThreads(new Set([parentThreadIndex])));
      dispatch(hideGlobalTrack(parentTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('can extract a screenshots track', function () {
      const { getState } = storeWithProfile(getScreenshotTrackProfile());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [screenshots]',
        'show [process]',
        '  - show [thread Empty] SELECTED',
      ]);
    });

    describe('sorting of track types to ensure proper URL backwards compatibility', function () {
      const stableIndexOrder = [
        'process',
        'process',
        // Screenshots are last.
        'screenshots',
        'screenshots',
        'screenshots',
      ];
      const userFacingSortOrder = [
        // Screenshots are first.
        'screenshots',
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
        threadA.isMainThread = true;
        threadB.name = 'GeckoMain';
        threadB.isMainThread = true;
        threadA.processType = 'tab';
        threadA.pid = '1';
        threadA.pid = '2';
        const { getState } = storeWithProfile(profile);
        return {
          globalTracks: ProfileViewSelectors.getGlobalTracks(getState()),
          globalTrackOrder: UrlStateSelectors.getGlobalTrackOrder(getState()),
        };
      }

      it('creates stable track indexes over time', function () {
        const { globalTracks } = setup();
        expect(globalTracks.map((track) => track.type)).toEqual(
          stableIndexOrder
        );
      });

      it('creates a separate user-facing ordering that is different from the internal sorting', function () {
        const { globalTracks, globalTrackOrder } = setup();
        expect(
          globalTrackOrder.map((trackIndex) => globalTracks[trackIndex].type)
        ).toEqual(userFacingSortOrder);
      });
    });

    describe('ordering by activity', function () {
      it('orders process tracks by activity score while keeping parent process first', function () {
        const { profile } = getProfileFromTextSamples(
          'A  B  C  D  E  F  G  H  I  J', // High activity parent process
          'X  Y', // Low activity tab process
          'P  Q  R  S  T  U  V  W  X  Y  Z  A  B  C  D' // Very high activity tab process
        );

        // Set up threads as different processes
        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'default'; // Parent process
        profile.threads[0].pid = '1';

        profile.threads[1].name = 'GeckoMain';
        profile.threads[1].isMainThread = true;
        profile.threads[1].processType = 'tab';
        profile.threads[1].pid = '2';

        profile.threads[2].name = 'GeckoMain';
        profile.threads[2].isMainThread = true;
        profile.threads[2].processType = 'tab';
        profile.threads[2].pid = '3';

        const { getState } = storeWithProfile(profile);

        // Parent process should be first, then tab processes ordered by activity
        // The highest activity tab process (index 2) should be selected by default
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default]', // Parent process first
          'show [thread GeckoMain tab] SELECTED', // Very high activity tab process selected
          'show [thread GeckoMain tab]', // Low activity tab process
        ]);

        const globalTrackOrder =
          UrlStateSelectors.getGlobalTrackOrder(getState());
        expect(globalTrackOrder).toEqual([0, 2, 1]);
      });

      it('orders multiple tab processes by their activity levels', function () {
        const profile = getProfileWithThreadCPUDelta([
          [5, 5, 5], // Low activity tab process
          [50, 50, 50], // High activity tab process
          [25, 25, 25], // Medium activity tab process
        ]);

        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'tab';
        profile.threads[0].pid = '1';

        profile.threads[1].name = 'GeckoMain';
        profile.threads[1].isMainThread = true;
        profile.threads[1].processType = 'tab';
        profile.threads[1].pid = '2';

        profile.threads[2].name = 'GeckoMain';
        profile.threads[2].isMainThread = true;
        profile.threads[2].processType = 'tab';
        profile.threads[2].pid = '3';

        const { getState } = storeWithProfile(profile);

        // Processes should be ordered by activity: high, medium, low
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain tab] SELECTED', // High activity (index 1)
          'show [thread GeckoMain tab]', // Medium activity (index 2)
          'show [thread GeckoMain tab]', // Low activity (index 0)
        ]);

        const globalTrackOrder =
          UrlStateSelectors.getGlobalTrackOrder(getState());
        expect(globalTrackOrder).toEqual([1, 2, 0]);
      });

      it('handles processes without main threads gracefully', function () {
        const { profile } = getProfileFromTextSamples('A', 'B');

        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'tab';
        profile.threads[0].pid = '1';

        profile.threads[1].name = 'DOM Worker';
        profile.threads[1].isMainThread = false;
        profile.threads[1].processType = 'tab';
        profile.threads[1].pid = '2'; // Different PID, no main thread

        const { getState } = storeWithProfile(profile);

        // Should not crash and maintain a stable order
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain tab] SELECTED',
          'show [process]',
          '  - show [thread DOM Worker]',
        ]);

        const globalTrackOrder =
          UrlStateSelectors.getGlobalTrackOrder(getState());
        expect(globalTrackOrder).toEqual([0, 1]);
      });
    });

    describe('default selected thread selection by activity', function () {
      it('selects the tab process with highest activity as default', function () {
        const profile = getProfileWithThreadCPUDelta([
          [10, 10, 10], // Low activity parent process
          [5, 5, 5], // Low activity tab process
          [50, 50, 50], // High activity tab process
        ]);

        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'default'; // Parent process
        profile.threads[0].pid = '0';

        profile.threads[1].name = 'GeckoMain';
        profile.threads[1].isMainThread = true;
        profile.threads[1].processType = 'tab';
        profile.threads[1].pid = '1';

        profile.threads[2].name = 'GeckoMain';
        profile.threads[2].isMainThread = true;
        profile.threads[2].processType = 'tab';
        profile.threads[2].pid = '2';

        const { getState } = storeWithProfile(profile);

        // The high activity tab process (index 2) should be selected
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default]', // Parent process
          'show [thread GeckoMain tab] SELECTED', // High activity tab selected
          'show [thread GeckoMain tab]', // Low activity tab
        ]);

        const globalTrackOrder =
          UrlStateSelectors.getGlobalTrackOrder(getState());
        expect(globalTrackOrder).toEqual([0, 2, 1]);
      });

      it('falls back to first thread when no tab processes exist', function () {
        const profile = getProfileWithThreadCPUDelta([
          [10, 10, 10], // Parent process only
        ]);

        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'default';
        profile.threads[0].pid = '0';

        const { getState } = storeWithProfile(profile);

        // Parent process should be selected as fallback
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default] SELECTED',
        ]);
      });

      it('selects highest activity tab even when parent has higher activity', function () {
        const profile = getProfileWithThreadCPUDelta([
          [100, 100, 100], // Very high activity parent process
          [50, 50, 50], // Medium activity tab process
          [75, 75, 75], // High activity tab process
        ]);

        profile.threads[0].name = 'GeckoMain';
        profile.threads[0].isMainThread = true;
        profile.threads[0].processType = 'default'; // Parent process
        profile.threads[0].pid = '0';

        profile.threads[1].name = 'GeckoMain';
        profile.threads[1].isMainThread = true;
        profile.threads[1].processType = 'tab';
        profile.threads[1].pid = '1';

        profile.threads[2].name = 'GeckoMain';
        profile.threads[2].isMainThread = true;
        profile.threads[2].processType = 'tab';
        profile.threads[2].pid = '2';

        const { getState } = storeWithProfile(profile);

        // The highest activity tab process (index 2) should be selected,
        // not the parent process despite it having higher activity
        expect(getHumanReadableTracks(getState())).toEqual([
          'show [thread GeckoMain default]', // Parent process not selected
          'show [thread GeckoMain tab] SELECTED', // High activity tab selected
          'show [thread GeckoMain tab]', // Medium activity tab
        ]);

        const globalTrackOrder =
          UrlStateSelectors.getGlobalTrackOrder(getState());
        expect(globalTrackOrder).toEqual([0, 2, 1]);
      });
    });
  });

  describe('local tracks', function () {
    it('can define custom local tracks from marker graphs', function () {
      const { getState } = storeWithProfile(getProfileWithCustomMarkerTracks());
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [process]',
        '  - show [thread Empty] SELECTED',
        '  - show [marker Marker] SELECTED',
      ]);
    });

    it('can hide a local track', function () {
      const { getState, dispatch, workerTrackIndex, tabPid } = init();
      withAnalyticsMock(() => {
        dispatch(hideLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'hide local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can count hidden local tracks', function () {
      const { getState, dispatch, workerTrackIndex, tabPid } = init();
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      expect(ProfileViewSelectors.getTrackCount(getState())).toEqual({
        hidden: 1,
        total: 4,
      });
    });

    it('can count hidden global tracks and their hidden local tracks', function () {
      const { getState, dispatch, tabTrackIndex } = init();
      dispatch(hideGlobalTrack(tabTrackIndex));
      expect(ProfileViewSelectors.getTrackCount(getState())).toEqual({
        hidden: 3,
        total: 4,
      });
    });

    it('will hide the global track if hiding the last visible thread', function () {
      const profile = getProfileWithoutAProcessMainThread();
      const { getState, dispatch, workerTrackIndex, tabPid, styleTrackIndex } =
        init(profile);
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'hide [process]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it("can select a local track's thread", function () {
      const { getState, dispatch, workerThreadIndex } = init();
      dispatch(changeSelectedThreads(new Set([workerThreadIndex])));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('will reselect a sibling thread index when a track is hidden', function () {
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
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('will reselect a sibling thread index when a track is hidden 2', function () {
      const { getState, dispatch, tabPid, styleTrackIndex, styleThreadIndex } =
        init();
      dispatch(changeSelectedThreads(new Set([styleThreadIndex])));
      dispatch(hideLocalTrack(tabPid, styleTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('will reselect the main thread index when all local tracks are hidden', function () {
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
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('will not hide the last visible thread', function () {
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
        'hide [thread GeckoMain default]',
        'show [process]',
        '  - hide [thread DOM Worker]',
        '  - show [thread Style] SELECTED',
      ]);
    });

    it('will not hide the last visible thread 2', function () {
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
        'hide [thread GeckoMain default]',
        'show [process]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can show a local track', function () {
      const { getState, dispatch, tabPid, workerTrackIndex } = init();
      dispatch(hideLocalTrack(tabPid, workerTrackIndex));
      withAnalyticsMock(() => {
        dispatch(showLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'show local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('can change the local track order', function () {
      const { getState, dispatch, styleTrackIndex, workerTrackIndex, tabPid } =
        init();
      dispatch(
        changeLocalTrackOrder(tabPid, [styleTrackIndex, workerTrackIndex])
      );
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);
    });

    it('can isolate a local track', function () {
      const { getState, dispatch, tabPid, workerTrackIndex } = init();
      withAnalyticsMock(() => {
        dispatch(isolateLocalTrack(tabPid, workerTrackIndex));
        expect(self.ga).toHaveBeenCalledWith('send', {
          eventAction: 'isolate local track',
          eventCategory: 'timeline',
          hitType: 'event',
        });
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    it('can select the isolated track', function () {
      const {
        getState,
        dispatch,
        tabPid,
        workerTrackIndex,
        parentThreadIndex,
      } = init();
      dispatch(changeSelectedThreads(new Set([parentThreadIndex])));
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
      dispatch(isolateLocalTrack(tabPid, workerTrackIndex));
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [thread Style]',
      ]);
    });

    describe('sorting of track types to ensure proper URL backwards compatibility', function () {
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
        const pid = '1';
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

      it('creates stable track indexes over time', function () {
        const { localTracks } = setup();
        expect(localTracks.map((track) => track.type)).toEqual(
          stableIndexOrder
        );
      });

      it('creates a separate user-facing ordering that is different from the internal sorting', function () {
        const { localTracks, localTrackOrder } = setup();
        expect(
          localTrackOrder.map((trackIndex) => localTracks[trackIndex].type)
        ).toEqual(userFacingSortOrder);
      });
    });

    it('properly initializes the sorting with for the IPC tracks', function () {
      // IPC tracks have a special case for the track ordering. They always
      // appear after the thread tracks that they belong to. If they belong to
      // the global track, then it should show up before the other local tracks.
      // If it belongs to a local track, it should appear right after the local
      // thread track.
      const profile = getProfileWithNiceTracks();
      const { pid } = profile.threads[1];
      addIPCMarkerPairToThreads(
        {
          startTime: 1,
          endTime: 10,
          messageSeqno: 1,
        },
        profile.threads[1], // tab process
        profile.threads[2], // DOM Worker
        profile.shared
      );
      const { getState } = storeWithProfile(profile);
      const localTracks = ProfileViewSelectors.getLocalTracks(getState(), pid);
      const localTrackOrder = UrlStateSelectors.getLocalTrackOrder(
        getState(),
        pid
      );

      // Check that we properly put the two IPC tracks right after their threads.
      // Since the first IPC track belongs to the global track, it should appear
      // first, and the second IPC track should appear after the DOM Worker track.
      expect(
        localTrackOrder.map((trackIndex) => localTracks[trackIndex].type)
      ).toEqual(['ipc', 'thread', 'ipc', 'thread']);

      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        // Belongs to the global tab track.
        '  - hide [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        // Belongs to the DOM Worker local track.
        '  - hide [ipc DOM Worker]',
        '  - show [thread Style]',
      ]);
    });
  });
});

describe('ProfileViewSelectors.getProcessesWithMemoryTrack', function () {
  it('knows when a profile does not have a memory track', function () {
    const profile = getProfileWithNiceTracks();
    const [thread] = profile.threads;
    const { getState } = storeWithProfile(profile);
    const processesWithMemoryTrack =
      ProfileViewSelectors.getProcessesWithMemoryTrack(getState());
    expect(processesWithMemoryTrack.has(thread.pid)).toEqual(false);
  });

  it('knows when a profile has a memory track', function () {
    const { getState, profile } = getStoreWithMemoryTrack();
    const [thread] = profile.threads;
    const processesWithMemoryTrack =
      ProfileViewSelectors.getProcessesWithMemoryTrack(getState());
    expect(processesWithMemoryTrack.has(thread.pid)).toEqual(true);
  });
});
