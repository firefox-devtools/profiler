/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  ScreenshotPayload,
  Profile,
  Thread,
  ThreadIndex,
  Pid,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
} from 'firefox-profiler/types';

import {
  defaultThreadOrder,
  getFriendlyThreadName,
  isThreadWithNoPaint,
  isContentThreadWithNoPaint,
} from './profile-data';
import { splitSearchString, stringsToRegExp } from '../utils/string';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';

export type TracksWithOrder = {|
  +globalTracks: GlobalTrack[],
  +globalTrackOrder: TrackIndex[],
  +localTracksByPid: Map<Pid, LocalTrack[]>,
  +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
|};

export type HiddenTracks = {|
  +hiddenGlobalTracks: Set<TrackIndex>,
  +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
|};

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
  'event-delay': 4,
};
const LOCAL_TRACK_DISPLAY_ORDER = {
  network: 0,
  memory: 1,
  thread: 2,
  ipc: 3,
  'event-delay': 4,
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
          (track) =>
            track.type === 'thread' && track.threadIndex === threadIndex
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

    if (!isMainThread(thread)) {
      // This thread has not been added as a GlobalTrack, so add it as a local track.
      tracks.push({ type: 'thread', threadIndex });
    }

    if (
      thread.markers.data.some((datum) => datum && datum.type === 'Network')
    ) {
      // This thread has network markers.
      tracks.push({ type: 'network', threadIndex });
    }

    if (thread.markers.data.some((datum) => datum && datum.type === 'IPC')) {
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
 * Take threads and add event delay tracks for them. Return the new
 * localTracksByPid map.
 */
export function addEventDelayTracksForThreads(
  threads: Thread[],
  localTracksByPid: Map<Pid, LocalTrack[]>
): Map<Pid, LocalTrack[]> {
  const newLocalTracksByPid = new Map();

  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const { pid } = thread;
    // Get or create the tracks and trackOrder.
    let tracks = newLocalTracksByPid.get(pid);
    if (tracks === undefined) {
      tracks = localTracksByPid.get(pid);
      if (tracks === undefined) {
        tracks = [];
      }
      // copy it so we don't mutate the state
      tracks = [...tracks];
    }

    tracks.push({ type: 'event-delay', threadIndex });
    newLocalTracksByPid.set(pid, tracks);
  }

  return newLocalTracksByPid;
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
    if (isMainThread(thread)) {
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
      }
    }
  }

  // Add the visual progress tracks if we have visualMetrics data.
  if (profile.meta && profile.meta.visualMetrics) {
    globalTracks.push({ type: 'visual-progress' });
    globalTracks.push({ type: 'perceptual-visual-progress' });
    globalTracks.push({ type: 'contentful-visual-progress' });
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
        (globalTrack) =>
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

function _intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set([...set1].filter((x) => set2.has(x)));
}

function _subtractSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set([...set1].filter((x) => !set2.has(x)));
}

// Returns the selected thread (set), intersected with the set of visible threads.
// Falls back to the default thread selection.
export function initializeSelectedThreadIndex(
  selectedThreadIndexes: Set<ThreadIndex> | null,
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile
): Set<ThreadIndex> {
  if (selectedThreadIndexes === null) {
    return getDefaultSelectedThreadIndexes(visibleThreadIndexes, profile);
  }

  // Filter out hidden threads from the set of selected threads.
  const visibleSelectedThreadIndexes = _intersectSets(
    selectedThreadIndexes,
    new Set(visibleThreadIndexes)
  );
  if (visibleSelectedThreadIndexes.size === 0) {
    // No selected threads were visible. Fall back to default selection.
    return getDefaultSelectedThreadIndexes(visibleThreadIndexes, profile);
  }
  return visibleSelectedThreadIndexes;
}

// Select either the GeckoMain [tab] thread, or the first thread in the thread
// order.
function getDefaultSelectedThreadIndexes(
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile
): Set<ThreadIndex> {
  const visibleThreads = visibleThreadIndexes.map(
    (threadIndex) => profile.threads[threadIndex]
  );
  const defaultThread = _findDefaultThread(visibleThreads);
  const defaultThreadIndex = profile.threads.indexOf(defaultThread);
  if (defaultThreadIndex === -1) {
    throw new Error('Expected to find a thread index to select.');
  }
  return new Set([defaultThreadIndex]);
}

// Returns either a configuration of hidden tracks that has at least one
// visible thread, or null.
export function tryInitializeHiddenTracksLegacy(
  tracksWithOrder: TracksWithOrder,
  legacyHiddenThreads: ThreadIndex[],
  profile: Profile
): HiddenTracks | null {
  const allThreads = new Set(profile.threads.map((_thread, i) => i));
  const hiddenThreadsSet = new Set(legacyHiddenThreads);
  const visibleThreads = _subtractSets(allThreads, hiddenThreadsSet);
  if (visibleThreads.size === 0) {
    return null;
  }
  return _computeHiddenTracksForVisibleThreads(
    profile,
    visibleThreads,
    tracksWithOrder
  );
}

// Returns either a configuration of hidden tracks that has at least one
// visible thread, or null.
export function tryInitializeHiddenTracksFromUrl(
  tracksWithOrder: TracksWithOrder,
  urlHiddenGlobalTracks: Set<TrackIndex>,
  urlHiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>
): HiddenTracks | null {
  const hiddenGlobalTracks = _intersectSets(
    new Set(tracksWithOrder.globalTrackOrder),
    urlHiddenGlobalTracks
  );

  const hiddenLocalTracksByPid = new Map();
  for (const [pid, localTrackOrder] of tracksWithOrder.localTrackOrderByPid) {
    const localTracks = new Set(localTrackOrder);
    const hiddenLocalTracks = _intersectSets(
      localTracks,
      urlHiddenLocalTracksByPid.get(pid) || new Set()
    );
    hiddenLocalTracksByPid.set(pid, hiddenLocalTracks);
    if (hiddenLocalTracks.size === localTracks.size) {
      // All local tracks of this process were hidden.
      // If the main thread was not recorded for this process, hide the (empty) process track as well.
      const globalTrackIndex = tracksWithOrder.globalTracks.findIndex(
        (globalTrack) =>
          globalTrack.type === 'process' &&
          globalTrack.pid === pid &&
          globalTrack.mainThreadIndex === null
      );
      if (globalTrackIndex !== -1) {
        // An empty global track was found, hide it.
        hiddenGlobalTracks.add(globalTrackIndex);
      }
    }
  }

  const hiddenTracks = { hiddenGlobalTracks, hiddenLocalTracksByPid };
  if (getVisibleThreads(tracksWithOrder, hiddenTracks).length === 0) {
    return null;
  }

  return hiddenTracks;
}

// Returns the default configuration of hidden global and local tracks.
// The result is guaranteed to have a non-empty number of visible threads.
export function computeDefaultHiddenTracks(
  tracksWithOrder: TracksWithOrder,
  profile: Profile,
  idleThreadsByCPU: Set<ThreadIndex>
): HiddenTracks {
  return _computeHiddenTracksForVisibleThreads(
    profile,
    computeDefaultVisibleThreads(profile, idleThreadsByCPU),
    tracksWithOrder
  );
}

// Return a non-empty set of threads that should be shown by default.
export function computeDefaultVisibleThreads(
  profile: Profile,
  idleThreadsByCPU: Set<ThreadIndex>
): Set<ThreadIndex> {
  const validThreadIndexes = profile.threads.map((_thread, i) => i);
  const nonIdleThreads = validThreadIndexes.filter((threadIndex) => {
    return !_isThreadIdle(profile, threadIndex, idleThreadsByCPU);
  });
  if (nonIdleThreads.length === 0) {
    // All threads idle. Show all threads.
    return new Set(validThreadIndexes);
  }
  return new Set(nonIdleThreads);
}

// Create the sets of global and local tracks so that the requested
// threads are visible. Non-process global tracks and non-thread local
// tracks are always visible.
// Some main threads can be visible even if they were not requested to
// be visible. This happens if their global track contains visible local
// tracks.
function _computeHiddenTracksForVisibleThreads(
  profile: Profile,
  visibleThreadIndexes: Set<ThreadIndex>,
  tracksWithOrder: TracksWithOrder
): HiddenTracks {
  const visiblePids = new Set(
    [...visibleThreadIndexes].map((i) => profile.threads[i].pid)
  );

  const hiddenGlobalTracks = new Set(
    tracksWithOrder.globalTrackOrder.filter((trackIndex) => {
      const globalTrack = tracksWithOrder.globalTracks[trackIndex];
      if (globalTrack.type !== 'process') {
        // Keep non-process global tracks visible.
        return false;
      }
      return !visiblePids.has(globalTrack.pid);
    })
  );

  const hiddenLocalTracksByPid = new Map();
  for (const [pid, localTrackOrder] of tracksWithOrder.localTrackOrderByPid) {
    if (!visiblePids.has(pid)) {
      // Hide all local tracks.
      hiddenLocalTracksByPid.set(pid, new Set(localTrackOrder));
      continue;
    }

    const localTracks = tracksWithOrder.localTracksByPid.get(pid) ?? [];
    const hiddenLocalTracks = new Set(
      localTrackOrder.filter((localTrackIndex) => {
        const localTrack = localTracks[localTrackIndex];
        if (localTrack.type !== 'thread') {
          // Keep non-thread local tracks visible.
          return false;
        }
        return !visibleThreadIndexes.has(localTrack.threadIndex);
      })
    );
    hiddenLocalTracksByPid.set(pid, hiddenLocalTracks);
  }

  return { hiddenGlobalTracks, hiddenLocalTracksByPid };
}

// Return the list of threads which are visible in the supplied hidden
// tracks configuration.
export function getVisibleThreads(
  { globalTracks, localTracksByPid }: TracksWithOrder,
  { hiddenGlobalTracks, hiddenLocalTracksByPid }: HiddenTracks
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
        hiddenLocalTracksByPid.get(pid),
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
        // It can also happen when importing other profile formats.

        // First, see if any thread in this process has a non-empty processName.
        const pid = globalTrack.pid;
        const processName = threads
          .filter((thread) => thread.pid === pid)
          .map((thread) => thread.processName)
          .find((processName) => !!processName);
        if (processName) {
          return processName;
        }

        // Fallback: Use the PID.
        if (typeof pid === 'string') {
          // The pid is a unique string label, use that.
          return pid;
        }
        // The pid is a number, make a label for it.
        return `Process ${pid}`;
      }

      // Getting the friendly thread name and removing the scheme in case we
      // have any eTLD+1 returned. This can happen if the thread is an Isolated
      // Web Content process' main thread that has an `eTLD+1` field. Removing the
      // scheme to fit the complete url in this limited space in the timeline.
      return getFriendlyThreadName(
        threads,
        threads[globalTrack.mainThreadIndex]
      ).replace(/^https?:\/\//i, '');
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
    case 'event-delay':
      return (
        getFriendlyThreadName(threads, threads[localTrack.threadIndex]) +
        ' Event Delay'
      );
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}

/**
 * Determine if a thread is idle, so that it can be hidden. It is really annoying for an
 * end user to load a profile full of empty and idle threads. This function uses
 * various rules to determine if a thread is idle.
 */
function _isThreadIdle(
  profile: Profile,
  threadIndex: ThreadIndex,
  idleThreadsByCPU: Set<ThreadIndex>
): boolean {
  const thread = profile.threads[threadIndex];
  if (
    // Don't hide the Renderer thread. This is because Renderer thread is pretty
    // useful for understanding the painting with WebRender and it's an important
    // thread for the users.
    thread.name === 'Renderer' ||
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
    return isThreadWithNoPaint(thread);
  }

  if (isContentThreadWithNoPaint(thread)) {
    // If content thread doesn't have any paint markers, set it idle if the
    // thread has at least 80% idle samples.
    return _isThreadIdleByEitherCpuOrCategory(
      profile,
      thread,
      threadIndex,
      idleThreadsByCPU,
      PERCENTAGE_ACTIVE_SAMPLES_NON_PAINT
    );
  }

  if (/^(?:Audio|Media|GraphRunner|WebrtcWorker)/.test(thread.name)) {
    // This is a media thread: they are usually very idle, but are interesting
    // as soon as there's at least one sample. They're present with the media
    // preset, but not usually captured otherwise.
    // Matched thread names: AudioIPC, MediaPDecoder, MediaTimer, MediaPlayback,
    // MediaDecoderStateMachine, GraphRunner. They're enabled by the media
    // preset.
    return !_hasThreadAtLeastOneNonIdleSample(profile, thread);
  }

  // Detect the idleness by either looking at the thread CPU usage (if it has),
  // or by looking at the sample categories.
  return _isThreadIdleByEitherCpuOrCategory(
    profile,
    thread,
    threadIndex,
    idleThreadsByCPU,
    PERCENTAGE_ACTIVE_SAMPLES
  );
}

/**
 * This function check if the thread has threadCPUDelta values and uses it to
 * detect the thread idleness if it has these. Otherwise, falls back to using
 * the sample categories for idleness detection. CPU values are more accurate
 * than sample categories: for example some places could be marked "idle" but
 * still consume CPU in some situations.
 */
function _isThreadIdleByEitherCpuOrCategory(
  profile: Profile,
  thread: Thread,
  threadIndex: ThreadIndex,
  idleThreadsByCPU: Set<ThreadIndex>,
  activeSamplePercentage: number
): boolean {
  const { sampleUnits } = profile.meta;
  if (thread.samples.threadCPUDelta && sampleUnits) {
    // Use the thread CPU usage numbers to detect the idleness.
    return idleThreadsByCPU.has(threadIndex);
  }

  // Fall back to using the sample categories to detect the idleness.
  return _isThreadMostlyFullOfIdleSamples(
    profile,
    thread,
    activeSamplePercentage
  );
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
  activeSamplePercentage: number
): boolean {
  let maxActiveStackCount = activeSamplePercentage * thread.samples.length;
  let activeStackCount = 0;
  let filteredStackCount = 0;

  const { categories } = profile.meta;
  if (!categories) {
    // Profiles that are imported may not have categories. In this case do not try
    // and deduce anything about idleness.
    return false;
  }

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

      const category = categories[categoryIndex];
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

function _hasThreadAtLeastOneNonIdleSample(
  profile: Profile,
  thread: Thread
): boolean {
  const { categories } = profile.meta;
  if (!categories) {
    // Profiles that are imported may not have categories, assume that there are
    // non-idle samples.
    return true;
  }

  for (const stackIndex of thread.samples.stack) {
    if (stackIndex === null) {
      continue;
    }

    const categoryIndex = thread.stackTable.category[stackIndex];
    const category = categories[categoryIndex];
    if (category.name !== 'Idle') {
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
    (thread) => thread.name === 'GeckoMain' && thread.processType === 'tab'
  );
  const defaultThreadIndex =
    contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(threads)[0];

  return threads[defaultThreadIndex];
}

export function isMainThread(thread: Thread): boolean {
  return (
    thread.name === 'GeckoMain' ||
    // If the pid is a string, then it's not one that came from the system.
    // These threads should all be treated as main threads.
    typeof thread.pid === 'string' ||
    // On Linux the tid of the main thread is the pid. This is useful for
    // profiles imported from the Linux 'perf' tool.
    String(thread.pid) === thread.tid
  );
}

function _indexesAreValid(listLength: number, indexes: number[]) {
  return (
    // The item length is valid.
    indexes.length === listLength &&
    // The indexes are valid and include every single value.
    indexes
      .slice()
      .sort((a, b) => a - b) // sort numerically
      .every((value, arrayIndex) => value === arrayIndex)
  );
}

/**
 * Get the search filter and return the search filtered global tracks.
 * The search includes the fields like, track name, pid, tid, process type,
 * process name, and eTLD+1.
 */
export function getSearchFilteredGlobalTracks(
  tracks: GlobalTrack[],
  globalTrackNames: string[],
  threads: Thread[],
  searchFilter: string
): Set<TrackIndex> | null {
  if (!searchFilter) {
    // Nothing is filtered, returning null.
    return null;
  }
  const searchRegExp = stringsToRegExp(splitSearchString(searchFilter));
  if (!searchRegExp) {
    // There is no search query, returning null.
    return null;
  }

  const searchFilteredGlobalTracks = new Set();
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const globalTrack = tracks[trackIndex];

    // Reset regexp for each iteration. Otherwise state from previous
    // iterations can cause matches to fail if the search is global or
    // sticky.
    searchRegExp.lastIndex = 0;

    switch (globalTrack.type) {
      case 'process': {
        const { mainThreadIndex } = globalTrack;
        // Check the pid of the global track first.
        if (searchRegExp.test(globalTrack.pid.toString())) {
          searchFilteredGlobalTracks.add(trackIndex);
          continue;
        }

        // Get the thread of the global track and check thread information.
        if (mainThreadIndex !== null) {
          const thread = threads[mainThreadIndex];

          const threadName = globalTrackNames[trackIndex];
          if (searchRegExp.test(threadName)) {
            searchFilteredGlobalTracks.add(trackIndex);
            continue;
          }

          const { tid } = thread;
          if (tid && searchRegExp.test(tid.toString())) {
            searchFilteredGlobalTracks.add(trackIndex);
            continue;
          }

          if (searchRegExp.test(thread.processType)) {
            searchFilteredGlobalTracks.add(trackIndex);
            continue;
          }

          const { processName } = thread;
          if (processName && searchRegExp.test(processName)) {
            searchFilteredGlobalTracks.add(trackIndex);
            continue;
          }

          const etldPlus1 = thread['eTLD+1'];
          if (etldPlus1 && searchRegExp.test(etldPlus1)) {
            searchFilteredGlobalTracks.add(trackIndex);
            continue;
          }
        }

        break;
      }
      case 'screenshots':
      case 'visual-progress':
      case 'perceptual-visual-progress':
      case 'contentful-visual-progress': {
        const { type } = globalTrack;
        if (searchRegExp.test(type)) {
          searchFilteredGlobalTracks.add(trackIndex);
          continue;
        }
        break;
      }
      default:
        throw assertExhaustiveCheck(globalTrack, 'Unhandled GlobalTrack type.');
    }
  }

  return searchFilteredGlobalTracks;
}

/**
 * Get the search filter and return the search filtered local tracks by Pid.
 * The search includes the fields like, track name, pid, tid, process type,
 * process name, and eTLD+1.
 */
export function getSearchFilteredLocalTracksByPid(
  localTracksByPid: Map<Pid, LocalTrack[]>,
  localTrackNamesByPid: Map<Pid, string[]>,
  threads: Thread[],
  searchFilter: string
): Map<Pid, Set<TrackIndex>> | null {
  if (!searchFilter) {
    // Nothing is filtered, returning null.
    return null;
  }
  const searchRegExp = stringsToRegExp(splitSearchString(searchFilter));
  if (!searchRegExp) {
    // There is no search query, returning null.
    return null;
  }

  const searchFilteredLocalTracksByPid = new Map();
  for (const [pid, tracks] of localTracksByPid) {
    const searchFilteredLocalTracks = new Set();
    const localTrackNames = localTrackNamesByPid.get(pid);
    if (localTrackNames === undefined) {
      throw new Error('Failed to get the local track names');
    }

    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const localTrack = tracks[trackIndex];
      // Reset regexp for each iteration. Otherwise state from previous
      // iterations can cause matches to fail if the search is global or
      // sticky.
      searchRegExp.lastIndex = 0;

      if (searchRegExp.test(pid.toString())) {
        searchFilteredLocalTracks.add(trackIndex);
        continue;
      }

      switch (localTrack.type) {
        case 'thread': {
          const { threadIndex } = localTrack;
          // Get the thread of the local track and check thread information.
          const thread = threads[threadIndex];

          const threadName = localTrackNames[trackIndex];
          if (searchRegExp.test(threadName)) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }

          const { tid } = thread;
          if (tid && searchRegExp.test(tid.toString())) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }

          if (searchRegExp.test(thread.processType)) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }

          const { processName } = thread;
          if (processName && searchRegExp.test(processName)) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }

          const etldPlus1 = thread['eTLD+1'];
          if (etldPlus1 && searchRegExp.test(etldPlus1)) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }
          break;
        }
        case 'network':
        case 'memory':
        case 'ipc':
        case 'event-delay': {
          const { type } = localTrack;
          if (searchRegExp.test(type)) {
            searchFilteredLocalTracks.add(trackIndex);
            continue;
          }
          break;
        }
        default:
          throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
      }
    }

    searchFilteredLocalTracksByPid.set(pid, searchFilteredLocalTracks);
  }

  return searchFilteredLocalTracksByPid;
}
