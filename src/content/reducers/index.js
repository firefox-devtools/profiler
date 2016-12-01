import { combineReducers } from 'redux';
import { applyFunctionMerging, setFuncNames, setTaskTracerNames } from '../symbolication';
import { defaultThreadOrder, getTimeRangeIncludingAllThreads } from '../profile-data';

function status(state = 'INITIALIZING', action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return 'WAITING_FOR_PROFILE';
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return 'DONE';
    default:
      return state;
  }
}

function view(state = 'INITIALIZING', action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return 'PROFILE';
    default:
      return state;
  }
}

function threadOrder(state = [], action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return defaultThreadOrder(action.profile.threads);
    case 'CHANGE_THREAD_ORDER':
      return action.threadOrder;
    default:
      return state;
  }
}

function selectedThread(state = 0, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON': {
      const contentThreadId = action.profile.threads.findIndex(thread => thread.name === 'Content');
      return contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(action.profile.threads)[0];
    }
    case 'CHANGE_SELECTED_THREAD':
      return action.selectedThread;
    default:
      return state;
  }
}

function viewOptionsThreads(state = [], action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return action.profile.threads.map(() => ({
        selectedFuncStack: [],
        expandedFuncStacks: [],
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
        return { selectedFuncStack, expandedFuncStacks };
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
      return getTimeRangeIncludingAllThreads(action.profile);
    default:
      return state;
  }
}

function zeroAt(state = 0, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return getTimeRangeIncludingAllThreads(action.profile).start;
    default:
      return state;
  }
}

function profile(state = {}, action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
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

function summaryView (state = {summary: null, expanded: null}, action) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED': {
      return Object.assign({}, state, { summary: action.summary, expanded: new Set() });
    }
    case 'PROFILE_SUMMARY_EXPAND': {
      const expanded = new Set(state.expanded);
      expanded.add(action.threadName);
      return Object.assign({}, state, { expanded });
    }
    case 'PROFILE_SUMMARY_COLLAPSE': {
      const expanded = new Set(state.expanded);
      expanded.delete(action.threadName);
      return Object.assign({}, state, { expanded });
    }
    default:
      return state;
  }
}

const viewOptions = combineReducers({
  threads: viewOptionsThreads,
  threadOrder, selectedThread, symbolicationStatus, waitingForLibs,
  selection, scrollToSelectionGeneration, rootRange, zeroAt,
});

const profileView = combineReducers({ viewOptions, profile });

export default { status, view, profileView, summaryView };
