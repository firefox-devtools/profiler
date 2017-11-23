/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import escapeStringRegexp from 'escape-string-regexp';
import { createSelector } from 'reselect';

import { defaultThreadOrder } from '../profile-logic/profile-data';
import { urlFromState } from '../url-handling';
import * as RangeFilters from '../profile-logic/range-filters';

import type { ThreadIndex } from '../types/profile';
import type { StartEndRange } from '../types/units';
import type {
  TransformStacksPerThread,
  TransformStack,
} from '../types/transforms';
import type {
  Action,
  DataSource,
  ImplementationFilter,
  TabSlug,
} from '../types/actions';
import type { State, UrlState, Reducer } from '../types/reducers';

// Pre-allocate an array to help with strict equality tests in the selectors.
const EMPTY_TRANSFORM_STACK = [];

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

function profileUrl(state: string = '', action: Action) {
  switch (action.type) {
    default:
      return state;
  }
}

function selectedTab(state: TabSlug = 'calltree', action: Action) {
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
  function findDefaultThreadIndex(threads) {
    const contentThreadId = threads.findIndex(
      thread => thread.name === 'GeckoMain' && thread.processType === 'tab'
    );
    return contentThreadId !== -1
      ? contentThreadId
      : defaultThreadOrder(threads)[0];
  }

  switch (action.type) {
    case 'CHANGE_SELECTED_THREAD':
      return action.selectedThread;
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_FILE': {
      // When loading in a brand new profile, select either the GeckoMain [tab] thread,
      // or the first thread in the thread order. For profiles from the Web, the
      // selectedThread has already been initialized from the URL and does not require
      // looking at the profile.
      return findDefaultThreadIndex(action.profile.threads);
    }
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL': {
      // For profiles from the web, we only need to ensure the selected thread
      // is actually valid.
      if (state < action.profile.threads.length) {
        return state;
      }
      return findDefaultThreadIndex(action.profile.threads);
    }
    case 'HIDE_THREAD': {
      const { threadIndex, hiddenThreads, threadOrder } = action;
      // If the currently selected thread is being hidden, then re-select a new one.
      if (state === threadIndex) {
        const index = threadOrder.find(index => {
          return index !== threadIndex && !hiddenThreads.includes(index);
        });
        if (index === undefined) {
          throw new Error('A new thread index must be found');
        }
        return index;
      }
      return state;
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

function markersSearchString(state: string = '', action: Action) {
  switch (action.type) {
    case 'CHANGE_MARKER_SEARCH_STRING':
      return action.searchString;
    default:
      return state;
  }
}

function transforms(state: TransformStacksPerThread = {}, action: Action) {
  switch (action.type) {
    case 'ADD_TRANSFORM_TO_STACK': {
      const { threadIndex, transform } = action;
      const transforms = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: [...transforms, transform],
      });
    }
    case 'POP_TRANSFORMS_FROM_STACK': {
      const { threadIndex, firstRemovedFilterIndex } = action;
      const transforms = state[threadIndex] || [];
      return Object.assign({}, state, {
        [threadIndex]: transforms.slice(0, firstRemovedFilterIndex),
      });
    }
    default:
      return state;
  }
}

/**
 * Represents the current filter applied to the stack frames, where it will show
 * frames only by implementation.
 */
function implementation(
  state: ImplementationFilter = 'combined',
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_IMPLEMENTATION_FILTER':
      return action.implementation;
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

function threadOrder(state: ThreadIndex[] = [], action: Action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE': {
      // When receiving a new profile, try to use the thread order specified in the URL,
      // but ensure that the IDs are correct.
      const threads = defaultThreadOrder(action.profile.threads);
      const validUrlThreads = state.filter(index => threads.includes(index));
      const missingThreads = threads.filter(index => !state.includes(index));
      return validUrlThreads.concat(missingThreads);
    }
    case 'CHANGE_THREAD_ORDER':
      return action.threadOrder;
    default:
      return state;
  }
}

function hiddenThreads(state: ThreadIndex[] = [], action: Action) {
  switch (action.type) {
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_STORE':
    case 'RECEIVE_PROFILE_FROM_URL':
    case 'RECEIVE_PROFILE_FROM_FILE': {
      // When receiving a new profile, try to use the hidden threads specified in the URL,
      // but ensure that the IDs are correct.
      const threads = action.profile.threads.map(
        (_, threadIndex) => threadIndex
      );
      return state.filter(index => threads.includes(index));
    }
    case 'HIDE_THREAD':
      return [...state, action.threadIndex];
    case 'SHOW_THREAD': {
      const { threadIndex } = action;
      return state.filter(index => index !== threadIndex);
    }
    default:
      return state;
  }
}

const urlStateReducer: Reducer<UrlState> = (regularUrlStateReducer => (
  state: UrlState,
  action: Action
): UrlState => {
  switch (action.type) {
    case '@@urlenhancer/updateUrlState':
      return action.urlState;
    default:
      return regularUrlStateReducer(state, action);
  }
})(
  combineReducers({
    dataSource,
    hash,
    profileUrl,
    selectedTab,
    rangeFilters,
    selectedThread,
    callTreeSearchString,
    implementation,
    invertCallstack,
    hidePlatformDetails,
    threadOrder,
    hiddenThreads,
    markersSearchString,
    transforms,
  })
);
export default urlStateReducer;

export const getUrlState = (state: State): UrlState => state.urlState;

export const getDataSource = (state: State) => getUrlState(state).dataSource;
export const getHash = (state: State) => getUrlState(state).hash;
export const getProfileUrl = (state: State) => getUrlState(state).profileUrl;
export const getRangeFilters = (state: State) =>
  getUrlState(state).rangeFilters;
export const getImplementationFilter = (state: State) =>
  getUrlState(state).implementation;
export const getHidePlatformDetails = (state: State) =>
  getUrlState(state).hidePlatformDetails;
export const getInvertCallstack = (state: State) =>
  getUrlState(state).invertCallstack;
export const getCurrentSearchString = (state: State) =>
  getUrlState(state).callTreeSearchString;
export const getSearchStrings = createSelector(
  getCurrentSearchString,
  searchString => {
    if (!searchString) {
      return [];
    }
    return searchString
      .split(',')
      .map(part => part.trim())
      .filter(part => part);
  }
);
export const getSearchStringsAsRegExp = createSelector(
  getSearchStrings,
  strings => {
    if (!strings.length) {
      return null;
    }
    const regexpStr = strings.map(escapeStringRegexp).join('|');
    return new RegExp(regexpStr, 'gi');
  }
);
export const getMarkersSearchString = (state: State) =>
  getUrlState(state).markersSearchString;

export const getSelectedTab = (state: State) => getUrlState(state).selectedTab;
export const getSelectedThreadIndex = (state: State) =>
  getUrlState(state).selectedThread;
export const getTransformStack = (
  state: State,
  threadIndex: ThreadIndex
): TransformStack => {
  return getUrlState(state).transforms[threadIndex] || EMPTY_TRANSFORM_STACK;
};
export const getThreadOrder = (state: State) => getUrlState(state).threadOrder;
export const getHiddenThreads = (state: State) =>
  getUrlState(state).hiddenThreads;
export const getVisibleThreadOrder = createSelector(
  getThreadOrder,
  getHiddenThreads,
  (threadOrder: ThreadIndex[], hiddenThreads: ThreadIndex[]) => {
    return threadOrder.filter(index => !hiddenThreads.includes(index));
  }
);
export const getUrlPredictor = createSelector(
  getUrlState,
  (oldUrlState: UrlState) => (actionOrActionList: Action | Action[]) => {
    const actionList: Action[] = Array.isArray(actionOrActionList)
      ? actionOrActionList
      : [actionOrActionList];
    const newUrlState = actionList.reduce(urlStateReducer, oldUrlState);
    return urlFromState(newUrlState);
  }
);

export const getRangeFilterLabels = createSelector(
  getRangeFilters,
  RangeFilters.getRangeFilterLabels
);
