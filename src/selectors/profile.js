/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as Tracks from '../profile-logic/tracks';
import * as UrlState from './url-state';
import { ensureExists } from '../utils/flow';
import {
  filterCounterToRange,
  accumulateCounterSamples,
} from '../profile-logic/profile-data';
import {
  IPCMarkerCorrelations,
  correlateIPCMarkers,
} from '../profile-logic/marker-data';

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
} from '../types/profile';
import type {
  LocalTrack,
  TrackIndex,
  GlobalTrack,
  AccumulatedCounterSamples,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type {
  GlobalTrackReference,
  LocalTrackReference,
  TrackReference,
  PreviewSelection,
  HiddenTrackCount,
} from '../types/actions';
import type { Selector, DangerousSelectorWithArguments } from '../types/store';
import type {
  State,
  ProfileViewState,
  SymbolicationStatus,
} from '../types/state';
import type { $ReturnType } from '../types/utils';

export const getProfileView: Selector<ProfileViewState> = state =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<*> = state =>
  getProfileView(state).viewOptions;
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
function _createCounterSelectors(counterIndex: CounterIndex): * {
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
  > = createSelector(
    getCommittedRangeFilteredCounter,
    counters =>
      accumulateCounterSamples(
        counters.sampleGroups.map(group => group.samples)
      )
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
  getProfileView(state).globalTracks;
export const getActiveTabHiddenGlobalTracks: Selector<
  Set<TrackIndex>
> = state => getProfileView(state).activeTabHiddenGlobalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences: Selector<
  GlobalTrackReference[]
> = createSelector(
  getGlobalTracks,
  globalTracks =>
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
  getProfileView(state).localTracksByPid;
export const getActiveTabHiddenLocalTracksByPid: Selector<
  Map<Pid, Set<TrackIndex>>
> = state => getProfileView(state).activeTabHiddenLocalTracksByPid;

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

export const getGlobalTrackNames: Selector<string[]> = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads) =>
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
  getActiveTabHiddenLocalTracksByPid,
  UrlState.getHiddenGlobalTracks,
  getActiveTabHiddenGlobalTracks,
  UrlState.getShowTabOnly,
  (
    globalTracks,
    localTracksByPid,
    hiddenLocalTracksByPid,
    activeTabHiddenLocalTracksByPid,
    hiddenGlobalTracks,
    activeTabHiddenGlobalTracks,
    showTabOnly
  ) => {
    let hidden = 0;
    let total = 0;

    // Count up the local tracks
    for (const [pid, localTracks] of localTracksByPid) {
      // Look up some of the information.
      const hiddenLocalTracks = hiddenLocalTracksByPid.get(pid) || new Set();
      const activeTabHiddenLocalTracks =
        activeTabHiddenLocalTracksByPid.get(pid) || new Set();
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
        if (showTabOnly !== null) {
          if (!activeTabHiddenGlobalTracks.has(globalTrackIndex)) {
            // If we are in active tab view and the current hidden track is not
            // hidden by that, count its local tracks but also make sure that we
            // don't count its hidden local tracks that if they are hidden by active tab view.
            hidden += localTracks.length - activeTabHiddenLocalTracks.size;
          }
        } else {
          hidden += localTracks.length;
        }
      } else {
        // Only count the hidden local tracks.
        hidden += hiddenLocalTracks.size;
        if (showTabOnly !== null) {
          // If we are in active tab view, we should remove the count of active
          // tab hidden tracks since they won't be visible at all.
          hidden -= [...activeTabHiddenLocalTracks].filter(t =>
            hiddenLocalTracks.has(t)
          ).length;
        }
      }
      total += localTracks.length;
      if (showTabOnly !== null) {
        // Again, if we are in active tab view, do not count the tracks that are hidden by active tab view.
        total -= activeTabHiddenLocalTracks.size;
      }
    }

    // Count up the global tracks
    if (showTabOnly) {
      total += globalTracks.length - activeTabHiddenGlobalTracks.size;
      hidden += [...hiddenGlobalTracks].filter(
        t => !activeTabHiddenGlobalTracks.has(t)
      ).length;
    } else {
      total += globalTracks.length;
      hidden += hiddenGlobalTracks.size;
    }

    return { hidden, total };
  }
);

/**
 * Get the pages array and construct a Map that we can use to easily get the
 * InnerWindowIDs that are under one tab. The constructed map is
 * `Map<BrowsingContextID,Set<InnerWindowID>>`. The BrowsingContextID we use in
 * that map is the BrowsingContextID of the top most frame. That corresponds to
 * a tab(Side note: don't tell any platform developer that this is a tab ID,
 * they will freak out. Because in the platform world this isn't a tab ID, since
 * the iframe has a different BrowsingContext than the parent. But outer most
 * BrowsingContextID _acts_ like a tab ID).
 * So we had to figure out the outer most BrowsingContextID of each element. And
 * we constructed an intermediate map to quickly find that value.
 */
export const getPagesMap: Selector<Map<
  BrowsingContextID,
  Set<InnerWindowID>
> | null> = createSelector(
  getPageList,
  pageList => {
    if (pageList === null || pageList.length === 0) {
      // There is no data, return null
      return null;
    }

    // Constructing this map first so we won't have to walk through the page list
    // all the time.
    const innerWindowIDToPageMap: Map<
      InnerWindowID,
      {
        browsingContextID: BrowsingContextID,
        embedderInnerWindowID: InnerWindowID,
      }
    > = new Map();

    for (const page of pageList) {
      innerWindowIDToPageMap.set(page.innerWindowID, {
        browsingContextID: page.browsingContextID,
        embedderInnerWindowID: page.embedderInnerWindowID,
      });
    }

    // Now we have a way to fastly traverse back with the previous Map.
    // We can do construction of BrowsingContextID to set of InnerWindowID map.
    const pageMap: Map<BrowsingContextID, Set<InnerWindowID>> = new Map();
    const appendPageMap = (browsingContextID, innerWindowID) => {
      const tabEntry = pageMap.get(browsingContextID);
      if (tabEntry === undefined) {
        const newTabEntry = new Set([innerWindowID]);
        pageMap.set(browsingContextID, newTabEntry);
      } else {
        tabEntry.add(innerWindowID);
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
        appendPageMap(parent.browsingContextID, page.innerWindowID);
      }
    }

    return pageMap;
  }
);

/**
 * Get the page map and the active tab ID, then return the InnerWindowIDs that
 * are related to this active tab. This is a fairly simple map element access.
 * The `BrowsingContextID -> Set<InnerWindowID>` construction happens inside
 * the getPageMap selector.
 * This function returns the Set all the time even though we are not in the active
 * tab view at the moment. Idaelly you should use the wrapper getRelevantPagesForCurrentTab
 * function if you want to do something inside the active tab view. This is needed
 * for only viewProfile function to calculate the hidden tracks during page load,
 * even though we are not in the active tab view.
 */
export const getRelevantPagesForActiveTab: Selector<
  Set<InnerWindowID>
> = createSelector(
  getPagesMap,
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
 * A simple wrapper for getRelevantPagesForActiveTab.
 * It returns an empty Set if showTabOnly is null, and returns the real Set if
 * showTabOnly is assigned already. We should usually use this instead of the
 * wrapped function. But the wrapped function is helpful to calculate the hidden
 * tracks by active tab view during the first page load(inside viewProfile function).
 */
export const getRelevantPagesForCurrentTab: Selector<
  Set<InnerWindowID>
> = createSelector(
  UrlState.getShowTabOnly,
  getRelevantPagesForActiveTab,
  (showTabOnly, relevantPages) => {
    if (showTabOnly === null) {
      // Return an empty set if we want to see everything or that data is not there.
      return new Set();
    }

    return relevantPages;
  }
);

/**
 * Gets the hidden global tracks from the url and from the active tab view,
 * then merges those Sets depending on the active tab view status.
 */
export const getComputedHiddenGlobalTracks: Selector<
  Set<TrackIndex>
> = createSelector(
  UrlState.getProfileSpecificState,
  UrlState.getShowTabOnly,
  getActiveTabHiddenGlobalTracks,
  (profileSpecific, showTabOnly, activeTabHiddenGlobalTracks) => {
    const hiddenGlobalTracks = profileSpecific.hiddenGlobalTracks;
    if (showTabOnly === null) {
      return hiddenGlobalTracks;
    }

    // We are in the showTabOnly mode and we need to hide the tracks that don't
    // belong to the active tab as well.
    return new Set([...hiddenGlobalTracks, ...activeTabHiddenGlobalTracks]);
  }
);

/**
 * Gets the hidden local tracks from the url and from the active tab view,
 * then merges those Sets depending on the active tab view status.
 */
export const getComputedHiddenLocalTracksByPid: Selector<
  Map<Pid, Set<TrackIndex>>
> = createSelector(
  UrlState.getProfileSpecificState,
  UrlState.getShowTabOnly,
  getActiveTabHiddenLocalTracksByPid,
  (profileSpecific, showTabOnly, activeTabHiddenLocalTracksByPid) => {
    const hiddenLocalTracksByPid = profileSpecific.hiddenLocalTracksByPid;
    if (showTabOnly === null) {
      return hiddenLocalTracksByPid;
    }

    // We are in the showTabOnly mode and we need to hide the tracks that don't
    // belong to the active tab as well.

    // We need to deep copy those Maps and Sets here, just in case.
    const mergedHiddenLocalTracksByPid = new Map();
    for (const [pid, localTracks] of hiddenLocalTracksByPid) {
      mergedHiddenLocalTracksByPid.set(pid, new Set([...localTracks]));
    }

    for (const [pid, localTracks] of activeTabHiddenLocalTracksByPid) {
      const entry = mergedHiddenLocalTracksByPid.get(pid);
      if (entry) {
        mergedHiddenLocalTracksByPid.set(
          pid,
          new Set([...entry, ...localTracks])
        );
      } else {
        mergedHiddenLocalTracksByPid.set(pid, new Set([...localTracks]));
      }
    }

    return mergedHiddenLocalTracksByPid;
  }
);

/**
 * This selector does a simple lookup in the set of computed hidden tracks for a
 * PID, and ensures that a TrackIndex is selected correctly. This makes it easier
 * to avoid doing null checks everywhere.
 */
export const getComputedHiddenLocalTracks: DangerousSelectorWithArguments<
  Set<TrackIndex>,
  Pid
> = (state, pid) =>
  ensureExists(
    getComputedHiddenLocalTracksByPid(state).get(pid),
    'Unable to get the tracks for the given pid.'
  );
