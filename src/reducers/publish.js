/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import { getShouldSanitizeByDefault } from '../profile-logic/sanitize';

import type {
  CheckedSharingOptions,
  PublishState,
  UploadState,
  UploadPhase,
  Reducer,
  State,
} from 'firefox-profiler/types';

function _getDefaultSharingOptions(): CheckedSharingOptions {
  return {
    includeHiddenThreads: false,
    includeFullTimeRange: false,
    includeScreenshots: false,
    includeUrls: false,
    includeExtension: false,
    includePreferenceValues: false,
  };
}

const checkedSharingOptions: Reducer<CheckedSharingOptions> = (
  state = _getDefaultSharingOptions(),
  action
) => {
  switch (action.type) {
    case 'PROFILE_LOADED': {
      const newState = _getDefaultSharingOptions();
      if (!getShouldSanitizeByDefault(action.profile)) {
        // Flip the sharing options.
        for (const key of Object.keys(newState)) {
          newState[key] = true;
        }
      }
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

// This is a diagram explaining the ordering of actions for uploading
//
//               UPLOAD_COMPRESSION_STARTED
//                         |
//                         v
//                    UPLOAD_STARTED  --->  UPDATE_UPLOAD_PROGRESS
//                     /          \           (fired many times)
//                    v            v
// [SANITIZED_]PROFILE_PUBLISHED   UPLOAD_ABORTED
//               |
//               v
//          UPLOAD_RESET
//
const phase: Reducer<UploadPhase> = (state = 'local', action) => {
  switch (action.type) {
    case 'UPLOAD_COMPRESSION_STARTED':
      return 'compressing';
    case 'UPLOAD_STARTED':
      return 'uploading';
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
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
    // Not all of these upload actions really need to be here, but it's nice to
    // explicitly list them all here.
    case 'UPLOAD_STARTED':
    case 'UPLOAD_ABORTED':
    case 'UPLOAD_RESET':
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'UPLOAD_COMPRESSION_STARTED':
    case 'UPLOAD_FAILED':
      return 0;
    default:
      return state;
  }
};

const error: Reducer<Error | mixed> = (state = null, action) => {
  switch (action.type) {
    case 'UPLOAD_FAILED':
      return action.error;
    case 'UPLOAD_COMPRESSION_STARTED':
      // When starting out a new upload, clear out any old errors.
      return null;
    default:
      return state;
  }
};

const noop = () => {};
const abortFunction: Reducer<() => void> = (state = noop, action) => {
  switch (action.type) {
    case 'UPLOAD_ABORTED':
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'UPLOAD_FAILED':
      return noop;
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
    case 'PROFILE_PUBLISHED':
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'UPLOAD_ABORTED':
    case 'UPLOAD_FAILED':
    case 'HIDE_STALE_PROFILE':
      // Increment the generation value when exiting out of the profile uploading.
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
  generation,
});

/**
 * When sanitizing profiles, it is nice to have the option to revert to the original
 * profile and view, which is stored in this reducer.
 */
const prePublishedState: Reducer<null | State> = (state = null, action) => {
  switch (action.type) {
    case 'SANITIZED_PROFILE_PUBLISHED':
    case 'PROFILE_PUBLISHED':
      return action.prePublishedState;
    case 'REVERT_TO_PRE_PUBLISHED_STATE':
      return null;
    default:
      return state;
  }
};

/**
 * This piece of state controls the animation of hiding the profile when it's stale.
 * Stale profiles are ones that have been mutated in some way. This happens when
 * the user goes from an original profile to a sanitized profile, or when they revert
 * to the original. We want to display a helpful animation when this happens, and so
 * this piece of state controls it.
 */
const isHidingStaleProfile: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'HIDE_STALE_PROFILE':
      return true;
    case 'VIEW_FULL_PROFILE':
    case 'VIEW_ORIGINS_PROFILE':
    case 'VIEW_ACTIVE_TAB_PROFILE':
      return false;
    default:
      return state;
  }
};

/**
 * This piece of state lets components know that a profile has been sanitized.
 * This changes the behavior of how the <ProfileViewer> component animates in.
 */
const hasSanitizedProfile: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'HIDE_STALE_PROFILE':
      return true;
    default:
      return state;
  }
};

const publishReducer: Reducer<PublishState> = combineReducers({
  checkedSharingOptions,
  upload,
  isHidingStaleProfile,
  hasSanitizedProfile,
  prePublishedState,
});

export default publishReducer;
