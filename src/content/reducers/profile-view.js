import { applyFunctionMerging, setFuncNames, setTaskTracerNames } from '../symbolication';
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import * as URLState from './url-state';
import * as ProfileData from '../profile-data';
import * as StackTiming from '../stack-timing';
import * as ProfileTree from '../profile-tree';
import * as TaskTracer from '../task-tracer';

function profile(state = {}, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return action.profile;
    case 'COALESCED_FUNCTIONS_UPDATE': {
      const { functionsUpdatePerThread } = action;
      const threads = state.threads.map((thread, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return thread;
        }
        const { oldFuncToNewFuncMap, funcIndices, funcNames } = functionsUpdatePerThread[threadIndex];
        return setFuncNames(applyFunctionMerging(thread, oldFuncToNewFuncMap),
                            funcIndices, funcNames);
      });
      return Object.assign({}, state, { threads });
    }
    case 'ASSIGN_TASK_TRACER_NAMES': {
      const { addressIndices, symbolNames } = action;
      const tasktracer = setTaskTracerNames(state.tasktracer, addressIndices, symbolNames);
      return Object.assign({}, state, { tasktracer });
    }
    default:
      return state;
  }
}

function funcStackAfterCallTreeFilter(funcArray, filter) {
  if (filter.type === 'prefix' && !filter.matchJSOnly) {
    return removePrefixFromFuncArray(filter.prefixFuncs, funcArray);
  }
  return funcArray;
}

function removePrefixFromFuncArray(prefixFuncs, funcArray) {
  if (prefixFuncs.length > funcArray.length ||
      prefixFuncs.some((prefixFunc, i) => prefixFunc !== funcArray[i])) {
    return [];
  }
  return funcArray.slice(prefixFuncs.length - 1);
}

function threadOrder(state = [], action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return ProfileData.defaultThreadOrder(action.profile.threads);
    case 'CHANGE_THREAD_ORDER':
      return action.threadOrder;
    default:
      return state;
  }
}

function symbolicationStatus(state = 'DONE', action) {
  switch (action.type) {
    case 'START_SYMBOLICATING':
      return 'SYMBOLICATING';
    case 'DONE_SYMBOLICATING':
      return 'DONE';
    default:
      return state;
  }
}

function viewOptionsThreads(state = [], action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
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
      return state.map((thread, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return thread;
        }
        const { oldFuncToNewFuncMap } = functionsUpdatePerThread[threadIndex];
        const selectedFuncStack = thread.selectedFuncStack.map(oldFunc => {
          const newFunc = oldFuncToNewFuncMap.get(oldFunc);
          return newFunc === undefined ? oldFunc : newFunc;
        });
        const expandedFuncStacks = thread.expandedFuncStacks.map(oldFuncArray => {
          return oldFuncArray.map(oldFunc => {
            const newFunc = oldFuncToNewFuncMap.get(oldFunc);
            return newFunc === undefined ? oldFunc : newFunc;
          });
        });
        return {
          selectedFuncStack,
          expandedFuncStacks,
          selectedMarker: thread.selectedMarker,
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
        Object.assign({}, state[threadIndex], { selectedFuncStack, expandedFuncStacks }),
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
      const expandedFuncStacks = state[threadIndex].expandedFuncStacks.map(fs => funcStackAfterCallTreeFilter(fs, filter));
      const selectedFuncStack = funcStackAfterCallTreeFilter(state[threadIndex].selectedFuncStack, filter);
      return [
        ...state.slice(0, threadIndex),
        Object.assign({}, state[threadIndex], { selectedFuncStack, expandedFuncStacks }),
        ...state.slice(threadIndex + 1),
      ];
    }
    default:
      return state;
  }
}

function waitingForLibs(state = new Set(), action) {
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

function selection(state = { hasSelection: false, isModifying: false }, action) { // TODO: Rename to timeRangeSelection
  switch (action.type) {
    case 'UPDATE_PROFILE_SELECTION':
      return action.selection;
    default:
      return state;
  }
}

function scrollToSelectionGeneration(state = 0, action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
    case 'CHANGE_JS_ONLY':
    case 'CHANGE_SELECTED_FUNC_STACK':
    case 'CHANGE_SELECTED_THREAD':
      return state + 1;
    default:
      return state;
  }
}

function rootRange(state = { start: 0, end: 1 }, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
}

function zeroAt(state = 0, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return ProfileData.getTimeRangeIncludingAllThreads(action.profile).start;
    default:
      return state;
  }
}

function tabOrder(state = [0, 1, 2, 3, 4, 5], action) {
  switch (action.type) {
    case 'CHANGE_TAB_ORDER':
      return action.tabOrder;
    default:
      return state;
  }
}

const viewOptions = combineReducers({
  threads: viewOptionsThreads,
  threadOrder, symbolicationStatus, waitingForLibs,
  selection, scrollToSelectionGeneration, rootRange, zeroAt,
  tabOrder,
});

export default combineReducers({ viewOptions, profile });

export const getProfileView = state => state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions = state => getProfileView(state).viewOptions;

export const getScrollToSelectionGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.scrollToSelectionGeneration
);

export const getZeroAt = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.zeroAt
);

export const getThreadOrder = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.threadOrder
);

export const getDisplayRange = createSelector(
  state => getProfileViewOptions(state).rootRange,
  state => getProfileViewOptions(state).zeroAt,
  URLState.getRangeFilters,
  (rootRange, zeroAt, rangeFilters) => {
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
  state => getProfileTaskTracerData(state).taskTable,
  state => getProfileTaskTracerData(state).threadTable,
  TaskTracer.getTasksByThread
);

/**
 * Profile
 */
export const getProfile = state => getProfileView(state).profile;
export const getProfileInterval = state => getProfile(state).meta.interval;
export const getThreadNames = state => getProfile(state).threads.map(t => t.name);
export const getProfileTaskTracerData = state => getProfile(state).tasktracer;

const selectorsForThreads = {};

export const selectorsForThread = threadIndex => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = state => getProfile(state).threads[threadIndex];
    const getViewOptions = state => getProfileViewOptions(state).threads[threadIndex];
    const getCallTreeFilters = state => URLState.getCallTreeFilters(state, threadIndex);
    const getRangeFilteredThread = createSelector(
      getThread,
      getDisplayRange,
      (thread, range) => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );
    const getRangeFilteredThreadSamples = createSelector(
      getRangeFilteredThread,
      thread => thread.samples
    );
    const getRangeFilteredThreadMarkers = createSelector(
      getRangeFilteredThread,
      thread => thread.markers
    );
    const getJankInstances = createSelector(
      getRangeFilteredThreadSamples,
      state => getThread(state).processType,
      (samples, processType) => ProfileData.getJankInstances(samples, processType, 50)
    );
    const getTracingMarkers = createSelector(
      getThread,
      getRangeFilteredThreadMarkers,
      (thread, markers) => ProfileData.getTracingMarkers(thread, markers)
    );
    const getRangeAndCallTreeFilteredThread = createSelector(
      getRangeFilteredThread,
      getCallTreeFilters,
      (thread, callTreeFilters) => {
        const result = callTreeFilters.reduce((t, filter) => {
          switch (filter.type) {
            case 'prefix':
              return ProfileData.filterThreadToPrefixStack(t, filter.prefixFuncs, filter.matchJSOnly);
            case 'postfix':
              return ProfileData.filterThreadToPostfixStack(t, filter.postfixFuncs, filter.matchJSOnly);
            default:
              throw new Error('unhandled call tree filter');
          }
        }, thread);
        return result;
      }
    );
    const getJSOnlyFilteredThread = createSelector(
      getRangeAndCallTreeFilteredThread,
      URLState.getJSOnly,
      (thread, jsOnly) => {
        return jsOnly ? ProfileData.filterThreadToJSOnly(thread) : thread;
      }
    );
    const getJSOnlyAndSearchFilteredThread = createSelector(
      getJSOnlyFilteredThread,
      URLState.getSearchString,
      (thread, searchString) => {
        return ProfileData.filterThreadToSearchString(thread, searchString);
      }
    );
    const getFilteredThread = createSelector(
      getJSOnlyAndSearchFilteredThread,
      URLState.getInvertCallstack,
      (thread, shouldInvertCallstack) => {
        return shouldInvertCallstack ? ProfileData.invertCallstack(thread) : thread;
      }
    );
    const getRangeSelectionFilteredThread = createSelector(
      getFilteredThread,
      getProfileViewOptions,
      (thread, viewOptions) => {
        if (!viewOptions.selection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = viewOptions.selection;
        return ProfileData.filterThreadToRange(thread, selectionStart, selectionEnd);
      }
    );
    const getFuncStackInfo = createSelector(
      getFilteredThread,
      ({stackTable, frameTable, funcTable}) => {
        return ProfileData.getFuncStackInfo(stackTable, frameTable, funcTable);
      }
    );
    const getSelectedFuncStackAsFuncArray = createSelector(
      getViewOptions,
      threadViewOptions => threadViewOptions.selectedFuncStack
    );
    const getSelectedFuncStack = createSelector(
      getFuncStackInfo,
      getSelectedFuncStackAsFuncArray,
      (funcStackInfo, funcArray) => {
        return ProfileData.getFuncStackFromFuncArray(funcArray, funcStackInfo.funcStackTable);
      }
    );
    const getExpandedFuncStacksAsFuncArrays = createSelector(
      getViewOptions,
      threadViewOptions => threadViewOptions.expandedFuncStacks
    );
    const getExpandedFuncStacks = createSelector(
      getFuncStackInfo,
      getExpandedFuncStacksAsFuncArrays,
      (funcStackInfo, funcArrays) => {
        return funcArrays.map(funcArray => ProfileData.getFuncStackFromFuncArray(funcArray, funcStackInfo.funcStackTable));
      }
    );
    const getFuncStackMaxDepth = createSelector(
      getFilteredThread,
      getFuncStackInfo,
      StackTiming.computeFuncStackMaxDepth
    );
    const getStackTimingByDepth = createSelector(
      getFilteredThread,
      getFuncStackInfo,
      getFuncStackMaxDepth,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getFuncStackInfo,
      URLState.getJSOnly,
      ProfileTree.getCallTree
    );
    selectorsForThreads[threadIndex] = {
      getThread,
      getRangeFilteredThread,
      getViewOptions,
      getCallTreeFilters,
      getFilteredThread,
      getJankInstances,
      getTracingMarkers,
      getRangeSelectionFilteredThread,
      getFuncStackInfo,
      getSelectedFuncStack,
      getExpandedFuncStacks,
      getFuncStackMaxDepth,
      getStackTimingByDepth,
      getCallTree,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors = (() => {
  const anyThreadSelectors = selectorsForThread(0);
  const result = {};
  for (const key in anyThreadSelectors) {
    result[key] = state => selectorsForThread(URLState.getSelectedThreadIndex(state))[key](state);
  }
  return result;
})();
