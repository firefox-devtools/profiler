/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers } from 'redux';
import { oneLine } from 'common-tags';
import { objectEntries } from '../utils/types';
import { tabSlugs, tabsShowingSampleData } from '../app-logic/tabs-handling';

import type {
  ThreadIndex,
  Pid,
  TrackIndex,
  StartEndRange,
  TransformStacksPerThread,
  DataSource,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  TimelineType,
  UrlState,
  Reducer,
  SourceViewState,
  AssemblyViewState,
  IsOpenPerPanelState,
  TabID,
} from 'firefox-profiler/types';

import type { TabSlug } from '../app-logic/tabs-handling';
import { translateThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import { translateTransformStack } from 'firefox-profiler/profile-logic/transforms';

/*
 * This state file governs the state that comes from, and alters, the window
 * location. The location itself is changed in `src/components/app/UrlManager`,
 * and the computations are handled in `src/app-logic/url-handling`.
 *
 * All reducers in this state can be circumvented and the state reset
 * completely using the action `UPDATE_URL_STATE`. This action is dispatched
 * from the URL, either at the first load or when it changes when the user
 * navigates.
 * That's why the individual reducers might look incomplete at times.
 * See below the function `wrapReducerInResetter`.
 */

const dataSource: Reducer<DataSource> = (state = 'none', action) => {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'from-file';
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
      return 'public';
    case 'TRIGGER_LOADING_FROM_URL':
      return 'from-url';
    case 'PROFILE_REMOTELY_DELETED':
      return 'unpublished';
    case 'SET_DATA_SOURCE':
      return action.dataSource;
    default:
      return state;
  }
};

const hash: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
      return action.hash;
    case 'PROFILE_REMOTELY_DELETED':
      return '';
    default:
      return state;
  }
};

const profileUrl: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_URL':
      return action.profileUrl ? action.profileUrl : state;
    case 'TRIGGER_LOADING_FROM_URL':
      return action.profileUrl;
    default:
      return state;
  }
};

const profilesToCompare: Reducer<string[] | null> = (state = null, action) => {
  switch (action.type) {
    case 'CHANGE_PROFILES_TO_COMPARE':
      return action.profiles;
    default:
      return state;
  }
};

const selectedTab: Reducer<TabSlug> = (state = 'calltree', action) => {
  switch (action.type) {
    case 'CHANGE_SELECTED_TAB':
    case 'SELECT_TRACK':
    case 'VIEW_FULL_PROFILE':
    case 'CHANGE_TAB_FILTER':
      return action.selectedTab;
    case 'FOCUS_CALL_TREE':
      if (tabsShowingSampleData.includes(state)) {
        // Don't switch to call tree if the tab is already showing sample data.
        return state;
      }
      return 'calltree';
    default:
      return state;
  }
};

const committedRanges: Reducer<StartEndRange[]> = (state = [], action) => {
  switch (action.type) {
    case 'COMMIT_RANGE': {
      const { start, end } = action;
      return [...state, { start, end }];
    }
    case 'POP_COMMITTED_RANGES':
      return state.slice(0, action.firstPoppedFilterIndex);
    case 'SANITIZED_PROFILE_PUBLISHED':
      // This value may be updated due to profile sanitization.
      return action.committedRanges ? action.committedRanges : state;
    default:
      return state;
  }
};

const selectedThreads: Reducer<Set<ThreadIndex> | null> = (
  state = null,
  action
): Set<ThreadIndex> | null => {
  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
    case 'SELECT_TRACK':
    case 'VIEW_FULL_PROFILE':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'HIDE_GLOBAL_TRACK':
    case 'HIDE_LOCAL_TRACK':
    case 'HIDE_PROVIDED_TRACKS':
    case 'ISOLATE_LOCAL_TRACK':
    case 'TOGGLE_RESOURCES_PANEL':
    case 'CHANGE_TAB_FILTER':
      // Only switch to non-null selected threads.
      return action.selectedThreadIndexes;
    case 'SANITIZED_PROFILE_PUBLISHED': {
      const { translationMaps } = action;
      if (
        state === null ||
        !translationMaps ||
        !translationMaps.oldThreadIndexToNew
      ) {
        // Either there was no selected thread, or the thread indexes were not modified.
        return state;
      }
      const newSelectedThreads = new Set<ThreadIndex>();
      const { oldThreadIndexToNew } = translationMaps;
      for (const oldThreadIndex of state) {
        const newThreadIndex = oldThreadIndexToNew.get(oldThreadIndex);
        if (newThreadIndex === undefined) {
          console.error(oneLine`
            Unable to map an old thread index to a new thread index for the selected
            thread when sanitizing a profile
          `);
          return null;
        }
        newSelectedThreads.add(newThreadIndex);
      }
      return newSelectedThreads;
    }
    default:
      return state;
  }
};

const callTreeSearchString: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
};

const markersSearchString: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'CHANGE_MARKER_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
};

const networkSearchString: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'CHANGE_NETWORK_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
};

const transforms: Reducer<TransformStacksPerThread> = (state = {}, action) => {
  switch (action.type) {
    case 'PROFILE_LOADED':
      return action.transformStacks || state;
    case 'ADD_TRANSFORM_TO_STACK': {
      const { threadsKey, transform } = action;
      const transforms = state[threadsKey] || [];
      return Object.assign({}, state, {
        [threadsKey]: [...transforms, transform],
      });
    }
    case 'POP_TRANSFORMS_FROM_STACK': {
      const { threadsKey, firstPoppedFilterIndex } = action;
      const transforms = state[threadsKey] || [];
      return Object.assign({}, state, {
        [threadsKey]: transforms.slice(0, firstPoppedFilterIndex),
      });
    }
    case 'SANITIZED_PROFILE_PUBLISHED': {
      const { translationMaps } = action;
      if (!translationMaps) {
        return state;
      }

      const newTransforms = {} as TransformStacksPerThread;
      for (const [threadsKey, transformStack] of objectEntries(state)) {
        const newThreadsKey = translationMaps.oldThreadIndexToNew
          ? translateThreadsKey(threadsKey, translationMaps.oldThreadIndexToNew)
          : threadsKey;
        if (newThreadsKey === null) {
          // Discard transforms for threads that were removed.
          continue;
        }

        newTransforms[newThreadsKey] = translateTransformStack(
          transformStack,
          translationMaps
        );
      }
      return newTransforms;
    }
    default:
      return state;
  }
};

const timelineType: Reducer<TimelineType> = (
  state = 'cpu-category',
  action
) => {
  switch (action.type) {
    case 'CHANGE_TIMELINE_TYPE':
      return action.timelineType;
    case 'VIEW_FULL_PROFILE':
      // The timelineType can be set at load time from a URL value.
      // If it's not set from a URL value we provide a default value from this action.
      // When it's null we don't want to override the value that was set already.
      if (action.timelineType !== null) {
        return action.timelineType;
      }
      return state;
    default:
      return state;
  }
};

/**
 * Represents the current filter applied to the stack frames, where it will show
 * frames only by implementation.
 */
const implementation: Reducer<ImplementationFilter> = (
  state = 'combined',
  action
) => {
  switch (action.type) {
    case 'PROFILE_LOADED':
      return action.implementationFilter || state;
    case 'CHANGE_IMPLEMENTATION_FILTER':
      return action.implementation;
    default:
      return state;
  }
};

/**
 * Represents the last selected call tree summary strategy, which will be used to
 * summarize the the call tree. A strategy can be selected that is not supported
 * by the current thread, in this case it will default back to timing.
 */
const lastSelectedCallTreeSummaryStrategy: Reducer<CallTreeSummaryStrategy> = (
  state = 'timing',
  action
) => {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SUMMARY_STRATEGY':
      return action.callTreeSummaryStrategy;
    default:
      return state;
  }
};

const invertCallstack: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
};

/**
 * Signals whether user timing markers will be shown in the stack chart.
 */
const showUserTimings: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'CHANGE_SHOW_USER_TIMINGS':
      return action.showUserTimings;
    default:
      return state;
  }
};

const stackChartSameWidths: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'CHANGE_STACK_CHART_SAME_WIDTHS':
      return action.stackChartSameWidths;
    default:
      return state;
  }
};

/**
 * This state controls whether or not to show a summary view of self time, or the full
 * stack-based view of the JS tracer data.
 */
const showJsTracerSummary: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'CHANGE_SHOW_JS_TRACER_SUMMARY':
      return action.showSummary;
    default:
      return state;
  }
};

const globalTrackOrder: Reducer<TrackIndex[]> = (state = [], action) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'CHANGE_GLOBAL_TRACK_ORDER':
    case 'CHANGE_TAB_FILTER':
      return action.globalTrackOrder;
    case 'SANITIZED_PROFILE_PUBLISHED':
      // If some threads were removed, do not even attempt to figure this out. It's
      // complicated, and not many people use this feature.
      return action.translationMaps?.oldThreadIndexToNew ? [] : state;
    default:
      return state;
  }
};

const hiddenGlobalTracks: Reducer<Set<TrackIndex>> = (
  state = new Set(),
  action
) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'ISOLATE_LOCAL_TRACK':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'ISOLATE_SCREENSHOT_TRACK':
    case 'CHANGE_TAB_FILTER':
      return action.hiddenGlobalTracks;
    case 'HIDE_GLOBAL_TRACK': {
      const hiddenGlobalTracks = new Set(state);
      hiddenGlobalTracks.add(action.trackIndex);
      return hiddenGlobalTracks;
    }
    case 'SHOW_ALL_TRACKS':
      return new Set();
    case 'SHOW_PROVIDED_TRACKS': {
      const hiddenGlobalTracks = new Set(state);
      // Remove all the provided global tracks from the hidden global tracks.
      action.globalTracksToShow.forEach(
        Set.prototype.delete,
        hiddenGlobalTracks
      );
      return hiddenGlobalTracks;
    }
    case 'SHOW_GLOBAL_TRACK':
    case 'SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS': {
      const hiddenGlobalTracks = new Set(state);
      hiddenGlobalTracks.delete(action.trackIndex);
      return hiddenGlobalTracks;
    }
    case 'HIDE_PROVIDED_TRACKS': {
      const hiddenGlobalTracks = new Set(state);
      // Add all the provided global tracks to the hidden global tracks.
      action.globalTracksToHide.forEach(Set.prototype.add, hiddenGlobalTracks);
      return hiddenGlobalTracks;
    }
    case 'SANITIZED_PROFILE_PUBLISHED':
      // If any threads were removed, this was because they were hidden.
      // Reset this state.
      return action.translationMaps?.oldThreadIndexToNew ? new Set() : state;
    default:
      return state;
  }
};

const hiddenLocalTracksByPid: Reducer<Map<Pid, Set<TrackIndex>>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'CHANGE_TAB_FILTER':
      return action.hiddenLocalTracksByPid;
    case 'HIDE_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      const hiddenLocalTracks = new Set(hiddenLocalTracksByPid.get(action.pid));
      hiddenLocalTracks.add(action.trackIndex);
      hiddenLocalTracksByPid.set(action.pid, hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    case 'SHOW_ALL_TRACKS': {
      const hiddenLocalTracksByPid = new Map(state);
      for (const key of hiddenLocalTracksByPid) {
        hiddenLocalTracksByPid.set(key[0], new Set());
      }
      return hiddenLocalTracksByPid;
    }
    case 'SHOW_PROVIDED_TRACKS': {
      const hiddenLocalTracksByPid = new Map(state);
      // Go through the filtered local tracks to make them visible.
      for (const [
        pid,
        localTracksToMakeVisible,
      ] of action.localTracksByPidToShow.entries()) {
        const hiddenLocalTracks = state.get(pid) ?? new Set();
        const newHiddenLocalTracks = new Set(hiddenLocalTracks);
        localTracksToMakeVisible.forEach(
          Set.prototype.delete,
          newHiddenLocalTracks
        );
        hiddenLocalTracksByPid.set(pid, newHiddenLocalTracks);
      }

      return hiddenLocalTracksByPid;
    }
    case 'SHOW_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      const hiddenLocalTracks = new Set(hiddenLocalTracksByPid.get(action.pid));
      hiddenLocalTracks.delete(action.trackIndex);
      hiddenLocalTracksByPid.set(action.pid, hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    case 'SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS': {
      // Show all local tracks for this global track
      const hiddenLocalTracksByPid = new Map(state);
      hiddenLocalTracksByPid.set(action.pid, new Set());
      return hiddenLocalTracksByPid;
    }
    case 'HIDE_PROVIDED_TRACKS': {
      const hiddenLocalTracksByPid = new Map(state);
      // Go through the provided local tracks to make them hidden.
      for (const [
        pid,
        localTracksToMakeHidden,
      ] of action.localTracksByPidToHide.entries()) {
        const hiddenLocalTracks = state.get(pid) ?? new Set();
        const newHiddenLocalTracks = new Set(hiddenLocalTracks);
        localTracksToMakeHidden.forEach(
          Set.prototype.add,
          newHiddenLocalTracks
        );
        hiddenLocalTracksByPid.set(pid, newHiddenLocalTracks);
      }

      return hiddenLocalTracksByPid;
    }
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'ISOLATE_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      hiddenLocalTracksByPid.set(action.pid, action.hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    case 'SANITIZED_PROFILE_PUBLISHED':
      // If any threads were removed then this information is no longer valid.
      return action.translationMaps?.oldThreadIndexToNew ? new Map() : state;
    default:
      return state;
  }
};

const localTrackOrderByPid: Reducer<Map<Pid, TrackIndex[]>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'ENABLE_EVENT_DELAY_TRACKS':
    case 'ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS':
    case 'CHANGE_TAB_FILTER':
      return action.localTrackOrderByPid;
    case 'CHANGE_LOCAL_TRACK_ORDER': {
      const localTrackOrderByPid = new Map(state);
      localTrackOrderByPid.set(action.pid, action.localTrackOrder);
      return localTrackOrderByPid;
    }
    case 'SANITIZED_PROFILE_PUBLISHED':
      // If any threads were removed then remove this information. It's complicated
      // to compute, and not many people use it.
      return action.translationMaps?.oldThreadIndexToNew ? new Map() : state;
    default:
      return state;
  }
};

const localTrackOrderChangedPids: Reducer<Set<Pid>> = (
  state = new Set(),
  action
) => {
  switch (action.type) {
    case 'CHANGE_LOCAL_TRACK_ORDER': {
      const localTrackOrderChangedPids = new Set(state);
      localTrackOrderChangedPids.add(action.pid);
      return localTrackOrderChangedPids;
    }
    case 'SANITIZED_PROFILE_PUBLISHED':
      // In localTrackOrderByPid above the state is reset in this case,
      // let's reset it here as well.
      return action.translationMaps?.oldThreadIndexToNew ? new Set() : state;
    default:
      return state;
  }
};

/**
 * This state controls whether or not we are filtering the full view for a
 * specific Firefox tab.
 */
const tabFilter: Reducer<TabID | null> = (state = null, action) => {
  switch (action.type) {
    case 'CHANGE_TAB_FILTER':
      return action.tabID;
    default:
      return state;
  }
};

// If you update this reducer, please don't forget to update the profileName
// reducer below as well.
const pathInZipFile: Reducer<string | null> = (state = null, action) => {
  switch (action.type) {
    // Update the URL the moment the zip file is starting to be
    // processed, not when it is viewed. The processing is async.
    case 'PROCESS_PROFILE_FROM_ZIP_FILE':
      return action.pathInZipFile ? action.pathInZipFile : null;
    case 'PROFILE_PUBLISHED': // Removes the file information when publishing.
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'RETURN_TO_ZIP_FILE_LIST':
      return null;
    default:
      return state;
  }
};

const profileName: Reducer<string | null> = (state = null, action) => {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'CHANGE_PROFILE_NAME':
      return action.profileName;
    default:
      return state;
  }
};

const sourceView: Reducer<SourceViewState> = (
  state = {
    scrollGeneration: 0,
    libIndex: null,
    sourceIndex: null,
    highlightedLine: null,
  },
  action
) => {
  switch (action.type) {
    case 'UPDATE_BOTTOM_BOX': {
      const shouldScroll = action.scrollToLineNumber !== undefined;
      return {
        scrollGeneration: shouldScroll
          ? state.scrollGeneration + 1
          : state.scrollGeneration,
        libIndex: action.libIndex,
        sourceIndex: action.sourceIndex,
        scrollToLineNumber: action.scrollToLineNumber,
        highlightedLine: action.highlightedLineNumber,
      };
    }
    case 'SANITIZED_PROFILE_PUBLISHED': {
      if (!action.translationMaps || state.sourceIndex === null) {
        return state;
      }
      const newSourceIndexPlusOne =
        action.translationMaps.oldSourceToNewSourcePlusOne[state.sourceIndex];
      return {
        ...state,
        sourceIndex:
          newSourceIndexPlusOne !== 0 ? newSourceIndexPlusOne - 1 : null,
      };
    }

    default:
      return state;
  }
};

const assemblyView: Reducer<AssemblyViewState> = (
  state = {
    isOpen: false,
    scrollGeneration: 0,
    highlightedInstruction: null,
    nativeSymbols: [],
    currentNativeSymbol: null,
  },
  action
) => {
  switch (action.type) {
    case 'UPDATE_BOTTOM_BOX': {
      const { nativeSymbols, currentNativeSymbol, shouldOpenAssemblyView } =
        action;
      const shouldScroll = action.scrollToInstructionAddress !== undefined;
      return {
        scrollGeneration: shouldScroll
          ? state.scrollGeneration + 1
          : state.scrollGeneration,
        nativeSymbols,
        currentNativeSymbol,
        isOpen: state.isOpen || shouldOpenAssemblyView,
        scrollToInstructionAddress: action.scrollToInstructionAddress,
        highlightedInstruction: action.highlightedInstructionAddress,
      };
    }
    case 'OPEN_ASSEMBLY_VIEW': {
      return {
        ...state,
        isOpen: true,
      };
    }
    case 'CHANGE_ASSEMBLY_VIEW_NATIVE_SYMBOL_ENTRY_INDEX': {
      return {
        ...state,
        currentNativeSymbol: action.entryIndex,
      };
    }
    case 'CLOSE_ASSEMBLY_VIEW': {
      return {
        ...state,
        isOpen: false,
      };
    }
    default:
      return state;
  }
};

function _getBottomBoxInitialState(): IsOpenPerPanelState {
  const state = {} as IsOpenPerPanelState;
  tabSlugs.forEach((tabSlug) => (state[tabSlug] = false));
  return state;
}

const isBottomBoxOpenPerPanel: Reducer<IsOpenPerPanelState> = (
  state = _getBottomBoxInitialState(),
  action
) => {
  switch (action.type) {
    case 'UPDATE_BOTTOM_BOX': {
      const { currentTab, shouldOpenBottomBox } = action;
      if (shouldOpenBottomBox && !state[currentTab]) {
        return { ...state, [currentTab]: true };
      }
      return state;
    }
    case 'CLOSE_BOTTOM_BOX_FOR_TAB': {
      const { tab } = action;
      if (state[tab]) {
        return { ...state, [tab]: false };
      }
      return state;
    }
    default:
      return state;
  }
};

/**
 * This value is only set from the URL and never changed.
 */
const symbolServerUrl: Reducer<string | null> = (state = null) => {
  return state;
};

/**
 * These values are specific to an individual profile.
 */
const profileSpecific = combineReducers({
  selectedThreads,
  implementation,
  lastSelectedCallTreeSummaryStrategy,
  invertCallstack,
  showUserTimings,
  stackChartSameWidths,
  committedRanges,
  callTreeSearchString,
  markersSearchString,
  networkSearchString,
  transforms,
  sourceView,
  assemblyView,
  isBottomBoxOpenPerPanel,
  timelineType,
  globalTrackOrder,
  hiddenGlobalTracks,
  hiddenLocalTracksByPid,
  localTrackOrderByPid,
  localTrackOrderChangedPids,
  showJsTracerSummary,
  tabFilter,
  // The timeline tracks used to be hidden and sorted by thread indexes, rather than
  // track indexes. The only way to migrate this information to tracks-based data is to
  // first retrieve the profile, so they can't be upgraded by the normal url upgrading
  // process. These value are only set by the locationToState function.
  legacyThreadOrder: (state: ThreadIndex[] | null = null) => state,
  legacyHiddenThreads: (state: ThreadIndex[] | null = null) => state,
});

/**
 * Provide a mechanism to wrap the UrlState reducer in a special function that can swap
 * out the entire UrlState with a new one coming from the History API. Also provide a
 * way to invalidate sections of the state based off of looking at multiple profiles.
 */
const wrapReducerInResetter = (
  regularUrlStateReducer: Reducer<UrlState>
): Reducer<UrlState> => {
  return (state, action) => {
    switch (action.type) {
      case 'UPDATE_URL_STATE':
        // A new URL came in because of a browser action, discard the current UrlState
        // and use the new one, which was probably serialized from the URL, or stored
        // in the history API.
        return action.newUrlState
          ? action.newUrlState
          : regularUrlStateReducer(undefined, action);
      case 'RETURN_TO_ZIP_FILE_LIST':
      case 'WAITING_FOR_PROFILE_FROM_FILE':
        // Invalidate all information that would be specific to an individual profile.
        return {
          ...regularUrlStateReducer(state, action),
          profileSpecific: profileSpecific(undefined, action),
          selectedTab: selectedTab(undefined, action),
        };
      default:
        return regularUrlStateReducer(state, action);
    }
  };
};

const urlStateReducer: Reducer<UrlState> = wrapReducerInResetter(
  combineReducers({
    dataSource,
    hash,
    profileUrl,
    profilesToCompare,
    selectedTab,
    pathInZipFile,
    profileSpecific,
    profileName,
    symbolServerUrl,
  })
);

export default urlStateReducer;
