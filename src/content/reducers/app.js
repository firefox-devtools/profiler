import { combineReducers } from 'redux';

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

function isURLSetupDone(state = false, action) {
  switch (action.type) {
    case '@@urlenhancer/urlSetupDone':
      return true;
    default:
      return state;
  }
}

export default combineReducers({ view, isURLSetupDone });

export const getApp = state => state.app;
export const getView = state => getApp(state).view;
export const getIsURLSetupDone = state => getApp(state).isURLSetupDone;
