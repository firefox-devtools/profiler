import { push, replace } from 'react-router-redux';
import { parseRangeFilters, stringifyRangeFilters } from '../range-filters';
import { preprocessProfile, unserializeProfile } from '../preprocess-profile';
import { defaultThreadOrder, getTimeRangeIncludingAllThreads } from '../profile-data';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';

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

export function assignTaskTracerNames(addressIndices, symbolNames) {
  return {
    type: 'ASSIGN_TASK_TRACER_NAMES',
    addressIndices, symbolNames,
  };
}

export function retrieveProfileFromAddon() {
  return dispatch => {
    dispatch(waitingForProfileFromAddon());

    // XXX use Promise.race with a 5 second timeout promise to show an error message
    window.geckoProfilerPromise.then(geckoProfiler => {
      // XXX update state to show that we're connected to the profiler addon
      geckoProfiler.getProfile().then(rawProfile => {
        const profile = preprocessProfile(rawProfile);

        if (!('thread' in location.query)) {
          let contentThreadId = profile.threads.findIndex(thread => thread.name === 'Content');
          contentThreadId = contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(profile.threads)[0];
          dispatch(replaceQueryAction({
            type: 'CHANGE_SELECTED_THREAD',
            selectedThread: contentThreadId,
          }, location));
        }


        dispatch(receiveProfileFromAddon(profile));

        const symbolStore = new SymbolStore('cleopatra-async-storage', {
          requestSymbolTable: (pdbName, breakpadId) => {
            const requestedLib = { pdbName, breakpadId };
            dispatch(requestingSymbolTable(requestedLib));
            return geckoProfiler.getSymbolTable(pdbName, breakpadId).then(symbolTable => {
              dispatch(receivedSymbolTableReply(requestedLib));
              return symbolTable;
            }, error => {
              dispatch(receivedSymbolTableReply(requestedLib));
              throw error;
            });
          },
        });

        dispatch(startSymbolicating());
        symbolicateProfile(profile, symbolStore, {
          onMergeFunctions: (threadIndex, oldFuncToNewFuncMap) => {
            dispatch(mergeFunctions(threadIndex, oldFuncToNewFuncMap));
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
            dispatch(assignFunctionNames(threadIndex, funcIndices, funcNames));
          },
          onGotTaskTracerNames: (addressIndices, symbolNames) => {
            dispatch(assignTaskTracerNames(addressIndices, symbolNames));
          },
        }).then(() => dispatch(doneSymbolicating()));
      });
    });
  };
}

export function waitingForProfileFromWeb() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_WEB',
  };
}

export function receiveProfileFromWeb(profile) {
  return {
    type: 'RECEIVE_PROFILE_FROM_WEB',
    profile,
  };
}

export function errorReceivingProfileFromWeb(error) {
  return {
    type: 'ERROR_RECEIVING_PROFILE_FROM_WEB',
    error,
  };
}

export function retrieveProfileFromWeb(hash, location) {
  return dispatch => {
    dispatch(waitingForProfileFromWeb());

    fetch(`https://profile-store.commondatastorage.googleapis.com/${hash}`).then(response => response.text()).then(text => {
      const profile = unserializeProfile(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }

      let queryActions = [];
      if (!('thread' in location.query)) {
        let contentThreadId = profile.threads.findIndex(thread => thread.name === 'Content');
        contentThreadId = contentThreadId !== -1 ? contentThreadId : defaultThreadOrder(profile.threads)[0];
        queryActions.push({
          type: 'CHANGE_SELECTED_THREAD',
          selectedThread: contentThreadId,
        });
      }

      if (window.legacyRangeFilters) {
        const zeroAt = getTimeRangeIncludingAllThreads(profile).start;
        queryActions = queryActions.concat(window.legacyRangeFilters.map(
          ({ start, end }) => ({
            type: 'ADD_RANGE_FILTER',
            filter: { start: start - zeroAt, end: end - zeroAt },
          })
        ));
      }

      dispatch(replaceQueryActions(queryActions, location));
      dispatch(receiveProfileFromWeb(profile));

    }).catch(error => {
      dispatch(errorReceivingProfileFromWeb(error));
    });
  };
}

export function changeSelectedFuncStack(threadIndex, selectedFuncStack) {
  return {
    type: 'CHANGE_SELECTED_FUNC_STACK',
    selectedFuncStack, threadIndex,
  };
}

export function changeSelectedThread(selectedThread, location) {
  return pushQueryAction({
    type: 'CHANGE_SELECTED_THREAD',
    selectedThread,
  }, location);
}

export function changeThreadOrder(threadOrder) {
  return {
    type: 'CHANGE_THREAD_ORDER',
    threadOrder,
  };
}

export function changeCallTreeSearchString(searchString, location) {
  return pushQueryAction({
    type: 'CHANGE_CALL_TREE_SEARCH_STRING',
    searchString,
  }, location);
}


function basePathExcludingTrailingSlash(dataSource, params) {
  if (params.hash) {
    return `/${dataSource}/${params.hash}`;
  }
  return `/${dataSource}`;
}

export function changeSelectedTab(selectedTab, dataSource, location, params) {
  const newPathname = `${basePathExcludingTrailingSlash(dataSource, params)}/${selectedTab}/`;
  if (location.pathname === newPathname) {
    return () => {};
  }
  return dispatch => dispatch(push({ pathname: newPathname, query: location.query }));
}

export function profilePublished(hash, location, params) {
  const { selectedTab } = params;
  const newParams = Object.assign({}, params, { hash });
  const newPathname = `${basePathExcludingTrailingSlash('public', newParams)}/${selectedTab}/`;
  if (location.pathname === newPathname) {
    return () => {};
  }
  return dispatch => dispatch(replace({ pathname: newPathname, query: location.query }));
}

export function changeTabOrder(tabOrder) {
  return {
    type: 'CHANGE_TAB_ORDER',
    tabOrder,
  };
}

export function changeExpandedFuncStacks(threadIndex, expandedFuncStacks) {
  return {
    type: 'CHANGE_EXPANDED_FUNC_STACKS',
    threadIndex, expandedFuncStacks,
  };
}

export function changeSelectedMarker(threadIndex, selectedMarker) {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker, threadIndex,
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
      const { start, end } = action;
      rangeFilters.push({ start, end });
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

function callTreeSearchReducer(state = '', action) {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function selectedThreadReducer(state = '', action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
      return `${action.selectedThread}`;
    default:
      return state;
  }
}

export const queryRootReducer = createQueryReducer({
  jsOnly: jsOnlyReducer,
  invertCallstack: invertCallstackReducer,
}, {
  rangeFilters: rangeFiltersReducer,
  search: callTreeSearchReducer,
  thread: selectedThreadReducer,
});

function pushQueryAction(action, { pathname, query }) {
  return push({ pathname, query: queryRootReducer(query, action) });
}

function pushQueryActions(actions, { pathname, query }) {
  return push({ pathname, query: actions.reduce(queryRootReducer, query) });
}

function replaceQueryAction(action, { pathname, query }) {
  return replace({ pathname, query: queryRootReducer(query, action) });
}

function replaceQueryActions(actions, { pathname, query }) {
  return replace({ pathname, query: actions.reduce(queryRootReducer, query) });
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
