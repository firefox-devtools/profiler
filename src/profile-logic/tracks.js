/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { ScreenshotPayload } from '../types/markers';
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

/**
 * In order for track indexes to be backwards compatible, the indexes need to be
 * stable across time. Therefore the tracks must be consistently sorted. When new
 * track types are added, they must be added to the END of the track list, so that
 * URL-encoded information remains stable.
 *
 * However, this sorting may not be the one we want to display to the end user, so provide
 * a secondary sorting order for how the tracks will actually be displayed.
 */
const LOCAL_TRACK_INDEX_ORDER = {
  thread: 0,
  network: 1,
  memory: 2,
  ipc: 3,
};
const LOCAL_TRACK_DISPLAY_ORDER = {
  network: 0,
  memory: 1,
  thread: 2,
  ipc: 3,
};
const GLOBAL_TRACK_INDEX_ORDER = {
  process: 0,
  screenshots: 1,
  'visual-progress': 2,
  'perceptual-visual-progress': 3,
  'contentful-visual-progress': 4,
};
const GLOBAL_TRACK_DISPLAY_ORDER = {
  'visual-progress': 0,
  'perceptual-visual-progress': 1,
  'contentful-visual-progress': 2,
  screenshots: 3,
  process: 4,
};

function _getDefaultLocalTrackOrder(tracks: LocalTrack[]) {
  const trackOrder = tracks.map((_, index) => index);
  // In place sort!
  trackOrder.sort(
    (a, b) =>
      LOCAL_TRACK_DISPLAY_ORDER[tracks[a].type] -
      LOCAL_TRACK_DISPLAY_ORDER[tracks[b].type]
  );
  return trackOrder;
}

function _getDefaultGlobalTrackOrder(tracks: GlobalTrack[]) {
  const trackOrder = tracks.map((_, index) => index);
  // In place sort!
  trackOrder.sort(
    (a, b) =>
      GLOBAL_TRACK_DISPLAY_ORDER[tracks[a].type] -
      GLOBAL_TRACK_DISPLAY_ORDER[tracks[b].type]
  );
  return trackOrder;
}

/**
 * Determine the display order of the local tracks. This will be a different order than
 * how the local tracks are stored, as the initial ordering must be stable when new
 * track types are added.
 */
export function initializeLocalTrackOrderByPid(
  // If viewing an existing profile, take the track ordering from the URL and sanitize it.
  urlTrackOrderByPid: Map<Pid, TrackIndex[]> | null,
  // This is the list of the tracks.
  localTracksByPid: Map<Pid, LocalTrack[]>,
  // If viewing an old profile URL, there were not tracks, only thread indexes. Turn
  // the legacy ordering into track ordering.
  legacyThreadOrder: ThreadIndex[] | null
): Map<Pid, TrackIndex[]> {
  const trackOrderByPid = new Map();

  if (legacyThreadOrder === null) {
    // Go through each set of tracks, determine the sort order.
    for (const [pid, tracks] of localTracksByPid) {
      // Create the default trackOrder.
      let trackOrder = _getDefaultLocalTrackOrder(tracks);

      if (urlTrackOrderByPid !== null) {
        // Sanitize the track information provided by the URL, and ensure it is valid.
        let urlTrackOrder = urlTrackOrderByPid.get(pid);
        if (urlTrackOrder !== undefined) {
          // A URL track order was found, sanitize it.

          if (urlTrackOrder.length !== trackOrder.length) {
            // The URL track order length doesn't match the tracks we've generated. Most
            // likely this means that we have generated new tracks that the URL does not
            // know about. Add indexes at the end for the new tracks. These new indexes
            // will still be checked by the _indexesAreValid function below.
            const newOrder = urlTrackOrder.slice();
            for (let i = urlTrackOrder.length; i < trackOrder.length; i++) {
              newOrder.push(i);
            }
            urlTrackOrder = newOrder;
          }

          if (_indexesAreValid(tracks.length, urlTrackOrder)) {
            trackOrder = urlTrackOrder;
          }
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

/**
 * Take a profile and figure out all of the local tracks, and organize them by PID.
 */
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

    if (!_isMainThread(thread)) {
      // This thread has not been added as a GlobalTrack, so add it as a local track.
      tracks.push({ type: 'thread', threadIndex });
    }

    if (thread.markers.data.some(datum => datum && datum.type === 'Network')) {
      // This thread has network markers.
      tracks.push({ type: 'network', threadIndex });
    }

    if (thread.markers.data.some(datum => datum && datum.type === 'IPC')) {
      // This thread has IPC markers.
      tracks.push({ type: 'ipc', threadIndex });
    }
  }

  const { counters } = profile;
  if (counters) {
    for (let counterIndex = 0; counterIndex < counters.length; counterIndex++) {
      const { pid, category } = counters[counterIndex];
      if (category === 'Memory') {
        let tracks = localTracksByPid.get(pid);
        if (tracks === undefined) {
          tracks = [];
          localTracksByPid.set(pid, tracks);
        }
        tracks.push({ type: 'memory', counterIndex });
      }
    }
  }

  // When adding a new track type, this for loop ensures that the newer tracks are
  // added at the end so that the local track indexes are stable and backwards compatible.
  for (const localTracks of localTracksByPid.values()) {
    // In place sort!
    localTracks.sort(
      (a, b) =>
        LOCAL_TRACK_INDEX_ORDER[a.type] - LOCAL_TRACK_INDEX_ORDER[b.type]
    );
  }

  return localTracksByPid;
}

/**
 * Take a profile and figure out what GlobalTracks it contains.
 */
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
    const { pid, markers, stringTable } = thread;
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

    // Check for screenshots.
    const ids: Set<string> = new Set();
    if (stringTable.hasString('CompositorScreenshot')) {
      const screenshotNameIndex = stringTable.indexForString(
        'CompositorScreenshot'
      );
      for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        if (markers.name[markerIndex] === screenshotNameIndex) {
          // Coerce the payload to a screenshot one. Don't do a runtime check that
          // this is correct.
          const data: ScreenshotPayload = (markers.data[markerIndex]: any);
          ids.add(data.windowID);
        }
      }
      for (const id of ids) {
        globalTracks.push({ type: 'screenshots', id, threadIndex });
        if (profile.meta && profile.meta.visualMetrics) {
          globalTracks.push({ type: 'visual-progress', id });
          globalTracks.push({ type: 'perceptual-visual-progress', id });
          globalTracks.push({ type: 'contentful-visual-progress', id });
        }
      }
    }
  }

  // When adding a new track type, this sort ensures that the newer tracks are added
  // at the end so that the global track indexes are stable and backwards compatible.
  globalTracks.sort(
    // In place sort!
    (a, b) =>
      GLOBAL_TRACK_INDEX_ORDER[a.type] - GLOBAL_TRACK_INDEX_ORDER[b.type]
  );

  return globalTracks;
}

/**
 * Determine the display order for the global tracks, which will be different the
 * initial ordering of the tracks, as the initial ordering must remain stable as
 * new tracks are added.
 */
export function initializeGlobalTrackOrder(
  // This is the list of the tracks.
  globalTracks: GlobalTrack[],
  // If viewing an existing profile, take the track ordering from the URL and sanitize it.
  urlGlobalTrackOrder: TrackIndex[] | null,
  // If viewing an old profile URL, there were not tracks, only thread indexes. Turn
  // the legacy ordering into track ordering.
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

  if (
    urlGlobalTrackOrder !== null &&
    urlGlobalTrackOrder.length !== globalTracks.length
  ) {
    // The URL track order length doesn't match the tracks we've generated. Most likely
    // this means that we have generated new tracks that the URL does not know about.
    // Add on indexes at the end for the new tracks. These new indexes will still be
    // checked by the _indexesAreValid function below.s
    const newOrder = urlGlobalTrackOrder.slice();
    for (let i = urlGlobalTrackOrder.length; i < globalTracks.length; i++) {
      newOrder.push(i);
    }
    urlGlobalTrackOrder = newOrder;
  }

  return urlGlobalTrackOrder !== null &&
    _indexesAreValid(globalTracks.length, urlGlobalTrackOrder)
    ? urlGlobalTrackOrder
    : _getDefaultGlobalTrackOrder(globalTracks);
}

export function initializeSelectedThreadIndex(
  selectedThreadIndex: ThreadIndex | null,
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile
): ThreadIndex {
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
  if (threadIndex === -1) {
    throw new Error('Expected to find a thread index to select.');
  }
  return threadIndex;
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
  for (
    let globalTrackIndex = 0;
    globalTrackIndex < globalTracks.length;
    globalTrackIndex++
  ) {
    if (hiddenGlobalTracks.has(globalTrackIndex)) {
      continue;
    }
    const globalTrack = globalTracks[globalTrackIndex];
    if (globalTrack.type === 'process') {
      const { mainThreadIndex, pid } = globalTrack;
      if (mainThreadIndex !== null) {
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
      for (
        let localTrackIndex = 0;
        localTrackIndex < tracks.length;
        localTrackIndex++
      ) {
        const track = tracks[localTrackIndex];
        if (track.type === 'thread') {
          const { threadIndex } = track;
          if (!hiddenTracks.has(localTrackIndex)) {
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
    case 'visual-progress':
      return 'Visual Progress';
    case 'perceptual-visual-progress':
      return 'Perceptual Visual Progress';
    case 'contentful-visual-progress':
      return 'Contentful Visual Progress';
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
    case 'ipc':
      return `IPC — ${getFriendlyThreadName(
        threads,
        threads[localTrack.threadIndex]
      )}`;
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}

/**
 * Some of the local tracks are not allowed for the single tab view because they
 * are too much information for users and we would like to hide as much information
 * as possible to make the UI simpler for web developers.
 */
export function isLocalTrackAllowedForSingleTabView(localTrack: LocalTrack) {
  switch (localTrack.type) {
    case 'thread':
      return true;
    case 'network':
    case 'memory':
    case 'ipc':
      return false;
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}

/**
 * Determine if a thread is idle, so that it can be hidden. It is really annoying for an
 * end user to load a profile full of empty and idle threads. This function uses
 * various rules to determine if a thread is idle.
 */
function _isThreadIdle(profile: Profile, thread: Thread): boolean {
  if (
    // Don't hide the compositor.
    thread.name === 'Compositor' ||
    // Don't hide the main thread of the parent process.
    (thread.name === 'GeckoMain' && thread.processType === 'default') ||
    // Don't hide the GPU thread on Windows.
    (thread.name === 'GeckoMain' && thread.processType === 'gpu')
  ) {
    return false;
  }

  if (thread.samples.length === 0) {
    // This is a profile without any sample (taken with no periodic sampling mode)
    // and we can't take a look at the samples to decide whether that thread is
    // active or not. So we are checking if we have a paint marker instead.
    return _isThreadWithNoPaint(thread);
  }

  if (_isContentThreadWithNoPaint(thread)) {
    // If content thread doesn't have any paint markers, set it idle if the
    // thread has at least 80% idle samples.
    return _isThreadMostlyFullOfIdleSamples(
      profile,
      thread,
      PERCENTAGE_ACTIVE_SAMPLES_NON_PAINT
    );
  }

  return _isThreadMostlyFullOfIdleSamples(profile, thread);
}

function _isContentThreadWithNoPaint(thread: Thread): boolean {
  if (thread.name === 'GeckoMain' && thread.processType === 'tab') {
    return _isThreadWithNoPaint(thread);
  }

  return false;
}

// Returns true if the thread doesn't include any RefreshDriverTick. This
// indicates they were not painted to, and most likely idle. This is just
// a heuristic to help users.
function _isThreadWithNoPaint({ markers, stringTable }: Thread): boolean {
  let isPaintMarkerFound = false;
  if (stringTable.hasString('RefreshDriverTick')) {
    const paintStringIndex = stringTable.indexForString('RefreshDriverTick');

    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      if (paintStringIndex === markers.name[markerIndex]) {
        isPaintMarkerFound = true;
        break;
      }
    }
  }
  if (!isPaintMarkerFound) {
    return true;
  }
  return false;
}

// Any thread, except content thread with no RefreshDriverTick, with less than
// 5% non-idle time will be hidden.
const PERCENTAGE_ACTIVE_SAMPLES = 0.05;

// Any content thread with no RefreshDriverTick with less than 20% non-idle
// time will be hidden.
const PERCENTAGE_ACTIVE_SAMPLES_NON_PAINT = 0.2;

/**
 * This function goes through all of the samples in the thread, and sees if some large
 * percentage of them are idle. If the thread is mostly idle, then it should be hidden.
 */
function _isThreadMostlyFullOfIdleSamples(
  profile: Profile,
  thread: Thread,
  activeSamplePercentage: number = PERCENTAGE_ACTIVE_SAMPLES
): boolean {
  let maxActiveStackCount = activeSamplePercentage * thread.samples.length;
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
        activeSamplePercentage * (thread.samples.length - filteredStackCount);
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
