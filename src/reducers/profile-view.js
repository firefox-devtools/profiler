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
import WeakTupleMap from 'weaktuplemap';
import * as Transforms from '../profile-logic/transforms';
import * as UrlState from './url-state';
import * as ProfileData from '../profile-logic/profile-data';
import * as StackTiming from '../profile-logic/stack-timing';
import * as FlameGraph from '../profile-logic/flame-graph';
import * as MarkerTiming from '../profile-logic/marker-timing';
import * as CallTree from '../profile-logic/call-tree';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import { arePathsEqual, PathSet } from '../utils/path';

import type {
  Profile,
  Thread,
  ThreadIndex,
  SamplesTable,
  MarkersTable,
} from '../types/profile';
import type {
  TracingMarker,
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
  MarkerTimingRows,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type { Action, ProfileSelection } from '../types/actions';
import type {
  State,
  Reducer,
  ProfileViewState,
  RequestedLib,
  SymbolicationStatus,
  ThreadViewOptions,
} from '../types/reducers';
import type { Transform, TransformStack } from '../types/transforms';

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
          selectedCallNodePath: threadViewOptions.selectedCallNodePath.map(
            mapOldFuncToNewFunc
          ),
          expandedCallNodePaths: new PathSet(
            Array.from(threadViewOptions.expandedCallNodePaths).map(oldPath =>
              oldPath.map(mapOldFuncToNewFunc)
            )
          ),
          selectedMarker: threadViewOptions.selectedMarker,
        };
      });
    }
    case 'CHANGE_SELECTED_CALL_NODE': {
      const { selectedCallNodePath, threadIndex } = action;

      const threadState = state[threadIndex];
      const previousSelectedCallNodePath = threadState.selectedCallNodePath;

      // If the selected node doesn't actually change, let's return the previous
      // state to avoid rerenders.
      if (arePathsEqual(selectedCallNodePath, previousSelectedCallNodePath)) {
        return state;
      }

      let { expandedCallNodePaths } = threadState;

      /* Looking into the current state to know whether we want to generate a
       * new one. It can be expensive to clone when we have a lot of expanded
       * lines, but it's very infrequent that we actually want to expand new
       * lines as a result of a selection. */
      const selectedNodeParentPaths = [];
      for (let i = 1; i < selectedCallNodePath.length; i++) {
        selectedNodeParentPaths.push(selectedCallNodePath.slice(0, i));
      }
      const hasNewExpandedPaths = selectedNodeParentPaths.some(
        path => !expandedCallNodePaths.has(path)
      );

      if (hasNewExpandedPaths) {
        expandedCallNodePaths = new PathSet(expandedCallNodePaths);
        selectedNodeParentPaths.forEach(path =>
          expandedCallNodePaths.add(path)
        );
      }

      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], {
          selectedCallNodePath,
          expandedCallNodePaths,
        }),
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
          return Object.assign({}, viewOptions, {
            selectedCallNodePath,
            expandedCallNodePaths,
          });
        }
        return viewOptions;
      });
    }
    case 'CHANGE_EXPANDED_CALL_NODES': {
      const { threadIndex, expandedCallNodePaths } = action;
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], {
          expandedCallNodePaths: new PathSet(expandedCallNodePaths),
        }),
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'CHANGE_SELECTED_MARKER': {
      const { threadIndex, selectedMarker } = action;
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], { selectedMarker }),
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
        Object.assign({}, state[threadIndex], {
          selectedCallNodePath,
          expandedCallNodePaths,
        }),
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
        Object.assign({}, state[threadIndex], {
          selectedCallNodePath,
          expandedCallNodePaths,
        }),
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

function selection(
  state: ProfileSelection = { hasSelection: false, isModifying: false },
  action: Action
): ProfileSelection {
  // TODO: Rename to timeRangeSelection
  switch (action.type) {
    case 'UPDATE_PROFILE_SELECTION':
      return action.selection;
    default:
      return state;
  }
}

function scrollToSelectionGeneration(state: number = 0, action: Action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
    case 'CHANGE_SELECTED_CALL_NODE':
    case 'CHANGE_SELECTED_THREAD':
    case 'HIDE_THREAD':
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

function tabOrder(state: number[] = [0, 1, 2, 3], action: Action) {
  switch (action.type) {
    case 'CHANGE_TAB_ORDER':
      return action.tabOrder;
    default:
      return state;
  }
}

function rightClickedThread(state: ThreadIndex = 0, action: Action) {
  switch (action.type) {
    case 'CHANGE_RIGHT_CLICKED_THREAD':
      return action.selectedThread;
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

const profileViewReducer: Reducer<ProfileViewState> = combineReducers({
  viewOptions: combineReducers({
    perThread: viewOptionsPerThread,
    symbolicationStatus,
    waitingForLibs,
    selection,
    scrollToSelectionGeneration,
    focusCallTreeGeneration,
    rootRange,
    zeroAt,
    tabOrder,
    rightClickedThread,
    isCallNodeContextMenuVisible,
  }),
  profile,
});
export default profileViewReducer;

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

export const getTabOrder = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.tabOrder
);

export const getDisplayRange = createSelector(
  (state: State) => getProfileViewOptions(state).rootRange,
  (state: State) => getProfileViewOptions(state).zeroAt,
  UrlState.getRangeFilters,
  (rootRange, zeroAt, rangeFilters): StartEndRange => {
    if (rangeFilters.length > 0) {
      let { start, end } = rangeFilters[rangeFilters.length - 1];
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
export const getThreads = (state: State): Thread[] => getProfile(state).threads;
export const getThreadNames = (state: State): string[] =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedThreadIndex = (state: State) =>
  getProfileViewOptions(state).rightClickedThread;
export const getSelection = (state: State) =>
  getProfileViewOptions(state).selection;

export type SelectorsForThread = {
  getThread: State => Thread,
  getViewOptions: State => ThreadViewOptions,
  getTransformStack: State => TransformStack,
  getTransformLabels: State => string[],
  getRangeFilteredThread: State => Thread,
  getRangeAndTransformFilteredThread: State => Thread,
  getJankInstances: State => TracingMarker[],
  getProcessedMarkersThread: State => Thread,
  getTracingMarkers: State => TracingMarker[],
  getMarkerTiming: State => MarkerTimingRows,
  getRangeSelectionFilteredTracingMarkers: State => TracingMarker[],
  getRangeSelectionFilteredTracingMarkersForHeader: State => TracingMarker[],
  getFilteredThread: State => Thread,
  getRangeSelectionFilteredThread: State => Thread,
  getCallNodeInfo: State => CallNodeInfo,
  getCallNodeMaxDepth: State => number,
  getSelectedCallNodePath: State => CallNodePath,
  getSelectedCallNodeIndex: State => IndexIntoCallNodeTable | null,
  getExpandedCallNodePaths: State => PathSet,
  getExpandedCallNodeIndexes: State => Array<IndexIntoCallNodeTable | null>,
  getCallTree: State => CallTree.CallTree,
  getStackTimingByDepth: State => StackTiming.StackTimingByDepth,
  getCallNodeMaxDepthForFlameGraph: State => number,
  getFlameGraphTiming: State => FlameGraph.FlameGraphTiming,
  getFriendlyThreadName: State => string,
  getThreadProcessDetails: State => string,
  getSearchFilteredMarkers: State => MarkersTable,
  unfilteredSamplesRange: State => StartEndRange | null,
};

const selectorsForThreads: { [key: ThreadIndex]: SelectorsForThread } = {};

export const selectorsForThread = (
  threadIndex: ThreadIndex
): SelectorsForThread => {
  if (!(threadIndex in selectorsForThreads)) {
    /**
     * The first per-thread selectors filter out and transform a thread based on user's
     * interactions. The transforms are order dependendent.
     *
     * 1. Unfiltered - The first selector gets the unmodified original thread.
     * 2. Range - New samples table with only samples in range.
     * 3. Transform - Apply the transform stack that modifies the stacks and samples.
     * 4. Implementation - Modify stacks and samples to only show a single implementation.
     * 5. Search - Exclude samples that don't include some text in the stack.
     * 6. Range selection - Only include samples that are within a user's sub-selection.
     */
    const getThread = (state: State): Thread =>
      getProfile(state).threads[threadIndex];
    const getRangeFilteredThread = createSelector(
      getThread,
      getDisplayRange,
      (thread, range): Thread => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );
    const applyTransform = (thread: Thread, transform: Transform) => {
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
            transform.implementation
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
            transform.funcIndex
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
      cache: new WeakTupleMap(),
    });
    const getTransformStack = (state: State): TransformStack =>
      UrlState.getTransformStack(state, threadIndex);
    const getRangeAndTransformFilteredThread = createSelector(
      getRangeFilteredThread,
      getTransformStack,
      (startingThread, transforms): Thread =>
        transforms.reduce(
          // Apply the reducer using an arrow function to ensure correct memoization.
          (thread, transform) => applyTransformMemoized(thread, transform),
          startingThread
        )
    );
    const _getImplementationFilteredThread = createSelector(
      getRangeAndTransformFilteredThread,
      UrlState.getImplementationFilter,
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
      (thread, shouldInvertCallstack): Thread => {
        return shouldInvertCallstack
          ? ProfileData.invertCallstack(thread)
          : thread;
      }
    );
    const getRangeSelectionFilteredThread = createSelector(
      getFilteredThread,
      getSelection,
      (thread, selection): Thread => {
        if (!selection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = selection;
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
      (samples): TracingMarker[] => ProfileData.getJankInstances(samples, 50)
    );
    const getProcessedMarkersThread = createSelector(
      getThread,
      ProfileData.extractMarkerDataFromName
    );
    const getTracingMarkers = createSelector(
      getProcessedMarkersThread,
      ProfileData.getTracingMarkers
    );
    const getMarkerTiming = createSelector(
      getTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getRangeSelectionFilteredTracingMarkers = createSelector(
      getTracingMarkers,
      getDisplayRange,
      (markers, range): TracingMarker[] => {
        const { start, end } = range;
        return ProfileData.filterTracingMarkersToRange(markers, start, end);
      }
    );
    const getRangeSelectionFilteredTracingMarkersForHeader = createSelector(
      getRangeSelectionFilteredTracingMarkers,
      (markers): TracingMarker[] => markers.filter(tm => tm.name !== 'GCMajor')
    );
    const getCallNodeInfo = createSelector(
      getFilteredThread,
      ({ stackTable, frameTable, funcTable }: Thread): CallNodeInfo => {
        return ProfileData.getCallNodeInfo(stackTable, frameTable, funcTable);
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
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
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
      getRangeSelectionFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );
    const getFlameGraphTiming = createSelector(
      getCallTree,
      FlameGraph.getFlameGraphTiming
    );
    const getSearchFilteredMarkers = createSelector(
      getRangeSelectionFilteredThread,
      UrlState.getMarkersSearchString,
      ProfileData.getSearchFilteredMarkers
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
      getProcessedMarkersThread,
      getTracingMarkers,
      getMarkerTiming,
      getRangeSelectionFilteredTracingMarkers,
      getRangeSelectionFilteredTracingMarkersForHeader,
      getFilteredThread,
      getRangeSelectionFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getSelectedCallNodePath,
      getSelectedCallNodeIndex,
      getExpandedCallNodePaths,
      getExpandedCallNodeIndexes,
      getCallTree,
      getStackTimingByDepth,
      getCallNodeMaxDepthForFlameGraph,
      getFlameGraphTiming,
      getFriendlyThreadName,
      getThreadProcessDetails,
      getSearchFilteredMarkers,
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
