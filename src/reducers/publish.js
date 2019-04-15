/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { getShouldSanitizeByDefault } from '../profile-logic/process-profile';

import type { CheckedSharingOptions } from '../types/actions';
import type {
  PublishState,
  UploadState,
  UploadPhase,
  Reducer,
} from '../types/state';

function _getDefaultSharingOptions(): CheckedSharingOptions {
  return {
    isFiltering: true,
    includeHiddenThreads: false,
    includeFullTimeRange: false,
    includeScreenshots: false,
    includeUrls: false,
    includeExtension: false,
  };
}

const checkedSharingOptions: Reducer<CheckedSharingOptions> = (
  state = _getDefaultSharingOptions(),
  action
) => {
  switch (action.type) {
    case 'VIEW_PROFILE': {
      const newState = _getDefaultSharingOptions();
      newState.isFiltering = getShouldSanitizeByDefault(action.profile);
      return newState;
    }
    case 'TOGGLE_CHECKED_SHARING_OPTION':
      return {
        ...state,
        [action.slug]: !state[action.slug],
      };
    default:
      return state;
  }
};

const phase: Reducer<UploadPhase> = (state = 'local', action) => {
  switch (action.type) {
    case 'UPLOAD_STARTED':
      return 'uploading';
    case 'UPLOAD_FINISHED':
      return 'uploaded';
    case 'UPLOAD_FAILED':
      return 'error';
    case 'UPLOAD_ABORTED':
    case 'UPLOAD_RESET':
      return 'local';
    default:
      return state;
  }
};

const uploadProgress: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'UPDATE_UPLOAD_PROGRESS':
      return action.uploadProgress;
    case 'UPLOAD_STARTED':
    case 'UPLOAD_ABORTED':
    case 'UPLOAD_RESET':
    case 'UPLOAD_FINISHED':
      return 0;
    default:
      return state;
  }
};

const error: Reducer<Error | mixed> = (state = null, action) => {
  switch (action.type) {
    case 'UPLOAD_FAILED':
      return action.error;
    default:
      return state;
  }
};

const url: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'UPLOAD_FINISHED':
      return action.url;
    default:
      return state;
  }
};

const abortFunction: Reducer<() => void> = (state = () => {}, action) => {
  switch (action.type) {
    case 'UPLOAD_STARTED':
      return action.abortFunction;
    default:
      return state;
  }
};

/**
 * Update the generation value for every upload attempt.
 */
const generation: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'UPLOAD_STARTED':
      // Increment the generation value if starting to upload.
      return state + 1;
    default:
      return state;
  }
};

const upload: Reducer<UploadState> = combineReducers({
  phase,
  uploadProgress,
  abortFunction,
  error,
  url,
  generation,
});

const publishReducer: Reducer<PublishState> = combineReducers({
  checkedSharingOptions,
  upload,
});

export default publishReducer;
