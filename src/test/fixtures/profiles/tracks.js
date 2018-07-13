/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as profileViewSelectors from '../../../reducers/profile-view';
import * as urlStateReducers from '../../../reducers/url-state';
import { getProfileFromTextSamples } from './make-profile';
import { oneLine } from 'common-tags';

import type { Profile } from '../../../types/profile';
import type { State } from '../../../types/reducers';

/**
 * This function takes the current timeline tracks, and generates a human readable result
 * that makes it easy to assert the shape and structure of the tracks in tests.
 *
 * Usage:
 *
 * expect(getHumanReadableTracks(getState())).toEqual([
 *  'show [thread GeckoMain process]',
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
  const threads = profileViewSelectors.getThreads(state);
  const globalTracks = profileViewSelectors.getGlobalTracks(state);
  const hiddenGlobalTracks = urlStateReducers.getHiddenGlobalTracks(state);
  const selectedThreadIndex = urlStateReducers.getSelectedThreadIndex(state);
  const text: string[] = [];
  for (const globalTrackIndex of urlStateReducers.getGlobalTrackOrder(state)) {
    const globalTrack = globalTracks[globalTrackIndex];
    const globalHiddenText = hiddenGlobalTracks.has(globalTrackIndex)
      ? 'hide'
      : 'show';
    if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex !== null
    ) {
      const selected =
        globalTrack.mainThreadIndex === selectedThreadIndex ? ' SELECTED' : '';
      const thread = threads[globalTrack.mainThreadIndex];
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
      const trackOrder = urlStateReducers.getLocalTrackOrder(
        state,
        globalTrack.pid
      );
      const tracks = profileViewSelectors.getLocalTracks(
        state,
        globalTrack.pid
      );

      for (const trackIndex of trackOrder) {
        const track = tracks[trackIndex];
        const thread = threads[track.threadIndex];
        const hiddenTracks = urlStateReducers.getHiddenLocalTracks(
          state,
          globalTrack.pid
        );
        const hiddenText = hiddenTracks.has(trackIndex) ? 'hide' : 'show';
        const selected =
          track.threadIndex === selectedThreadIndex ? ' SELECTED' : '';

        text.push(
          `  - ${hiddenText} [${track.type} ${thread.name}]${selected}`
        );
      }
    }
  }
  return text;
}

/**
 * Produces a profile with the following tracks, (as displayed by getHumanReadableTracks.)
 *  [
 *    'show [thread GeckoMain process]',
 *    'show [thread GeckoMain tab]',
 *    '  - show [thread DOM Worker]',
 *    '  - show [thread Style]',
 *  ]
 */
export function getProfileWithNiceTracks(): Profile {
  const { profile } = getProfileFromTextSamples('A', 'B', 'C', 'D');
  const [thread1, thread2, thread3, thread4] = profile.threads;
  thread1.name = 'GeckoMain';
  thread1.processType = 'process';
  thread1.pid = 111;

  thread2.name = 'GeckoMain';
  thread2.processType = 'tab';
  thread2.pid = 222;

  // Add a refresh driver tick so that this thread will not be idle.
  thread2.markers.data.push({
    type: 'tracing',
    category: 'Paint',
    interval: 'start',
  });
  thread2.markers.name.push(
    thread2.stringTable.indexForString('RefreshDriverTick')
  );
  thread2.markers.time.push(0);
  thread2.markers.length++;

  thread3.name = 'DOM Worker';
  thread3.processType = 'tab';
  thread3.pid = 222;

  thread4.name = 'Style';
  thread4.processType = 'tab';
  thread4.pid = 222;
  return profile;
}
