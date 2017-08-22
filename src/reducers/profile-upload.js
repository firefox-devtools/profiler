/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import type { Action } from '../types/actions';
import type {
  ProfileUploadState,
  ProfileUploadStatus,
  State,
  Reducer,
} from '../types/reducers';

function progress(state: number = 0, action: Action): number {
  switch (action.type) {
    case 'PROFILE_UPLOAD_PROGRESS':
      return action.progress;
    default:
      return state;
  }
}

function status(
  state: ProfileUploadStatus = 'none',
  action: Action
): ProfileUploadStatus {
  switch (action.type) {
    case 'PROFILE_UPLOAD_START':
      return 'uploading';
    case 'PROFILE_UPLOAD_ERROR':
      return 'error';
    case 'PROFILE_UPLOAD_SUCCESS':
      return 'none';
    default:
      return state;
  }
}

function error(state: Error | null = null, action: Action): Error | null {
  switch (action.type) {
    case 'PROFILE_UPLOAD_ERROR':
      return action.error;
    default:
      return state;
  }
}

function shortURL(
  state: string = window.location.href,
  action: Action
): string {
  switch (action.type) {
    case 'SHORTENING_URL':
      return action.url;
    case 'SHORTENED_URL':
      return action.shortURL;
    default:
      return state;
  }
}

const profileUploadStateReducer: Reducer<ProfileUploadState> = combineReducers({
  progress,
  status,
  error,
  shortURL,
});

export default profileUploadStateReducer;

export const getProfileUpload = (state: State): ProfileUploadState =>
  state.profileUpload;
export const getProgress = (state: State): number =>
  getProfileUpload(state).progress;
export const getStatus = (state: State): ProfileUploadStatus =>
  getProfileUpload(state).status;
export const getError = (state: State): Error | null =>
  getProfileUpload(state).error;
export const getShortURL = (state: State): string =>
  getProfileUpload(state).shortURL;
