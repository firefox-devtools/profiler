/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as Tracks from '../profile-logic/tracks';
import * as UrlState from './url-state';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';
import {
  filterCounterToRange,
  accumulateCounterSamples,
  extractProfileFilterPageData,
} from '../profile-logic/profile-data';
import {
  IPCMarkerCorrelations,
  correlateIPCMarkers,
} from '../profile-logic/marker-data';
import { markerSchemaFrontEndOnly } from '../profile-logic/marker-schema';

import type {
  Profile,
  CategoryList,
  IndexIntoCategoryList,
  Thread,
  ThreadIndex,
  Pid,
  Counter,
  CounterIndex,
  PageList,
  ProfileMeta,
  VisualMetrics,
  ProgressGraphData,
  ProfilerConfiguration,
  InnerWindowID,
  BrowsingContextID,
  Page,
  LocalTrack,
  TrackIndex,
  GlobalTrack,
  AccumulatedCounterSamples,
  ProfileFilterPageData,
  ActiveTabGlobalTrack,
  OriginsTimeline,
  ActiveTabResourceTrack,
  Milliseconds,
  StartEndRange,
  GlobalTrackReference,
  LocalTrackReference,
  TrackReference,
  PreviewSelection,
  HiddenTrackCount,
  ActiveTabGlobalTrackReference,
  ActiveTabResourceTrackReference,
  Selector,
  DangerousSelectorWithArguments,
  State,
  ProfileViewState,
  SymbolicationStatus,
  FullProfileViewState,
  ActiveTabProfileViewState,
  OriginsViewState,
  ActiveTabTimeline,
  ActiveTabMainTrack,
  ThreadsKey,
  $ReturnType,
  MarkerSchema,
  MarkerSchemaByName,
} from 'firefox-profiler/types';

export const getProfileView: Selector<ProfileViewState> = state =>
  state.profileView;
export const getFullProfileView: Selector<FullProfileViewState> = state =>
  getProfileView(state).full;
export const getActiveTabProfileView: Selector<ActiveTabProfileViewState> = state =>
  getProfileView(state).activeTab;
export const getOriginsProfileView: Selector<OriginsViewState> = state =>
  getProfileView(state).origins;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<
  $PropertyType<ProfileViewState, 'viewOptions'>
> = state => getProfileView(state).viewOptions;
export const getProfileRootRange: Selector<StartEndRange> = state =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus: Selector<SymbolicationStatus> = state =>
  getProfileViewOptions(state).symbolicationStatus;
export const getScrollToSelectionGeneration: Selector<number> = state =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration: Selector<number> = state =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt: Selector<Milliseconds> = state =>
  getProfileRootRange(state).start;

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

export const getMouseTimePosition: Selector<Milliseconds | null> = state =>
  getProfileViewOptions(state).mouseTimePosition;

export const getPreviewSelection: Selector<PreviewSelection> = state =>
  getProfileViewOptions(state).previewSelection;

/**
 * This selector returns the current range, taking into account the current
 * preview selection if any.
 */
export const getPreviewSelectionRange: Selector<StartEndRange> = createSelector(
  getCommittedRange,
  getPreviewSelection,
  (committedRange, previewSelection) => {
    if (previewSelection.hasSelection) {
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
export const getProfileOrNull: Selector<Profile | null> = state =>
  getProfileView(state).profile;
export const getProfile: Selector<Profile> = state =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getProfileInterval: Selector<Milliseconds> = state =>
  getProfile(state).meta.interval;
export const getPageList = (state: State): PageList | null =>
  getProfile(state).pages || null;
export const getCategories: Selector<CategoryList> = state =>
  getProfile(state).meta.categories;
export const getDefaultCategory: Selector<IndexIntoCategoryList> = state =>
  getCategories(state).findIndex(c => c.color === 'grey');
export const getThreads: Selector<Thread[]> = state =>
  getProfile(state).threads;
export const getThreadNames: Selector<string[]> = state =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedTrack: Selector<TrackReference | null> = state =>
  getProfileViewOptions(state).rightClickedTrack;
export const getCounter: Selector<Counter[] | null> = state =>
  getProfile(state).counters || null;
export const getMeta: Selector<ProfileMeta> = state => getProfile(state).meta;
export const getVisualMetricsOrNull: Selector<VisualMetrics | null> = state =>
  getMeta(state).visualMetrics || null;
export const getVisualMetrics: Selector<VisualMetrics> = state =>
  ensureExists(
    getVisualMetricsOrNull(state),
    'Tried to access the visual metrics when it does not exist.'
  );
export const getVisualProgress: Selector<ProgressGraphData[]> = state =>
  getVisualMetrics(state).VisualProgress;
export const getPerceptualSpeedIndexProgress: Selector<
  ProgressGraphData[]
> = state => getVisualMetrics(state).PerceptualSpeedIndexProgress;
export const getContentfulSpeedIndexProgress: Selector<
  ProgressGraphData[]
> = state => getVisualMetrics(state).ContentfulSpeedIndexProgress;
export const getProfilerConfiguration: Selector<?ProfilerConfiguration> = state =>
  getMeta(state).configuration;

// Get the marker schema that comes from the Gecko profile.
const getMarkerSchemaGecko: Selector<MarkerSchema[]> = state =>
  getMeta(state).markerSchema;

// Combine the marker schema from Gecko and the front-end. This allows the front-end
// to generate markers such as the Jank markers, and display them.
export const getMarkerSchema: Selector<MarkerSchema[]> = createSelector(
  getMarkerSchemaGecko,
  geckoSchema => {
    const frontEndSchemaNames = new Set([
      ...markerSchemaFrontEndOnly.map(schema => schema.name),
    ]);
    return [
      // Don't duplicate schema definitions that the front-end already has.
      ...geckoSchema.filter(schema => !frontEndSchemaNames.has(schema.name)),
      ...markerSchemaFrontEndOnly,
    ];
  }
);

export const getMarkerSchemaByName: Selector<MarkerSchemaByName> = createSelector(
  getMarkerSchema,
  schemaList => {
    const result = Object.create(null);
    for (const schema of schemaList) {
      result[schema.name] = schema;
    }
    return result;
  }
);

export const getActiveBrowsingContextID: Selector<BrowsingContextID | null> = state => {
  const configuration = getProfilerConfiguration(state);
  if (
    configuration &&
    configuration.activeBrowsingContextID &&
    configuration.activeBrowsingContextID !== 0
  ) {
    // BrowsingContext ID can be `0` and that means Firefox has failed to get
    // the BrowsingContextID of the active tab. We are converting that `0` to
    // `null` here to explicitly indicate that we don't have that information.
    return configuration.activeBrowsingContextID;
  }
  return null;
};

type CounterSelectors = $ReturnType<typeof _createCounterSelectors>;

const _counterSelectors = {};
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
  const getCounter: Selector<Counter> = state =>
    ensureExists(
      getProfile(state).counters,
      'Attempting to get a counter by index, but no counters exist.'
    )[counterIndex];

  const getDescription: Selector<string> = state =>
    getCounter(state).description;

  const getPid: Selector<Pid> = state => getCounter(state).pid;

  const getCommittedRangeFilteredCounter: Selector<Counter> = createSelector(
    getCounter,
    getCommittedRange,
    (counters, range) => filterCounterToRange(counters, range.start, range.end)
  );

  const getAccumulateCounterSamples: Selector<
    Array<AccumulatedCounterSamples>
  > = createSelector(getCommittedRangeFilteredCounter, counters =>
    accumulateCounterSamples(counters.sampleGroups.map(group => group.samples))
  );

  return {
    getCounter,
    getDescription,
    getPid,
    getCommittedRangeFilteredCounter,
    getAccumulateCounterSamples,
  };
}

export const getIPCMarkerCorrelations: Selector<IPCMarkerCorrelations> = createSelector(
  getThreads,
  correlateIPCMarkers
);

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks: Selector<GlobalTrack[]> = state =>
  getFullProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences: Selector<
  GlobalTrackReference[]
> = createSelector(getGlobalTracks, globalTracks =>
  globalTracks.map((globalTrack, trackIndex) => ({
    type: 'global',
    trackIndex,
  }))
);

export const getHasPreferenceMarkers: Selector<boolean> = createSelector(
  getThreads,
  threads => {
    return threads.some(({ stringTable, markers }) => {
      /*
       * Does this particular thread have a Preference in it?
       */
      const indexForPreferenceString = stringTable.indexForString(
        'PreferenceRead'
      );
      return markers.name.some(name => name === indexForPreferenceString);
    });
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
  {| +globalTrackIndex: TrackIndex, +globalTrack: GlobalTrack |},
  Pid
> = (state, pid) => {
  const globalTracks = getGlobalTracks(state);
  const globalTrackIndex = globalTracks.findIndex(
    track => track.type === 'process' && track.pid === pid
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
export const getLocalTracksByPid: Selector<Map<Pid, LocalTrack[]>> = state =>
  getFullProfileView(state).localTracksByPid;

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
    getFullProfileView(state).localTracksByPid.get(pid),
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
  localTracksByPid => {
    const processesWithMemoryTrack = new Set();
    for (const [pid, localTracks] of localTracksByPid.entries()) {
      if (localTracks.some(track => track.type === 'memory')) {
        processesWithMemoryTrack.add(pid);
      }
    }
    return processesWithMemoryTrack;
  }
);

export const getRightClickedThreadIndex: Selector<null | ThreadIndex> = createSelector(
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

export const getGlobalTrackNames: Selector<
  string[]
> = createSelector(getGlobalTracks, getThreads, (globalTracks, threads) =>
  globalTracks.map(globalTrack =>
    Tracks.getGlobalTrackName(globalTrack, threads)
  )
);

export const getGlobalTrackName: DangerousSelectorWithArguments<
  string,
  TrackIndex
> = (state, trackIndex) => getGlobalTrackNames(state)[trackIndex];

export const getLocalTrackNamesByPid: Selector<
  Map<Pid, string[]>
> = createSelector(
  getLocalTracksByPid,
  getThreads,
  (localTracksByPid, threads) => {
    const localTrackNamesByPid = new Map();
    for (const [pid, localTracks] of localTracksByPid) {
      localTrackNamesByPid.set(
        pid,
        localTracks.map(localTrack =>
          Tracks.getLocalTrackName(localTrack, threads)
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
 * Active tab profile selectors
 */

/**
 * Returns global tracks for the active tab view.
 */
export const getActiveTabTimeline: Selector<ActiveTabTimeline> = state =>
  getActiveTabProfileView(state).activeTabTimeline;

export const getActiveTabMainTrack: Selector<ActiveTabMainTrack> = state =>
  getActiveTabTimeline(state).mainTrack;

export const getActiveTabGlobalTracks: Selector<
  ActiveTabGlobalTrack[]
> = state => [
  ...getActiveTabTimeline(state).screenshots,
  getActiveTabTimeline(state).mainTrack,
];

/**
 * Returns resource tracks for the active tab view.
 */
export const getActiveTabResourceTracks: Selector<
  ActiveTabResourceTrack[]
> = state => getActiveTabTimeline(state).resources;

export const getActiveTabResourcesThreadsKey: Selector<ThreadsKey> = state =>
  getActiveTabTimeline(state).resourcesThreadsKey;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getActiveTabGlobalTrackReferences: Selector<
  GlobalTrackReference[]
> = createSelector(getActiveTabGlobalTracks, globalTracks =>
  globalTracks.map((globalTrack, trackIndex) => ({
    type: 'global',
    trackIndex,
  }))
);

/**
 * This finds an ActiveTabGlobalTrack from its TrackReference. No memoization is needed
 * as this is a simple value look-up.
 */
export const getActiveTabGlobalTrackFromReference: DangerousSelectorWithArguments<
  ActiveTabGlobalTrack,
  ActiveTabGlobalTrackReference
> = (state, trackReference) =>
  getActiveTabGlobalTracks(state)[trackReference.trackIndex];

/**
 * This finds an ActiveTabResourceTrack from its TrackReference. No memoization is needed
 * as this is a simple value look-up.
 */
export const getActiveTabResourceTrackFromReference: DangerousSelectorWithArguments<
  ActiveTabResourceTrack,
  ActiveTabResourceTrackReference
> = (state, trackReference) =>
  getActiveTabResourceTracks(state)[trackReference.trackIndex];

/**
 * Origins profile view selectors.
 */

export const getOriginsTimeline: Selector<OriginsTimeline> = state =>
  getOriginsProfileView(state).originsTimeline;

/**
 * It's a bit hard to deduce the total amount of hidden tracks, as there are both
 * global and local tracks, and they are stored by PID. If a global track is hidden,
 * then all its children are as well. Also we need to take into account the tracks
 * that are hidden by active tab view. We should ignore them because they will not
 * be visible in the track list. This function walks all of the data to determine
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
        track => track.type === 'process' && track.pid === pid
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

/**
 * Get the pages array and construct a Map of pages that we can use to get the
 * relationships of tabs. The constructed map is `Map<BrowsingContextID,Page[]>`.
 * The BrowsingContextID we use in that map is the BrowsingContextID of the
 * topmost frame. That corresponds to a tab(Side note: don't tell any platform
 * developer that this is a tab ID, they will freak out. Because in the platform
 * world this isn't a tab ID, since the iframe has a different BrowsingContext
 * than the parent. But outer most BrowsingContextID _acts_ like a tab ID for our case).
 * So we had to figure out the outer most BrowsingContextID of each element and
 * constructed an intermediate map to quickly find that value.
 */
export const getPagesMap: Selector<Map<
  BrowsingContextID,
  Page[]
> | null> = createSelector(getPageList, pageList => {
  if (pageList === null || pageList.length === 0) {
    // There is no data, return null
    return null;
  }

  // Constructing this map first so we won't have to walk through the page list
  // all the time.
  const innerWindowIDToPageMap: Map<InnerWindowID, Page> = new Map();

  for (const page of pageList) {
    innerWindowIDToPageMap.set(page.innerWindowID, page);
  }

  // Now we have a way to fastly traverse back with the previous Map.
  // We can do construction of BrowsingContextID to Page array map.
  const pageMap: Map<BrowsingContextID, Page[]> = new Map();
  const appendPageMap = (browsingContextID, page) => {
    const tabEntry = pageMap.get(browsingContextID);
    if (tabEntry === undefined) {
      pageMap.set(browsingContextID, [page]);
    } else {
      tabEntry.push(page);
    }
  };

  for (const page of pageList) {
    if (page.embedderInnerWindowID === undefined) {
      // This is the top most page, which means the web page itself.
      appendPageMap(page.browsingContextID, page.innerWindowID);
    } else {
      // This is an iframe, we should find its parent to see find top most
      // BrowsingContextID, which is the tab ID for our case.
      const getTopMostParent = item => {
        // We are using a Map to make this more performant.
        // It should be 1-2 loop iteration in 99% of the cases.
        const parent = innerWindowIDToPageMap.get(item.embedderInnerWindowID);
        if (parent !== undefined) {
          return getTopMostParent(parent);
        }
        return item;
      };

      const parent = getTopMostParent(page);
      // Now we have the top most parent. We can append the pageMap.
      appendPageMap(parent.browsingContextID, page);
    }
  }

  return pageMap;
});

/**
 * Return the relevant page array for active tab.
 * This is useful for operations that require the whole Page object instead of
 * only the InnerWindowIDs. If you only need the InnerWindowID array of the active
 * tab, please use getRelevantInnerWindowIDsForActiveTab selector. Returns
 * _emptyRelevantPagesForActiveTab array as empty array to return the same array
 * every time the selector inputs are invalidated. That eliminates the re-render
 * of the components.
 */
const _emptyRelevantPagesForActiveTab = [];
export const getRelevantPagesForActiveTab: Selector<Page[]> = createSelector(
  getPagesMap,
  getActiveBrowsingContextID,
  (pagesMap, activeBrowsingContextID) => {
    if (
      pagesMap === null ||
      pagesMap.size === 0 ||
      activeBrowsingContextID === null
    ) {
      // Return an empty array if we want to see everything or that data is not there.
      return _emptyRelevantPagesForActiveTab;
    }

    const pages = pagesMap.get(activeBrowsingContextID);
    return pages !== undefined ? pages : _emptyRelevantPagesForActiveTab;
  }
);

/**
 * Get the page map and return the set of InnerWindowIDs by its parent BrowsingContextID.
 * This is a helper selector for other selectors so we can easily get the relevant
 * InnerWindowID set of a parent BrowsingContextID. Set is useful for faster
 * filtering operations.
 */
export const getInnerWindowIDSetByBrowsingContextID: Selector<Map<
  BrowsingContextID,
  Set<InnerWindowID>
> | null> = createSelector(getPagesMap, pagesMap => {
  if (pagesMap === null || pagesMap.size === 0) {
    // There is no data, return null
    return null;
  }

  const innerWindowIDSetByBrowsingContextID = new Map();
  for (const [browsingContextID, pages] of pagesMap) {
    innerWindowIDSetByBrowsingContextID.set(
      browsingContextID,
      new Set(pages.map(page => page.innerWindowID))
    );
  }
  return innerWindowIDSetByBrowsingContextID;
});

/**
 * Get the page map and the active tab ID, then return the InnerWindowIDs that
 * are related to this active tab. This is a fairly simple map element access.
 * The `BrowsingContextID -> Set<InnerWindowID>` construction happens inside
 * the getInnerWindowIDSetByBrowsingContextID selector.
 * This function returns the Set all the time even though we are not in the active
 * tab view at the moment. Ideally you should use the wrapper
 * getRelevantInnerWindowIDsForCurrentTab function if you want to do something
 * inside the active tab view. This is needed for only viewProfile function to
 * calculate the hidden tracks during page load, even though we are not in the
 * active tab view.
 */
export const getRelevantInnerWindowIDsForActiveTab: Selector<
  Set<InnerWindowID>
> = createSelector(
  getInnerWindowIDSetByBrowsingContextID,
  getActiveBrowsingContextID,
  (pagesMap, activeBrowsingContextID) => {
    if (
      pagesMap === null ||
      pagesMap.size === 0 ||
      activeBrowsingContextID === null
    ) {
      // Return an empty set if we want to see everything or that data is not there.
      return new Set();
    }

    const pageSet = pagesMap.get(activeBrowsingContextID);
    return pageSet !== undefined ? pageSet : new Set();
  }
);

/**
 * A simple wrapper for getRelevantInnerWindowIDsForActiveTab.
 * It returns an empty Set if ctxId is null, and returns the real Set if
 * ctxId is assigned already. We should usually use this instead of the
 * wrapped function. But the wrapped function is helpful to calculate the hidden
 * tracks by active tab view during the first page load(inside viewProfile function).
 */
export const getRelevantInnerWindowIDsForCurrentTab: Selector<
  Set<InnerWindowID>
> = createSelector(
  UrlState.getTimelineTrackOrganization,
  getRelevantInnerWindowIDsForActiveTab,
  (timelineTrackOrganization, relevantInnerWindowIDs) => {
    switch (timelineTrackOrganization.type) {
      case 'active-tab':
        return relevantInnerWindowIDs;
      case 'full':
      case 'origins':
        return new Set();
      default:
        throw assertExhaustiveCheck(
          timelineTrackOrganization,
          'Unhandled timelineTrackOrganization case'
        );
    }
  }
);

/**
 * Extracts the data of the first page on the tab filtered profile.
 * Currently we assume that we don't change the origin of webpages while
 * profiling in web developer preset. That's why we are simply getting the
 * first page we find that belongs to the active tab. Returns null if profiler
 * is not in the single tab view at the moment.
 */
export const getProfileFilterPageData: Selector<ProfileFilterPageData | null> = createSelector(
  getPageList,
  getRelevantInnerWindowIDsForCurrentTab,
  extractProfileFilterPageData
);

/**
 * Get the map of Thread ID -> Thread Name for easy access.
 */
export const getThreadIdToNameMap: Selector<
  Map<number, string>
> = createSelector(getThreads, threads => {
  const threadIdToNameMap = new Map();
  for (const thread of threads) {
    if (thread.tid !== undefined) {
      threadIdToNameMap.set(thread.tid, thread.name);
    }
  }
  return threadIdToNameMap;
});
