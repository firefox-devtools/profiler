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
    case 'CHANGE_UPLOAD_STATE':
      return 'phase' in action.changes ? action.changes.phase : state;
    default:
      return state;
  }
};

const uploadProgress: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'CHANGE_UPLOAD_STATE':
      return 'uploadProgress' in action.changes
        ? action.changes.uploadProgress
        : state;
    default:
      return state;
  }
};

const error: Reducer<Error | mixed> = (state = null, action) => {
  switch (action.type) {
    case 'CHANGE_UPLOAD_STATE':
      return 'error' in action.changes ? action.changes.error : state;
    default:
      return state;
  }
};

const url: Reducer<string> = (state = '', action) => {
  switch (action.type) {
    case 'CHANGE_UPLOAD_STATE':
      return 'url' in action.changes ? action.changes.url : state;
    default:
      return state;
  }
};

const abortFunction: Reducer<() => void> = (state = () => {}, action) => {
  switch (action.type) {
    case 'CHANGE_UPLOAD_STATE':
      return 'abortFunction' in action.changes
        ? action.changes.abortFunction
        : state;
    default:
      return state;
  }
};

/**
 * Update the generation value for every upload attempt.
 */
const generation: Reducer<number> = (state = 0, action) => {
  switch (action.type) {
    case 'CHANGE_UPLOAD_STATE':
      // Increment the generation value if starting to upload.
      return action.changes.phase === 'uploading' ? state + 1 : state;
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
