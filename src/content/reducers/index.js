import { combineReducers } from 'redux';
import { applyFunctionMerging, setFuncNames, setTaskTracerNames } from '../symbolication';
import { defaultThreadOrder, getTimeRangeIncludingAllThreads } from '../profile-data';

function status(state = 'INITIALIZING', action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
    case 'WAITING_FOR_PROFILE_FROM_WEB':
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'WAITING_FOR_PROFILE';
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return 'DONE';
    default:
      return state;
  }
}

function view(state = 'INITIALIZING', action) {
  switch (action.type) {
    case 'FILE_NOT_FOUND':
      return 'FILE_NOT_FOUND';
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return 'PROFILE';
    default:
      return state;
  }
}

function threadOrder(state = [], action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return defaultThreadOrder(action.profile.threads);
    case 'CHANGE_THREAD_ORDER':
      return action.threadOrder;
    default:
      return state;
  }
}

function removePrefixFromFuncArray(prefixFuncs, funcArray) {
  if (prefixFuncs.length > funcArray.length ||
      prefixFuncs.some((prefixFunc, i) => prefixFunc !== funcArray[i])) {
    return [];
  }
  return funcArray.slice(prefixFuncs.length - 1);
}

function funcStackAfterCallTreeFilter(funcArray, filter) {
  if (filter.type === 'prefix' && !filter.matchJSOnly) {
    return removePrefixFromFuncArray(filter.prefixFuncs, funcArray);
  }
  return funcArray;
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
      return getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
}

function zeroAt(state = 0, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return getTimeRangeIncludingAllThreads(action.profile).start;
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

function summaryView(state = {summary: null, expanded: null}, action) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED': {
      return Object.assign({}, state, { summary: action.summary, expanded: new Set() });
    }
    case 'PROFILE_SUMMARY_EXPAND': {
      const expanded = new Set(state.expanded);
      expanded.add(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
    case 'PROFILE_SUMMARY_COLLAPSE': {
      const expanded = new Set(state.expanded);
      expanded.delete(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
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

const profileView = combineReducers({ viewOptions, profile });

function dataSource(state = 'none', action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'from-file';
    case 'PROFILE_PUBLISHED':
      return 'public';
    default:
      return state;
  }
}

function hash(state = '', action) {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
      return action.hash;
    default:
      return state;
  }
}

function selectedTab(state = 'calltree', action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_TAB':
      return action.selectedTab;
    default:
      return state;
  }
}

function rangeFilters(state = [], action) {
  switch (action.type) {
    case 'ADD_RANGE_FILTER': {
      const { start, end } = action;
      return [...state, { start, end }];
    }
    case 'POP_RANGE_FILTERS':
      return state.slice(0, action.firstRemovedFilterIndex);
    default:
      return state;
  }
}

function selectedThread(state = 0, action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
      return action.selectedThread;
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_FILE': {
      // When loading in a brand new profile, select either the GeckoMain [tab] thread,
      // or the first thread in the thread order. For profiles from the Web, the
      // selectedThread has already been initialized from the URL and does not require
      // looking at the profile.
      const contentThreadId = action.profile.threads.findIndex(thread => {
        return thread.name === 'GeckoMain' && thread.processType === 'tab';
      });
      return contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(action.profile.threads)[0];
    }
    default:
      return state;
  }
}

function callTreeSearchString(state = '', action) {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function callTreeFilters(state = {}, action) {
  switch (action.type) {
    case 'ADD_CALL_TREE_FILTER': {
      const { threadIndex, filter } = action;
      const oldFilters = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: [...oldFilters, filter],
      });
    }
    case 'POP_CALL_TREE_FILTERS': {
      const { threadIndex, firstRemovedFilterIndex } = action;
      const oldFilters = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: oldFilters.slice(0, firstRemovedFilterIndex),
      });
    }
    default:
      return state;
  }
}

function jsOnly(state = false, action) {
  switch (action.type) {
    case 'CHANGE_JS_ONLY':
      return action.jsOnly;
    default:
      return state;
  }
}

function invertCallstack(state = false, action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
}

export const urlState = (regularUrlStateReducer => (state, action) => {
  switch (action.type) {
    case '@@urlenhancer/updateURLState':
      return action.urlState;
    default:
      return regularUrlStateReducer(state, action);
  }
})(combineReducers({
  dataSource, hash, selectedTab, rangeFilters, selectedThread,
  callTreeSearchString, callTreeFilters, jsOnly, invertCallstack,
}));

function isUrlSetupDone(state = false, action) {
  switch (action.type) {
    case '@@urlenhancer/urlSetupDone':
      return true;
    default:
      return state;
  }
}

export default { status, view, profileView, summaryView, urlState, isUrlSetupDone };
