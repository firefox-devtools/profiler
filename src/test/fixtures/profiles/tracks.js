/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as profileViewSelectors from '../../../selectors/profile';
import * as urlStateSelectors from '../../../selectors/url-state';
import {
  getProfileFromTextSamples,
  getCounterForThread,
} from './processed-profile';
import { storeWithProfile } from '../stores';
import { oneLine } from 'common-tags';

import type {
  OriginsTimelineTrack,
  Profile,
  State,
  Pid,
} from 'firefox-profiler/types';

import { StringTable } from '../../../utils/string-table';
import { assertExhaustiveCheck } from '../../../utils/flow';
import { getFriendlyThreadName } from '../../../profile-logic/profile-data';
import { INSTANT } from 'firefox-profiler/app-logic/constants';

/**
 * This function takes the current timeline tracks, and generates a human readable result
 * that makes it easy to assert the shape and structure of the tracks in tests.
 *
 * Usage:
 *
 * expect(getHumanReadableTracks(getState())).toEqual([
 *  'show [thread GeckoMain default]',
 *  'show [thread GeckoMain tab] SELECTED',
 *  '  - show [thread DOM Worker]',
 *  '  - show [thread Style]',
 * ]);
 *
 * Format:
 *
 * Global tracks - These are presented with no indentation as one line.
 * Local tracks - These are indented with `  - `
 * Hidden tracks - Each line starts with `show` and `hide` to indicate whether the track
 *                 is shown or hidden.
 * Selected thread - The thread track ends in SELECTED when selected.
 * Global Track naming - `[thread ThreadName ProcessType]` | `[TrackType]`
 * Local Track naming - `[thread ThreadName]` | `[TrackType]`
 */
export function getHumanReadableTracks(state: State): string[] {
  const stringArray =
    profileViewSelectors.getRawProfileSharedData(state).stringArray;
  const threads = profileViewSelectors.getThreads(state);
  const globalTracks = profileViewSelectors.getGlobalTracks(state);
  const hiddenGlobalTracks = urlStateSelectors.getHiddenGlobalTracks(state);
  const selectedThreadIndexes =
    urlStateSelectors.getSelectedThreadIndexes(state);
  const timelineTrackOrganization =
    urlStateSelectors.getTimelineTrackOrganization(state);
  const text: string[] = [];

  if (timelineTrackOrganization.type !== 'full') {
    throw new Error('Expected to have the full timeline track organization.');
  }

  for (const globalTrackIndex of urlStateSelectors.getGlobalTrackOrder(state)) {
    const globalTrack = globalTracks[globalTrackIndex];
    const globalHiddenText = hiddenGlobalTracks.has(globalTrackIndex)
      ? 'hide'
      : 'show';
    if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex !== null
    ) {
      const { mainThreadIndex } = globalTrack;
      const selected = selectedThreadIndexes.has(mainThreadIndex)
        ? ' SELECTED'
        : '';
      const thread = threads[mainThreadIndex];
      text.push(
        // This is broken up into multiple lines to make it easier to read, but it is
        // in fact one line.
        /// Example: 'hide [thread GeckoMain default] SELECTED'
        oneLine`
          ${globalHiddenText}
          [thread ${thread.name} ${thread.processType}]${selected}
        `
      );
    } else {
      text.push(`${globalHiddenText} [${globalTrack.type}]`);
    }

    if (globalTrack.type === 'process') {
      const trackOrder = urlStateSelectors.getLocalTrackOrder(
        state,
        globalTrack.pid
      );
      const tracks = profileViewSelectors.getLocalTracks(
        state,
        globalTrack.pid
      );

      for (const trackIndex of trackOrder) {
        const track = tracks[trackIndex];
        let trackName;
        if (track.type === 'memory') {
          trackName = profileViewSelectors
            .getCounterSelectors(track.counterIndex)
            .getPid(state);
        } else if (track.type === 'bandwidth') {
          trackName = profileViewSelectors
            .getCounterSelectors(track.counterIndex)
            .getPid(state);
        } else if (track.type === 'process-cpu') {
          trackName = profileViewSelectors
            .getCounterSelectors(track.counterIndex)
            .getPid(state);
        } else if (track.type === 'power') {
          trackName = profileViewSelectors
            .getCounterSelectors(track.counterIndex)
            .getCounter(state).name;
        } else if (track.type === 'marker') {
          trackName = stringArray[track.markerName];
        } else {
          trackName = threads[track.threadIndex].name;
        }
        const hiddenTracks = urlStateSelectors.getHiddenLocalTracks(
          state,
          globalTrack.pid
        );

        const hiddenText = hiddenTracks.has(trackIndex) ? 'hide' : 'show';
        const selected =
          track.threadIndex !== undefined &&
          selectedThreadIndexes.has(track.threadIndex)
            ? ' SELECTED'
            : '';

        text.push(`  - ${hiddenText} [${track.type} ${trackName}]${selected}`);
      }
    }
  }
  return text;
}

/**
 * Produces a profile with the following tracks, (as displayed by getHumanReadableTracks.)
 *  [
 *    'show [thread GeckoMain default]',
 *    'show [thread GeckoMain tab]',
 *    '  - show [thread DOM Worker]',
 *    '  - show [thread Style]',
 *  ]
 */
export function getProfileWithNiceTracks(): Profile {
  const { profile } = getProfileFromTextSamples('A', 'B', 'C', 'D');
  const { shared, threads } = profile;
  const [thread1, thread2, thread3, thread4] = threads;
  thread1.name = 'GeckoMain';
  thread1.isMainThread = true;
  thread1.pid = '111';
  thread1.tid = 11;

  thread2.name = 'GeckoMain';
  thread2.isMainThread = true;
  thread2.processType = 'tab';
  thread2.pid = '222';
  thread2.tid = 22;

  // Add a refresh driver tick so that this thread will not be idle.
  thread2.markers.data.push({
    type: 'tracing',
    category: 'Paint',
  });
  thread2.markers.category.push(0);
  const thread2StringTable = StringTable.withBackingArray(shared.stringArray);
  thread2.markers.name.push(
    thread2StringTable.indexForString('RefreshDriverTick')
  );
  thread2.markers.startTime.push(0);
  thread2.markers.endTime.push(null);
  thread2.markers.phase.push(INSTANT);
  thread2.markers.length++;

  thread3.name = 'DOM Worker';
  thread3.pid = '222';
  thread3.processType = 'tab';
  thread3.tid = 33;

  thread4.name = 'Style';
  thread4.processType = 'tab';
  thread4.pid = '222';
  thread4.tid = 44;
  return profile;
}

/** This function produces a profile that will have several global tracks and
 * local tracks, that look like this as displayed by getHumanReadableTracks:
 *  [
 *    'show [thread GeckoMain default]',
 *    '  - show [thread ThreadPool#1]',
 *    '  - show [thread ThreadPool#2]',
 *    '  - show [thread ThreadPool#3]',
 *    '  - show [thread ThreadPool#4]',
 *    '  - show [thread ThreadPool#5]',
 *    'show [thread GeckoMain tab]',
 *    '  - show [thread DOM Worker]',
 *    '  - show [thread Style]',
 *    'show [thread GeckoMain tab]',
 *    '  - show [thread AudioPool#1]',
 *    '  - show [thread AudioPool#2]',
 *    '  - show [thread Renderer]',
 *  ]
 */
export function getProfileWithMoreNiceTracks() {
  const { profile } = getProfileFromTextSamples(
    ...Array.from({ length: 13 }, () => 'A')
  );

  const { threads } = profile;
  let tid = 1000;
  let pid = 1000;

  // Global thread 1
  threads[0].name = 'GeckoMain';
  threads[0].isMainThread = true;
  threads[0].pid = `${pid}`;
  threads[0].tid = tid++;

  for (let i = 1; i <= 5; i++) {
    threads[i].name = `ThreadPool#${i}`;
    threads[i].pid = `${pid}`;
    threads[i].tid = tid++;
  }

  // Global thread 2
  threads[6].name = 'GeckoMain';
  threads[6].isMainThread = true;
  threads[6].processType = 'tab';
  threads[6].pid = `${++pid}`;
  threads[6].tid = tid++;

  threads[7].name = 'DOM Worker';
  threads[7].pid = `${pid}`;
  threads[7].tid = tid++;

  threads[8].name = 'Style';
  threads[8].pid = `${pid}`;
  threads[8].tid = tid++;

  // Global thread 3
  threads[9].name = 'GeckoMain';
  threads[9].isMainThread = true;
  threads[9].processType = 'tab';
  threads[9].pid = `${++pid}`;
  threads[9].tid = tid++;

  threads[10].name = 'AudioPool#1';
  threads[10].pid = `${pid}`;
  threads[10].tid = tid++;

  threads[11].name = 'AudioPool#2';
  threads[11].pid = `${pid}`;
  threads[11].tid = tid++;

  threads[12].name = 'Renderer';
  threads[12].pid = `${pid}`;
  threads[12].tid = tid++;

  return profile;
}

/*
 * This produces a profile where no global track will be found. This is simulating
 * profiles coming from various importers.
 */
export function getProfileWithFakeGlobalTrack(): Profile {
  const { profile } = getProfileFromTextSamples('A', 'B', 'C', 'D');

  const [thread1, thread2, thread3, thread4] = profile.threads;

  // First group of threads
  thread1.name = 'Thread <0>';
  thread1.pid = '111';

  thread2.name = 'Thread <1>';
  thread2.pid = '111';

  // Second group of threads
  thread3.name = 'Thread <2>';
  thread3.pid = '222';

  thread4.name = 'Thread <3>';
  thread4.pid = '222';

  return profile;
}

export function getStoreWithMemoryTrack(pid: Pid = '222') {
  const { profile } = getProfileFromTextSamples(
    // Create a trivial profile with 10 samples, all of the function "A".
    Array(10).fill('A').join('  ')
  );
  const threadIndex = 0;
  const trackIndex = 0;
  const trackReference = { type: 'local', pid, trackIndex };

  {
    // Modify the thread to include the counter.
    const thread = profile.threads[threadIndex];
    thread.name = 'GeckoMain';
    thread.isMainThread = true;
    thread.pid = pid;
    const counter = getCounterForThread(thread, threadIndex);
    counter.category = 'Memory';
    profile.counters = [counter];
  }

  const store = storeWithProfile(profile);
  const localTrack = profileViewSelectors.getLocalTrackFromReference(
    store.getState(),
    trackReference
  );

  if (localTrack.type !== 'memory') {
    throw new Error('Expected a memory track.');
  }
  return { store, ...store, profile, trackReference, localTrack, threadIndex };
}

/**
 * This function takes the current origins timeline tracks, and generates a
 * human readable result that makes it easy to assert the shape and structure
 * of the tracks in tests.
 *
 * Usage:
 *
 *  expect(getHumanReadableOriginTracks(getState())).toEqual([
 *    'Parent Process',
 *    'Compositor',
 *    'GeckoMain pid:(2)',
 *    'GeckoMain pid:(3)',
 *    'https://aaaa.example.com',
 *    '  - https://bbbb.example.com',
 *    '  - https://cccc.example.com',
 *    'https://dddd.example.com',
 *    '  - https://eeee.example.com',
 *    '  - https://ffff.example.com',
 *  ]);
 */
export function getHumanReadableOriginTracks(state: State): string[] {
  const threads = profileViewSelectors.getThreads(state);
  const originsTimeline = profileViewSelectors.getOriginsTimeline(state);

  const results: string[] = [];

  function addHumanFriendlyTrack(
    track: OriginsTimelineTrack,
    nested: boolean = false
  ) {
    const prefix = nested ? '  - ' : '';
    switch (track.type) {
      case 'origin':
        results.push(track.origin);
        for (const child of track.children) {
          addHumanFriendlyTrack(child, true);
        }
        break;
      case 'no-origin': {
        const thread = threads[track.threadIndex];
        results.push(prefix + getFriendlyThreadName(threads, thread));
        break;
      }
      case 'sub-origin': {
        results.push(prefix + track.origin);
        break;
      }
      default:
        throw assertExhaustiveCheck(track, 'Unhandled OriginsTimelineTrack.');
    }
  }

  for (const track of originsTimeline) {
    addHumanFriendlyTrack(track);
  }

  return results;
}
