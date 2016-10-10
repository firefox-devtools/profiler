import { push } from 'react-router-redux';
import { parseRangeFilters, stringifyRangeFilters } from '../range-filters';

export function waitingForProfileFromAddon() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON',
  };
}

export function receiveProfileFromAddon(profile) {
  return {
    type: 'RECEIVE_PROFILE_FROM_ADDON',
    profile: profile,
  };
}

export function requestingSymbolTable(requestedLib) {
  return {
    type: 'REQUESTING_SYMBOL_TABLE',
    requestedLib,
  };
}

export function receivedSymbolTableReply(requestedLib) {
  return {
    type: 'RECEIVED_SYMBOL_TABLE_REPLY',
    requestedLib,
  };
}

export function startSymbolicating() {
  return {
    type: 'START_SYMBOLICATING',
  };
}

export function doneSymbolicating() {
  return { type: 'DONE_SYMBOLICATING' };
}

export function coalescedFunctionsUpdate(functionsUpdatePerThread) {
  return {
    type: 'COALESCED_FUNCTIONS_UPDATE',
    functionsUpdatePerThread,
  };
}

class ColascedFunctionsUpdateDispatcher {
  constructor() {
    this._requestedAnimationFrame = false;
    this._updates = {};
  }

  _scheduleUpdate(dispatch) {
    if (!this._requestedAnimationFrame) {
      window.requestAnimationFrame(() => this._dispatchUpdate(dispatch));
      this._requestedAnimationFrame = true;
    }
  }

  _dispatchUpdate(dispatch) {
    const updates = this._updates;
    this._updates = {};
    this._requestedAnimationFrame = false;
    dispatch(coalescedFunctionsUpdate(updates));
  }

  mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        oldFuncToNewFuncMap,
        funcIndices: [],
        funcNames: [],
      };
    } else {
      for (const oldFunc of oldFuncToNewFuncMap.keys()) {
        this._updates[threadIndex].oldFuncToNewFuncMap.set(oldFunc, oldFuncToNewFuncMap.get(oldFunc));
      }
    }
  }

  assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames) {
    this._scheduleUpdate(dispatch);
    if (!this._updates[threadIndex]) {
      this._updates[threadIndex] = {
        funcIndices, funcNames,
        oldFuncToNewFuncMap: new Map(),
      };
    } else {
      this._updates[threadIndex].funcIndices = this._updates[threadIndex].funcIndices.concat(funcIndices);
      this._updates[threadIndex].funcNames = this._updates[threadIndex].funcNames.concat(funcNames);
    }
  }
}

const gCoalescedFunctionsUpdateDispatcher = new ColascedFunctionsUpdateDispatcher();

export function mergeFunctions(threadIndex, oldFuncToNewFuncMap) {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.mergeFunctions(dispatch, threadIndex, oldFuncToNewFuncMap);
  };
}

export function assignFunctionNames(threadIndex, funcIndices, funcNames) {
  return dispatch => {
    gCoalescedFunctionsUpdateDispatcher.assignFunctionNames(dispatch, threadIndex, funcIndices, funcNames);
  };
}

export function changeSelectedFuncStack(threadIndex, selectedFuncStack) {
  return {
    type: 'CHANGE_SELECTED_FUNC_STACK',
    selectedFuncStack, threadIndex,
  };
}

export function changeSelectedThread(selectedThread) {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThread,
  };
}

export function changeThreadOrder(threadOrder) {
  return {
    type: 'CHANGE_THREAD_ORDER',
    threadOrder,
  };
}

export function changeExpandedFuncStacks(threadIndex, expandedFuncStacks) {
  return {
    type: 'CHANGE_EXPANDED_FUNC_STACKS',
    threadIndex, expandedFuncStacks,
  };
}

function changeBoolQueryParam(query, paramName, newValue) {
  if ((paramName in query) === newValue) {
    return query;
  }
  const newQuery = Object.assign({}, query);
  if (newValue) {
    newQuery[paramName] = null;
  } else {
    delete newQuery[paramName];
  }
  return newQuery;
}

function changeStringQueryParam(query, paramName, newValue) {
  const shouldRemoveFromQuery = (newValue === '' || newValue === null || newValue === undefined);
  if ((shouldRemoveFromQuery && !(paramName in query)) ||
      (!shouldRemoveFromQuery && query[paramName] === newValue)) {
    return query;
  }
  const newQuery = Object.assign({}, query);
  if (shouldRemoveFromQuery) {
    delete newQuery[paramName];
  } else {
    newQuery[paramName] = newValue;
  }
  return newQuery;
}

function applyBoolQueryParamReducer(query, paramName, reducer, action) {
  const currentValue = (paramName in query);
  return changeBoolQueryParam(query, paramName, reducer(currentValue, action));
}

function applyStringQueryParamReducer(query, paramName, reducer, action) {
  const currentValue = (paramName in query) ? query[paramName] : '';
  return changeStringQueryParam(query, paramName, reducer(currentValue, action));
}

function createQueryReducer(boolParamReducers, stringParamReducers) {
  return (state = {}, action) => {
    let s = state;
    for (const paramName in boolParamReducers) {
      s = applyBoolQueryParamReducer(s, paramName, boolParamReducers[paramName], action);
    }
    for (const paramName in stringParamReducers) {
      s = applyStringQueryParamReducer(s, paramName, stringParamReducers[paramName], action);
    }
    return s;
  };
}

function jsOnlyReducer(state = false, action) {
  switch (action.type) {
    case 'CHANGE_JS_ONLY':
      return action.jsOnly;
    default:
      return state;
  }
}

function invertCallstackReducer(state = false, action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
}

function rangeFiltersReducer(state = '', action) {
  switch (action.type) {
    case 'ADD_RANGE_FILTER': {
      const rangeFilters = parseRangeFilters(state);
      rangeFilters.push({ start: action.start, end: action.end });
      return stringifyRangeFilters(rangeFilters);
    }
    case 'POP_RANGE_FILTERS': {
      const rangeFilters = parseRangeFilters(state);
      return stringifyRangeFilters(rangeFilters.slice(0, action.firstRemovedFilterIndex));
    }
    default:
      return state;
  }
}

export const queryRootReducer = createQueryReducer({
  jsOnly: jsOnlyReducer,
  invertCallstack: invertCallstackReducer,
}, {
  rangeFilters: rangeFiltersReducer,
});

function pushQueryAction(action, { query }) {
  return push({ query: queryRootReducer(query, action) });
}

export function changeJSOnly(jsOnly, location) {
  return pushQueryAction({
    type: 'CHANGE_JS_ONLY',
    jsOnly,
  }, location);
}

export function changeInvertCallstack(invertCallstack, location) {
  return pushQueryAction({
    type: 'CHANGE_INVERT_CALLSTACK',
    invertCallstack,
  }, location);
}

export function updateProfileSelection(selection) {
  return {
    type: 'UPDATE_PROFILE_SELECTION',
    selection,
  };
}

export function addRangeFilter(start, end, location) {
  return pushQueryAction({
    type: 'ADD_RANGE_FILTER',
    start, end,
  }, location);
}

export function addRangeFilterAndUnsetSelection(start, end, location) {
  return dispatch => {
    dispatch(addRangeFilter(start, end, location));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export function popRangeFilters(firstRemovedFilterIndex, location) {
  return pushQueryAction({
    type: 'POP_RANGE_FILTERS',
    firstRemovedFilterIndex,
  }, location);
}

export function popRangeFiltersAndUnsetSelection(firstRemovedFilterIndex, location) {
  return dispatch => {
    dispatch(popRangeFilters(firstRemovedFilterIndex, location));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export { push } from 'react-router-redux';
