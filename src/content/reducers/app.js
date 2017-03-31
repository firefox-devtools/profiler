// @flow
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';

import type { Action } from '../actions/types';
import type { State, AppState, Reducer, IconWithClassName } from './types';

function view(state: string = 'INITIALIZING', action: Action) {
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

function isURLSetupDone(state: boolean = false, action: Action) {
  switch (action.type) {
    case '@@urlenhancer/urlSetupDone':
      return true;
    default:
      return state;
  }
}

function classNameFromUrl(url) {
  return url.replace(/[/:.+>< ~()#,]/g, '_');
}

function favicons(state: Set<string>, action: Action) {
  switch (action.type) {
    case 'ICON_HAS_LOADED':
      return new Set([...state, action.icon]);
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
}


const appStateReducer: Reducer<AppState> = combineReducers({ view, isURLSetupDone, favicons });
export default appStateReducer;

export const getApp = (state: State): AppState => state.app;
export const getView = (state: State): string => getApp(state).view;
export const getIsURLSetupDone = (state: State): boolean => getApp(state).isURLSetupDone;
export const getIcons = (state: State): Set<string> => getApp(state).favicons;
export const getIconForNode = (state: State, node): string => getIcons(state).has(node.icon) ? node.icon : null;
export const getIconClassNameForNode = createSelector(
  getIcons, (state, node) => node,
  (icons, node) => (icons.has(node.icon) ? classNameFromUrl(node.icon) : null)
);
export const getIconsWithClassNames: (State => IconWithClassName[]) = createSelector(
  getIcons,
  icons => [...icons].map(icon => ({ icon, className: classNameFromUrl(icon) }))
);

