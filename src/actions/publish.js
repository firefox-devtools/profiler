/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { uploadBinaryProfileData } from '../profile-logic/profile-store';
import { sendAnalytics } from '../utils/analytics';
import { getUrlState } from '../selectors/url-state';
import {
  getAbortFunction,
  getUploadGeneration,
  getSanitizedProfile,
  getSanitizedProfileData,
  getRemoveProfileInformation,
} from '../selectors/publish';
import { urlFromState } from '../app-logic/url-handling';
import { profilePublished } from './app';
import urlStateReducer from '../reducers/url-state';

import type { Action, ThunkAction } from '../types/store';
import type { CheckedSharingOptions } from '../types/actions';
import type { StartEndRange } from '../types/units';
import type { ThreadIndex } from '../types/profile';

export function toggleCheckedSharingOptions(
  slug: $Keys<CheckedSharingOptions>
): Action {
  return {
    type: 'TOGGLE_CHECKED_SHARING_OPTION',
    slug,
  };
}

export function uploadCompressionStarted(): Action {
  return {
    type: 'UPLOAD_COMPRESSION_STARTED',
  };
}

/**
 * Start uploading the profile, but save an abort function to be able to cancel it.
 */
export function uploadStarted(abortFunction: () => void): Action {
  return {
    type: 'UPLOAD_STARTED',
    abortFunction,
  };
}

/**
 * As the profile uploads, remember the amount that has been uploaded so that the UI
 * can reflect the progress.
 */
export function updateUploadProgress(uploadProgress: number): Action {
  return {
    type: 'UPDATE_UPLOAD_PROGRESS',
    uploadProgress,
  };
}

/**
 * A profile upload finished.
 */
export function uploadFinished(url: string): Action {
  return { type: 'UPLOAD_FINISHED', url };
}

/**
 * A profile upload failed.
 */
export function uploadFailed(error: mixed): Action {
  return { type: 'UPLOAD_FAILED', error };
}

/**
 * This function starts the profile sharing process. Takes an optional argument that
 * indicates if the share attempt is being made for the second time. We have two share
 * buttons, one for sharing for the first time, and one for sharing after the initial
 * share depending on the previous URL share status. People can decide to remove the
 * URLs from the profile after sharing with URLs or they can decide to add the URLs after
 * sharing without them. We check the current state before attempting to share depending
 * on that flag.
 *
 * The return value is used for tests to determine if the request went all the way
 * through (true) or was quit early due to the generation value being invalidated (false).
 */
export function attemptToPublish(): ThunkAction<Promise<boolean>> {
  return async (dispatch, getState) => {
    try {
      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'start',
      });

      // Get the current generation of this request. It can be aborted midway through.
      // This way we can check inside this async function if we need to bail out early.
      const uploadGeneration = getUploadGeneration(getState());

      dispatch(uploadCompressionStarted());
      const gzipData: Uint8Array = await getSanitizedProfileData(getState());

      // The previous line was async, check to make sure that this request is still valid.
      if (uploadGeneration !== getUploadGeneration(getState())) {
        return false;
      }

      const { abortFunction, startUpload } = uploadBinaryProfileData();
      dispatch(uploadStarted(abortFunction));

      if (uploadGeneration !== getUploadGeneration(getState())) {
        // The upload could have been aborted while we were compressing the data.
        return false;
      }

      // Upload the profile, and notify it with the amount of data that has been
      // uploaded.
      const hash = await startUpload(gzipData, uploadProgress => {
        dispatch(updateUploadProgress(uploadProgress));
      });

      // The previous line was async, check to make sure that this request is still valid.
      if (uploadGeneration !== getUploadGeneration(getState())) {
        return false;
      }

      const removeProfileInformation = getRemoveProfileInformation(getState());
      let urlState;
      if (removeProfileInformation) {
        const { committedRanges, oldThreadIndexToNew } = getSanitizedProfile(
          getState()
        );
        urlState = urlStateReducer(
          getUrlState(getState()),
          profileSanitized(hash, committedRanges, oldThreadIndexToNew)
        );
      } else {
        urlState = urlStateReducer(
          getUrlState(getState()),
          profilePublished(hash)
        );
      }
      const url = window.location.origin + urlFromState(urlState);

      dispatch(uploadFinished(url));

      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'succeeded',
      });

      window.open(url, '_blank');
    } catch (error) {
      dispatch(uploadFailed(error));
      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'failed',
      });
      return false;
    }
    return true;
  };
}

/**
 * Abort the attempt to publish.
 */
export function abortUpload(): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const abort = getAbortFunction(getState());
    abort();
    dispatch({ type: 'UPLOAD_ABORTED' });

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile upload',
      eventAction: 'aborted',
    });
  };
}

export function resetUploadState(): Action {
  return {
    type: 'UPLOAD_RESET',
  };
}

/**
 * Report to the UrlState that the profile was sanitized. This will re-map any stored
 * indexes or information that has been sanitized away.
 */
export function profileSanitized(
  hash: string,
  committedRanges: StartEndRange[] | null,
  oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null
): Action {
  return {
    type: 'SANITIZE_PROFILE',
    hash,
    committedRanges,
    oldThreadIndexToNew,
  };
}
