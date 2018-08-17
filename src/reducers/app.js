/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';

import { getSelectedTab } from './url-state';
import { tabSlugs } from '../app-logic/tabs-handling';

import type { Action } from '../types/store';
import type {
  State,
  AppState,
  AppViewState,
  IsSidebarOpenPerPanelState,
  Reducer,
} from '../types/reducers';

function view(
  state: AppViewState = { phase: 'INITIALIZING' },
  action: Action
): AppViewState {
  if (state.phase === 'DATA_LOADED') {
    // Let's not come back at another phase if we're already displaying a profile
    return state;
  }

  switch (action.type) {
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_STORE':
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_URL':
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_ADDON':
      return {
        phase: 'INITIALIZING',
        additionalData: {
          message: action.error.message,
          attempt: action.error.attempt,
        },
      };
    case 'ERROR_RECEIVING_PROFILE_FROM_FILE':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_ADDON':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_STORE':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_URL':
      return { phase: 'FATAL_ERROR', error: action.error };
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return { phase: 'INITIALIZING' };
    case 'ROUTE_NOT_FOUND':
      return { phase: 'ROUTE_NOT_FOUND' };
    case 'RECEIVE_ZIP_FILE':
    case 'VIEW_PROFILE':
      return { phase: 'DATA_LOADED' };
    default:
      return state;
  }
}

function isUrlSetupDone(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'URL_SETUP_DONE':
      return true;
    default:
      return state;
  }
}

function hasZoomedViaMousewheel(state: boolean = false, action: Action) {
  switch (action.type) {
    case 'HAS_ZOOMED_VIA_MOUSEWHEEL': {
      return true;
    }
    default:
      return state;
  }
}

function isSidebarOpenPerPanel(
  state: IsSidebarOpenPerPanelState,
  action: Action
): IsSidebarOpenPerPanelState {
  if (state === undefined) {
    state = {};
    tabSlugs.forEach(tabSlug => (state[tabSlug] = true));
  }

  switch (action.type) {
    case 'CHANGE_SIDEBAR_OPEN_STATE': {
      const { tab, isOpen } = action;
      // Due to how this action will be dispatched we'll always have the value
      // changed so we don't need the performance optimization of checking the
      // stored value against the new value.
      return {
        ...state,
        [tab]: isOpen,
      };
    }
    default:
      return state;
  }
}

const appStateReducer: Reducer<AppState> = combineReducers({
  view,
  isUrlSetupDone,
  hasZoomedViaMousewheel,
  isSidebarOpenPerPanel,
});

export default appStateReducer;

export const getApp = (state: State): AppState => state.app;
export const getView = (state: State): AppViewState => getApp(state).view;
export const getIsUrlSetupDone = (state: State): boolean =>
  getApp(state).isUrlSetupDone;
export const getHasZoomedViaMousewheel = (state: State): boolean => {
  return getApp(state).hasZoomedViaMousewheel;
};
export const getIsSidebarOpen = (state: State): boolean =>
  getApp(state).isSidebarOpenPerPanel[getSelectedTab(state)];
