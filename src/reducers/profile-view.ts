/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { combineReducers } from 'redux';
import * as Transforms from '../profile-logic/transforms';
import * as ProfileData from '../profile-logic/profile-data';
import { arePathsEqual, PathSet } from '../utils/path';

import type {
  Profile,
  Pid,
  LocalTrack,
  GlobalTrack,
  LastNonShiftClickInformation,
  StartEndRange,
  PreviewSelection,
  RequestedLib,
  TrackReference,
  Reducer,
  ProfileViewState,
  SymbolicationStatus,
  ThreadViewOptions,
  ThreadViewOptionsPerThreads,
  TableViewOptionsPerTab,
  RightClickedCallNode,
  MarkerReference,
  CallNodePath,
  ThreadsKey,
  Milliseconds,
  TableViewOptions,
} from 'firefox-profiler/types';
import {
  applyFuncSubstitutionToCallPath,
  applyFuncSubstitutionToPathSetAndIncludeNewAncestors,
} from '../profile-logic/symbolication';
import type { TabSlug } from '../app-logic/tabs-handling';

import { objectMap } from '../utils/types';

const profile: Reducer<Profile | null> = (state = null, action) => {
  switch (action.type) {
    case 'PROFILE_LOADED':
      return action.profile;
    case 'BULK_SYMBOLICATION': {
      if (state === null) {
        throw new Error(
          'Assumed that a profile would be loaded in time for a coalesced functions update.'
        );
      }
      if (!state.threads.length) {
        return state;
      }
      const { symbolicatedThreads } = action;
      return { ...state, threads: symbolicatedThreads };
    }
    case 'DONE_SYMBOLICATING': {
      if (state === null) {
        throw new Error(
          `Strangely we're done symbolicating a non-existent profile.`
        );
      }

      return {
        ...state,
        meta: {
          ...state.meta,
          symbolicated: true,
        },
      };
    }
    case 'UPDATE_PAGES': {
      if (state === null) {
        throw new Error(
          `We tried to update the pages information for a non-existent profile.`
        );
      }

      const { newPages } = action;
      return { ...state, pages: newPages };
    }
    default:
      return state;
  }
};

/**
 * This information is stored, rather than derived via selectors, since the coalesced
 * function update would force it to be recomputed on every symbolication update
 * pass. It is valid for the lifetime of the profile.
 */
const globalTracks: Reducer<GlobalTrack[]> = (state = [], action) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'CHANGE_TAB_FILTER':
      return action.globalTracks;
    default:
      return state;
  }
};

/**
 * This can be derived like the globalTracks information, but is stored in the state
 * for the same reason.
 */
const localTracksByPid: Reducer<Map<Pid, LocalTrack[]>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'VIEW_FULL_PROFILE':
    case 'ENABLE_EVENT_DELAY_TRACKS':
    case 'ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS':
    case 'CHANGE_TAB_FILTER':
      return action.localTracksByPid;
    default:
      return state;
  }
};

const symbolicationStatus: Reducer<SymbolicationStatus> = (
  state = 'DONE',
  action
) => {
  switch (action.type) {
    case 'START_SYMBOLICATING':
      return 'SYMBOLICATING';
    case 'DONE_SYMBOLICATING':
      return 'DONE';
    default:
      return state;
  }
};

export const defaultThreadViewOptions: ThreadViewOptions = {
  selectedNonInvertedCallNodePath: [],
  selectedInvertedCallNodePath: [],
  expandedNonInvertedCallNodePaths: new PathSet(),
  expandedInvertedCallNodePaths: new PathSet(),
  selectedMarker: null,
  selectedNetworkMarker: null,
  lastSeenTransformCount: 0,
};

function _getThreadViewOptions(
  state: ThreadViewOptionsPerThreads,
  threadsKey: ThreadsKey
): ThreadViewOptions {
  const options = state[threadsKey];
  if (options) {
    return options;
  }
  return defaultThreadViewOptions;
}

function _updateThreadViewOptions(
  state: ThreadViewOptionsPerThreads,
  threadsKey: ThreadsKey,
  updates: Partial<ThreadViewOptions>
): ThreadViewOptionsPerThreads {
  const newState = { ...state };
  newState[threadsKey] = {
    ..._getThreadViewOptions(state, threadsKey),
    ...updates,
  };
  return newState;
}

const viewOptionsPerThread: Reducer<ThreadViewOptionsPerThreads> = (
  state = {} as ThreadViewOptionsPerThreads,
  action
): ThreadViewOptionsPerThreads => {
  switch (action.type) {
    case 'PROFILE_LOADED':
      // The view options are lazily initialized. Reset to the default values.
      return {};
    case 'BULK_SYMBOLICATION': {
      const { oldFuncToNewFuncsMaps } = action;
      // For each thread, apply oldFuncToNewFuncsMap to that thread's
      // selectedCallNodePath and expandedCallNodePaths.
      const newState = objectMap(state, (threadViewOptions, threadsKey) => {
        // Multiple selected threads are not supported, note that transforming
        // the threadKey with multiple threads into a number will result in a NaN.
        // This should be fine here, as the oldFuncToNewFuncsMaps only supports
        // single thread indexes.
        const threadIndex = +threadsKey;
        if (Number.isNaN(threadIndex)) {
          throw new Error(
            'Bulk symbolication only supports a single thread, and a ThreadsKey with ' +
              'multiple threads was used.'
          );
        }
        const oldFuncToNewFuncsMap = oldFuncToNewFuncsMaps.get(threadIndex);
        if (oldFuncToNewFuncsMap === undefined) {
          return threadViewOptions;
        }

        return {
          ...threadViewOptions,
          selectedNonInvertedCallNodePath: applyFuncSubstitutionToCallPath(
            oldFuncToNewFuncsMap,
            threadViewOptions.selectedNonInvertedCallNodePath
          ),
          selectedInvertedCallNodePath: applyFuncSubstitutionToCallPath(
            oldFuncToNewFuncsMap,
            threadViewOptions.selectedInvertedCallNodePath
          ),
          expandedNonInvertedCallNodePaths:
            applyFuncSubstitutionToPathSetAndIncludeNewAncestors(
              oldFuncToNewFuncsMap,
              threadViewOptions.expandedNonInvertedCallNodePaths
            ),
          expandedInvertedCallNodePaths:
            applyFuncSubstitutionToPathSetAndIncludeNewAncestors(
              oldFuncToNewFuncsMap,
              threadViewOptions.expandedInvertedCallNodePaths
            ),
        };
      });

      return newState;
    }
    case 'CHANGE_SELECTED_CALL_NODE': {
      const {
        isInverted,
        selectedCallNodePath,
        threadsKey,
        optionalExpandedToCallNodePath,
      } = action;

      const threadState = _getThreadViewOptions(state, threadsKey);

      const previousSelectedCallNodePath = isInverted
        ? threadState.selectedInvertedCallNodePath
        : threadState.selectedNonInvertedCallNodePath;

      // If the selected node doesn't actually change, let's return the previous
      // state to avoid rerenders.
      if (
        arePathsEqual(selectedCallNodePath, previousSelectedCallNodePath) &&
        !optionalExpandedToCallNodePath
      ) {
        return state;
      }

      let expandedCallNodePaths = isInverted
        ? threadState.expandedInvertedCallNodePaths
        : threadState.expandedNonInvertedCallNodePaths;
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
        (path) => !expandedCallNodePaths.has(path)
      );

      if (hasNewExpandedPaths) {
        expandedCallNodePaths = new PathSet(expandedCallNodePaths);
        expandToNodeParentPaths.forEach((path) =>
          expandedCallNodePaths.add(path)
        );
      }

      return _updateThreadViewOptions(
        state,
        threadsKey,
        isInverted
          ? {
              selectedInvertedCallNodePath: selectedCallNodePath,
              expandedInvertedCallNodePaths: expandedCallNodePaths,
            }
          : {
              selectedNonInvertedCallNodePath: selectedCallNodePath,
              expandedNonInvertedCallNodePaths: expandedCallNodePaths,
            }
      );
    }
    case 'CHANGE_INVERT_CALLSTACK': {
      const {
        newSelectedCallNodePath,
        selectedThreadIndexes,
        invertCallstack,
      } = action;
      return objectMap(state, (viewOptions, threadsKey) => {
        if (
          // `Object.entries` converts number threadsKeys into strings, so
          // converting right hand side to string as well.
          threadsKey ===
          ProfileData.getThreadsKey(selectedThreadIndexes).toString()
        ) {
          const expandedCallNodePaths = new PathSet();
          for (let i = 1; i < newSelectedCallNodePath.length; i++) {
            expandedCallNodePaths.add(newSelectedCallNodePath.slice(0, i));
          }

          return invertCallstack
            ? {
                ...viewOptions,
                selectedInvertedCallNodePath: newSelectedCallNodePath,
                expandedInvertedCallNodePaths: expandedCallNodePaths,
              }
            : {
                ...viewOptions,
                selectedNonInvertedCallNodePath: newSelectedCallNodePath,
                expandedNonInvertedCallNodePaths: expandedCallNodePaths,
              };
        }
        return viewOptions;
      });
    }
    case 'CHANGE_EXPANDED_CALL_NODES': {
      const { threadsKey, isInverted } = action;
      const expandedCallNodePaths = new PathSet(action.expandedCallNodePaths);

      return _updateThreadViewOptions(
        state,
        threadsKey,
        isInverted
          ? { expandedInvertedCallNodePaths: expandedCallNodePaths }
          : { expandedNonInvertedCallNodePaths: expandedCallNodePaths }
      );
    }
    case 'CHANGE_SELECTED_MARKER': {
      const { threadsKey, selectedMarker } = action;
      return _updateThreadViewOptions(state, threadsKey, { selectedMarker });
    }
    case 'CHANGE_SELECTED_NETWORK_MARKER': {
      const { threadsKey, selectedNetworkMarker } = action;
      return _updateThreadViewOptions(state, threadsKey, {
        selectedNetworkMarker,
      });
    }
    case 'ADD_TRANSFORM_TO_STACK': {
      const { threadsKey, transform, transformedThread, callNodeInfo } = action;

      const getFilteredPathSet = function (pathSet: PathSet): PathSet {
        return new PathSet(
          Array.from(pathSet)
            .map((path) =>
              Transforms.applyTransformToCallNodePath(
                path,
                transform,
                transformedThread,
                callNodeInfo
              )
            )
            .filter((path) => path.length > 0)
        );
      };

      const getFilteredPath = function (path: CallNodePath): CallNodePath {
        return Transforms.applyTransformToCallNodePath(
          path,
          transform,
          transformedThread,
          callNodeInfo
        );
      };

      const threadViewOptions = _getThreadViewOptions(state, threadsKey);
      const selectedNonInvertedCallNodePath = getFilteredPath(
        threadViewOptions.selectedNonInvertedCallNodePath
      );
      const selectedInvertedCallNodePath = getFilteredPath(
        threadViewOptions.selectedInvertedCallNodePath
      );
      const expandedNonInvertedCallNodePaths = getFilteredPathSet(
        threadViewOptions.expandedNonInvertedCallNodePaths
      );
      const expandedInvertedCallNodePaths = getFilteredPathSet(
        threadViewOptions.expandedInvertedCallNodePaths
      );

      const lastSeenTransformCount =
        threadViewOptions.lastSeenTransformCount + 1;

      return _updateThreadViewOptions(state, threadsKey, {
        selectedNonInvertedCallNodePath,
        selectedInvertedCallNodePath,
        expandedNonInvertedCallNodePaths,
        expandedInvertedCallNodePaths,
        lastSeenTransformCount,
      });
    }
    case 'POP_TRANSFORMS_FROM_STACK': {
      // Simply reset the stored paths until this bug is fixed:
      // https://github.com/firefox-devtools/profiler/issues/882
      const { threadsKey } = action;
      return _updateThreadViewOptions(state, threadsKey, {
        selectedNonInvertedCallNodePath: [],
        selectedInvertedCallNodePath: [],
        expandedNonInvertedCallNodePaths: new PathSet(),
        expandedInvertedCallNodePaths: new PathSet(),
        lastSeenTransformCount: 0,
      });
    }
    case 'UPDATE_URL_STATE': {
      // When the URL state changes (e.g., via browser back button):
      // 1. Check if the transform stack has been popped for each thread.
      //   If so, reset the stored paths, because they may reference call nodes
      //   that only exist in a transformed tree.
      //   See: https://github.com/firefox-devtools/profiler/issues/5689.
      // 2. Sync selected marker with URL state.

      if (!action.newUrlState) {
        return state;
      }

      const { transforms, selectedMarkers } =
        action.newUrlState.profileSpecific;
      return objectMap(state, (viewOptions, threadsKey) => {
        const transformStack = transforms[threadsKey] || [];
        const newTransformCount = transformStack.length;
        const oldTransformCount = viewOptions.lastSeenTransformCount;

        // Get the selected marker from URL state for this thread
        const urlSelectedMarker = selectedMarkers[threadsKey] ?? null;
        const currentSelectedMarker = viewOptions.selectedMarker;

        // Check if we need to update anything
        const transformCountChanged = newTransformCount < oldTransformCount;
        const markerChanged = urlSelectedMarker !== currentSelectedMarker;

        if (!transformCountChanged && !markerChanged) {
          // No change needed
          return viewOptions;
        }

        // Build the updated view options
        let updatedOptions = { ...viewOptions };

        // If transform count changed, reset the paths
        if (transformCountChanged) {
          updatedOptions = {
            ...updatedOptions,
            selectedNonInvertedCallNodePath: [],
            selectedInvertedCallNodePath: [],
            expandedNonInvertedCallNodePaths: new PathSet(),
            expandedInvertedCallNodePaths: new PathSet(),
            lastSeenTransformCount: newTransformCount,
          };
        }

        // If marker changed, sync it from URL state
        if (markerChanged) {
          updatedOptions = {
            ...updatedOptions,
            selectedMarker: urlSelectedMarker,
          };
        }

        return updatedOptions;
      });
    }
    case 'CHANGE_IMPLEMENTATION_FILTER': {
      const {
        transformedThread,
        threadsKey,
        previousImplementation,
        implementation,
      } = action;

      if (previousImplementation === implementation) {
        return state;
      }

      const viewOptions = _getThreadViewOptions(state, threadsKey);

      const getUpdatedPath = function getUpdatedPath(
        callNodePath: CallNodePath
      ): CallNodePath {
        // This CallNodePath may need to be updated twice.
        if (implementation === 'combined') {
          // Restore the full CallNodePaths
          callNodePath = Transforms.restoreAllFunctionsInCallNodePath(
            transformedThread,
            previousImplementation,
            callNodePath
          );
        } else {
          if (previousImplementation !== 'combined') {
            // Restore the CallNodePath back to an unfiltered state before re-filtering
            // it on the next implementation.
            callNodePath = Transforms.restoreAllFunctionsInCallNodePath(
              transformedThread,
              previousImplementation,
              callNodePath
            );
          }
          // Take the full CallNodePath, and strip out anything not in this implementation.
          callNodePath = Transforms.filterCallNodePathByImplementation(
            transformedThread,
            implementation,
            callNodePath
          );
        }
        return callNodePath;
      };

      const getAncestorPathSet = function getAncestorPathSet(
        callNodePath: CallNodePath
      ): PathSet {
        const ancestorCallNodePaths = new PathSet();
        for (let i = 1; i < callNodePath.length; i++) {
          ancestorCallNodePaths.add(callNodePath.slice(0, i));
        }
        return ancestorCallNodePaths;
      };

      const selectedNonInvertedCallNodePath = getUpdatedPath(
        viewOptions.selectedNonInvertedCallNodePath
      );
      const selectedInvertedCallNodePath = getUpdatedPath(
        viewOptions.selectedInvertedCallNodePath
      );
      const expandedNonInvertedCallNodePaths = getAncestorPathSet(
        selectedNonInvertedCallNodePath
      );
      const expandedInvertedCallNodePaths = getAncestorPathSet(
        selectedInvertedCallNodePath
      );

      return _updateThreadViewOptions(state, threadsKey, {
        selectedNonInvertedCallNodePath,
        selectedInvertedCallNodePath,
        expandedNonInvertedCallNodePaths,
        expandedInvertedCallNodePaths,
      });
    }
    default:
      return state;
  }
};

export const defaultTableViewOptions: TableViewOptions = {
  fixedColumnWidths: null,
};

function _updateTableViewOptions(
  state: TableViewOptionsPerTab,
  tab: TabSlug,
  updates: Partial<TableViewOptions>
): TableViewOptionsPerTab {
  const newState = { ...state };
  newState[tab] = {
    ...(state[tab] ?? defaultTableViewOptions),
    ...updates,
  };
  return newState;
}

const tableViewOptionsPerTab: Reducer<TableViewOptionsPerTab> = (
  state = {} as TableViewOptionsPerTab,
  action
): TableViewOptionsPerTab => {
  switch (action.type) {
    case 'CHANGE_TABLE_VIEW_OPTIONS':
      return _updateTableViewOptions(
        state,
        action.tab,
        action.tableViewOptions
      );
    default:
      return state;
  }
};

const waitingForLibs: Reducer<Set<RequestedLib>> = (
  state = new Set(),
  action
) => {
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
};

const previewSelection: Reducer<PreviewSelection | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'UPDATE_PREVIEW_SELECTION':
      return action.previewSelection;
    case 'COMMIT_RANGE':
      return null;
    case 'POP_COMMITTED_RANGES':
      if (!action.committedRange) {
        return null;
      }
      return {
        isModifying: false,
        selectionStart: action.committedRange.start,
        selectionEnd: action.committedRange.end,
      };
    default:
      return state;
  }
};

/**
 * When changing state in the UI, it's hard to know when we need to re-scroll a
 * selection into view. This value is a generational value (it always increments by one).
 * Anytime it increments, it signals that the current view needs to scroll the selection
 * into view. This mechanism works will with memoization of props with React components.
 */
const scrollToSelectionGeneration: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
    case 'CHANGE_SELECTED_THREAD':
    case 'SELECT_TRACK':
    case 'HIDE_GLOBAL_TRACK':
    case 'HIDE_LOCAL_TRACK':
    case 'HIDE_PROVIDED_TRACKS':
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
    case 'CHANGE_MARKER_SEARCH_STRING':
    case 'CHANGE_NETWORK_SEARCH_STRING':
      return state + 1;
    case 'CHANGE_SELECTED_CALL_NODE':
    case 'CHANGE_SELECTED_MARKER':
    case 'CHANGE_SELECTED_NETWORK_MARKER':
      if (action.context.source === 'pointer') {
        // If the call node was changed as a result of a pointer click, do not
        // scroll the table. Indeed this is disturbing and prevents double
        // clicks.
        return state;
      }
      return state + 1;
    default:
      return state;
  }
};

/**
 * When changing state in the UI, we need to know when the call tree needs to be focused.
 * This value is a generational value (it always increments by one). Anytime it
 * increments, it signals that the current view needs to focus the call tree
 * This mechanism works will with memoization of props with React components.
 */
const focusCallTreeGeneration: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'FOCUS_CALL_TREE':
      return state + 1;
    default:
      return state;
  }
};

const rootRange: Reducer<StartEndRange> = (
  state = { start: 0, end: 1 },
  action
) => {
  switch (action.type) {
    case 'PROFILE_LOADED':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
};

const lastNonShiftClick: Reducer<LastNonShiftClickInformation | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'SELECT_TRACK':
      return action.lastNonShiftClickInformation;

    // Reset the state if the user hides the previously clicked track.
    case 'HIDE_GLOBAL_TRACK': {
      if (!state) {
        return null;
      }
      const { clickedTrack } = state;
      if (
        clickedTrack.type === 'global' &&
        clickedTrack.trackIndex === action.trackIndex
      ) {
        // This global track is hidden.
        return null;
      }
      if (clickedTrack.type === 'local' && clickedTrack.pid === action.pid) {
        // The global track where this local track belongs is hidden.
        return null;
      }
      return state;
    }
    case 'HIDE_LOCAL_TRACK': {
      if (!state) {
        return null;
      }
      const { clickedTrack } = state;
      if (
        clickedTrack.type === 'local' &&
        clickedTrack.pid === action.pid &&
        clickedTrack.trackIndex === action.trackIndex
      ) {
        // This local track is hidden.
        return null;
      }
      return state;
    }
    default:
      return state;
  }
};

const rightClickedTrack: Reducer<TrackReference | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'CHANGE_RIGHT_CLICKED_TRACK':
      return action.trackReference;
    default:
      return state;
  }
};

const rightClickedCallNode: Reducer<RightClickedCallNode | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'BULK_SYMBOLICATION': {
      if (state === null) {
        return null;
      }

      const { oldFuncToNewFuncsMaps } = action;
      // This doesn't support a ThreadsKey with multiple threads.
      const oldFuncToNewFuncsMap = oldFuncToNewFuncsMaps.get(+state.threadsKey);
      if (oldFuncToNewFuncsMap === undefined) {
        return state;
      }

      return {
        ...state,
        callNodePath: applyFuncSubstitutionToCallPath(
          oldFuncToNewFuncsMap,
          state.callNodePath
        ),
      };
    }
    case 'CHANGE_RIGHT_CLICKED_CALL_NODE':
      if (action.callNodePath !== null) {
        return {
          threadsKey: action.threadsKey,
          callNodePath: action.callNodePath,
        };
      }

      return null;
    case 'SET_CONTEXT_MENU_VISIBILITY':
      // We want to change the state only when the menu is hidden.
      if (action.isVisible) {
        return state;
      }

      return null;
    case 'PROFILE_LOADED':
    case 'CHANGE_INVERT_CALLSTACK':
    case 'ADD_TRANSFORM_TO_STACK':
    case 'POP_TRANSFORMS_FROM_STACK':
    case 'CHANGE_IMPLEMENTATION_FILTER':
      return null;
    default:
      return state;
  }
};

const rightClickedMarker: Reducer<MarkerReference | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'CHANGE_RIGHT_CLICKED_MARKER':
      if (action.markerIndex !== null) {
        return {
          threadsKey: action.threadsKey,
          markerIndex: action.markerIndex,
        };
      }

      return null;
    case 'SET_CONTEXT_MENU_VISIBILITY':
      // We want to change the state only when the menu is hidden.
      if (action.isVisible) {
        return state;
      }

      return null;
    case 'PROFILE_LOADED':
      return null;
    default:
      return state;
  }
};

const hoveredMarker: Reducer<MarkerReference | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'CHANGE_HOVERED_MARKER':
      if (action.markerIndex !== null) {
        return {
          threadsKey: action.threadsKey,
          markerIndex: action.markerIndex,
        };
      }

      return null;
    case 'PROFILE_LOADED':
      return null;
    default:
      return state;
  }
};

/**
 * This is for tracking mouse position in timeline-axis
 */
const mouseTimePosition: Reducer<Milliseconds | null> = (
  state = null,
  action
) => {
  switch (action.type) {
    case 'CHANGE_MOUSE_TIME_POSITION':
      return action.mouseTimePosition;
    default:
      return state;
  }
};

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
      case 'SANITIZED_PROFILE_PUBLISHED':
      case 'REVERT_TO_PRE_PUBLISHED_STATE':
      case 'RETURN_TO_ZIP_FILE_LIST':
        // Provide a mechanism to wipe the state clean when changing out profiles.
        // All of the profile view information is invalidated.
        return regularReducer(undefined, action);
      default:
        // Run the normal reducer.
        return regularReducer(state, action);
    }
  };
};

const profileViewReducer: Reducer<ProfileViewState> = wrapReducerInResetter(
  combineReducers({
    viewOptions: combineReducers({
      perThread: viewOptionsPerThread,
      symbolicationStatus,
      waitingForLibs,
      previewSelection,
      scrollToSelectionGeneration,
      focusCallTreeGeneration,
      rootRange,
      lastNonShiftClick,
      rightClickedTrack,
      rightClickedCallNode,
      rightClickedMarker,
      hoveredMarker,
      mouseTimePosition,
      perTab: tableViewOptionsPerTab,
    }),
    profile,
    globalTracks,
    localTracksByPid,
  })
);

export default profileViewReducer;
