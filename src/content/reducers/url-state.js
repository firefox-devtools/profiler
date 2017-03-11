// @flow
import { combineReducers } from 'redux';
import { defaultThreadOrder } from '../profile-data';
import { createSelector } from 'reselect';
import { urlFromState } from '../url-handling';

import type { ThreadIndex, IndexIntoFuncTable } from '../../common/types/profile';
import type { Action } from '../actions/types';

type CallTreeFilter = {
  type: 'postfix' | 'prefix',
  postfixFuncs: null | IndexIntoFuncTable[],
  prefixFuncs: null | IndexIntoFuncTable[],
  matchJSOnly: boolean,
};

type RangeFilter = { start: number, end: number};

type DataSourceState = 'none' | 'from-file' | 'public';
type RangeFiltersState = RangeFilter[];
type CallTreeFiltersState = { [key: ThreadIndex]: CallTreeFilter }

type URLState = {
  dataSource: DataSourceState,
  hash: string,
  selectedTab: string,
  rangeFilters: RangeFiltersState,
  selectedThread: ThreadIndex,
  callTreeSearchString: string,
  callTreeFilters: CallTreeFiltersState,
  jsOnly: boolean,
  invertCallstack: boolean,
  hidePlatformDetails: boolean,
}

function dataSource(state: DataSourceState = 'none', action: Action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'from-file';
    case 'PROFILE_PUBLISHED':
      return 'public';
    default:
      return state;
  }
}

function hash(state: string = '', action: Action) {
  switch (action.type) {
    case 'PROFILE_PUBLISHED':
      return action.hash;
    default:
      return state;
  }
}

function selectedTab(state: string = 'calltree', action: Action) {
  switch (action.type) {
    case 'CHANGE_SELECTED_TAB':
      return action.selectedTab;
    default:
      return state;
  }
}

function rangeFilters(state: RangeFiltersState = [], action: Action) {
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

function selectedThread(state: ThreadIndex = 0, action: Action) {
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

function callTreeSearchString(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_CALL_TREE_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function callTreeFilters(state: CallTreeFiltersState = {}, action: Action) {
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

function jsOnly(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_JS_ONLY':
      return action.jsOnly;
    default:
      return state;
  }
}

function invertCallstack(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_INVERT_CALLSTACK':
      return action.invertCallstack;
    default:
      return state;
  }
}

function hidePlatformDetails(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'CHANGE_HIDE_PLATFORM_DETAILS':
      return action.hidePlatformDetails;
    default:
      return state;
  }
}

const urlState = (regularUrlStateReducer => (state: URLState, action: Action) => {
  switch (action.type) {
    case '@@urlenhancer/updateURLState':
      return action.urlState;
    default:
      return regularUrlStateReducer(state, action);
  }
})(combineReducers({
  dataSource, hash, selectedTab, rangeFilters, selectedThread,
  callTreeSearchString, callTreeFilters, jsOnly, invertCallstack,
  hidePlatformDetails,
}));

export default urlState;

const getURLState = (state: Object): URLState => state.urlState;

export const getDataSource = (state: Object) => getURLState(state).dataSource;
export const getHash = (state: Object) => getURLState(state).hash;
export const getRangeFilters = (state: Object) => getURLState(state).rangeFilters;
export const getJSOnly = (state: Object) => getURLState(state).jsOnly;
export const getHidePlatformDetails = (state: Object) => getURLState(state).hidePlatformDetails;
export const getInvertCallstack = (state: Object) => getURLState(state).invertCallstack;
export const getSearchString = (state: Object) => getURLState(state).callTreeSearchString;
export const getSelectedTab = (state: Object) => getURLState(state).selectedTab;
export const getSelectedThreadIndex = (state: Object) => getURLState(state).selectedThread;
export const getCallTreeFilters = (state: Object, threadIndex: ThreadIndex) => getURLState(state).callTreeFilters[threadIndex] || [];

export const getURLPredictor = createSelector(
  getURLState,
  oldURLState => actionOrActionList => {
    const actionList = ('type' in actionOrActionList) ? [actionOrActionList] : actionOrActionList;
    const newURLState = actionList.reduce(urlState, oldURLState);
    return urlFromState(newURLState);
  }
);
