/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import type { Action } from '../types/actions';
import type { ProfileUploadState, State, Reducer } from '../types/reducers';

function progress(state: number = 0, action: Action): number {
  switch (action.type) {
    case 'PROFILE_UPLOAD_PROGRESS':
      return action.progress;
    default:
      return state;
  }
}

const profileUploadStateReducer: Reducer<ProfileUploadState> = combineReducers({
  progress,
});

export default profileUploadStateReducer;

export const getProfileUpload = (state: State): ProfileUploadState =>
  state.profileUpload;
export const getProgress = (state: State): number =>
  getProfileUpload(state).progress;
