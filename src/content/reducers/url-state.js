// @flow
import { combineReducers } from 'redux';
import { defaultThreadOrder } from '../profile-data';
import { createSelector } from 'reselect';
import { urlFromState } from '../url-handling';
import * as RangeFilters from '../range-filters';

import type { ThreadIndex } from '../../common/types/profile';
import type { StartEndRange } from '../../common/types/units';
import type { Action, CallTreeFiltersPerThread, CallTreeFilter, DataSource } from '../actions/types';
import type { State, URLState, Reducer } from './types';

function dataSource(state: DataSource = 'none', action: Action) {
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

function rangeFilters(state: StartEndRange[] = [], action: Action) {
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

function callTreeFilters(state: CallTreeFiltersPerThread = {}, action: Action) {
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

const urlStateReducer: Reducer<URLState> = (regularUrlStateReducer => (state: URLState, action: Action): URLState => {
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
export default urlStateReducer;

const getURLState = (state: State): URLState => state.urlState;

export const getDataSource = (state: State) => getURLState(state).dataSource;
export const getHash = (state: State) => getURLState(state).hash;
export const getRangeFilters = (state: State) => getURLState(state).rangeFilters;
export const getJSOnly = (state: State) => getURLState(state).jsOnly;
export const getHidePlatformDetails = (state: State) => getURLState(state).hidePlatformDetails;
export const getInvertCallstack = (state: State) => getURLState(state).invertCallstack;
export const getSearchString = (state: State) => getURLState(state).callTreeSearchString;
export const getSelectedTab = (state: State) => getURLState(state).selectedTab;
export const getSelectedThreadIndex = (state: State) => getURLState(state).selectedThread;
export const getCallTreeFilters = (state: State, threadIndex: ThreadIndex): CallTreeFilter[] => {
  return getURLState(state).callTreeFilters[threadIndex] || [];
};

export const getURLPredictor = createSelector(
  getURLState,
  (oldURLState: URLState) => actionOrActionList => {
    const actionList = ('type' in actionOrActionList) ? [actionOrActionList] : actionOrActionList;
    const newURLState = actionList.reduce(urlStateReducer, oldURLState);
    return urlFromState(newURLState);
  }
);

export const getRangeFilterLabels = createSelector(
  getRangeFilters,
  RangeFilters.getRangeFilterLabels
);
