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
import * as CallTreeFilters from '../profile-logic/call-tree-filters';
import * as URLState from './url-state';
import * as ProfileData from '../profile-logic/profile-data';
import * as StackTiming from '../profile-logic/stack-timing';
import * as MarkerTiming from '../profile-logic/marker-timing';
import * as ProfileTree from '../profile-logic/profile-tree';
import * as TaskTracerTools from '../profile-logic/task-tracer';
import { getCategoryColorStrategy } from './flame-chart';

import type {
  Profile,
  Thread,
  ThreadIndex,
  IndexIntoFuncTable,
  SamplesTable,
  TaskTracer,
} from '../types/profile';
import type {
  TracingMarker,
  FuncStackInfo,
  IndexIntoFuncStackTable,
  MarkerTimingRows,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type {
  Action,
  CallTreeFilter,
  ProfileSelection,
} from '../types/actions';
import type {
  State,
  Reducer,
  ProfileViewState,
  RequestedLib,
  SymbolicationStatus,
  ThreadViewOptions,
} from '../types/reducers';

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

function funcStackAfterCallTreeFilter(
  funcArray: IndexIntoFuncTable[],
  filter: CallTreeFilter
) {
  if (filter.type === 'prefix' && !filter.matchJSOnly) {
    return removePrefixFromFuncArray(filter.prefixFuncs, funcArray);
  }
  return funcArray;
}

function removePrefixFromFuncArray(
  prefixFuncs: IndexIntoFuncTable[],
  funcArray: IndexIntoFuncTable[]
) {
  if (
    prefixFuncs.length > funcArray.length ||
    prefixFuncs.some((prefixFunc, i) => prefixFunc !== funcArray[i])
  ) {
    return [];
  }
  return funcArray.slice(prefixFuncs.length - 1);
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
        selectedFuncStack: [],
        expandedFuncStacks: [],
        selectedMarker: -1,
      }));
    case 'COALESCED_FUNCTIONS_UPDATE': {
      const { functionsUpdatePerThread } = action;
      // For each thread, apply oldFuncToNewFuncMap to that thread's
      // selectedFuncStack and expandedFuncStacks.
      return state.map((threadViewOptions, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return threadViewOptions;
        }
        const { oldFuncToNewFuncMap } = functionsUpdatePerThread[threadIndex];
        return {
          selectedFuncStack: threadViewOptions.selectedFuncStack.map(
            oldFunc => {
              const newFunc = oldFuncToNewFuncMap.get(oldFunc);
              return newFunc === undefined ? oldFunc : newFunc;
            }
          ),
          expandedFuncStacks: threadViewOptions.expandedFuncStacks.map(
            oldFuncArray => {
              return oldFuncArray.map(oldFunc => {
                const newFunc = oldFuncToNewFuncMap.get(oldFunc);
                return newFunc === undefined ? oldFunc : newFunc;
              });
            }
          ),
          selectedMarker: threadViewOptions.selectedMarker,
        };
      });
    }
    case 'CHANGE_SELECTED_FUNC_STACK': {
      const { selectedFuncStack, threadIndex } = action;
      const expandedFuncStacks = state[threadIndex].expandedFuncStacks.slice();
      for (let i = 1; i < selectedFuncStack.length; i++) {
        expandedFuncStacks.push(selectedFuncStack.slice(0, i));
      }
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], {
          selectedFuncStack,
          expandedFuncStacks,
        }),
        ...state.slice(threadIndex + 1),
      ];
    }
    case 'CHANGE_EXPANDED_FUNC_STACKS': {
      const { threadIndex, expandedFuncStacks } = action;
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], { expandedFuncStacks }),
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
    case 'ADD_CALL_TREE_FILTER': {
      const { threadIndex, filter } = action;
      const expandedFuncStacks = state[threadIndex].expandedFuncStacks.map(fs =>
        funcStackAfterCallTreeFilter(fs, filter)
      );
      const selectedFuncStack = funcStackAfterCallTreeFilter(
        state[threadIndex].selectedFuncStack,
        filter
      );
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], {
          selectedFuncStack,
          expandedFuncStacks,
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
    case 'CHANGE_SELECTED_FUNC_STACK':
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

function tabOrder(state: number[] = [0, 1, 2, 3, 4, 5], action: Action) {
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
  getCallTreeFilters: State => CallTreeFilter[],
  getCallTreeFilterLabels: State => string[],
  getRangeFilteredThread: State => Thread,
  getJankInstances: State => TracingMarker[],
  getTracingMarkers: State => TracingMarker[],
  getMarkerTiming: State => MarkerTimingRows,
  getRangeSelectionFilteredTracingMarkers: State => TracingMarker[],
  getFilteredThread: State => Thread,
  getRangeSelectionFilteredThread: State => Thread,
  getFuncStackInfo: State => FuncStackInfo,
  getSelectedFuncStack: State => IndexIntoFuncStackTable | null,
  getExpandedFuncStacks: State => Array<IndexIntoFuncStackTable | null>,
  getCallTree: State => ProfileTree.ProfileTreeClass,
  getFilteredThreadForFlameChart: State => Thread,
  getFuncStackInfoOfFilteredThreadForFlameChart: State => FuncStackInfo,
  getFuncStackMaxDepthForFlameChart: State => number,
  getStackTimingByDepthForFlameChart: State => StackTiming.StackTimingByDepth,
  getLeafCategoryStackTimingForFlameChart: State => StackTiming.StackTimingByDepth,
  getFriendlyThreadName: State => string,
  getThreadProcessDetails: State => string,
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
    const getCallTreeFilters = (state: State): CallTreeFilter[] =>
      URLState.getCallTreeFilters(state, threadIndex);
    const getFriendlyThreadName = createSelector(
      getThreads,
      getThread,
      ProfileData.getFriendlyThreadName
    );
    const getThreadProcessDetails = createSelector(
      getThread,
      ProfileData.getThreadProcessDetails
    );
    const getCallTreeFilterLabels: (state: State) => string[] = createSelector(
      getThread,
      getFriendlyThreadName,
      getCallTreeFilters,
      CallTreeFilters.getCallTreeFilterLabels
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
      getFriendlyThreadName,
      (samples, threadName): TracingMarker[] =>
        ProfileData.getJankInstances(samples, threadName, 50)
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
    const _getRangeAndCallTreeFilteredThread = createSelector(
      getRangeFilteredThread,
      getCallTreeFilters,
      (thread, callTreeFilters): Thread => {
        const result = callTreeFilters.reduce((t, filter) => {
          switch (filter.type) {
            case 'prefix':
              return ProfileData.filterThreadToPrefixStack(
                t,
                filter.prefixFuncs,
                filter.matchJSOnly
              );
            case 'postfix':
              return ProfileData.filterThreadToPostfixStack(
                t,
                filter.postfixFuncs,
                filter.matchJSOnly
              );
            default:
              throw new Error('unhandled call tree filter');
          }
        }, thread);
        return result;
      }
    );
    const _getImplementationFilteredThread = createSelector(
      _getRangeAndCallTreeFilteredThread,
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
    const getFuncStackInfo = createSelector(
      getFilteredThread,
      ({ stackTable, frameTable, funcTable }: Thread): FuncStackInfo => {
        return ProfileData.getFuncStackInfo(stackTable, frameTable, funcTable);
      }
    );
    const _getSelectedFuncStackAsFuncArray = createSelector(
      getViewOptions,
      (threadViewOptions): IndexIntoFuncTable[] =>
        threadViewOptions.selectedFuncStack
    );
    const getSelectedFuncStack = createSelector(
      getFuncStackInfo,
      _getSelectedFuncStackAsFuncArray,
      (funcStackInfo, funcArray): IndexIntoFuncStackTable | null => {
        return ProfileData.getFuncStackFromFuncArray(
          funcArray,
          funcStackInfo.funcStackTable
        );
      }
    );
    const _getExpandedFuncStacksAsFuncArrays = createSelector(
      getViewOptions,
      (threadViewOptions): Array<IndexIntoFuncTable[]> =>
        threadViewOptions.expandedFuncStacks
    );
    const getExpandedFuncStacks = createSelector(
      getFuncStackInfo,
      _getExpandedFuncStacksAsFuncArrays,
      (funcStackInfo, funcArrays): (IndexIntoFuncStackTable | null)[] => {
        return funcArrays.map(funcArray =>
          ProfileData.getFuncStackFromFuncArray(
            funcArray,
            funcStackInfo.funcStackTable
          )
        );
      }
    );
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getFuncStackInfo,
      URLState.getImplementationFilter,
      URLState.getInvertCallstack,
      ProfileTree.getCallTree
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
    const getFuncStackInfoOfFilteredThreadForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      ({ stackTable, frameTable, funcTable }): FuncStackInfo => {
        return ProfileData.getFuncStackInfo(stackTable, frameTable, funcTable);
      }
    );
    const getFuncStackMaxDepthForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getFuncStackInfoOfFilteredThreadForFlameChart,
      StackTiming.computeFuncStackMaxDepth
    );
    const getStackTimingByDepthForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getFuncStackInfoOfFilteredThreadForFlameChart,
      getFuncStackMaxDepthForFlameChart,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getLeafCategoryStackTimingForFlameChart = createSelector(
      getFilteredThreadForFlameChart,
      getProfileInterval,
      getCategoryColorStrategy,
      StackTiming.getLeafCategoryStackTiming
    );

    selectorsForThreads[threadIndex] = {
      getThread,
      getViewOptions,
      getCallTreeFilters,
      getCallTreeFilterLabels,
      getRangeFilteredThread,
      getJankInstances,
      getTracingMarkers,
      getMarkerTiming,
      getRangeSelectionFilteredTracingMarkers,
      getFilteredThread,
      getRangeSelectionFilteredThread,
      getFuncStackInfo,
      getSelectedFuncStack,
      getExpandedFuncStacks,
      getCallTree,
      getFilteredThreadForFlameChart,
      getFuncStackInfoOfFilteredThreadForFlameChart,
      getFuncStackMaxDepthForFlameChart,
      getStackTimingByDepthForFlameChart,
      getLeafCategoryStackTimingForFlameChart,
      getFriendlyThreadName,
      getThreadProcessDetails,
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
