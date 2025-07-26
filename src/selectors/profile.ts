/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';
import * as Tracks from '../profile-logic/tracks';
import * as CPU from '../profile-logic/cpu';
import * as CombinedCPU from '../profile-logic/combined-cpu';
import * as UrlState from './url-state';
import type { SliceTree } from '../utils/slice-tree';
import { getSlices } from '../utils/slice-tree';
import { ensureExists } from '../utils/types';
import {
  accumulateCounterSamples,
  extractProfileFilterPageData,
  computeMaxCounterSampleCountPerMs,
  getFriendlyThreadName,
  processCounter,
  getInclusiveSampleIndexRangeForSelection,
  computeTabToThreadIndexesMap,
  computeSamplesTableFromRawSamplesTable,
} from '../profile-logic/profile-data';
import type { IPCMarkerCorrelations } from '../profile-logic/marker-data';
import { correlateIPCMarkers } from '../profile-logic/marker-data';
import { markerSchemaFrontEndOnly } from '../profile-logic/marker-schema';
import { getDefaultCategories } from 'firefox-profiler/profile-logic/data-structures';
import * as CommittedRanges from '../profile-logic/committed-ranges';
import { defaultTableViewOptions } from '../reducers/profile-view';
import { StringTable } from '../utils/string-table';
import type { TabSlug } from '../app-logic/tabs-handling';

import type {
  Profile,
  RawProfileSharedData,
  CategoryList,
  IndexIntoCategoryList,
  RawThread,
  ThreadIndex,
  Pid,
  Tid,
  RawCounter,
  Counter,
  CounterIndex,
  PageList,
  ProfileMeta,
  VisualMetrics,
  ProgressGraphData,
  ProfilerConfiguration,
  InnerWindowID,
  TabID,
  Page,
  LocalTrack,
  TrackIndex,
  GlobalTrack,
  AccumulatedCounterSamples,
  ProfileFilterPageData,
  Milliseconds,
  StartEndRange,
  GlobalTrackReference,
  LocalTrackReference,
  TrackReference,
  LastNonShiftClickInformation,
  PreviewSelection,
  HiddenTrackCount,
  Selector,
  DangerousSelectorWithArguments,
  State,
  ProfileViewState,
  SymbolicationStatus,
  MarkerSchema,
  MarkerSchemaByName,
  SampleUnits,
  SamplesTable,
  IndexIntoSamplesTable,
  ExtraProfileInfoSection,
  TableViewOptions,
  ExtensionTable,
  SortedTabPageData,
  TimelineUnit,
  SourceTable,
} from 'firefox-profiler/types';

import type { ThreadActivityScore } from '../profile-logic/tracks';

export const getProfileView: Selector<ProfileViewState> = (state) =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<
  ProfileViewState['viewOptions']
> = (state) => getProfileView(state).viewOptions;
export const getCurrentTableViewOptions: Selector<TableViewOptions> = (state) =>
  getProfileViewOptions(state).perTab[UrlState.getSelectedTab(state)] ||
  defaultTableViewOptions;
export const getProfileRootRange: Selector<StartEndRange> = (state) =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus: Selector<SymbolicationStatus> = (state) =>
  getProfileViewOptions(state).symbolicationStatus;
export const getScrollToSelectionGeneration: Selector<number> = (state) =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration: Selector<number> = (state) =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt: Selector<Milliseconds> = (state) =>
  getProfileRootRange(state).start;
export const getProfileTimelineUnit: Selector<TimelineUnit> = (state) => {
  const { sampleUnits } = getProfile(state).meta;
  return sampleUnits ? sampleUnits.time : 'ms';
};

export const getCommittedRange: Selector<StartEndRange> = createSelector(
  getProfileRootRange,
  getZeroAt,
  UrlState.getAllCommittedRanges,
  (rootRange, zeroAt, committedRanges): StartEndRange => {
    if (committedRanges.length > 0) {
      let { start, end } = committedRanges[committedRanges.length - 1];
      start += zeroAt;
      end += zeroAt;
      return { start, end };
    }
    return rootRange;
  }
);

/**
 * This selector transforms the committed ranges into a list of labels that can
 * be displayed in the UI.
 */
export const getCommittedRangeLabels: Selector<string[]> = createSelector(
  UrlState.getAllCommittedRanges,
  getProfileTimelineUnit,
  CommittedRanges.getCommittedRangeLabels
);

export const getMouseTimePosition: Selector<Milliseconds | null> = (state) =>
  getProfileViewOptions(state).mouseTimePosition;

export const getTableViewOptionSelectors: (
  tab: TabSlug
) => Selector<TableViewOptions> = (tab) => (state) => {
  const options = getProfileViewOptions(state).perTab[tab];
  return options || defaultTableViewOptions;
};

export const getPreviewSelection: Selector<PreviewSelection | null> = (state) =>
  getProfileViewOptions(state).previewSelection;

export const getPreviewSelectionIsBeingModified: Selector<boolean> = (
  state
) => {
  const previewSelection = getPreviewSelection(state);
  return previewSelection ? previewSelection.isModifying : false;
};

/**
 * This selector returns the current range, taking into account the current
 * preview selection if any.
 */
export const getPreviewSelectionRange: Selector<StartEndRange> = createSelector(
  getCommittedRange,
  getPreviewSelection,
  (committedRange, previewSelection) => {
    if (previewSelection) {
      return {
        start: previewSelection.selectionStart,
        end: previewSelection.selectionEnd,
      };
    }
    return committedRange;
  }
);

/**
 * Profile
 */
export const getProfileOrNull: Selector<Profile | null> = (state) =>
  getProfileView(state).profile;
export const getProfile: Selector<Profile> = (state) =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getRawProfileSharedData: Selector<RawProfileSharedData> = (
  state
) => getProfile(state).shared;
export const getProfileInterval: Selector<Milliseconds> = (state) =>
  getProfile(state).meta.interval;
export const getPageList = (state: State): PageList | null =>
  getProfile(state).pages || null;
export const getDefaultCategory: Selector<IndexIntoCategoryList> = (state) =>
  getCategories(state).findIndex((c) => c.color === 'grey');
export const getThreads: Selector<RawThread[]> = (state) =>
  getProfile(state).threads;
export const getThreadNames: Selector<string[]> = (state) =>
  getProfile(state).threads.map((t) => t.name);
export const getLastNonShiftClick: Selector<
  LastNonShiftClickInformation | null
> = (state) => getProfileViewOptions(state).lastNonShiftClick;
export const getRightClickedTrack: Selector<TrackReference | null> = (state) =>
  getProfileViewOptions(state).rightClickedTrack;
export const getCounters: Selector<RawCounter[] | null> = (state) =>
  getProfile(state).counters || null;
export const getMeta: Selector<ProfileMeta> = (state) => getProfile(state).meta;
export const getVisualMetricsOrNull: Selector<VisualMetrics | null> = (state) =>
  getMeta(state).visualMetrics || null;
export const getVisualMetrics: Selector<VisualMetrics> = (state) =>
  ensureExists(
    getVisualMetricsOrNull(state),
    'Tried to access the visual metrics when it does not exist.'
  );
export const getVisualProgress: Selector<ProgressGraphData[] | null> = (
  state
) => getVisualMetrics(state).VisualProgress;
export const getPerceptualSpeedIndexProgress: Selector<
  ProgressGraphData[] | null
> = (state) => getVisualMetrics(state).PerceptualSpeedIndexProgress ?? null;
export const getContentfulSpeedIndexProgress: Selector<
  ProgressGraphData[] | null
> = (state) => getVisualMetrics(state).ContentfulSpeedIndexProgress ?? null;
export const getProfilerConfiguration: Selector<
  ProfilerConfiguration | undefined
> = (state) => getMeta(state).configuration;

// Get the marker schema that comes from the Gecko profile.
const getMarkerSchemaGecko: Selector<MarkerSchema[]> = (state) =>
  getMeta(state).markerSchema;

// Get the samples table units. They can be different depending on their platform.
// See SampleUnits type definition for more information.
export const getSampleUnits: Selector<SampleUnits | undefined> = (state) =>
  getMeta(state).sampleUnits;

// Get all extensions in the profile metadata.
export const getExtensionTable: Selector<ExtensionTable | undefined> = (
  state
) => getMeta(state).extensions;

/**
 * Firefox profiles will always have categories. However, imported profiles may not
 * contain default categories. In this case, provide a default list.
 */
export const getCategories: Selector<CategoryList> = createSelector(
  getProfile,
  (profile) => {
    const { categories } = profile.meta;
    return categories ? categories : getDefaultCategories();
  }
);

export const getStringTable: Selector<StringTable> = createSelector(
  (state: State) => getRawProfileSharedData(state).stringArray,
  (stringArray) => StringTable.withBackingArray(stringArray as string[])
);

export const getSourceTable: Selector<SourceTable> = (state: State) =>
  getRawProfileSharedData(state).sources;

// Combine the marker schema from Gecko and the front-end. This allows the front-end
// to generate markers such as the Jank markers, and display them.
export const getMarkerSchema: Selector<MarkerSchema[]> = createSelector(
  getMarkerSchemaGecko,
  (geckoSchema) => {
    const frontEndSchemaNames = new Set([
      ...markerSchemaFrontEndOnly.map((schema) => schema.name),
    ]);
    return [
      // Don't duplicate schema definitions that the front-end already has.
      ...geckoSchema.filter((schema) => !frontEndSchemaNames.has(schema.name)),
      ...markerSchemaFrontEndOnly,
    ];
  }
);

export const getMarkerSchemaByName: Selector<MarkerSchemaByName> =
  createSelector(getMarkerSchema, (schemaList) => {
    const result = Object.create(null);
    for (const schema of schemaList) {
      result[schema.name] = schema;
    }
    return result;
  });

type CounterSelectors = ReturnType<typeof _createCounterSelectors>;

const _counterSelectors: { [key: number]: CounterSelectors } = {};
export const getCounterSelectors = (index: CounterIndex): CounterSelectors => {
  let selectors = _counterSelectors[index];
  if (!selectors) {
    selectors = _createCounterSelectors(index);
    _counterSelectors[index] = selectors;
  }
  return selectors;
};

/**
 * This function creates selectors for each of the Counters in the profile. The type
 * signature of each selector is defined in the function body, and inferred in the return
 * type of the function.
 */
function _createCounterSelectors(counterIndex: CounterIndex) {
  const getCounter: Selector<Counter> = createSelector(getProfile, (profile) =>
    processCounter(
      ensureExists(
        profile.counters,
        'Attempting to get a counter by index, but no counters exist.'
      )[counterIndex]
    )
  );

  const getDescription: Selector<string> = (state) =>
    getCounter(state).description;

  const getPid: Selector<Pid> = (state) => getCounter(state).pid;

  const getCommittedRangeCounterSampleRange: Selector<
    [IndexIntoSamplesTable, IndexIntoSamplesTable]
  > = createSelector(getCounter, getCommittedRange, (counter, range) =>
    getInclusiveSampleIndexRangeForSelection(
      counter.samples,
      range.start,
      range.end
    )
  );

  const getAccumulateCounterSamples: Selector<AccumulatedCounterSamples> =
    createSelector(
      getCounter,
      getCommittedRangeCounterSampleRange,
      (counter, sampleRange) =>
        accumulateCounterSamples(counter.samples, sampleRange)
    );

  const getMaxCounterSampleCountPerMs: Selector<number> = createSelector(
    getCounter,
    getProfileInterval,
    (counter, profileInterval) =>
      computeMaxCounterSampleCountPerMs(counter.samples, profileInterval)
  );

  const getMaxRangeCounterSampleCountPerMs: Selector<number> = createSelector(
    getCounter,
    getProfileInterval,
    getCommittedRangeCounterSampleRange,
    (counter, profileInterval, sampleRange) =>
      computeMaxCounterSampleCountPerMs(
        counter.samples,
        profileInterval,
        sampleRange
      )
  );

  return {
    getCounter,
    getDescription,
    getPid,
    getAccumulateCounterSamples,
    getMaxCounterSampleCountPerMs,
    getMaxRangeCounterSampleCountPerMs,
    getCommittedRangeCounterSampleRange,
  };
}

export const getIPCMarkerCorrelations: Selector<IPCMarkerCorrelations> =
  createSelector([getThreads, getRawProfileSharedData], correlateIPCMarkers);

/**
 * Returns an InnerWindowID -> Page map, so we can look up the page from inner
 * window id quickly. Returns null if there are no pages in the profile.
 */
export const getInnerWindowIDToPageMap: Selector<Map<
  InnerWindowID,
  Page
> | null> = createSelector(getPageList, (pages) => {
  if (!pages) {
    // Return null if there are no pages.
    return null;
  }

  const innerWindowIDToPageMap: Map<InnerWindowID, Page> = new Map();
  for (const page of pages) {
    innerWindowIDToPageMap.set(page.innerWindowID, page);
  }

  return innerWindowIDToPageMap;
});

/**
 * Returns an InnerWindowID -> TabID map, so we can find the TabID of a given
 * innerWindowID quickly. Returns null if there are no pages in the profile.
 */
export const getInnerWindowIDToTabMap: Selector<Map<
  InnerWindowID,
  TabID
> | null> = createSelector(getPageList, (pages) => {
  if (!pages) {
    // Return null if there are no pages.
    return null;
  }

  const innerWindowIDToTabMap: Map<InnerWindowID, TabID> = new Map();
  for (const page of pages) {
    innerWindowIDToTabMap.set(page.innerWindowID, page.tabID);
  }

  return innerWindowIDToTabMap;
});

/**
 * Return a map of tab to thread indexes map. This is useful for learning which
 * threads are involved for tabs. This is mainly used for the tab selector on
 * the top left corner.
 */
export const getTabToThreadIndexesMap: Selector<Map<TabID, Set<ThreadIndex>>> =
  createSelector(
    getThreads,
    getInnerWindowIDToTabMap,
    (threads, innerWindowIDToTabMap) =>
      computeTabToThreadIndexesMap(threads, innerWindowIDToTabMap)
  );

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks: Selector<GlobalTrack[]> = (state) =>
  getProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences: Selector<GlobalTrackReference[]> =
  createSelector(getGlobalTracks, (globalTracks) =>
    globalTracks.map((_globalTrack, trackIndex) => ({
      type: 'global',
      trackIndex,
    }))
  );

export const getHasPreferenceMarkers: Selector<boolean> = createSelector(
  getStringTable,
  getThreads,
  (stringTable, threads) => {
    if (!stringTable.hasString('PreferenceRead')) {
      return false;
    }
    const indexForPreferenceString =
      stringTable.indexForString('PreferenceRead');
    return threads.some(({ markers }) =>
      markers.name.includes(indexForPreferenceString)
    );
  }
);

/**
 * This finds a GlobalTrack from its TrackReference. No memoization is needed
 * as this is a simple value look-up.
 */
export const getGlobalTrackFromReference: DangerousSelectorWithArguments<
  GlobalTrack,
  GlobalTrackReference
> = (state, trackReference) =>
  getGlobalTracks(state)[trackReference.trackIndex];

/**
 * This finds a GlobalTrack and its index for a specific Pid.
 *
 * Warning: this selector returns a new object on every call, and will not
 * properly work with a PureComponent.
 */
export const getGlobalTrackAndIndexByPid: DangerousSelectorWithArguments<
  { readonly globalTrackIndex: TrackIndex; readonly globalTrack: GlobalTrack },
  Pid
> = (state, pid) => {
  const globalTracks = getGlobalTracks(state);
  const globalTrackIndex = globalTracks.findIndex(
    (track) => track.type === 'process' && track.pid === pid
  );
  if (globalTrackIndex === -1) {
    throw new Error('Unable to find the track index for the given pid.');
  }
  const globalTrack = globalTracks[globalTrackIndex];
  if (globalTrack.type !== 'process') {
    throw new Error('The globalTrack must be a process type.');
  }
  return { globalTrackIndex, globalTrack };
};

/**
 * This returns a map of local tracks from a pid.
 */
export const getLocalTracksByPid: Selector<Map<Pid, LocalTrack[]>> = (state) =>
  getProfileView(state).localTracksByPid;

/**
 * This selectors performs a simple look up in a Map, throws an error if it doesn't exist,
 * and finally returns the local tracks for a specific Pid. It does not need memoization
 * and is a very inexpensive function to run.
 */
export const getLocalTracks: DangerousSelectorWithArguments<
  LocalTrack[],
  Pid
> = (state, pid) =>
  ensureExists(
    getProfileView(state).localTracksByPid.get(pid),
    'Unable to get the tracks for the given pid.'
  );

/**
 * This selector does an inexpensive look-up for the local track from a reference.
 * It does not need any memoization, and returns the same object every time.
 */
export const getLocalTrackFromReference: DangerousSelectorWithArguments<
  LocalTrack,
  LocalTrackReference
> = (state, trackReference) =>
  getLocalTracks(state, trackReference.pid)[trackReference.trackIndex];

/**
 * Memory markers are collected in the memory track, but in the case of profiles
 * with no memory tracks, go ahead and place them in the parent process.
 */
export const getProcessesWithMemoryTrack: Selector<Set<Pid>> = createSelector(
  getLocalTracksByPid,
  (localTracksByPid) => {
    const processesWithMemoryTrack = new Set<Pid>();
    for (const [pid, localTracks] of localTracksByPid.entries()) {
      if (localTracks.some((track) => track.type === 'memory')) {
        processesWithMemoryTrack.add(pid);
      }
    }
    return processesWithMemoryTrack;
  }
);

export const getRightClickedThreadIndex: Selector<null | ThreadIndex> =
  createSelector(
    getRightClickedTrack,
    getGlobalTracks,
    getLocalTracksByPid,
    (rightClickedTrack, globalTracks, localTracksByPid) => {
      if (rightClickedTrack === null) {
        return null;
      }
      if (rightClickedTrack.type === 'global') {
        const track = globalTracks[rightClickedTrack.trackIndex];
        return track.type === 'process' ? track.mainThreadIndex : null;
      }
      const { pid, trackIndex } = rightClickedTrack;
      const localTracks = ensureExists(
        localTracksByPid.get(pid),
        'No local tracks found at that pid.'
      );
      const track = localTracks[trackIndex];

      return track.type === 'thread' ? track.threadIndex : null;
    }
  );

export const getGlobalTrackNames: Selector<string[]> = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads) =>
    globalTracks.map((globalTrack) =>
      Tracks.getGlobalTrackName(globalTrack, threads)
    )
);

export const getGlobalTrackName: DangerousSelectorWithArguments<
  string,
  TrackIndex
> = (state, trackIndex) => getGlobalTrackNames(state)[trackIndex];

export const getLocalTrackNamesByPid: Selector<Map<Pid, string[]>> =
  createSelector(
    getLocalTracksByPid,
    getThreads,
    getRawProfileSharedData,
    getCounters,
    (localTracksByPid, threads, shared, counters) => {
      const localTrackNamesByPid = new Map();
      for (const [pid, localTracks] of localTracksByPid) {
        localTrackNamesByPid.set(
          pid,
          localTracks.map((localTrack) =>
            Tracks.getLocalTrackName(
              localTrack,
              threads,
              shared,
              counters || []
            )
          )
        );
      }
      return localTrackNamesByPid;
    }
  );

export const getLocalTrackName = (
  state: State,
  pid: Pid,
  trackIndex: TrackIndex
): string =>
  ensureExists(
    getLocalTrackNamesByPid(state).get(pid),
    'Could not find the track names from the given pid'
  )[trackIndex];

/**
 * It's a bit hard to deduce the total amount of hidden tracks, as there are both
 * global and local tracks, and they are stored by PID. If a global track is hidden,
 * then all its children are as well. This function walks all of the data to determine
 * the correct hidden counts.
 */
export const getHiddenTrackCount: Selector<HiddenTrackCount> = createSelector(
  getGlobalTracks,
  getLocalTracksByPid,
  UrlState.getHiddenLocalTracksByPid,
  UrlState.getHiddenGlobalTracks,
  (
    globalTracks,
    localTracksByPid,
    hiddenLocalTracksByPid,
    hiddenGlobalTracks
  ) => {
    let hidden = 0;
    let total = 0;

    // Count up the local tracks
    for (const [pid, localTracks] of localTracksByPid) {
      // Look up some of the information.
      const hiddenLocalTracks = hiddenLocalTracksByPid.get(pid) || new Set();
      const globalTrackIndex = globalTracks.findIndex(
        (track) => track.type === 'process' && track.pid === pid
      );
      if (globalTrackIndex === -1) {
        throw new Error('Unable to find a global track from the given pid.');
      }
      if (!hiddenLocalTracks) {
        throw new Error(
          'Unable to find the hidden local tracks from the given pid'
        );
      }

      if (hiddenGlobalTracks.has(globalTrackIndex)) {
        // The entire process group is hidden, count all of the tracks.
        hidden += localTracks.length;
      } else {
        // Only count the hidden local tracks.
        hidden += hiddenLocalTracks.size;
      }
      total += localTracks.length;
    }

    total += globalTracks.length;
    hidden += hiddenGlobalTracks.size;

    return { hidden, total };
  }
);

export const getReferenceCPUDeltaPerMs: Selector<number> = createSelector(
  getProfile,
  CPU.computeReferenceCPUDeltaPerMs
);

export const getThreadActivityScores: Selector<Array<ThreadActivityScore>> =
  createSelector(
    getProfile,
    getReferenceCPUDeltaPerMs,
    (profile, referenceCPUDeltaPerMs) => {
      const { threads } = profile;

      return threads.map((thread) =>
        Tracks.computeThreadActivityScore(
          profile,
          thread,
          referenceCPUDeltaPerMs
        )
      );
    }
  );

/**
 * Get the CPU time in milliseconds for each thread.
 * Returns an array of CPU times (one per thread), or null if no CPU delta
 * information is available. This uses the raw sampleScore without boost factors.
 */
export const getThreadCPUTimeMs: Selector<Array<number> | null> =
  createSelector(getProfile, (profile) => {
    const { threads, meta } = profile;
    const { sampleUnits } = meta;

    if (!sampleUnits || !sampleUnits.threadCPUDelta) {
      return null;
    }

    // Determine the conversion factor to milliseconds
    let cpuDeltaToMs: number;
    switch (sampleUnits.threadCPUDelta) {
      case 'µs':
        cpuDeltaToMs = 1 / 1000;
        break;
      case 'ns':
        cpuDeltaToMs = 1 / 1000000;
        break;
      case 'variable CPU cycles':
        // CPU cycles are not time units, return null
        return null;
      default:
        return null;
    }

    return threads.map((thread) => {
      const { threadCPUDelta } = thread.samples;
      if (!threadCPUDelta) {
        return 0;
      }
      // Sum up all CPU deltas and convert to milliseconds
      const totalCPUDelta = threadCPUDelta.reduce<number>(
        (accum, delta) => accum + (delta ?? 0),
        0
      );
      return totalCPUDelta * cpuDeltaToMs;
    });
  });

/**
 * Get SamplesTable for all threads in the profile.
 * Returns an array of SamplesTable objects, one per thread.
 */
export const getAllThreadsSamplesTables: Selector<SamplesTable[]> =
  createSelector(
    getProfile,
    getSampleUnits,
    getReferenceCPUDeltaPerMs,
    (profile, sampleUnits, referenceCPUDeltaPerMs) => {
      return profile.threads.map((thread) =>
        computeSamplesTableFromRawSamplesTable(
          thread.samples,
          sampleUnits,
          referenceCPUDeltaPerMs
        )
      );
    }
  );

/**
 * Get combined CPU activity data from all threads.
 * Returns combined time and CPU ratio arrays, or null if no CPU data is available.
 */
export const getCombinedThreadCPUData: Selector<CombinedCPU.CpuRatioTimeSeries | null> =
  createSelector(getAllThreadsSamplesTables, (samplesTables) =>
    CombinedCPU.combineCPUDataFromThreads(samplesTables)
  );

/**
 * Get activity slices for the combined CPU usage across all threads.
 * Returns hierarchical slices showing periods of high combined CPU activity,
 * or null if no CPU data is available.
 */
export const getCombinedThreadActivitySlices: Selector<SliceTree | null> =
  createSelector(getCombinedThreadCPUData, (combinedCPU) => {
    if (combinedCPU === null) {
      return null;
    }
    const m = Math.ceil(combinedCPU.maxCpuRatio);
    return getSlices(
      [0.05 * m, 0.2 * m, 0.4 * m, 0.6 * m, 0.8 * m],
      combinedCPU.cpuRatio,
      combinedCPU.time
    );
  });

/**
 * Get the pages array and construct a Map of pages that we can use to get the
 * relationships of tabs. The constructed map is `Map<TabID,Page[]>`.
 * The TabID we use in that map is the TabID of the topmost frame. That corresponds
 * to a tab. So we had to figure out the outer most TabID of each element and
 * constructed an intermediate map to quickly find that value.
 */
export const getPagesMap: Selector<Map<TabID, Page[]> | null> = createSelector(
  getPageList,
  getInnerWindowIDToPageMap,
  (pageList, innerWindowIDToPageMap) => {
    if (
      pageList === null ||
      innerWindowIDToPageMap === null ||
      pageList.length === 0
    ) {
      // There is no data, return null
      return null;
    }

    // Construction of TabID to Page array map.
    const pageMap: Map<TabID, Page[]> = new Map();

    for (const page of pageList) {
      // If this is an iframe, we recursively visit its parent.
      const getTopMostParent = (item: any) => {
        if (item.embedderInnerWindowID === 0) {
          return item;
        }

        // We are using a Map to make this more performant.
        // It should be 1-2 loop iteration in 99% of the cases.
        const parent = innerWindowIDToPageMap.get(item.embedderInnerWindowID);
        if (parent !== undefined) {
          return getTopMostParent(parent);
        }
        // This is very unlikely to happen.
        return item;
      };

      const topMostParent = getTopMostParent(page);

      // Now we have the top most parent. We can append the pageMap.
      const { tabID } = topMostParent;
      const tabEntry = pageMap.get(tabID);
      if (tabEntry === undefined) {
        pageMap.set(tabID, [page]);
      } else {
        tabEntry.push(page);
      }
    }

    return pageMap;
  }
);

/**
 * Get the page map and return the set of InnerWindowIDs by its parent TabID.
 * This is a helper selector for other selectors so we can easily get the relevant
 * InnerWindowID set of a parent TabID. Set is useful for faster
 * filtering operations.
 */
export const getInnerWindowIDSetByTabID: Selector<Map<
  TabID,
  Set<InnerWindowID>
> | null> = createSelector(getPagesMap, (pagesMap) => {
  if (pagesMap === null || pagesMap.size === 0) {
    // There is no data, return null
    return null;
  }

  const innerWindowIDSetByTabID = new Map();
  for (const [tabID, pages] of pagesMap) {
    innerWindowIDSetByTabID.set(
      tabID,
      new Set(pages.map((page) => page.innerWindowID))
    );
  }
  return innerWindowIDSetByTabID;
});

export const getExtensionIdToNameMap: Selector<Map<string, string> | null> =
  createSelector(getExtensionTable, (extensions) => {
    if (!extensions) {
      return null;
    }

    const extensionIDtoNameMap = new Map();
    for (let i = 0; i < extensions.length; i++) {
      extensionIDtoNameMap.set(extensions.baseURL[i], extensions.name[i]);
    }
    return extensionIDtoNameMap;
  });

/**
 * Extract the hostname and favicon from the last page if we are in single tab
 * Extract the hostname and favicon from the last page for all tab ids. we
 * view. We assume that the user wants to know about the last loaded page in
 * assume that the user wants to know about the last loaded page in this tab.
 * this tab.
 * returns an empty Map if we don't have information about pages (in older profiles).
 */
export const getProfileFilterPageDataByTabID: Selector<
  Map<TabID, ProfileFilterPageData>
> = createSelector(
  getPagesMap,
  getExtensionIdToNameMap,
  extractProfileFilterPageData
);

/**
 * Get the profile filter page data for all the tabs and return a sorted array
 * of tabs data with their score.
 */
export const getProfileFilterSortedPageData: Selector<SortedTabPageData> =
  createSelector(
    getProfileFilterPageDataByTabID,
    getTabToThreadIndexesMap,
    getThreadActivityScores,
    (pageDataByTabID, tabToThreadIndexesMap, threadActivityScores) => {
      const pageDataWithScore = [];
      // Generate the pageDataWithScore array
      for (const [tabID, pageData] of pageDataByTabID.entries()) {
        let tabScore = 0;
        const threadIndexes = tabToThreadIndexesMap.get(tabID);
        if (!threadIndexes) {
          // Couldn't find any thread indexes for the tab. Do not show it.
          continue;
        }
        for (const threadIndex of threadIndexes.values()) {
          const threadScore = threadActivityScores[threadIndex];
          if (!threadScore) {
            throw new Error('Failed to find the thread score!');
          }

          tabScore += threadScore.boostedSampleScore;
        }
        pageDataWithScore.push({
          tabID,
          tabScore,
          pageData,
        });
      }

      // Sort the tabs by their activity.
      pageDataWithScore.sort((a, b) => b.tabScore - a.tabScore);
      return pageDataWithScore;
    }
  );

/**
 * Get the map of Thread ID -> Thread Name for easy access.
 */
export const getThreadIdToNameMap: Selector<Map<Tid, string>> = createSelector(
  getThreads,
  (threads) => {
    const threadIdToNameMap = new Map();
    for (const thread of threads) {
      threadIdToNameMap.set(thread.tid, getFriendlyThreadName(threads, thread));
    }
    return threadIdToNameMap;
  }
);

export const getProcessIdToNameMap: Selector<Map<Pid, string>> = createSelector(
  getThreads,
  (threads) => {
    const processIdToNameMap = new Map();
    for (const thread of threads) {
      if (!thread.isMainThread || !thread.pid) {
        continue;
      }
      processIdToNameMap.set(
        thread.pid,
        getFriendlyThreadName(threads, thread)
      );
    }
    return processIdToNameMap;
  }
);

// Gets whether this profile contains private information.
export const getContainsPrivateBrowsingInformation: Selector<boolean> =
  createSelector(getProfile, (profile) => {
    const { threads, pages } = profile;

    if (pages) {
      const hasPrivatePages = pages.some((page) => page.isPrivateBrowsing);
      if (hasPrivatePages) {
        return true;
      }
    }

    // The previous "if" block should be good enough, but including also the
    // next block (that's appropriate for Fission only) might be more future
    // proof.

    const hasPrivateThreads = threads.some(
      (thread) => thread.isPrivateBrowsing
    );

    return hasPrivateThreads;
  });

/**
 * Returns the TIDs of the threads that are profiled.
 */
export const getProfiledThreadIds: Selector<Set<Tid>> = createSelector(
  getThreads,
  (threads) => {
    const profiledThreadIds = new Set<Tid>();
    for (const { tid } of threads) {
      profiledThreadIds.add(tid);
    }
    return profiledThreadIds;
  }
);

/** Should the "Look up the function name on Searchfox" menu entry be hidden? */
export const getShouldDisplaySearchfox: Selector<boolean> = (state) => {
  const { profile } = state.profileView;
  if (!profile) {
    return true;
  }
  return profile.meta.sourceCodeIsNotOnSearchfox !== true;
};

/* Hide the stack type of frames in context menus? */
export const getProfileUsesMultipleStackTypes: Selector<boolean> = (state) => {
  const { profile } = state.profileView;
  if (!profile) {
    return true;
  }
  return profile.meta.usesOnlyOneStackType !== true;
};

export const getProfileExtraInfo: Selector<ExtraProfileInfoSection[]> =
  createSelector(getProfile, (profile) => profile.meta.extra || []);

export const getSourceViewFile: Selector<string | null> = createSelector(
  getSourceTable,
  getStringTable,
  UrlState.getSourceViewSourceIndex,
  (sources, stringTable, sourceIndex) => {
    if (sourceIndex === null) {
      return null;
    }

    const fileNameStrIndex = sources.filename[sourceIndex];
    return fileNameStrIndex !== null
      ? stringTable.getString(fileNameStrIndex)
      : null;
  }
);

export const getSourceViewSourceUuid: Selector<string | null> = createSelector(
  getSourceTable,
  UrlState.getSourceViewSourceIndex,
  (sources, sourceIndex) =>
    sourceIndex !== null ? sources.uuid[sourceIndex] : null
);
