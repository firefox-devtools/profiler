/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import escapeStringRegexp from 'escape-string-regexp';
import { createSelector } from 'reselect';
import { ensureExists } from '../utils/flow';
import { urlFromState } from '../app-logic/url-handling';
import * as CommittedRanges from '../profile-logic/committed-ranges';

import type { ThreadIndex, Pid } from '../types/profile';
import type { TrackIndex } from '../types/profile-derived';
import type { StartEndRange } from '../types/units';
import type {
  TransformStacksPerThread,
  TransformStack,
} from '../types/transforms';
import type {
  Action,
  DataSource,
  ImplementationFilter,
  TimelineType,
} from '../types/actions';
import type { State, UrlState, Reducer } from '../types/reducers';
import type { TabSlug } from '../app-logic/tabs-handling';

// Pre-allocate an array to help with strict equality tests in the selectors.
const EMPTY_TRANSFORM_STACK = [];

function dataSource(state: DataSource = 'none', action: Action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'from-file';
    case 'PROFILE_PUBLISHED':
      return 'public';
    default:
      return state;
  }
}

function hash(state: string = '', action: Action) {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
      return action.hash;
    default:
      return state;
  }
}

function profileUrl(state: string = '', action: Action) {
  switch (action.type) {
    default:
      return state;
  }
}

function selectedTab(state: TabSlug = 'calltree', action: Action): TabSlug {
  switch (action.type) {
    case 'CHANGE_SELECTED_TAB':
    case 'SELECT_TRACK':
      return action.selectedTab;
    default:
      return state;
  }
}

function committedRanges(state: StartEndRange[] = [], action: Action) {
  switch (action.type) {
    case 'COMMIT_RANGE': {
      const { start, end } = action;
      return [...state, { start, end }];
    }
    case 'POP_COMMITTED_RANGES':
      return state.slice(0, action.firstPoppedFilterIndex);
    default:
      return state;
  }
}

function selectedThread(
  state: ThreadIndex | null = null,
  action: Action
): ThreadIndex | null {
  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
    case 'SELECT_TRACK':
    case 'VIEW_PROFILE':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'HIDE_GLOBAL_TRACK':
    case 'HIDE_LOCAL_TRACK':
    case 'ISOLATE_LOCAL_TRACK':
      // Only switch to non-null selected threads.
      return (action.selectedThreadIndex: ThreadIndex);
    default:
      return state;
  }
}

function callTreeSearchString(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function markersSearchString(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_MARKER_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function transforms(state: TransformStacksPerThread = {}, action: Action) {
  switch (action.type) {
    case 'ADD_TRANSFORM_TO_STACK': {
      const { threadIndex, transform } = action;
      const transforms = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: [...transforms, transform],
      });
    }
    case 'POP_TRANSFORMS_FROM_STACK': {
      const { threadIndex, firstPoppedFilterIndex } = action;
      const transforms = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: transforms.slice(0, firstPoppedFilterIndex),
      });
    }
    default:
      return state;
  }
}

function timelineType(
  state: TimelineType = 'category',
  action: Action
): TimelineType {
  switch (action.type) {
    case 'CHANGE_TIMELINE_TYPE':
      return action.timelineType;
    default:
      return state;
  }
}

/**
 * Represents the current filter applied to the stack frames, where it will show
 * frames only by implementation.
 */
function implementation(
  state: ImplementationFilter = 'combined',
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_IMPLEMENTATION_FILTER':
      return action.implementation;
    default:
      return state;
  }
}

function invertCallstack(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
}

function globalTrackOrder(state: TrackIndex[] = [], action: Action) {
  switch (action.type) {
    case 'VIEW_PROFILE':
    case 'CHANGE_GLOBAL_TRACK_ORDER':
      return action.globalTrackOrder;
    default:
      return state;
  }
}

function hiddenGlobalTracks(
  state: Set<TrackIndex> = new Set(),
  action: Action
) {
  switch (action.type) {
    case 'VIEW_PROFILE':
    case 'ISOLATE_LOCAL_TRACK':
    case 'ISOLATE_PROCESS':
    case 'ISOLATE_PROCESS_MAIN_THREAD':
      return action.hiddenGlobalTracks;
    case 'HIDE_GLOBAL_TRACK': {
      const hiddenGlobalTracks = new Set(state);
      hiddenGlobalTracks.add(action.trackIndex);
      return hiddenGlobalTracks;
    }
    case 'SHOW_GLOBAL_TRACK': {
      const hiddenGlobalTracks = new Set(state);
      hiddenGlobalTracks.delete(action.trackIndex);
      return hiddenGlobalTracks;
    }
    default:
      return state;
  }
}

function hiddenLocalTracksByPid(
  state: Map<Pid, Set<TrackIndex>> = new Map(),
  action: Action
) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.hiddenLocalTracksByPid;
    case 'HIDE_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      const hiddenLocalTracks = new Set(hiddenLocalTracksByPid.get(action.pid));
      hiddenLocalTracks.add(action.trackIndex);
      hiddenLocalTracksByPid.set(action.pid, hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    case 'SHOW_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      const hiddenLocalTracks = new Set(hiddenLocalTracksByPid.get(action.pid));
      hiddenLocalTracks.delete(action.trackIndex);
      hiddenLocalTracksByPid.set(action.pid, hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    case 'ISOLATE_PROCESS_MAIN_THREAD':
    case 'ISOLATE_LOCAL_TRACK': {
      const hiddenLocalTracksByPid = new Map(state);
      hiddenLocalTracksByPid.set(action.pid, action.hiddenLocalTracks);
      return hiddenLocalTracksByPid;
    }
    default:
      return state;
  }
}

function localTrackOrderByPid(
  state: Map<Pid, TrackIndex[]> = new Map(),
  action: Action
) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.localTrackOrderByPid;
    case 'CHANGE_LOCAL_TRACK_ORDER': {
      const localTrackOrderByPid = new Map(state);
      localTrackOrderByPid.set(action.pid, action.localTrackOrder);
      return localTrackOrderByPid;
    }
    default:
      return state;
  }
}

function pathInZipFile(
  state: string | null = null,
  action: Action
): string | null {
  switch (action.type) {
    // Update the URL the moment the zip file is starting to be
    // processed, not when it is viewed. The processing is async.
    case 'PROCESS_PROFILE_FROM_ZIP_FILE':
      return action.pathInZipFile ? action.pathInZipFile : null;
    case 'RETURN_TO_ZIP_FILE_LIST':
      return null;
    default:
      return state;
  }
}

/**
 * These values are specific to an individual profile.
 */
const profileSpecific = combineReducers({
  selectedThread,
  globalTrackOrder,
  hiddenGlobalTracks,
  hiddenLocalTracksByPid,
  localTrackOrderByPid,
  implementation,
  invertCallstack,
  committedRanges,
  callTreeSearchString,
  markersSearchString,
  transforms,
  timelineType,
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
        // Invalidate all information that would be specific to an individual profile.
        return {
          ...regularUrlStateReducer(state, action),
          profileSpecific: profileSpecific(undefined, state),
        };
      default:
        return regularUrlStateReducer(state, action);
    }
  };
};

const urlStateReducer = wrapReducerInResetter(
  combineReducers({
    dataSource,
    hash,
    profileUrl,
    selectedTab,
    pathInZipFile,
    profileSpecific,
  })
);

export default urlStateReducer;

export const getUrlState = (state: State): UrlState => state.urlState;
export const getProfileSpecificState = (state: State) =>
  getUrlState(state).profileSpecific;

export const getDataSource = (state: State) => getUrlState(state).dataSource;
export const getHash = (state: State) => getUrlState(state).hash;
export const getProfileUrl = (state: State) => getUrlState(state).profileUrl;
export const getAllCommittedRanges = (state: State) =>
  getProfileSpecificState(state).committedRanges;
export const getImplementationFilter = (state: State) =>
  getProfileSpecificState(state).implementation;
export const getInvertCallstack = (state: State) =>
  getProfileSpecificState(state).invertCallstack;
export const getCurrentSearchString = (state: State) =>
  getProfileSpecificState(state).callTreeSearchString;
export const getSearchStrings = createSelector(
  getCurrentSearchString,
  searchString => {
    if (!searchString) {
      return null;
    }
    const result = searchString
      .split(',')
      .map(part => part.trim())
      .filter(part => part);

    if (result.length) {
      return result;
    }

    return null;
  }
);
export const getSearchStringsAsRegExp = createSelector(
  getSearchStrings,
  strings => {
    if (!strings || !strings.length) {
      return null;
    }
    const regexpStr = strings.map(escapeStringRegexp).join('|');
    return new RegExp(regexpStr, 'gi');
  }
);
export const getMarkersSearchString = (state: State) =>
  getProfileSpecificState(state).markersSearchString;
export const getSelectedTab = (state: State) => getUrlState(state).selectedTab;
export const getSelectedThreadIndexOrNull = (state: State) =>
  getProfileSpecificState(state).selectedThread;
export const getSelectedThreadIndex = (state: State) => {
  const threadIndex = getSelectedThreadIndexOrNull(state);
  if (threadIndex === null) {
    throw new Error(
      'Attempted to get a thread index before a profile was loaded.'
    );
  }
  return threadIndex;
};
export const getTransformStack = (
  state: State,
  threadIndex: ThreadIndex
): TransformStack => {
  return (
    getProfileSpecificState(state).transforms[threadIndex] ||
    EMPTY_TRANSFORM_STACK
  );
};

export const getTimelineType = (state: State): TimelineType =>
  getProfileSpecificState(state).timelineType;

export const getLegacyThreadOrder = (state: State) =>
  getProfileSpecificState(state).legacyThreadOrder;
export const getLegacyHiddenThreads = (state: State) =>
  getProfileSpecificState(state).legacyHiddenThreads;
export const getGlobalTrackOrder = (state: State) =>
  getProfileSpecificState(state).globalTrackOrder;
export const getHiddenGlobalTracks = (state: State) =>
  getProfileSpecificState(state).hiddenGlobalTracks;
export const getHiddenLocalTracksByPid = (state: State) =>
  getProfileSpecificState(state).hiddenLocalTracksByPid;
export const getHiddenLocalTracks = (state: State, pid: Pid) =>
  ensureExists(
    getHiddenLocalTracksByPid(state).get(pid),
    'Unable to get the hidden tracks from the given pid'
  );
export const getLocalTrackOrderByPid = (state: State) =>
  getProfileSpecificState(state).localTrackOrderByPid;
export const getLocalTrackOrder = (state: State, pid: Pid) =>
  ensureExists(
    getLocalTrackOrderByPid(state).get(pid),
    'Unable to get the track order from the given pid'
  );

export const getUrlPredictor = createSelector(
  getUrlState,
  (oldUrlState: UrlState) => (actionOrActionList: Action | Action[]) => {
    const actionList: Action[] = Array.isArray(actionOrActionList)
      ? actionOrActionList
      : [actionOrActionList];
    const newUrlState = actionList.reduce(urlStateReducer, oldUrlState);
    return urlFromState(newUrlState);
  }
);

export const getPathInZipFileFromUrl = (state: State) =>
  getUrlState(state).pathInZipFile;

/**
 * For now only provide a name for a profile if it came from a zip file.
 */
export const getProfileName: State => null | string = createSelector(
  getPathInZipFileFromUrl,
  pathInZipFile => {
    if (!pathInZipFile) {
      return null;
    }
    const pathParts = pathInZipFile.split('/');
    return pathParts[pathParts.length - 1];
  }
);

export const getCommittedRangeLabels = createSelector(
  getAllCommittedRanges,
  CommittedRanges.getCommittedRangeLabels
);
