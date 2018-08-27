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
import { defaultThreadOrder, getFriendlyThreadName } from './profile-data';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';

/**
 * This file collects all the logic that goes into validating URL-encoded view options.
 * It also selects the default view options for things like track hiding, ordering,
 * and selection.
 */
export function initializeLocalTrackOrderByPid(
  urlTrackOrderByPid: Map<Pid, TrackIndex[]> | null,
  localTracksByPid: Map<Pid, LocalTrack[]>,
  legacyThreadOrder: ThreadIndex[] | null
): Map<Pid, TrackIndex[]> {
  const trackOrderByPid = new Map();

  if (legacyThreadOrder === null) {
    // Go through each set of tracks, determine the sort order.
    for (const [pid, tracks] of localTracksByPid) {
      // Create the default trackOrder.
      let trackOrder = tracks.map((_, index) => index);

      if (urlTrackOrderByPid !== null) {
        // Sanitize the track information provided by the URL, and ensure it is valid.
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
  } else {
    // Convert the legacy thread order into the current track order.
    for (const [pid, tracks] of localTracksByPid) {
      const trackOrder = [];
      // Go through the legacy thread order and pair it with the correct track.
      for (const threadIndex of legacyThreadOrder) {
        const trackIndex = tracks.findIndex(
          track => track.type === 'thread' && track.threadIndex === threadIndex
        );
        if (trackIndex !== -1) {
          trackOrder.push(trackIndex);
        }
      }
      // Complete the list of track indexes by adding them to the end.
      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        if (!trackOrder.includes(trackIndex)) {
          trackOrder.push(trackIndex);
        }
      }
      trackOrderByPid.set(pid, trackOrder);
    }
  }

  return trackOrderByPid;
}

export function initializeHiddenLocalTracksByPid(
  urlHiddenTracksByPid: Map<Pid, Set<TrackIndex>> | null,
  localTracksByPid: Map<Pid, LocalTrack[]>,
  profile: Profile,
  legacyHiddenThreads: ThreadIndex[] | null
): Map<Pid, Set<TrackIndex>> {
  const hiddenTracksByPid = new Map();

  // Go through each set of tracks, determine the sort order.
  for (const [pid, tracks] of localTracksByPid) {
    const hiddenTracks = new Set();

    if (legacyHiddenThreads !== null) {
      for (const threadIndex of legacyHiddenThreads) {
        const trackIndex = tracks.findIndex(
          track => track.type === 'thread' && track.threadIndex === threadIndex
        );
        if (trackIndex !== -1) {
          hiddenTracks.add(trackIndex);
        }
      }
    } else if (urlHiddenTracksByPid === null) {
      for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
        const track = tracks[trackIndex];
        if (
          track.type === 'thread' &&
          _isThreadIdle(profile, profile.threads[track.threadIndex])
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

export function computeLocalTracksByPid(
  profile: Profile
): Map<Pid, LocalTrack[]> {
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
  // the internals of this function, otherwise each GlobalTrack usage would need
  // to check that it's a process type.
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
  urlGlobalTrackOrder: TrackIndex[] | null,
  legacyThreadOrder: ThreadIndex[] | null
): TrackIndex[] {
  if (legacyThreadOrder !== null) {
    // Upgrade an older URL value based on the thread index to the track index based
    // ordering. Don't trust that the thread indexes are actually valid.
    const trackOrder = [];

    // Convert the thread index to a track index, if it's valid.
    for (const threadIndex of legacyThreadOrder) {
      const trackIndex = globalTracks.findIndex(
        globalTrack =>
          globalTrack.type === 'process' &&
          globalTrack.mainThreadIndex === threadIndex
      );
      if (trackIndex !== -1) {
        trackOrder.push(trackIndex);
      }
    }

    // Add the remaining track indexes.
    for (let trackIndex = 0; trackIndex < globalTracks.length; trackIndex++) {
      if (!trackOrder.includes(trackIndex)) {
        trackOrder.push(trackIndex);
      }
    }
    return trackOrder;
  }

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
  profile: Profile,
  validTrackIndexes: TrackIndex[],
  urlHiddenGlobalTracks: Set<TrackIndex> | null,
  legacyHiddenThreads: ThreadIndex[] | null
): Set<TrackIndex> {
  const hiddenGlobalTracks = new Set();

  if (legacyHiddenThreads !== null) {
    for (const threadIndex of legacyHiddenThreads) {
      const trackIndex = globalTracks.findIndex(
        track =>
          track.type === 'process' && track.mainThreadIndex === threadIndex
      );
      if (trackIndex !== -1) {
        hiddenGlobalTracks.add(trackIndex);
      }
    }
  }

  if (urlHiddenGlobalTracks === null) {
    // No hidden global tracks exist, generate the default Set.
    for (let trackIndex = 0; trackIndex < globalTracks.length; trackIndex++) {
      const track = globalTracks[trackIndex];
      if (track.type === 'process' && track.mainThreadIndex !== null) {
        const { mainThreadIndex } = track;
        const thread = profile.threads[mainThreadIndex];
        if (_isThreadIdle(profile, thread)) {
          hiddenGlobalTracks.add(trackIndex);
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
      const tracks = ensureExists(
        localTracksByPid.get(pid),
        'A local track was expected to exist for the given pid.'
      );
      const hiddenTracks = ensureExists(
        hiddenTracksByPid.get(pid),
        'Hidden tracks were expected to exists for the given pid.'
      );
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
  return visibleThreads;
}

export function getGlobalTrackName(
  globalTrack: GlobalTrack,
  threads: Thread[]
): string {
  switch (globalTrack.type) {
    case 'process': {
      // Look up the thread information for the process if it exists.
      if (globalTrack.mainThreadIndex === null) {
        // No main thread was found for process track, so it is empty. This can
        // happen for instance when recording "DOM Worker" but not "GeckoMain". The
        // "DOM Worker" thread will be captured, but not the main thread, thus leaving
        // a process track with no main thread.
        return typeof globalTrack.pid === 'string'
          ? // The pid is a unique string label, use that.
            globalTrack.pid
          : // The pid is a number, make a label for it.
            `Process ${globalTrack.pid}`;
      }
      return getFriendlyThreadName(
        threads,
        threads[globalTrack.mainThreadIndex]
      );
    }
    case 'screenshots':
      return 'Screenshots';
    default:
      throw assertExhaustiveCheck(globalTrack, 'Unhandled GlobalTrack type.');
  }
}

export function getLocalTrackName(
  localTrack: LocalTrack,
  threads: Thread[]
): string {
  switch (localTrack.type) {
    case 'thread':
      return getFriendlyThreadName(threads, threads[localTrack.threadIndex]);
    case 'network':
      return 'Network';
    case 'memory':
      return 'Memory';
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}

// Any thread with less than 1% non-idle time will be hidden.
const PERCENTAGE_ACTIVE_SAMPLES = 0.01;

/**
 * Determine if a thread is idle, so that it can be hidden. It is really annoying for an
 * end user to load a profile full of empty and idle threads. This function goes through
 * all of the samples in the thread, and sees if some large percentage of them are idle.
 */
function _isThreadIdle(profile: Profile, thread: Thread): boolean {
  if (
    // Don't hide the compositor.
    thread.name === 'Compositor' ||
    // Don't hide the main thread.
    (thread.name === 'GeckoMain' && thread.processType === 'default')
  ) {
    return false;
  }

  let maxActiveStackCount = PERCENTAGE_ACTIVE_SAMPLES * thread.samples.length;
  let activeStackCount = 0;
  let filteredStackCount = 0;

  for (
    let sampleIndex = 0;
    sampleIndex < thread.samples.length;
    sampleIndex++
  ) {
    const stackIndex = thread.samples.stack[sampleIndex];
    if (stackIndex === null) {
      // This stack was filtered out. Most likely this will never actually happen
      // on a new profile, but keep this check here since the stacks are possibly
      // null in the Flow type definitions.
      filteredStackCount++;
      // Adjust the maximum necessary active stacks to find based on null stacks.
      maxActiveStackCount =
        PERCENTAGE_ACTIVE_SAMPLES *
        (thread.samples.length - filteredStackCount);
    } else {
      const categoryIndex = thread.stackTable.category[stackIndex];
      const category = profile.meta.categories[categoryIndex];
      if (category.name !== 'Idle') {
        activeStackCount++;
        if (activeStackCount > maxActiveStackCount) {
          return false;
        }
      }
    }
  }

  // Do one final check to see if we have enough active samples.
  return activeStackCount <= maxActiveStackCount;
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
