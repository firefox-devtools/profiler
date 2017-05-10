/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';

import type { Action } from '../actions/types';
import type { State, AppState, AppViewState, Reducer } from './types';

function view(state: AppViewState = { phase: 'INITIALIZING' }, action: Action): AppViewState {
  switch (action.type) {
    case 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_WEB':
      return {
        phase: 'INITIALIZING',
        additionalData: { attempt: action.error.attempt },
      };
    case 'ERROR_RECEIVING_PROFILE_FROM_FILE':
    case 'ERROR_RECEIVING_PROFILE_FROM_ADDON':
    case 'FATAL_ERROR_RECEIVING_PROFILE_FROM_WEB':
      return { phase: 'FATAL_ERROR', error: action.error };
    case 'ROUTE_NOT_FOUND':
      return { phase: 'ROUTE_NOT_FOUND' };
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return { phase: 'PROFILE' };
    default:
      return state;
  }
}

function isURLSetupDone(state: boolean = false, action: Action) {
  switch (action.type) {
    case '@@urlenhancer/urlSetupDone':
      return true;
    default:
      return state;
  }
}
const appStateReducer: Reducer<AppState> = combineReducers({ view, isURLSetupDone });
export default appStateReducer;

export const getApp = (state: State): AppState => state.app;
export const getView = (state: State): AppViewState => getApp(state).view;
export const getIsURLSetupDone = (state: State): boolean => getApp(state).isURLSetupDone;
