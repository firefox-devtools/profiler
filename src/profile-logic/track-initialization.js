/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Profile, Thread, ThreadIndex, Pid } from '../types/profile';
import type {
  GlobalTrack,
  LocalTrack,
  TrackIndex,
} from '../types/profile-derived';
import { defaultThreadOrder } from './profile-data';

/**
 * This file collects all the logic that goes into validating URL-encoded view options.
 * It also selects the default view options for things like track hiding, ordering,
 * and selection.
 */

export function initializeLocalTrackOrderByPid(
  urlTrackOrderByPid: Map<Pid, TrackIndex[]> | null,
  localTracksByPid: Map<Pid, LocalTrack[]>
): Map<Pid, TrackIndex[]> {
  const trackOrderByPid = new Map();

  // Go through each set of tracks, determine the sort order.
  for (const [pid, tracks] of localTracksByPid) {
    // Create the default trackOrder.
    let trackOrder = tracks.map((_, index) => index);

    if (urlTrackOrderByPid !== null) {
      const urlTrackOrder = urlTrackOrderByPid.get(pid);
      if (
        urlTrackOrder !== undefined &&
        _indexesAreValid(tracks.length, urlTrackOrder)
      ) {
        trackOrder = urlTrackOrder;
      }
    }

    trackOrderByPid.set(pid, trackOrder);
  }

  return trackOrderByPid;
}

export function initializeHiddenLocalTracksByPid(
  urlHiddenTracksByPid: Map<Pid, Set<TrackIndex>> | null,
  localTracksByPid: Map<Pid, LocalTrack[]>,
  threads: Thread[]
): Map<Pid, Set<TrackIndex>> {
  const hiddenTracksByPid = new Map();

  // Go through each set of tracks, determine the sort order.
  for (const [pid, tracks] of localTracksByPid) {
    const hiddenTracks = new Set();

    if (urlHiddenTracksByPid === null) {
      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        if (
          track.type === 'thread' &&
          _isThreadIdle(threads[track.threadIndex])
        ) {
          hiddenTracks.add(trackIndex);
        }
      }
    } else {
      const urlHiddenTracks = urlHiddenTracksByPid.get(pid);
      const trackIndexes = tracks.map((_, index) => index);

      if (urlHiddenTracks !== undefined) {
        for (const index of urlHiddenTracks) {
          if (trackIndexes.includes(index)) {
            hiddenTracks.add(index);
          }
        }
      }
    }

    hiddenTracksByPid.set(pid, hiddenTracks);
  }

  return hiddenTracksByPid;
}

export function computeTracksByPid(profile: Profile): Map<Pid, LocalTrack[]> {
  const localTracksByPid = new Map();

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { pid } = thread;
    // Get or create the tracks and trackOrder.
    let tracks = localTracksByPid.get(pid);
    if (tracks === undefined) {
      tracks = [];
      localTracksByPid.set(pid, tracks);
    }

    if (_isMainThread(thread)) {
      // This thread was already added as a GlobalTrack.
      continue;
    }

    tracks.push({ type: 'thread', threadIndex });
  }

  return localTracksByPid;
}

export function computeGlobalTracks(profile: Profile): GlobalTrack[] {
  // Defining this ProcessTrack type here helps flow understand the intent of
  // the internals of this function.
  type ProcessTrack = {
    type: 'process',
    pid: Pid,
    mainThreadIndex: number | null,
  };
  const globalTracksByPid: Map<Pid, ProcessTrack> = new Map();
  const globalTracks: GlobalTrack[] = [];

  // Create the global tracks.
  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { pid } = thread;
    if (_isMainThread(thread)) {
      // This is a main thread, a global track needs to be created or updated with
      // the main thread info.
      let globalTrack = globalTracksByPid.get(pid);
      if (globalTrack === undefined) {
        // Create the track.
        globalTrack = {
          type: 'process',
          pid,
          mainThreadIndex: threadIndex,
        };
        globalTracks.push(globalTrack);
        globalTracksByPid.set(pid, globalTrack);
      } else {
        // The main thread index was found, add it.
        globalTrack.mainThreadIndex = threadIndex;
      }
    } else {
      // This is a non-main thread.
      if (!globalTracksByPid.has(pid)) {
        // This is a thread without a known main thread. Create a global process
        // track for it, but don't add a main thread for it.
        const globalTrack = {
          type: 'process',
          pid: pid,
          mainThreadIndex: null,
        };
        globalTracks.push(globalTrack);
        globalTracksByPid.set(pid, globalTrack);
      }
    }
  }
  return globalTracks;
}

export function initializeGlobalTrackOrder(
  globalTracks: GlobalTrack[],
  urlGlobalTrackOrder: TrackIndex[] | null
): TrackIndex[] {
  return urlGlobalTrackOrder !== null &&
    _indexesAreValid(globalTracks.length, urlGlobalTrackOrder)
    ? urlGlobalTrackOrder
    : globalTracks.map((_, index) => index);
}

export function initializeSelectedThreadIndex(
  selectedThreadIndex: ThreadIndex | null,
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile
): ThreadIndex | null {
  if (
    selectedThreadIndex !== null &&
    visibleThreadIndexes.includes(selectedThreadIndex)
  ) {
    // This is a valid thread index to select.
    return selectedThreadIndex;
  }
  // Select either the GeckoMain [tab] thread, or the first thread in the thread
  // order.
  const threadIndex = profile.threads.indexOf(
    _findDefaultThread(
      visibleThreadIndexes.map(threadIndex => profile.threads[threadIndex])
    )
  );
  // The threadIndex being null should only happen in tests where profiles
  // have no threads.
  return threadIndex === -1 ? null : threadIndex;
}

export function initializeHiddenGlobalTracks(
  globalTracks: GlobalTrack[],
  threads: Thread[],
  validTrackIndexes: TrackIndex[],
  urlHiddenGlobalTracks: Set<TrackIndex> | null
): Set<TrackIndex> {
  const hiddenGlobalTracks = new Set();

  if (urlHiddenGlobalTracks === null) {
    // No hidden global tracks exist, generate the default Set.
    for (const track of globalTracks) {
      if (track.type === 'process' && track.mainThreadIndex !== null) {
        const { mainThreadIndex } = track;
        const thread = threads[mainThreadIndex];
        if (_isThreadIdle(thread)) {
          hiddenGlobalTracks.add(mainThreadIndex);
        }
      }
    }
    return hiddenGlobalTracks;
  }

  // Validate the global tracks to hide.
  for (const trackIndex of urlHiddenGlobalTracks) {
    if (validTrackIndexes.includes(trackIndex)) {
      hiddenGlobalTracks.add(trackIndex);
    }
  }
  return hiddenGlobalTracks;
}

export function getVisibleThreads(
  globalTracks: GlobalTrack[],
  hiddenGlobalTracks: Set<TrackIndex>,
  localTracksByPid: Map<Pid, LocalTrack[]>,
  hiddenTracksByPid: Map<Pid, Set<TrackIndex>>
): ThreadIndex[] {
  const visibleThreads = [];
  for (const globalTrack of globalTracks) {
    if (globalTrack.type === 'process') {
      const { mainThreadIndex, pid } = globalTrack;
      if (
        mainThreadIndex !== null &&
        !hiddenGlobalTracks.has(mainThreadIndex)
      ) {
        visibleThreads.push(mainThreadIndex);
      }
      const tracks = localTracksByPid.get(pid);
      const hiddenTracks = hiddenTracksByPid.get(pid);
      if (tracks !== undefined && hiddenTracks !== undefined) {
        for (const track of tracks) {
          if (track.type === 'thread') {
            const { threadIndex } = track;
            if (!hiddenTracks.has(threadIndex)) {
              visibleThreads.push(threadIndex);
            }
          }
        }
      }
    }
  }
  return visibleThreads;
}

/**
 * Determine if a thread is idle, so that it can be hidden. It is really annoying for an
 * end user to load a profile full of empty and idle threads.
 */
function _isThreadIdle(thread: Thread): boolean {
  // Hide content threads with no RefreshDriverTick. This indicates they were
  // not painted to, and most likely idle. This is just a heuristic to help users.
  if (thread.name === 'GeckoMain' && thread.processType === 'tab') {
    let isPaintMarkerFound = false;
    if (thread.stringTable.hasString('RefreshDriverTick')) {
      const paintStringIndex = thread.stringTable.indexForString(
        'RefreshDriverTick'
      );

      for (
        let markerIndex = 0;
        markerIndex < thread.markers.length;
        markerIndex++
      ) {
        if (paintStringIndex === thread.markers.name[markerIndex]) {
          isPaintMarkerFound = true;
          break;
        }
      }
    }
    if (!isPaintMarkerFound) {
      return true;
    }
  }
  return false;
}

function _findDefaultThread(threads: Thread[]): Thread | null {
  if (threads.length === 0) {
    // Tests may have no threads.
    return null;
  }
  const contentThreadId = threads.findIndex(
    thread => thread.name === 'GeckoMain' && thread.processType === 'tab'
  );
  const defaultThreadIndex =
    contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(threads)[0];

  return threads[defaultThreadIndex];
}

function _isMainThread(thread: Thread): boolean {
  return (
    thread.name === 'GeckoMain' ||
    // If the pid is a string, then it's not one that came from the system.
    // These threads should all be treated as main threads.
    typeof thread.pid === 'string'
  );
}

function _indexesAreValid(listLength: number, indexes: number[]) {
  return (
    // The item length is valid.
    indexes.length === listLength &&
    // The indexes are valid and include every single value.
    indexes
      .slice()
      .sort()
      .every((value, arrayIndex) => value === arrayIndex)
  );
}
