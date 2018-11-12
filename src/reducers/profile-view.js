/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  applyFunctionMerging,
  setFuncNames,
} from '../profile-logic/symbolication';
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';
import * as Tracks from '../profile-logic/tracks';
import * as Transforms from '../profile-logic/transforms';
import * as UrlState from './url-state';
import * as ProfileData from '../profile-logic/profile-data';
import * as MarkerData from '../profile-logic/marker-data';
import * as StackTiming from '../profile-logic/stack-timing';
import * as FlameGraph from '../profile-logic/flame-graph';
import * as MarkerTiming from '../profile-logic/marker-timing';
import * as CallTree from '../profile-logic/call-tree';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import { arePathsEqual, PathSet } from '../utils/path';

import type {
  Profile,
  CategoryList,
  IndexIntoCategoryList,
  Thread,
  ThreadIndex,
  SamplesTable,
  Pid,
  MarkersTable,
  IndexIntoSamplesTable,
} from '../types/profile';
import type {
  TracingMarker,
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
  MarkerTimingRows,
  LocalTrack,
  GlobalTrack,
  TrackIndex,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type {
  Action,
  PreviewSelection,
  RequestedLib,
  TrackReference,
} from '../types/actions';
import type {
  State,
  Reducer,
  ProfileViewState,
  ProfileSharingStatus,
  SymbolicationStatus,
  ThreadViewOptions,
} from '../types/reducers';
import type { Transform, TransformStack } from '../types/transforms';
import type {
  TimingsForPath,
  SelectedState,
} from '../profile-logic/profile-data';

function profile(state: Profile | null = null, action: Action): Profile | null {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.profile;
    case 'COALESCED_FUNCTIONS_UPDATE': {
      if (state === null) {
        throw new Error(
          'Assumed that a profile would be loaded in time for a coalesced functions update.'
        );
      }
      if (!state.threads.length) {
        return state;
      }
      const { functionsUpdatePerThread } = action;
      const threads = state.threads.map((thread, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return thread;
        }
        const {
          oldFuncToNewFuncMap,
          funcIndices,
          funcNames,
        } = functionsUpdatePerThread[threadIndex];
        return setFuncNames(
          applyFunctionMerging(thread, oldFuncToNewFuncMap),
          funcIndices,
          funcNames
        );
      });
      return Object.assign({}, state, { threads });
    }
    default:
      return state;
  }
}

/**
 * This information is stored, rather than derived via selectors, since the coalesced
 * function update would force it to be recomputed on every symbolication update
 * pass. It is valid for the lifetime of the profile.
 */
function globalTracks(state: GlobalTrack[] = [], action: Action) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.globalTracks;
    default:
      return state;
  }
}

/**
 * This can be derived like the globalTracks information, but is stored in the state
 * for the same reason.
 */
function localTracksByPid(
  state: Map<Pid, LocalTrack[]> = new Map(),
  action: Action
) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.localTracksByPid;
    default:
      return state;
  }
}

function symbolicationStatus(
  state: SymbolicationStatus = 'DONE',
  action: Action
) {
  switch (action.type) {
    case 'START_SYMBOLICATING':
      return 'SYMBOLICATING';
    case 'DONE_SYMBOLICATING':
      return 'DONE';
    default:
      return state;
  }
}

function viewOptionsPerThread(
  state: ThreadViewOptions[] = [],
  action: Action
): ThreadViewOptions[] {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return action.profile.threads.map(() => ({
        selectedCallNodePath: [],
        expandedCallNodePaths: new PathSet(),
        selectedMarker: -1,
      }));
    case 'COALESCED_FUNCTIONS_UPDATE': {
      const { functionsUpdatePerThread } = action;
      // For each thread, apply oldFuncToNewFuncMap to that thread's
      // selectedCallNodePath and expandedCallNodePaths.
      return state.map((threadViewOptions, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return threadViewOptions;
        }
        const { oldFuncToNewFuncMap } = functionsUpdatePerThread[threadIndex];
        const mapOldFuncToNewFunc = oldFunc => {
          const newFunc = oldFuncToNewFuncMap.get(oldFunc);
          return newFunc === undefined ? oldFunc : newFunc;
        };
        return {
          ...threadViewOptions,
          selectedCallNodePath: threadViewOptions.selectedCallNodePath.map(
            mapOldFuncToNewFunc
          ),
          expandedCallNodePaths: new PathSet(
            Array.from(threadViewOptions.expandedCallNodePaths).map(oldPath =>
              oldPath.map(mapOldFuncToNewFunc)
            )
          ),
        };
      });
    }
    case 'CHANGE_SELECTED_CALL_NODE': {
      const {
        selectedCallNodePath,
        threadIndex,
        optionalExpandedToCallNodePath,
      } = action;

      const threadState = state[threadIndex];
      const previousSelectedCallNodePath = threadState.selectedCallNodePath;

      // If the selected node doesn't actually change, let's return the previous
      // state to avoid rerenders.
      if (
        arePathsEqual(selectedCallNodePath, previousSelectedCallNodePath) &&
        !optionalExpandedToCallNodePath
      ) {
        return state;
      }

      let { expandedCallNodePaths } = threadState;
      const expandToNode = optionalExpandedToCallNodePath
        ? optionalExpandedToCallNodePath
        : selectedCallNodePath;

      /* Looking into the current state to know whether we want to generate a
       * new one. It can be expensive to clone when we have a lot of expanded
       * lines, but it's very infrequent that we actually want to expand new
       * lines as a result of a selection. */
      const expandToNodeParentPaths = [];
      for (let i = 1; i < expandToNode.length; i++) {
        expandToNodeParentPaths.push(expandToNode.slice(0, i));
      }
      const hasNewExpandedPaths = expandToNodeParentPaths.some(
        path => !expandedCallNodePaths.has(path)
      );

      if (hasNewExpandedPaths) {
        expandedCallNodePaths = new PathSet(expandedCallNodePaths);
        expandToNodeParentPaths.forEach(path =>
          expandedCallNodePaths.add(path)
        );
      }

      return [
        ...state.slice(0, threadIndex),
        {
          ...state[threadIndex],
          selectedCallNodePath,
          expandedCallNodePaths,
        },
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'CHANGE_INVERT_CALLSTACK': {
      const { callTree, callNodeTable, selectedThreadIndex } = action;
      return state.map((viewOptions, threadIndex) => {
        if (selectedThreadIndex === threadIndex) {
          // Only attempt this on the current thread, as we need the transformed thread
          // There is no guarantee that this has been calculated on all the other threads,
          // and we shouldn't attempt to expect it, as that could be quite a perf cost.
          const selectedCallNodePath = Transforms.invertCallNodePath(
            viewOptions.selectedCallNodePath,
            callTree,
            callNodeTable
          );

          const expandedCallNodePaths = new PathSet();
          for (let i = 1; i < selectedCallNodePath.length; i++) {
            expandedCallNodePaths.add(selectedCallNodePath.slice(0, i));
          }
          return {
            ...viewOptions,
            selectedCallNodePath,
            expandedCallNodePaths,
          };
        }
        return viewOptions;
      });
    }
    case 'CHANGE_EXPANDED_CALL_NODES': {
      const { threadIndex, expandedCallNodePaths } = action;
      return [
        ...state.slice(0, threadIndex),
        {
          ...state[threadIndex],
          expandedCallNodePaths: new PathSet(expandedCallNodePaths),
        },
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'CHANGE_SELECTED_MARKER': {
      const { threadIndex, selectedMarker } = action;
      return [
        ...state.slice(0, threadIndex),
        { ...state[threadIndex], selectedMarker },
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'ADD_TRANSFORM_TO_STACK': {
      const { threadIndex, transform, transformedThread } = action;
      const expandedCallNodePaths = new PathSet(
        Array.from(state[threadIndex].expandedCallNodePaths)
          .map(path =>
            Transforms.applyTransformToCallNodePath(
              path,
              transform,
              transformedThread
            )
          )
          .filter(path => path.length > 0)
      );

      const selectedCallNodePath = Transforms.applyTransformToCallNodePath(
        state[threadIndex].selectedCallNodePath,
        transform,
        transformedThread
      );

      return [
        ...state.slice(0, threadIndex),
        {
          ...state[threadIndex],
          selectedCallNodePath,
          expandedCallNodePaths,
        },
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'POP_TRANSFORMS_FROM_STACK': {
      // Simply reset the selected and expanded paths until this bug is fixed:
      // https://github.com/devtools-html/perf.html/issues/882
      const { threadIndex } = action;
      return [
        ...state.slice(0, threadIndex),
        {
          ...state[threadIndex],
          selectedCallNodePath: [],
          expandedCallNodePaths: new PathSet(),
        },
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'CHANGE_IMPLEMENTATION_FILTER': {
      const {
        transformedThread,
        threadIndex,
        previousImplementation,
        implementation,
      } = action;

      if (previousImplementation === implementation) {
        return state;
      }

      // This CallNodePath may need to be updated twice.
      let selectedCallNodePath = state[threadIndex].selectedCallNodePath;

      if (implementation === 'combined') {
        // Restore the full CallNodePaths
        selectedCallNodePath = Transforms.restoreAllFunctionsInCallNodePath(
          transformedThread,
          previousImplementation,
          selectedCallNodePath
        );
      } else {
        if (previousImplementation !== 'combined') {
          // Restore the CallNodePath back to an unfiltered state before re-filtering
          // it on the next implementation.
          selectedCallNodePath = Transforms.restoreAllFunctionsInCallNodePath(
            transformedThread,
            previousImplementation,
            selectedCallNodePath
          );
        }
        // Take the full CallNodePath, and strip out anything not in this implementation.
        selectedCallNodePath = Transforms.filterCallNodePathByImplementation(
          transformedThread,
          implementation,
          selectedCallNodePath
        );
      }

      const expandedCallNodePaths = new PathSet();
      for (let i = 1; i < selectedCallNodePath.length; i++) {
        expandedCallNodePaths.add(selectedCallNodePath.slice(0, i));
      }

      return [
        ...state.slice(0, threadIndex),
        {
          ...state[threadIndex],
          selectedCallNodePath,
          expandedCallNodePaths,
        },
        ...state.slice(threadIndex + 1),
      ];
    }
    default:
      return state;
  }
}

function waitingForLibs(state: Set<RequestedLib> = new Set(), action: Action) {
  switch (action.type) {
    case 'REQUESTING_SYMBOL_TABLE': {
      const newState = new Set(state);
      newState.add(action.requestedLib);
      return newState;
    }
    case 'RECEIVED_SYMBOL_TABLE_REPLY': {
      const newState = new Set(state);
      newState.delete(action.requestedLib);
      return newState;
    }
    default:
      return state;
  }
}

function previewSelection(
  state: PreviewSelection = { hasSelection: false, isModifying: false },
  action: Action
): PreviewSelection {
  // TODO: Rename to timeRangeSelection
  switch (action.type) {
    case 'UPDATE_PREVIEW_SELECTION':
      return action.previewSelection;
    case 'COMMIT_RANGE':
    case 'POP_COMMITTED_RANGES':
      return { hasSelection: false, isModifying: false };
    default:
      return state;
  }
}

function scrollToSelectionGeneration(state: number = 0, action: Action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
    case 'CHANGE_SELECTED_CALL_NODE':
    case 'CHANGE_SELECTED_THREAD':
    case 'SELECT_TRACK':
    case 'HIDE_GLOBAL_TRACK':
    case 'HIDE_LOCAL_TRACK':
    case 'CHANGE_SELECTED_MARKER':
      return state + 1;
    default:
      return state;
  }
}

function focusCallTreeGeneration(state: number = 0, action: Action) {
  switch (action.type) {
    case 'FOCUS_CALL_TREE':
      return state + 1;
    default:
      return state;
  }
}

function rootRange(
  state: StartEndRange = { start: 0, end: 1 },
  action: Action
) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
}

function zeroAt(state: Milliseconds = 0, action: Action) {
  switch (action.type) {
    case 'VIEW_PROFILE':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile).start;
    default:
      return state;
  }
}

function rightClickedTrack(
  // Make the initial value the first global track, which is assumed to exists.
  // This makes the track reference always exist, which in turn makes it so that
  // we do not have to check for a null TrackReference.
  state: TrackReference = { type: 'global', trackIndex: 0 },
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_RIGHT_CLICKED_TRACK':
      return action.trackReference;
    default:
      return state;
  }
}

function isCallNodeContextMenuVisible(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'SET_CALL_NODE_CONTEXT_MENU_VISIBILITY':
      return action.isVisible;
    default:
      return state;
  }
}

function profileSharingStatus(
  state: ProfileSharingStatus = {
    sharedWithUrls: false,
    sharedWithoutUrls: false,
  },
  action: Action
): ProfileSharingStatus {
  switch (action.type) {
    case 'SET_PROFILE_SHARING_STATUS':
      return action.profileSharingStatus;
    case 'VIEW_PROFILE':
      // Here are the possible cases:
      // - older shared profiles, newly captured profiles, and profiles from a file don't
      //   have the property `networkURLsRemoved`. We use the `dataSource` value
      //   to distinguish between these cases.
      // - newer profiles that have been shared do have this property.
      return {
        sharedWithUrls:
          !action.profile.meta.networkURLsRemoved &&
          action.dataSource === 'public',
        sharedWithoutUrls: action.profile.meta.networkURLsRemoved === true,
      };
    default:
      return state;
  }
}

/**
 * Provide a mechanism to wrap the reducer in a special function that can reset
 * the state to the default values. This is useful when viewing multiple profiles
 * (e.g. in zip files).
 */
const wrapReducerInResetter = (
  regularReducer: Reducer<ProfileViewState>
): Reducer<ProfileViewState> => {
  return (state, action) => {
    switch (action.type) {
      case 'RETURN_TO_ZIP_FILE_LIST':
        // Provide a mechanism to wipe this state clean when returning to the zip file
        // list, as it invalidates all of the profile view state.
        return regularReducer(undefined, action);
      default:
        // Run the normal reducer.
        return regularReducer(state, action);
    }
  };
};

export default wrapReducerInResetter(
  combineReducers({
    viewOptions: combineReducers({
      perThread: viewOptionsPerThread,
      symbolicationStatus,
      waitingForLibs,
      previewSelection,
      scrollToSelectionGeneration,
      focusCallTreeGeneration,
      rootRange,
      zeroAt,
      rightClickedTrack,
      isCallNodeContextMenuVisible,
      profileSharingStatus,
    }),
    globalTracks,
    localTracksByPid,
    profile,
  })
);

export const getProfileView = (state: State): ProfileViewState =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions = (state: State) =>
  getProfileView(state).viewOptions;
export const getProfileRootRange = (state: State) =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus = (state: State) =>
  getProfileViewOptions(state).symbolicationStatus;
export const getProfileSharingStatus = (state: State) =>
  getProfileViewOptions(state).profileSharingStatus;
export const getScrollToSelectionGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.scrollToSelectionGeneration
);

export const getFocusCallTreeGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.focusCallTreeGeneration
);

export const getZeroAt = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.zeroAt
);

export const getCommittedRange = createSelector(
  (state: State) => getProfileViewOptions(state).rootRange,
  (state: State) => getProfileViewOptions(state).zeroAt,
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
 * Profile
 */
export const getProfileOrNull = (state: State): Profile | null =>
  getProfileView(state).profile;
export const getProfile = (state: State): Profile =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getProfileInterval = (state: State): Milliseconds =>
  getProfile(state).meta.interval;
export const getCategories = (state: State): CategoryList =>
  getProfile(state).meta.categories;
export const getDefaultCategory = (state: State): IndexIntoCategoryList =>
  getCategories(state).findIndex(c => c.color === 'grey');
export const getThreads = (state: State): Thread[] => getProfile(state).threads;
export const getThreadNames = (state: State): string[] =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedTrack = (state: State) =>
  getProfileViewOptions(state).rightClickedTrack;
export const getPreviewSelection = (state: State) =>
  getProfileViewOptions(state).previewSelection;

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks = (state: State) =>
  getProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences = createSelector(
  getGlobalTracks,
  (globalTracks): TrackReference[] =>
    globalTracks.map((globalTrack, trackIndex) => ({
      type: 'global',
      trackIndex,
    }))
);

/**
 * This finds a GlobalTrack from its TrackReference.
 */
export const getGlobalTrackFromReference = (
  state: State,
  trackReference: TrackReference
) => {
  if (trackReference.type !== 'global') {
    throw new Error('Expected a global track reference.');
  }
  const globalTracks = getGlobalTracks(state);
  return globalTracks[trackReference.trackIndex];
};

/**
 * This finds a GlobalTrack and its index for a specific Pid.
 *
 * Warning: this selector returns a new object on every call, and will not
 * properly work with a PureComponent.
 */
export const getGlobalTrackAndIndexByPid = (state: State, pid: Pid) => {
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
export const getLocalTracksByPid = (state: State) =>
  getProfileView(state).localTracksByPid;

/**
 * This returns the local tracks for a specific Pid.
 */
export const getLocalTracks = (state: State, pid: Pid) =>
  ensureExists(
    getProfileView(state).localTracksByPid.get(pid),
    'Unable to get the tracks for the given pid.'
  );

/**
 * This returns a local track from its TrackReference.
 */
export const getLocalTrackFromReference = (
  state: State,
  trackReference: TrackReference
): LocalTrack => {
  if (trackReference.type !== 'local') {
    throw new Error('Expected a local track reference.');
  }
  const { pid, trackIndex } = trackReference;
  return getLocalTracks(state, pid)[trackIndex];
};
export const getRightClickedThreadIndex = createSelector(
  getRightClickedTrack,
  getGlobalTracks,
  getLocalTracksByPid,
  (rightClickedTrack, globalTracks, localTracksByPid): null | ThreadIndex => {
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
export const getGlobalTrackNames = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads): string[] =>
    globalTracks.map(globalTrack =>
      Tracks.getGlobalTrackName(globalTrack, threads)
    )
);
export const getGlobalTrackName = (
  state: State,
  trackIndex: TrackIndex
): string => getGlobalTrackNames(state)[trackIndex];
export const getLocalTrackNamesByPid = createSelector(
  getLocalTracksByPid,
  getThreads,
  (localTracksByPid, threads): Map<Pid, string[]> => {
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

const _getDefaultCategoryWrappedInObject = createSelector(
  getDefaultCategory,
  defaultCategory => ({ value: defaultCategory })
);

export type SelectorsForThread = {
  getThread: State => Thread,
  getViewOptions: State => ThreadViewOptions,
  getTransformStack: State => TransformStack,
  getTransformLabels: State => string[],
  getRangeFilteredThread: State => Thread,
  getRangeAndTransformFilteredThread: State => Thread,
  getJankInstances: State => TracingMarker[],
  getProcessedMarkersTable: State => MarkersTable,
  getTracingMarkers: State => TracingMarker[],
  getIsNetworkChartEmptyInFullRange: State => boolean,
  getNetworkChartTracingMarkers: State => TracingMarker[],
  getMarkerChartTracingMarkers: State => TracingMarker[],
  getIsMarkerChartEmptyInFullRange: State => boolean,
  getMarkerChartTiming: State => MarkerTimingRows,
  getNetworkChartTiming: State => MarkerTimingRows,
  getMergedNetworkChartTracingMarkers: State => TracingMarker[],
  getCommittedRangeFilteredTracingMarkers: State => TracingMarker[],
  getCommittedRangeFilteredTracingMarkersForHeader: State => TracingMarker[],
  getNetworkTracingMarkers: State => TracingMarker[],
  getNetworkTrackTiming: State => MarkerTimingRows,
  getRangeFilteredScreenshotsById: State => Map<string, TracingMarker[]>,
  getFilteredThread: State => Thread,
  getPreviewFilteredThread: State => Thread,
  getCallNodeInfo: State => CallNodeInfo,
  getCallNodeMaxDepth: State => number,
  getSelectedCallNodePath: State => CallNodePath,
  getSelectedCallNodeIndex: State => IndexIntoCallNodeTable | null,
  getExpandedCallNodePaths: State => PathSet,
  getExpandedCallNodeIndexes: State => Array<IndexIntoCallNodeTable | null>,
  getSamplesSelectedStatesInFilteredThread: State => SelectedState[],
  getTreeOrderComparatorInFilteredThread: State => (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  getCallTree: State => CallTree.CallTree,
  getStackTimingByDepth: State => StackTiming.StackTimingByDepth,
  getCallNodeMaxDepthForFlameGraph: State => number,
  getFlameGraphTiming: State => FlameGraph.FlameGraphTiming,
  getFriendlyThreadName: State => string,
  getThreadProcessDetails: State => string,
  getSearchFilteredTracingMarkers: State => TracingMarker[],
  getPreviewFilteredTracingMarkers: State => TracingMarker[],
  unfilteredSamplesRange: State => StartEndRange | null,
};

const selectorsForThreads: { [key: ThreadIndex]: SelectorsForThread } = {};

export const selectorsForThread = (
  threadIndex: ThreadIndex
): SelectorsForThread => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = (state: State): Thread =>
      getProfile(state).threads[threadIndex];
    const _getMarkersTable = (state: State) => getThread(state).markers;
    const _getStringTable = (state: State) => getThread(state).stringTable;

    /**
     * The first per-thread selectors filter out and transform a thread based on user's
     * interactions. The transforms are order dependendent.
     *
     * 1. Unfiltered getThread - The first selector gets the unmodified original thread.
     * 2. Range - New samples table with only samples in the committed range.
     * 3. Transform - Apply the transform stack that modifies the stacks and samples.
     * 4. Implementation - Modify stacks and samples to only show a single implementation.
     * 5. Search - Exclude samples that don't include some text in the stack.
     * 6. Preview - Only include samples that are within a user's preview range selection.
     */
    const getRangeFilteredThread = createSelector(
      getThread,
      getCommittedRange,
      (thread, range): Thread => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );
    const applyTransform = (
      thread: Thread,
      transform: Transform,
      defaultCategory: IndexIntoCategoryList
    ) => {
      switch (transform.type) {
        case 'focus-subtree':
          return transform.inverted
            ? Transforms.focusInvertedSubtree(
                thread,
                transform.callNodePath,
                transform.implementation
              )
            : Transforms.focusSubtree(
                thread,
                transform.callNodePath,
                transform.implementation
              );
        case 'merge-call-node':
          return Transforms.mergeCallNode(
            thread,
            transform.callNodePath,
            transform.implementation
          );
        case 'merge-function':
          return Transforms.mergeFunction(thread, transform.funcIndex);
        case 'drop-function':
          return Transforms.dropFunction(thread, transform.funcIndex);
        case 'focus-function':
          return Transforms.focusFunction(thread, transform.funcIndex);
        case 'collapse-resource':
          return Transforms.collapseResource(
            thread,
            transform.resourceIndex,
            transform.implementation,
            defaultCategory
          );
        case 'collapse-direct-recursion':
          return Transforms.collapseDirectRecursion(
            thread,
            transform.funcIndex,
            transform.implementation
          );
        case 'collapse-function-subtree':
          return Transforms.collapseFunctionSubtree(
            thread,
            transform.funcIndex,
            defaultCategory
          );
        default:
          throw assertExhaustiveCheck(transform);
      }
    };
    // It becomes very expensive to apply each transform over and over again as they
    // typically take around 100ms to run per transform on a fast machine. Memoize
    // memoize each step individually so that they transform stack can be pushed and
    // popped frequently and easily.
    const applyTransformMemoized = memoize(applyTransform, {
      cache: new MixedTupleMap(),
    });
    const getTransformStack = (state: State): TransformStack =>
      UrlState.getTransformStack(state, threadIndex);
    const getRangeAndTransformFilteredThread = createSelector(
      getRangeFilteredThread,
      getTransformStack,
      _getDefaultCategoryWrappedInObject,
      (startingThread, transforms, defaultCategoryObj): Thread =>
        transforms.reduce(
          // Apply the reducer using an arrow function to ensure correct memoization.
          (thread, transform) =>
            applyTransformMemoized(thread, transform, defaultCategoryObj.value),
          startingThread
        )
    );
    const _getImplementationFilteredThread = createSelector(
      getRangeAndTransformFilteredThread,
      UrlState.getImplementationFilter,
      getDefaultCategory,
      ProfileData.filterThreadByImplementation
    );
    const _getImplementationAndSearchFilteredThread = createSelector(
      _getImplementationFilteredThread,
      UrlState.getSearchStrings,
      (thread: Thread, searchStrings: string[] | null): Thread => {
        return ProfileData.filterThreadToSearchStrings(thread, searchStrings);
      }
    );
    const getFilteredThread = createSelector(
      _getImplementationAndSearchFilteredThread,
      UrlState.getInvertCallstack,
      getDefaultCategory,
      (thread, shouldInvertCallstack, defaultCategory): Thread => {
        return shouldInvertCallstack
          ? ProfileData.invertCallstack(thread, defaultCategory)
          : thread;
      }
    );
    const getPreviewFilteredThread = createSelector(
      getFilteredThread,
      getPreviewSelection,
      (thread, previewSelection): Thread => {
        if (!previewSelection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = previewSelection;
        return ProfileData.filterThreadToRange(
          thread,
          selectionStart,
          selectionEnd
        );
      }
    );

    const getViewOptions = (state: State): ThreadViewOptions =>
      getProfileViewOptions(state).perThread[threadIndex];
    const getFriendlyThreadName = createSelector(
      getThreads,
      getThread,
      ProfileData.getFriendlyThreadName
    );
    const getThreadProcessDetails = createSelector(
      getThread,
      ProfileData.getThreadProcessDetails
    );
    const getTransformLabels: (state: State) => string[] = createSelector(
      getRangeAndTransformFilteredThread,
      getFriendlyThreadName,
      getTransformStack,
      Transforms.getTransformLabels
    );
    const _getRangeFilteredThreadSamples = createSelector(
      getRangeFilteredThread,
      (thread): SamplesTable => thread.samples
    );
    const getJankInstances = createSelector(
      _getRangeFilteredThreadSamples,
      (samples): TracingMarker[] => MarkerData.getJankInstances(samples, 50)
    );

    /**
     * Similar to thread filtering, the markers can be filtered as well, and it's
     * important to use the right type of filtering for the view. The steps for filtering
     * markers are a bit different, since markers can be valid over ranges, and need a
     * bit more processing in order to get into a correct state. There are a few
     * variants of the selectors that are created for specific views that have been
     * omitted, but the ordered steps below give the general picture.
     *
     * 1. _getMarkersTable - Get the MarkersTable from the current thread.
     * 2. getProcessedMarkersTable - Process marker payloads out of raw strings, and other
     *                               future processing needs. This returns a MarkersTable
     *                               still.
     * 3. getTracingMarkers - Match up start/end markers, and start returning
     *                        TracingMarkers.
     * 4. getCommittedRangeFilteredTracingMarkers - Apply the commited range.
     * 5. getSearchFilteredTracingMarkers - Apply the search string
     * 6. getPreviewFilteredTracingMarkers - Apply the preview range
     */
    const getProcessedMarkersTable = createSelector(
      _getMarkersTable,
      _getStringTable,
      MarkerData.extractMarkerDataFromName
    );
    const getTracingMarkers = createSelector(
      getProcessedMarkersTable,
      _getStringTable,
      MarkerData.getTracingMarkers
    );
    const getCommittedRangeFilteredTracingMarkers = createSelector(
      getTracingMarkers,
      getCommittedRange,
      (markers, range): TracingMarker[] => {
        const { start, end } = range;
        return MarkerData.filterTracingMarkersToRange(markers, start, end);
      }
    );
    const getCommittedRangeFilteredTracingMarkersForHeader = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      (markers): TracingMarker[] =>
        markers.filter(
          tm =>
            tm.name !== 'GCMajor' &&
            tm.name !== 'BHR-detected hang' &&
            tm.name !== 'LongTask' &&
            tm.name !== 'LongIdleTask' &&
            !MarkerData.isNetworkMarker(tm)
        )
    );
    const getSearchFilteredTracingMarkers = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      UrlState.getMarkersSearchString,
      MarkerData.getSearchFilteredTracingMarkers
    );
    const getPreviewFilteredTracingMarkers = createSelector(
      getSearchFilteredTracingMarkers,
      getPreviewSelection,
      (markers, previewSelection) => {
        if (!previewSelection.hasSelection) {
          return markers;
        }
        const { selectionStart, selectionEnd } = previewSelection;
        return MarkerData.filterTracingMarkersToRange(
          markers,
          selectionStart,
          selectionEnd
        );
      }
    );
    const getIsNetworkChartEmptyInFullRange = createSelector(
      getTracingMarkers,
      markers => markers.filter(MarkerData.isNetworkMarker).length === 0
    );
    const getNetworkChartTracingMarkers = createSelector(
      getSearchFilteredTracingMarkers,
      markers => markers.filter(MarkerData.isNetworkMarker)
    );
    const getMergedNetworkChartTracingMarkers = createSelector(
      getNetworkChartTracingMarkers,
      MarkerData.mergeStartAndEndNetworkMarker
    );
    const getIsMarkerChartEmptyInFullRange = createSelector(
      getTracingMarkers,
      markers => MarkerData.filterForMarkerChart(markers).length === 0
    );
    const getMarkerChartTracingMarkers = createSelector(
      getSearchFilteredTracingMarkers,
      MarkerData.filterForMarkerChart
    );
    const getMarkerChartTiming = createSelector(
      getMarkerChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getNetworkChartTiming = createSelector(
      getNetworkChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getNetworkTracingMarkers = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      tracingMarkers => tracingMarkers.filter(MarkerData.isNetworkMarker)
    );
    const getNetworkTrackTiming = createSelector(
      getNetworkTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getScreenshotsById = createSelector(
      _getMarkersTable,
      _getStringTable,
      getProfileRootRange,
      MarkerData.extractScreenshotsById
    );
    const getRangeFilteredScreenshotsById = createSelector(
      getScreenshotsById,
      getCommittedRange,
      (screenshotsById, { start, end }) => {
        const newMap = new Map();
        for (const [id, screenshots] of screenshotsById) {
          newMap.set(
            id,
            MarkerData.filterTracingMarkersToRange(screenshots, start, end)
          );
        }
        return newMap;
      }
    );

    const getCallNodeInfo = createSelector(
      getFilteredThread,
      getDefaultCategory,
      (
        { stackTable, frameTable, funcTable }: Thread,
        defaultCategory: IndexIntoCategoryList
      ): CallNodeInfo => {
        return ProfileData.getCallNodeInfo(
          stackTable,
          frameTable,
          funcTable,
          defaultCategory
        );
      }
    );
    const getCallNodeMaxDepth = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );
    const getSelectedCallNodePath = createSelector(
      getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedCallNodePath
    );
    const getSelectedCallNodeIndex = createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath): IndexIntoCallNodeTable | null => {
        return ProfileData.getCallNodeIndexFromPath(
          callNodePath,
          callNodeInfo.callNodeTable
        );
      }
    );
    const getExpandedCallNodePaths = createSelector(
      getViewOptions,
      (threadViewOptions): PathSet => threadViewOptions.expandedCallNodePaths
    );
    const getExpandedCallNodeIndexes = createSelector(
      getCallNodeInfo,
      getExpandedCallNodePaths,
      (
        { callNodeTable },
        callNodePaths
      ): Array<IndexIntoCallNodeTable | null> =>
        ProfileData.getCallNodeIndicesFromPaths(
          Array.from(callNodePaths),
          callNodeTable
        )
    );
    const getSamplesSelectedStatesInFilteredThread = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      getSelectedCallNodeIndex,
      (
        thread,
        { callNodeTable, stackIndexToCallNodeIndex },
        selectedCallNode
      ) => {
        const sampleCallNodes = ProfileData.getSampleCallNodes(
          thread.samples,
          stackIndexToCallNodeIndex
        );
        return ProfileData.getSamplesSelectedStates(
          callNodeTable,
          sampleCallNodes,
          selectedCallNode
        );
      }
    );
    const getTreeOrderComparatorInFilteredThread = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      (thread, { callNodeTable, stackIndexToCallNodeIndex }) => {
        const sampleCallNodes = ProfileData.getSampleCallNodes(
          thread.samples,
          stackIndexToCallNodeIndex
        );
        return ProfileData.getTreeOrderComparator(
          callNodeTable,
          sampleCallNodes
        );
      }
    );
    const getCallTree = createSelector(
      getPreviewFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      getCategories,
      UrlState.getImplementationFilter,
      UrlState.getInvertCallstack,
      CallTree.getCallTree
    );
    const getStackTimingByDepth = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getCallNodeMaxDepthForFlameGraph = createSelector(
      getPreviewFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );
    const getFlameGraphTiming = createSelector(
      getPreviewFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      UrlState.getInvertCallstack,
      FlameGraph.getFlameGraphTiming
    );
    /**
     * The buffers of the samples can be cleared out. This function lets us know the
     * absolute range of samples that we have collected.
     */
    const unfilteredSamplesRange = createSelector(
      getThread,
      getProfileInterval,
      (thread, interval) => {
        const { time } = thread.samples;
        if (time.length === 0) {
          return null;
        }
        return { start: time[0], end: time[time.length - 1] + interval };
      }
    );

    selectorsForThreads[threadIndex] = {
      getThread,
      getViewOptions,
      getTransformStack,
      getTransformLabels,
      getRangeFilteredThread,
      getRangeAndTransformFilteredThread,
      getJankInstances,
      getProcessedMarkersTable,
      getTracingMarkers,
      getIsNetworkChartEmptyInFullRange,
      getNetworkChartTracingMarkers,
      getIsMarkerChartEmptyInFullRange,
      getMarkerChartTracingMarkers,
      getMarkerChartTiming,
      getNetworkChartTiming,
      getCommittedRangeFilteredTracingMarkers,
      getCommittedRangeFilteredTracingMarkersForHeader,
      getNetworkTracingMarkers,
      getNetworkTrackTiming,
      getMergedNetworkChartTracingMarkers,
      getRangeFilteredScreenshotsById,
      getFilteredThread,
      getPreviewFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getSelectedCallNodePath,
      getSelectedCallNodeIndex,
      getExpandedCallNodePaths,
      getExpandedCallNodeIndexes,
      getSamplesSelectedStatesInFilteredThread,
      getTreeOrderComparatorInFilteredThread,
      getCallTree,
      getStackTimingByDepth,
      getCallNodeMaxDepthForFlameGraph,
      getFlameGraphTiming,
      getFriendlyThreadName,
      getThreadProcessDetails,
      getSearchFilteredTracingMarkers,
      getPreviewFilteredTracingMarkers,
      unfilteredSamplesRange,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors: SelectorsForThread = (() => {
  const anyThreadSelectors: SelectorsForThread = selectorsForThread(0);
  const result: { [key: string]: (State) => any } = {};
  for (const key in anyThreadSelectors) {
    result[key] = (state: State) =>
      selectorsForThread(UrlState.getSelectedThreadIndex(state))[key](state);
  }
  const result2: SelectorsForThread = result;
  return result2;
})();

export type SelectorsForNode = {
  getName: State => string,
  getIsJS: State => boolean,
  getLib: State => string,
  getTimingsForSidebar: State => TimingsForPath,
};

export const selectedNodeSelectors: SelectorsForNode = (() => {
  const getName = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return stringTable.getString(funcTable.name[funcIndex]);
    }
  );

  const getIsJS = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { funcTable }) => {
      if (!selectedPath.length) {
        return false;
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return funcTable.isJS[funcIndex];
    }
  );

  const getLib = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable, resourceTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      return ProfileData.getOriginAnnotationForFunc(
        ProfileData.getLeafFuncIndex(selectedPath),
        funcTable,
        resourceTable,
        stringTable
      );
    }
  );

  const getTimingsForSidebar = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getCallNodeInfo,
    getProfileInterval,
    UrlState.getInvertCallstack,
    selectedThreadSelectors.getPreviewFilteredThread,
    (
      selectedPath,
      callNodeInfo,
      interval,
      isInvertedTree,
      thread
    ): TimingsForPath => {
      return ProfileData.getTimingsForPath(
        selectedPath,
        callNodeInfo,
        interval,
        isInvertedTree,
        thread
      );
    }
  );

  return {
    getName,
    getIsJS,
    getLib,
    getTimingsForSidebar,
  };
})();
