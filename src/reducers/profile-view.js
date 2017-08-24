/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  applyFunctionMerging,
  setFuncNames,
  setTaskTracerNames,
} from '../profile-logic/symbolication';
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import * as Transforms from '../profile-logic/transforms';
import * as URLState from './url-state';
import * as ProfileData from '../profile-logic/profile-data';
import * as StackTiming from '../profile-logic/stack-timing';
import * as MarkerTiming from '../profile-logic/marker-timing';
import * as CallTree from '../profile-logic/call-tree';
import * as TaskTracerTools from '../profile-logic/task-tracer';
import { getCategoryColorStrategy } from './flame-chart';
import uniqWith from 'lodash.uniqwith';

import type {
  Profile,
  Thread,
  ThreadIndex,
  SamplesTable,
  TaskTracer,
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
import type { TransformStack } from '../types/transforms';

function profile(
  state: Profile = ProfileData.getEmptyProfile(),
  action: Action
) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return action.profile;
    case 'COALESCED_FUNCTIONS_UPDATE': {
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
    case 'ASSIGN_TASK_TRACER_NAMES': {
      if (!state.tasktracer.taskTable.length) {
        return state;
      }
      const { addressIndices, symbolNames } = action;
      const tasktracer = setTaskTracerNames(
        state.tasktracer,
        addressIndices,
        symbolNames
      );
      return Object.assign({}, state, { tasktracer });
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

function viewOptionsPerThread(state: ThreadViewOptions[] = [], action: Action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return action.profile.threads.map(() => ({
        selectedCallNodePath: [],
        expandedCallNodePaths: [],
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
        return {
          selectedCallNodePath: threadViewOptions.selectedCallNodePath.map(
            oldFunc => {
              const newFunc = oldFuncToNewFuncMap.get(oldFunc);
              return newFunc === undefined ? oldFunc : newFunc;
            }
          ),
          expandedCallNodePaths: threadViewOptions.expandedCallNodePaths.map(
            oldPath => {
              return oldPath.map(oldFunc => {
                const newFunc = oldFuncToNewFuncMap.get(oldFunc);
                return newFunc === undefined ? oldFunc : newFunc;
              });
            }
          ),
          selectedMarker: threadViewOptions.selectedMarker,
        };
      });
    }
    case 'CHANGE_SELECTED_CALL_NODE': {
      const { selectedCallNodePath, threadIndex } = action;
      const expandedCallNodePaths = state[
        threadIndex
      ].expandedCallNodePaths.slice();
      for (let i = 1; i < selectedCallNodePath.length; i++) {
        expandedCallNodePaths.push(selectedCallNodePath.slice(0, i));
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
    case 'CHANGE_EXPANDED_CALL_NODES': {
      const { threadIndex, expandedCallNodePaths } = action;
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], { expandedCallNodePaths }),
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
      const { threadIndex, transform } = action;
      const expandedCallNodePaths = uniqWith(
        state[threadIndex].expandedCallNodePaths
          .map(path => Transforms.applyTransformToCallNodePath(path, transform))
          .filter(path => path.length > 0),
        Transforms.pathsAreEqual
      );

      const selectedCallNodePath = Transforms.applyTransformToCallNodePath(
        state[threadIndex].selectedCallNodePath,
        transform
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
) {
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
    case 'CHANGE_JS_ONLY':
    case 'CHANGE_SELECTED_CALL_NODE':
    case 'CHANGE_SELECTED_THREAD':
    case 'HIDE_THREAD':
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
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
}

function zeroAt(state: Milliseconds = 0, action: Action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE':
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

const profileViewReducer: Reducer<ProfileViewState> = combineReducers({
  viewOptions: combineReducers({
    perThread: viewOptionsPerThread,
    symbolicationStatus,
    waitingForLibs,
    selection,
    scrollToSelectionGeneration,
    rootRange,
    zeroAt,
    tabOrder,
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

export const getScrollToSelectionGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.scrollToSelectionGeneration
);

export const getZeroAt = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.zeroAt
);

export const getDisplayRange = createSelector(
  (state: State) => getProfileViewOptions(state).rootRange,
  (state: State) => getProfileViewOptions(state).zeroAt,
  URLState.getRangeFilters,
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

export const getTasksByThread = createSelector(
  (state: State) => getProfileTaskTracerData(state).taskTable,
  (state: State) => getProfileTaskTracerData(state).threadTable,
  TaskTracerTools.getTasksByThread
);

/**
 * Profile
 */
export const getProfile = (state: State): Profile =>
  getProfileView(state).profile;
export const getProfileInterval = (state: State): Milliseconds =>
  getProfile(state).meta.interval;
export const getThreads = (state: State): Thread[] => getProfile(state).threads;
export const getThreadNames = (state: State): string[] =>
  getProfile(state).threads.map(t => t.name);
export const getProfileTaskTracerData = (state: State): TaskTracer =>
  getProfile(state).tasktracer;

export type SelectorsForThread = {
  getThread: State => Thread,
  getViewOptions: State => ThreadViewOptions,
  getTransformStack: State => TransformStack,
  getTransformLabels: State => string[],
  getRangeFilteredThread: State => Thread,
  getJankInstances: State => TracingMarker[],
  getTracingMarkers: State => TracingMarker[],
  getMarkerTiming: State => MarkerTimingRows,
  getRangeSelectionFilteredTracingMarkers: State => TracingMarker[],
  getFilteredThread: State => Thread,
  getRangeSelectionFilteredThread: State => Thread,
  getCallNodeInfo: State => CallNodeInfo,
  getSelectedCallNodePath: State => CallNodePath,
  getSelectedCallNodeIndex: State => IndexIntoCallNodeTable | null,
  getExpandedCallNodePaths: State => CallNodePath[],
  getExpandedCallNodeIndexes: State => Array<IndexIntoCallNodeTable | null>,
  getCallTree: State => CallTree.CallTree,
  getFilteredThreadForFlameChart: State => Thread,
  getCallNodeInfoOfFilteredThreadForFlameChart: State => CallNodeInfo,
  getCallNodeMaxDepthForFlameChart: State => number,
  getStackTimingByDepthForFlameChart: State => StackTiming.StackTimingByDepth,
  getLeafCategoryStackTimingForFlameChart: State => StackTiming.StackTimingByDepth,
  getFriendlyThreadName: State => string,
  getThreadProcessDetails: State => string,
  getSearchFilteredMarkers: State => MarkersTable,
};

const selectorsForThreads: { [key: ThreadIndex]: SelectorsForThread } = {};

export const selectorsForThread = (
  threadIndex: ThreadIndex
): SelectorsForThread => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = (state: State): Thread =>
      getProfile(state).threads[threadIndex];
    const getViewOptions = (state: State): ThreadViewOptions =>
      getProfileViewOptions(state).perThread[threadIndex];
    const getTransformStack = (state: State): TransformStack =>
      URLState.getTransformStack(state, threadIndex);
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
      getThread,
      getFriendlyThreadName,
      getTransformStack,
      Transforms.getTransformLabels
    );
    const getRangeFilteredThread = createSelector(
      getThread,
      getDisplayRange,
      (thread, range): Thread => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );
    const _getRangeFilteredThreadSamples = createSelector(
      getRangeFilteredThread,
      (thread): SamplesTable => thread.samples
    );
    const getJankInstances = createSelector(
      _getRangeFilteredThreadSamples,
      (samples): TracingMarker[] => ProfileData.getJankInstances(samples, 50)
    );
    const getTracingMarkers = createSelector(
      getThread,
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
    const _getRangeAndTransformFilteredThread = createSelector(
      getRangeFilteredThread,
      getTransformStack,
      (startingThread, transforms): Thread => {
        const result = transforms.reduce((thread, transform) => {
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
            case 'merge-subtree':
              // TODO - Implement this transform.
              return thread;
            case 'merge-call-node':
              return transform.inverted
                ? Transforms.mergeInvertedCallNode(
                    thread,
                    transform.callNodePath,
                    transform.implementation
                  )
                : Transforms.mergeCallNode(
                    thread,
                    transform.callNodePath,
                    transform.implementation
                  );
            case 'merge-function':
              return Transforms.mergeFunction(thread, transform.funcIndex);
            default:
              throw new Error('Unhandled transform.');
          }
        }, startingThread);
        return result;
      }
    );
    const _getImplementationFilteredThread = createSelector(
      _getRangeAndTransformFilteredThread,
      URLState.getImplementationFilter,
      ProfileData.filterThreadByImplementation
    );
    const _getImplementationAndSearchFilteredThread = createSelector(
      _getImplementationFilteredThread,
      URLState.getSearchString,
      (thread, searchString): Thread => {
        return ProfileData.filterThreadToSearchString(thread, searchString);
      }
    );
    const getFilteredThread = createSelector(
      _getImplementationAndSearchFilteredThread,
      URLState.getInvertCallstack,
      (thread, shouldInvertCallstack): Thread => {
        return shouldInvertCallstack
          ? ProfileData.invertCallstack(thread)
          : thread;
      }
    );
    const getRangeSelectionFilteredThread = createSelector(
      getFilteredThread,
      getProfileViewOptions,
      (thread, viewOptions): Thread => {
        if (!viewOptions.selection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = viewOptions.selection;
        return ProfileData.filterThreadToRange(
          thread,
          selectionStart,
          selectionEnd
        );
      }
    );
    const getCallNodeInfo = createSelector(
      getFilteredThread,
      ({ stackTable, frameTable, funcTable }: Thread): CallNodeInfo => {
        return ProfileData.getCallNodeInfo(stackTable, frameTable, funcTable);
      }
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
        return ProfileData.getCallNodeFromPath(
          callNodePath,
          callNodeInfo.callNodeTable
        );
      }
    );
    const getExpandedCallNodePaths = createSelector(
      getViewOptions,
      (threadViewOptions): Array<CallNodePath> =>
        threadViewOptions.expandedCallNodePaths
    );
    const getExpandedCallNodeIndexes = createSelector(
      getCallNodeInfo,
      getExpandedCallNodePaths,
      (callNodeInfo, callNodePaths): (IndexIntoCallNodeTable | null)[] => {
        return callNodePaths.map(callNodePath =>
          ProfileData.getCallNodeFromPath(
            callNodePath,
            callNodeInfo.callNodeTable
          )
        );
      }
    );
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      URLState.getImplementationFilter,
      URLState.getInvertCallstack,
      CallTree.getCallTree
    );

    // The selectors below diverge from the thread filtering that's done above;
    // they respect the "hidePlatformDetails" setting instead of the "jsOnly"
    // setting. This type of filtering is needed for the flame chart.
    // This divergence is hopefully temporary, as we figure out how to filter
    // out unneeded detail from stacks in a way that satisfy both the flame
    // chart and the call tree.
    const getFilteredThreadForFlameChart = createSelector(
      getRangeFilteredThread,
      URLState.getHidePlatformDetails,
      URLState.getInvertCallstack,
      URLState.getSearchString,
      (
        thread: Thread,
        shouldHidePlatformDetails: boolean,
        shouldInvertCallstack: boolean,
        searchString: string
      ): Thread => {
        // Unlike for the call tree filtered profile, the individual steps of
        // this filtering are not memoized. I hope it's not too bad.
        let filteredThread = thread;
        filteredThread = ProfileData.filterThreadToSearchString(
          filteredThread,
          searchString
        );
        if (shouldHidePlatformDetails) {
          filteredThread = ProfileData.collapsePlatformStackFrames(
            filteredThread
          );
        }
        if (shouldInvertCallstack) {
          filteredThread = ProfileData.invertCallstack(filteredThread);
        }
        return filteredThread;
      }
    );
    const getCallNodeInfoOfFilteredThreadForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      ({ stackTable, frameTable, funcTable }): CallNodeInfo => {
        return ProfileData.getCallNodeInfo(stackTable, frameTable, funcTable);
      }
    );
    const getCallNodeMaxDepthForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getCallNodeInfoOfFilteredThreadForFlameChart,
      StackTiming.computeCallNodeMaxDepth
    );
    const getStackTimingByDepthForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getCallNodeInfoOfFilteredThreadForFlameChart,
      getCallNodeMaxDepthForFlameChart,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getLeafCategoryStackTimingForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getProfileInterval,
      getCategoryColorStrategy,
      StackTiming.getLeafCategoryStackTiming
    );
    const getSearchFilteredMarkers = createSelector(
      getRangeSelectionFilteredThread,
      URLState.getMarkersSearchString,
      ProfileData.getSearchFilteredMarkers
    );

    selectorsForThreads[threadIndex] = {
      getThread,
      getViewOptions,
      getTransformStack,
      getTransformLabels,
      getRangeFilteredThread,
      getJankInstances,
      getTracingMarkers,
      getMarkerTiming,
      getRangeSelectionFilteredTracingMarkers,
      getFilteredThread,
      getRangeSelectionFilteredThread,
      getCallNodeInfo,
      getSelectedCallNodePath,
      getSelectedCallNodeIndex,
      getExpandedCallNodePaths,
      getExpandedCallNodeIndexes,
      getCallTree,
      getFilteredThreadForFlameChart,
      getCallNodeInfoOfFilteredThreadForFlameChart,
      getCallNodeMaxDepthForFlameChart,
      getStackTimingByDepthForFlameChart,
      getLeafCategoryStackTimingForFlameChart,
      getFriendlyThreadName,
      getThreadProcessDetails,
      getSearchFilteredMarkers,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors: SelectorsForThread = (() => {
  const anyThreadSelectors: SelectorsForThread = selectorsForThread(0);
  const result: { [key: string]: (State) => any } = {};
  for (const key in anyThreadSelectors) {
    result[key] = (state: State) =>
      selectorsForThread(URLState.getSelectedThreadIndex(state))[key](state);
  }
  const result2: SelectorsForThread = result;
  return result2;
})();
