/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { uploadBinaryProfileData } from '../profile-logic/profile-store';
import { sendAnalytics } from '../utils/analytics';
import { getProfile } from '../selectors/profile';
import {
  getAbortFunction,
  getUploadGeneration,
  getSanitizedProfile,
  getSanitizedProfileData,
  getRemoveProfileInformation,
  getOriginalProfile,
  getOriginalUrlState,
} from '../selectors/publish';
import { getUrlState } from '../selectors/url-state';
import { viewProfile } from './receive-profile';
import { ensureExists } from '../utils/flow';
import { setHistoryReplaceState } from '../app-logic/url-handling';

import type { Action, ThunkAction } from '../types/store';
import type { CheckedSharingOptions } from '../types/actions';
import type { StartEndRange } from '../types/units';
import type { Profile, ThreadIndex } from '../types/profile';
import type { UrlState } from '../types/state';

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
      if (removeProfileInformation) {
        const {
          committedRanges,
          oldThreadIndexToNew,
          profile,
        } = getSanitizedProfile(getState());
        const originalProfile = getProfile(getState());
        const originalUrlState = getUrlState(getState());

        // Hide the old UI gracefully.
        await dispatch(hideStaleProfile());

        // Update the UrlState so that we are sanitized.
        dispatch(
          profileSanitized(
            hash,
            committedRanges,
            oldThreadIndexToNew,
            originalProfile,
            originalUrlState
          )
        );
        // Swap out the URL state, since the view profile calculates all of the default
        // settings. If we don't do this then we can go back in history to where we
        // are trying to view a profile without valid view settings.
        setHistoryReplaceState(true);
        // Multiple dispatches are usually to be avoided, but viewProfile requires
        // the next UrlState in place. It could be rewritten to have a UrlState passed
        // in as a paremeter, but that doesn't seem worth it at the time of this writing.
        dispatch(viewProfile(profile));
        setHistoryReplaceState(false);
      } else {
        dispatch(profilePublished(hash));
      }

      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'succeeded',
      });
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
  oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null,
  originalProfile: Profile,
  originalUrlState: UrlState
): Action {
  return {
    type: 'SANITIZE_PROFILE_PUBLISHED',
    hash,
    committedRanges,
    oldThreadIndexToNew,
    originalProfile,
    originalUrlState,
  };
}

/**
 * Report that the profile was published, but not sanitized.
 */
export function profilePublished(hash: string): Action {
  return {
    type: 'PROFILE_PUBLISHED',
    hash,
  };
}

export function revertToOriginalProfile(): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const originalProfile = ensureExists(
      getOriginalProfile(getState()),
      'Expected to find an original profile when reverting to it.'
    );
    const originalUrlState = ensureExists(
      getOriginalUrlState(getState()),
      'Expected to find the original url state to revert to.'
    );

    await dispatch(hideStaleProfile());

    dispatch({
      type: 'REVERT_TO_ORIGINAL_PROFILE',
      originalUrlState: originalUrlState,
    });

    dispatch(viewProfile(originalProfile));
  };
}

export function hideStaleProfile(): ThunkAction<Promise<void>> {
  return dispatch => {
    dispatch({ type: 'HIDE_STALE_PROFILE' });
    return new Promise(resolve => {
      // This timing should match .profileViewerFadeOut.
      setTimeout(resolve, 300);
    });
  };
}
