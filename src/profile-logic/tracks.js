/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  ScreenshotPayload,
  Profile,
  RawProfileSharedData,
  RawThread,
  ThreadIndex,
  Pid,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  RawCounter,
  Tid,
  TrackReference,
  TabID,
} from 'firefox-profiler/types';

import {
  getFriendlyThreadName,
  computeStackTableFromRawStackTable,
} from './profile-data';
import { intersectSets, subtractSets } from '../utils/set';
import { StringTable } from '../utils/string-table';
import { splitSearchString, stringsToRegExp } from '../utils/string';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';

export type TracksWithOrder = {
  readonly globalTracks: GlobalTrack[],
  readonly globalTrackOrder: TrackIndex[],
  readonly localTracksByPid: Map<Pid, LocalTrack[]>,
  readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>,
};

export type HiddenTracks = {
  readonly hiddenGlobalTracks: Set<TrackIndex>,
  readonly hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
};

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
  'process-cpu': 5,
  power: 6,
  marker: 7,
  bandwidth: 8,
};
const LOCAL_TRACK_DISPLAY_ORDER = {
  network: 0,
  bandwidth: 1,
  memory: 2,
  power: 3,
  // IPC tracks that belong to the global track will appear right after network
  // and counter tracks. But we want to show the IPC tracks that belong to the
  // local threads right after their track. This special handling happens inside
  // the sort function.
  ipc: 4,
  thread: 5,
  'event-delay': 6,
  'process-cpu': 7,
  marker: 8,
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

function _getDefaultLocalTrackOrder(tracks: LocalTrack[], profile: ?Profile) {
  const trackOrder = tracks.map((_, index) => index);
  const naturalSort = new Intl.Collator('en-US', { numeric: true });
  // In place sort!
  trackOrder.sort((a, b) => {
    if (
      tracks[a].type === 'thread' &&
      tracks[b].type === 'ipc' &&
      tracks[a].threadIndex === tracks[b].threadIndex
    ) {
      // If the IPC track belongs to that local thread, put the IPC tracks right
      // after it.
      return -1;
    }

    if (
      tracks[a].type === 'ipc' &&
      tracks[b].type === 'thread' &&
      tracks[a].threadIndex === tracks[b].threadIndex
    ) {
      // If the IPC track belongs to that local thread, put the IPC tracks right
      // after it.
      return 1;
    }

    if (
      profile &&
      profile.counters &&
      tracks[a].type === 'power' &&
      tracks[b].type === 'power'
    ) {
      const idxA = tracks[a].counterIndex;
      const idxB = tracks[b].counterIndex;
      if (profile.meta.keepProfileThreadOrder) {
        return idxA - idxB;
      }
      const nameA = profile.counters[idxA].name;
      const nameB = profile.counters[idxB].name;
      return naturalSort.compare(nameA, nameB);
    }

    // If the tracks are both threads, sort them by thread name, and then by
    // creation time if they have the same name.
    if (tracks[a].type === 'thread' && tracks[b].type === 'thread' && profile) {
      const idxA = tracks[a].threadIndex;
      const idxB = tracks[b].threadIndex;
      if (idxA === undefined || idxB === undefined) {
        return -1;
      }
      if (profile && profile.meta.keepProfileThreadOrder) {
        return idxA - idxB;
      }
      const nameA = profile.threads[idxA].name;
      const nameB = profile.threads[idxB].name;
      return (
        naturalSort.compare(nameA, nameB) ||
        profile.threads[idxA].registerTime - profile.threads[idxB].registerTime
      );
    }

    return (
      LOCAL_TRACK_DISPLAY_ORDER[tracks[a].type] -
      LOCAL_TRACK_DISPLAY_ORDER[tracks[b].type]
    );
  });

  return trackOrder;
}

function _getDefaultGlobalTrackOrder(
  tracks: GlobalTrack[],
  threadActivityScores: Array<ThreadActivityScore>
) {
  const trackOrder = tracks.map((_, index) => index);

  // In place sort!
  trackOrder.sort((a, b) => {
    const trackA = tracks[a];
    const trackB = tracks[b];

    // First, sort by track type priority (visual progress, screenshots, then process).
    const typeOrderA = GLOBAL_TRACK_DISPLAY_ORDER[trackA.type];
    const typeOrderB = GLOBAL_TRACK_DISPLAY_ORDER[trackB.type];

    if (typeOrderA !== typeOrderB) {
      return typeOrderA - typeOrderB;
    }

    if (trackA.type !== 'process' || trackB.type !== 'process') {
      // For all the cases where both of them are not the process type, return zero.
      return 0;
    }

    // This is the case where both of the tracks are processes. Let's sort them
    // by activity while keeping the parent process at the top.
    // mainThreadIndex might be null in case the GeckoMain thread is not
    // profiled in a profile.
    const activityA =
      trackA.mainThreadIndex !== null
        ? threadActivityScores[trackA.mainThreadIndex]
        : null;
    const activityB =
      trackB.mainThreadIndex !== null
        ? threadActivityScores[trackB.mainThreadIndex]
        : null;

    // Keep the parent process at the top.
    if (activityA?.isInParentProcess && !activityB?.isInParentProcess) {
      return -1;
    }
    if (!activityA?.isInParentProcess && activityB?.isInParentProcess) {
      return 1;
    }

    // For non-parent processes, sort by activity score.
    if (activityA && activityB) {
      return activityB.boostedSampleScore - activityA.boostedSampleScore;
    }

    // For all other cases, maintain original order.
    return 0;
  });

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
  legacyThreadOrder: ThreadIndex[] | null,
  profile: ?Profile
): Map<Pid, TrackIndex[]> {
  const trackOrderByPid = new Map();

  if (legacyThreadOrder === null) {
    // Go through each set of tracks, determine the sort order.
    for (const [pid, tracks] of localTracksByPid) {
      // Create the default trackOrder.
      let trackOrder = _getDefaultLocalTrackOrder(tracks, profile);

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
 * availableGlobalTracks is being sent by the caller to see which globalTracks
 * are present. The ones that have been filtered out by the tab selector
 * should be ignored.
 */
export function computeLocalTracksByPid(
  profile: Profile,
  availableGlobalTracks: GlobalTrack[]
): Map<Pid, LocalTrack[]> {
  const localTracksByPid = new Map();

  // Create a new set of available pids, so we can filter out the local tracks
  // if their globalTracks are also filtered out by the tab selector.
  const availablePids = new Set();
  for (const globalTrack of availableGlobalTracks) {
    if (globalTrack.type === 'process') {
      availablePids.add(globalTrack.pid);
    }
  }

  // find markers that might have their own track.
  const markerSchemasWithGraphs = (profile.meta.markerSchema || []).filter(
    (schema) => Array.isArray(schema.graphs) && schema.graphs.length > 0
  );

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { pid, markers } = thread;
    if (!availablePids.has(pid)) {
      // If the global track is filtered out ignore it here too.
      continue;
    }
    // Get or create the tracks and trackOrder.
    let tracks = localTracksByPid.get(pid);
    if (tracks === undefined) {
      tracks = [];
      localTracksByPid.set(pid, tracks);
    }

    if (!thread.isMainThread) {
      // This thread has not been added as a GlobalTrack, so add it as a local track.
      tracks.push({ type: 'thread', threadIndex });
    }

    if (markers.data.some((datum) => datum && datum.type === 'Network')) {
      // This thread has network markers.
      tracks.push({ type: 'network', threadIndex });
    }

    if (markers.data.some((datum) => datum && datum.type === 'IPC')) {
      // This thread has IPC markers.
      tracks.push({ type: 'ipc', threadIndex });
    }

    if (markerSchemasWithGraphs.length > 0) {
      const markerTracksBySchemaName = new Map();
      for (const markerSchema of markerSchemasWithGraphs) {
        markerTracksBySchemaName.set(markerSchema.name, {
          markerSchema,
          keys: (markerSchema.graphs || []).map((graph) => graph.key),
          markerNames: new Set(),
        });
      }

      for (let i = 0; i < markers.length; ++i) {
        const markerNameIndex = markers.name[i];
        const markerData = markers.data[i];
        const markerSchemaName = markerData ? markerData.type : null;
        if (markerData && markerSchemaName) {
          const mapEntry = markerTracksBySchemaName.get(markerSchemaName);
          if (mapEntry && mapEntry.keys.every((k) => k in markerData)) {
            mapEntry.markerNames.add(markerNameIndex);
          }
        }
      }

      for (const [
        ,
        { markerSchema, markerNames },
      ] of markerTracksBySchemaName) {
        for (const markerName of markerNames) {
          tracks.push({
            type: 'marker',
            threadIndex,
            markerSchema,
            markerName,
          });
        }
      }
    }
  }

  const { counters } = profile;
  if (counters) {
    for (let counterIndex = 0; counterIndex < counters.length; counterIndex++) {
      const { pid, category, samples } = counters[counterIndex];
      if (!availablePids.has(pid)) {
        // If the global track is filtered out ignore it here too.
        continue;
      }

      if (['Memory', 'power', 'Bandwidth'].includes(category)) {
        if (category === 'power' && samples.length <= 2) {
          // If we have only 2 samples, they are likely both 0 and we don't have a real counter.
          continue;
        }
        let tracks = localTracksByPid.get(pid);
        if (tracks === undefined) {
          tracks = [];
          localTracksByPid.set(pid, tracks);
        }
        if (category === 'Memory') {
          tracks.push({ type: 'memory', counterIndex });
        } else if (category === 'Bandwidth') {
          tracks.push({ type: 'bandwidth', counterIndex });
        } else {
          tracks.push({ type: 'power', counterIndex });
        }
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
  threads: RawThread[],
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
 * Take global tracks and add the experimental process CPU tracks. Return the new
 * localTracksByPid map.
 */
export function addProcessCPUTracksForProcess(
  counters: RawCounter[] | null,
  localTracksByPid: Map<Pid, LocalTrack[]>
): Map<Pid, LocalTrack[]> {
  if (counters === null) {
    // We don't have any counters to add.
    return localTracksByPid;
  }

  const newLocalTracksByPid = new Map(localTracksByPid);

  for (const [counterIndex, counter] of counters.entries()) {
    if (counter.category !== 'CPU' || counter.name !== 'processCPU') {
      // We only care about the process CPU counter types.
      continue;
    }

    const { pid } = counter;
    let localTracks = newLocalTracksByPid.get(pid) ?? [];

    // Do not mutate the current state.
    localTracks = [...localTracks, { type: 'process-cpu', counterIndex }];
    newLocalTracksByPid.set(pid, localTracks);
  }

  return newLocalTracksByPid;
}

/**
 * Take a profile and figure out what GlobalTracks it contains.
 */
export function computeGlobalTracks(
  profile: Profile,
  tabID: TabID | null = null,
  tabToThreadIndexesMap: Map<ThreadIndex, Set<TabID>>
): GlobalTrack[] {
  // Defining this ProcessTrack type here helps flow understand the intent of
  // the internals of this function, otherwise each GlobalTrack usage would need
  // to check that it's a process type.
  type ProcessTrack = {
    type: 'process',
    pid: Pid,
    mainThreadIndex: number | null,
  };
  const globalTracksByPid: Map<Pid, ProcessTrack> = new Map();
  let globalTracks: GlobalTrack[] = [];

  // Create the global tracks.
  const { stringArray } = profile.shared;
  const stringTable = StringTable.withBackingArray(stringArray);
  const screenshotNameIndex = stringTable.hasString('CompositorScreenshot')
    ? stringTable.indexForString('CompositorScreenshot')
    : null;

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { pid, markers } = thread;
    if (thread.isMainThread) {
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
    if (screenshotNameIndex !== null) {
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
    const metrics = profile.meta.visualMetrics;
    // Some metrics might be missing depending on the options specified to browsertime.
    if (metrics.VisualProgress) {
      globalTracks.push({ type: 'visual-progress' });
    }
    if (metrics.PerceptualSpeedIndexProgress) {
      globalTracks.push({ type: 'perceptual-visual-progress' });
    }
    if (metrics.ContentfulSpeedIndexProgress) {
      globalTracks.push({ type: 'contentful-visual-progress' });
    }
  }

  // Filter the global tracks by current tab.
  globalTracks = filterGlobalTracksByTab(
    globalTracks,
    profile,
    tabID,
    tabToThreadIndexesMap
  );

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
 * Filter the global tracks by the current selected tab if it's specified.
 */
function filterGlobalTracksByTab(
  globalTracks: GlobalTrack[],
  profile: Profile,
  tabID: TabID | null,
  tabToThreadIndexesMap: Map<ThreadIndex, Set<TabID>>
): GlobalTrack[] {
  if (tabID === null) {
    // Return the global tracks if there is no tab filter.
    return globalTracks;
  }

  const threadIndexes = tabToThreadIndexesMap.get(tabID);
  if (!threadIndexes) {
    // This is not really a possible path. It might indicate a bug on the frontend
    // or backend.
    console.warn(`Failed to find the thread indexes for given tab ${tabID}`);
    return globalTracks;
  }

  // Filter the tracks by the tab filter.
  const newGlobalTracks = [];
  for (const globalTrack of globalTracks) {
    switch (globalTrack.type) {
      case 'process': {
        const { mainThreadIndex } = globalTrack;
        if (mainThreadIndex === null) {
          // Do not include the global track if it doesn't have any main thread
          // index.
          continue;
        }

        const thread = profile.threads[mainThreadIndex];
        if (
          // Always add the parent process main thread.
          (thread.isMainThread && thread.processType === 'default') ||
          threadIndexes.has(mainThreadIndex)
        ) {
          newGlobalTracks.push(globalTrack);
        }
        break;
      }
      // Always include the screenshots.
      case 'screenshots':
      // Also always add the visual progress tracks without looking at the tab
      // filter. (fallthrough)
      case 'visual-progress':
      case 'perceptual-visual-progress':
      case 'contentful-visual-progress':
        newGlobalTracks.push(globalTrack);
        break;
      default:
        throw new Error('Unhandled globalTack type.');
    }
  }

  return newGlobalTracks;
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
  legacyThreadOrder: ThreadIndex[] | null,
  threadActivityScores: Array<ThreadActivityScore>
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
    : _getDefaultGlobalTrackOrder(globalTracks, threadActivityScores);
}

// Returns the selected thread (set), intersected with the set of visible threads.
// Falls back to the default thread selection.
export function initializeSelectedThreadIndex(
  selectedThreadIndexes: Set<ThreadIndex> | null,
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile,
  threadActivityScores: Array<ThreadActivityScore>
): Set<ThreadIndex> {
  if (selectedThreadIndexes === null) {
    return getDefaultSelectedThreadIndexes(
      visibleThreadIndexes,
      profile,
      threadActivityScores
    );
  }

  // Filter out hidden threads from the set of selected threads.
  const visibleSelectedThreadIndexes = intersectSets(
    selectedThreadIndexes,
    new Set(visibleThreadIndexes)
  );
  if (visibleSelectedThreadIndexes.size === 0) {
    // No selected threads were visible. Fall back to default selection.
    return getDefaultSelectedThreadIndexes(
      visibleThreadIndexes,
      profile,
      threadActivityScores
    );
  }
  return visibleSelectedThreadIndexes;
}

// Select either the most active GeckoMain [tab] thread, or the most active
// thread sorted by the thread activity scores.
// It always selects global tracks when there is a GeckoMain [tab], but when
// there is no GeckoMain [tab], it might select local tracks too depending
// on the activity score.
function getDefaultSelectedThreadIndexes(
  visibleThreadIndexes: ThreadIndex[],
  profile: Profile,
  threadActivityScores: Array<ThreadActivityScore>
): Set<ThreadIndex> {
  if (profile.meta.initialSelectedThreads !== undefined) {
    return new Set(
      profile.meta.initialSelectedThreads.filter((threadIndex) => {
        if (threadIndex < profile.threads.length) {
          return true;
        }

        console.warn(
          `The specified thread index ${threadIndex} is higher than the maximum thread index ${
            profile.threads.length - 1
          }.`
        );
        return false;
      })
    );
  }

  const { threads } = profile;
  if (threads.length === 0) {
    throw new Error('Expected to find a thread index to select.');
  }

  const threadOrder = _defaultThreadOrder(
    visibleThreadIndexes,
    threads,
    threadActivityScores
  );

  // Try to find a tab process with the highest activity score. If it can't
  // find one, select the first thread with the highest one.
  const defaultThreadIndex =
    threadOrder.find(
      (threadIndex) =>
        threads[threadIndex].name === 'GeckoMain' &&
        threads[threadIndex].processType === 'tab'
    ) ?? threadOrder[0];

  return new Set([defaultThreadIndex]);
}

function _defaultThreadOrder(
  visibleThreadIndexes: ThreadIndex[],
  threads: RawThread[],
  threadActivityScores: Array<ThreadActivityScore>
): ThreadIndex[] {
  const threadOrder = [...visibleThreadIndexes];

  // Note: to have a consistent behavior independant of the sorting algorithm,
  // we need to be careful that the comparator function is consistent:
  // comparator(a, b) === - comparator(b, a)
  // and
  // comparator(a, b) === 0   if and only if   a === b
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;

    if (nameA === nameB) {
      // Sort by the activity, but keep the original order if the activity
      // scores are the equal.
      return (
        threadActivityScores[b].boostedSampleScore -
          threadActivityScores[a].boostedSampleScore || a - b
      );
    }

    // Put the compositor/renderer thread last.
    // Compositor will always be before Renderer, if both are present.
    if (nameA === 'Compositor') {
      return 1;
    }

    if (nameB === 'Compositor') {
      return -1;
    }

    if (nameA === 'Renderer') {
      return 1;
    }

    if (nameB === 'Renderer') {
      return -1;
    }

    // Otherwise keep the existing order. We don't return 0 to guarantee that
    // the sort is stable even if the sort algorithm isn't.
    return (
      threadActivityScores[b].boostedSampleScore -
        threadActivityScores[a].boostedSampleScore || a - b
    );
  });
  return threadOrder;
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
  const visibleThreads = subtractSets(allThreads, hiddenThreadsSet);
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
  const hiddenGlobalTracks = intersectSets(
    new Set(tracksWithOrder.globalTrackOrder),
    urlHiddenGlobalTracks
  );

  const hiddenLocalTracksByPid = new Map();
  for (const [pid, localTrackOrder] of tracksWithOrder.localTrackOrderByPid) {
    const localTracks = new Set(localTrackOrder);
    const hiddenLocalTracks = intersectSets(
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
  threadActivityScores: Array<ThreadActivityScore>,
  includeParentProcessThreads: boolean
): HiddenTracks {
  return _computeHiddenTracksForVisibleThreads(
    profile,
    computeDefaultVisibleThreads(
      profile,
      tracksWithOrder,
      threadActivityScores,
      includeParentProcessThreads
    ),
    tracksWithOrder
  );
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
        return !_isLocalTrackVisible(localTrack, visibleThreadIndexes);
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
  threads: RawThread[]
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
  threads: RawThread[],
  shared: RawProfileSharedData,
  counters: RawCounter[]
): string {
  switch (localTrack.type) {
    case 'thread':
      return getFriendlyThreadName(threads, threads[localTrack.threadIndex]);
    case 'network':
      return 'Network';
    case 'memory':
      return 'Memory';
    case 'bandwidth':
      return 'Bandwidth';
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
    case 'process-cpu':
      return 'Process CPU';
    case 'power':
      return counters[localTrack.counterIndex].name;
    case 'marker':
      return shared.stringArray[localTrack.markerName];
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}

// Return a Set of all possible track threads. We can't just rely on the
// profile.threads, because some of them could be already filtered out by the
// tab selector.
function computeAllTrackThreads(
  tracksWithOrder: TracksWithOrder
): Set<ThreadIndex> {
  const allTrackThreads = new Set();

  for (const globalTrack of tracksWithOrder.globalTracks) {
    switch (globalTrack.type) {
      case 'process':
        if (globalTrack.mainThreadIndex !== null) {
          allTrackThreads.add(globalTrack.mainThreadIndex);
        }
        break;
      default:
        break;
    }
  }

  for (const [, localTracks] of tracksWithOrder.localTracksByPid) {
    for (const localTrack of localTracks) {
      switch (localTrack.type) {
        case 'thread':
          allTrackThreads.add(localTrack.threadIndex);
          break;
        default:
          break;
      }
    }
  }

  return allTrackThreads;
}

// Consider threads whose sample score is less than 5% of the maximum sample score to be idle.
const IDLE_THRESHOLD_FRACTION = 0.05;

// Return a non-empty set of threads that should be shown by default.
export function computeDefaultVisibleThreads(
  profile: Profile,
  tracksWithOrder: TracksWithOrder,
  threadActivityScores: Array<ThreadActivityScore>,
  includeParentProcessThreads: boolean
): Set<ThreadIndex> {
  const threads = profile.threads;
  if (threads.length === 0) {
    throw new Error('No threads');
  }

  // check whether the visible threads are preconfigured
  if (profile.meta.initialVisibleThreads !== undefined) {
    profile.meta.initialVisibleThreads.forEach((index) =>
      ensureExists(profile.threads[index])
    );
    return new Set(profile.meta.initialVisibleThreads);
  }

  const allTrackThreads = computeAllTrackThreads(tracksWithOrder);

  // First, compute a score for every thread.
  let scores = threadActivityScores.map((score, threadIndex) => ({
    threadIndex,
    score,
  }));

  // Next, filter the tracks by the tab selector threads.
  scores = scores.filter(({ threadIndex }) => allTrackThreads.has(threadIndex));

  // Next, sort the threads by score.
  scores.sort(({ score: a }, { score: b }) => {
    // Return:
    //  < 0 for "A is more interesting than B",
    //  > 0 for "B is more interesting than A",
    // == 0 for "both threads are equally interesting"
    if (a.isEssentialFirefoxThread !== b.isEssentialFirefoxThread) {
      return a.isEssentialFirefoxThread ? -1 : 1;
    }
    return b.boostedSampleScore - a.boostedSampleScore;
  });

  // Take the top 15 threads and cull everything else.
  const top15 = scores.slice(0, 15);

  // As a last pass, cull very-idle threads, by comparing their activity
  // to the thread with the most "sampleScore" activity.
  // We keep all threads whose sampleScore is at least 5% of the highest
  // sampleScore, and also any threads which are otherwise essential.
  // We also remove the parent process if that was requested. That's why we
  // have to ignore their scores while computing the highest score.
  const highestSampleScore = Math.max(
    ...scores.map(({ score }) => {
      if (score.isInParentProcess && !includeParentProcessThreads) {
        // Do not account for the parent process threads if we do not want to
        // include them for the visible threads by default.
        return 0;
      }
      return score.sampleScore;
    })
  );
  const thresholdSampleScore = highestSampleScore * IDLE_THRESHOLD_FRACTION;
  const tryToHideList = [];
  let finalList = top15.filter((activityScore) => {
    const { score } = activityScore;
    if (score.isInParentProcess && !includeParentProcessThreads) {
      // We try to hide this thread that belongs to the parent process.
      // But when we hide all the threads we might encounter that all the
      // threads are hidden now. For cases like this we would like to keep a
      // tryToHideList, so we can add them back if the track is completely empty.
      if (score.sampleScore >= thresholdSampleScore) {
        tryToHideList.push(activityScore);
      }
      return false;
    }

    if (score.isEssentialFirefoxThread) {
      return true; // keep.
    }
    if (score.isInterestingEvenWithMinimalActivity && score.sampleScore > 0) {
      return true; // keep.
    }
    return score.sampleScore >= thresholdSampleScore;
  });

  if (finalList.length === 0) {
    // We tried to hide the main process threads, but this resulted us to have
    // an empty list. Put them back.
    finalList = tryToHideList;
  }

  return new Set(finalList.map(({ threadIndex }) => threadIndex));
}

export type ThreadActivityScore = {
  // Whether this thread is one of the essential threads that
  // should always be kept (unless there's too many of them).
  isEssentialFirefoxThread: boolean,
  // Whether this thread belongs to the parent process. We do not want to show
  // them by default if the tab selector is used.
  isInParentProcess: boolean,
  // Whether this thread should be kept even if it looks very idle,
  // as long as there's a single sample with non-zero activity.
  isInterestingEvenWithMinimalActivity: boolean,
  // The accumulated CPU delta for the entire thread.
  // If the thread does not have CPU delta information, we compute
  // a "CPU-delta-like" number based on the number of samples which
  // are in a non-idle category.
  sampleScore: number,
  // Like sampleScore, but with a boost factor applied if this thread
  // is "interesting even with minimal activity".
  boostedSampleScore: number,
};

// Also called "padenot factor".
const AUDIO_THREAD_SAMPLE_SCORE_BOOST_FACTOR = 40;

// Compute a "default visibility" score for this thread.
// See the DefaultVisibilityScore type for details.
// If we have too many threads, we use this score to compare between
// "interesting" threads to make sure we keep the most interesting ones.
export function computeThreadActivityScore(
  profile: Profile,
  thread: RawThread,
  referenceCPUDeltaPerMs: number
): ThreadActivityScore {
  const isEssentialFirefoxThread = _isEssentialFirefoxThread(thread);
  const isInParentProcess = thread.processType === 'default';
  const isInterestingEvenWithMinimalActivity =
    _isFirefoxMediaThreadWhichIsUsuallyIdle(thread);
  const sampleScore = _computeThreadSampleScore(
    profile,
    thread,
    referenceCPUDeltaPerMs
  );
  const boostedSampleScore = isInterestingEvenWithMinimalActivity
    ? sampleScore * AUDIO_THREAD_SAMPLE_SCORE_BOOST_FACTOR
    : sampleScore;
  return {
    isEssentialFirefoxThread,
    isInParentProcess,
    isInterestingEvenWithMinimalActivity,
    sampleScore,
    boostedSampleScore,
  };
}

function _isEssentialFirefoxThread(thread: RawThread): boolean {
  return (
    // Don't hide the main thread of the parent process.
    (thread.name === 'GeckoMain' &&
      thread.processType === 'default' &&
      (!thread.processName || thread.processName === 'Parent Process')) ||
    // Don't hide the GPU thread on Windows.
    (thread.name === 'GeckoMain' && thread.processType === 'gpu')
  );
}

function _isFirefoxMediaThreadWhichIsUsuallyIdle(thread: RawThread): boolean {
  // Detect media threads: they are usually very idle, but are interesting
  // as soon as there's at least one sample. They're present with the media
  // preset, but not usually captured otherwise.
  // Matched thread names: AudioIPC, MediaPDecoder, MediaTimer, MediaPlayback,
  // MediaDecoderStateMachine, GraphRunner. They're enabled by the media
  // preset.
  return /^(?:Audio|Media|GraphRunner|WebrtcWorker)/.test(thread.name);
}

// Compute the accumulated CPU delta for the entire thread.
// If the thread does not have CPU delta information, we compute a
// "CPU-delta-like" number based on the number of samples which are in a
// non-idle category.
// If the profile has no cpu delta units, the return value is based on the
// number of non-idle samples.
function _computeThreadSampleScore(
  { meta }: Profile,
  { samples, stackTable, frameTable }: RawThread,
  referenceCPUDeltaPerMs: number
): number {
  if (meta.sampleUnits && samples.threadCPUDelta) {
    // Sum up all CPU deltas in this thread, to compute a total
    // CPU time for this thread (or a total CPU cycle count).
    return samples.threadCPUDelta.reduce(
      (accum, delta) => accum + (delta ?? 0),
      0
    );
  }

  // This thread has no CPU delta information.
  // Compute a score based on non-idle samples, in the same
  // units as the cpu delta score.
  const defaultCategory = meta.categories
    ? meta.categories.findIndex((c) => c.color === 'grey')
    : -1;
  const idleCategoryIndex = meta.categories
    ? meta.categories.findIndex((c) => c.name === 'Idle')
    : -1;
  const derivedStackTable = computeStackTableFromRawStackTable(
    stackTable,
    frameTable,
    defaultCategory
  );
  const nonIdleSampleCount = samples.stack.filter(
    (stack) =>
      stack !== null && derivedStackTable.category[stack] !== idleCategoryIndex
  ).length;
  const referenceCPUDeltaPerInterval = referenceCPUDeltaPerMs * meta.interval;
  return nonIdleSampleCount * referenceCPUDeltaPerInterval;
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
  threads: RawThread[],
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
  threads: RawThread[],
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
        case 'bandwidth':
        case 'marker':
        case 'ipc':
        case 'event-delay':
        case 'power':
        case 'process-cpu': {
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

    if (searchFilteredLocalTracks.size > 0) {
      // Only add the global track when the are some search filtered local tracks.
      searchFilteredLocalTracksByPid.set(pid, searchFilteredLocalTracks);
    }
  }

  return searchFilteredLocalTracksByPid;
}

/**
 * Get the type and return the type filtered global tracks.
 */
export function getTypeFilteredGlobalTracks(
  tracks: GlobalTrack[],
  type: string
): Set<TrackIndex> | null {
  if (!type) {
    return null;
  }

  const typeFilteredGlobalTracks = new Set();

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const globalTrack = tracks[trackIndex];

    if (globalTrack.type === type) {
      typeFilteredGlobalTracks.add(trackIndex);
    }
  }

  return typeFilteredGlobalTracks;
}

/**
 * Get the type and return the filtered by type local tracks by Pid.
 */
export function getTypeFilteredLocalTracksByPid(
  localTracksByPid: Map<Pid, LocalTrack[]>,
  type: string
): Map<Pid, Set<TrackIndex>> | null {
  if (!type) {
    return null;
  }

  const typeFilteredLocalTracksByPid = new Map();
  for (const [pid, tracks] of localTracksByPid) {
    const typeFilteredLocalTracks = new Set();

    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const localTrack = tracks[trackIndex];
      if (localTrack.type === type) {
        typeFilteredLocalTracks.add(trackIndex);
      }
    }
    if (typeFilteredLocalTracks.size > 0) {
      // Only add the global track when the are some type filtered local tracks.
      typeFilteredLocalTracksByPid.set(pid, typeFilteredLocalTracks);
    }
  }

  return typeFilteredLocalTracksByPid;
}

/**
 * Returns the track reference from tid.
 * Returns null if the given tid is not found.
 */
export function getTrackReferenceFromTid(
  tid: Tid,
  globalTracks: GlobalTrack[],
  localTracksByPid: Map<Pid, LocalTrack[]>,
  threads: RawThread[]
): TrackReference | null {
  // First, check if it's a global track.
  for (
    let globalTrackIndex = 0;
    globalTrackIndex < globalTracks.length;
    globalTrackIndex++
  ) {
    const globalTrack = globalTracks[globalTrackIndex];

    if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex !== null &&
      threads[globalTrack.mainThreadIndex].tid === tid
    ) {
      return { type: 'global', trackIndex: globalTrackIndex };
    }
  }

  // Then, check if it's a local track
  for (const [pid, localTracks] of localTracksByPid) {
    for (
      let localTrackIndex = 0;
      localTrackIndex < localTracks.length;
      localTrackIndex++
    ) {
      const localTrack = localTracks[localTrackIndex];

      if (
        localTrack.type === 'thread' &&
        threads[localTrack.threadIndex].tid === tid
      ) {
        return { type: 'local', pid: pid, trackIndex: localTrackIndex };
      }
    }
  }

  // Failed to find the thread from tid.
  return null;
}

/**
 * Returns the track reference from a threadIndex
 * Returns null if the given threadIndex is not found.
 */
export function getTrackReferenceFromThreadIndex(
  threadIndex: ThreadIndex,
  globalTracks: GlobalTrack[],
  localTracksByPid: Map<Pid, LocalTrack[]>
): TrackReference | null {
  // First, check if it's a global track.
  for (
    let globalTrackIndex = 0;
    globalTrackIndex < globalTracks.length;
    globalTrackIndex++
  ) {
    const globalTrack = globalTracks[globalTrackIndex];

    if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex === threadIndex
    ) {
      return { type: 'global', trackIndex: globalTrackIndex };
    }
  }

  // Then, check if it's a local track
  for (const [pid, localTracks] of localTracksByPid) {
    for (
      let localTrackIndex = 0;
      localTrackIndex < localTracks.length;
      localTrackIndex++
    ) {
      const localTrack = localTracks[localTrackIndex];

      if (
        localTrack.type === 'thread' &&
        localTrack.threadIndex === threadIndex
      ) {
        return { type: 'local', pid: pid, trackIndex: localTrackIndex };
      }
    }
  }

  // Failed to find the thread from its thread index.
  return null;
}

/*
 * Returns whether the local track should be visible or not.
 * If the track is not a thread, some of them can be visible by default and some
 * of them can be hidden to reduce the noise. This mostly depends on either the
 * usefulness or the activity of that track.
 *
 * TODO: Check the memory track activity here to decide if it should be visible.
 */
function _isLocalTrackVisible(
  localTrack: LocalTrack,
  visibleThreadIndexes: Set<ThreadIndex>
): boolean {
  switch (localTrack.type) {
    case 'thread':
      // Show the local thread if it's included in the visible thread indexes.
      return visibleThreadIndexes.has(localTrack.threadIndex);
    case 'marker':
    case 'network':
    case 'memory':
    case 'bandwidth':
    // 'event-delay' and 'process-cpu' tracks are experimental and they should
    // be visible by default whenever they are included in a profile. (fallthrough)
    case 'event-delay':
    case 'process-cpu':
    // Power tracks are there only if the power feature is enabled. So they should
    // be visible by default whenever they're included in a profile. (fallthrough)
    case 'power':
      // Keep non-thread local tracks visible.
      return true;
    case 'ipc':
      // IPC tracks are not always useful to the users. So we are making them hidden
      // by default to reduce the noise.
      return false;
    default:
      throw assertExhaustiveCheck(localTrack, 'Unhandled LocalTrack type.');
  }
}
