import { combineReducers } from 'redux';

function status(state = 'INITIALIZING', action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
    case 'WAITING_FOR_PROFILE_FROM_WEB':
    case 'WAITING_FOR_PROFILE_FROM_FILE':
      return 'WAITING_FOR_PROFILE';
    case 'RECEIVE_PROFILE_FROM_ADDON':
    case 'RECEIVE_PROFILE_FROM_WEB':
    case 'RECEIVE_PROFILE_FROM_FILE':
      return 'DONE';
    default:
      return state;
  }
}

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


export const getApp = state => state.app;
export const getStatus = state => getApp(state).status;
export const getView = state => getApp(state).view;
export const getIsURLSetupDone = state => getApp(state).isURLSetupDone;
