/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { stripIndent } from 'common-tags';

import { uploadBinaryProfileData } from '../profile-logic/profile-store';
import { sendAnalytics } from '../utils/analytics';
import {
  getUploadGeneration,
  getSanitizedProfile,
  getSanitizedProfileData,
  getRemoveProfileInformation,
  getPrePublishedState,
} from '../selectors/publish';
import {
  getDataSource,
  getProfileName,
  getUrlPredictor,
} from '../selectors/url-state';
import {
  getProfile,
  getZeroAt,
  getCommittedRange,
  getProfileFilterPageData,
} from '../selectors/profile';
import { viewProfile } from './receive-profile';
import { ensureExists } from '../utils/flow';
import { extractProfileTokenFromJwt } from '../utils/jwt';
import { setHistoryReplaceState } from '../app-logic/url-handling';
import { storeProfileData } from '../app-logic/published-profiles-store';

import type {
  Action,
  ThunkAction,
  CheckedSharingOptions,
  StartEndRange,
  ThreadIndex,
  State,
} from 'firefox-profiler/types';

export function toggleCheckedSharingOptions(
  slug: $Keys<CheckedSharingOptions>
): Action {
  return {
    type: 'TOGGLE_CHECKED_SHARING_OPTION',
    slug,
  };
}

export function uploadCompressionStarted(abortFunction: () => void): Action {
  return {
    type: 'UPLOAD_COMPRESSION_STARTED',
    abortFunction,
  };
}

/**
 * Start uploading the profile, but save an abort function to be able to cancel it.
 */
export function uploadStarted(): Action {
  return {
    type: 'UPLOAD_STARTED',
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

// This function stores information about the published profile, depending on
// various states. Especially it handles the case that we sanitized part of the
// profile. The sanitized information is passed along because it can be costly
// to rerun in case the selectors have been invalidated.
// Note that the returned promise won't ever be rejected, all errors are handled
// here.
async function storeJustPublishedProfileData(
  profileToken: string,
  jwtToken: string | null,
  sanitizedInformation,
  prepublishedState: State
): Promise<void> {
  const zeroAt = getZeroAt(prepublishedState);
  const adjustRange = range => ({
    start: range.start - zeroAt,
    end: range.end - zeroAt,
  });

  // We'll persist any computed profileName, because we may lose it otherwise
  // (This is the case with zip files).
  const profileName = getProfileName(prepublishedState);

  // The url predictor returns the URL that would be serialized out of the state
  // resulting of the actions passed in argument.
  // We need this here because the action of storing the profile data in the DB
  // happens before the sanitization really happens in the main state, so we
  // need to simulate it.
  const urlPredictor = getUrlPredictor(prepublishedState);
  let predictedUrl;

  const removeProfileInformation = getRemoveProfileInformation(
    prepublishedState
  );
  if (removeProfileInformation) {
    // In case you wonder, committedRanges is either an empty array (if the
    // range was sanitized) or `null` (otherwise).
    const { committedRanges, oldThreadIndexToNew } = sanitizedInformation;

    // Predicts the URL we'll have after local sanitization.
    predictedUrl = urlPredictor(
      profileSanitized(
        profileToken,
        committedRanges,
        oldThreadIndexToNew,
        profileName,
        null /* prepublished State */
      )
    );
  } else {
    // Predicts the URL we'll have after the process is finished.
    predictedUrl = urlPredictor(
      profilePublished(profileToken, profileName, null /* prepublished State */)
    );
  }

  const profileMeta = getProfile(prepublishedState).meta;
  const profileFilterPageData = getProfileFilterPageData(prepublishedState);

  try {
    await storeProfileData({
      profileToken,
      jwtToken,
      publishedDate: new Date(),
      name: getProfileName(prepublishedState),
      originHostname: profileFilterPageData
        ? profileFilterPageData.hostname
        : null,
      preset: null, // This is unused for now.
      meta: {
        // We don't put the full meta object, but only what we need, so that we
        // won't have unexpected compatibility problems in the future, if the meta
        // object changes. By being explicit we make sure this will be handled.
        product: profileMeta.product,
        abi: profileMeta.abi,
        platform: profileMeta.platform,
        toolkit: profileMeta.toolkit,
        misc: profileMeta.misc,
        oscpu: profileMeta.oscpu,
        updateChannel: profileMeta.updateChannel,
        appBuildID: profileMeta.appBuildID,
      },
      urlPath: predictedUrl,
      publishedRange:
        removeProfileInformation &&
        removeProfileInformation.shouldFilterToCommittedRange
          ? adjustRange(removeProfileInformation.shouldFilterToCommittedRange)
          : adjustRange(getCommittedRange(prepublishedState)),
    });
  } catch (e) {
    // In the future we'll probably want to show a warning somewhere in the
    // UI (see issue #2670). But for now we'll just display messages to the
    // console.
    if (e.name === 'InvalidStateError') {
      // It's very likely we are in private mode, so let's catch and ignore it.
      // We can remove this check once Firefox stops erroring,
      // see https://bugzilla.mozilla.org/show_bug.cgi?id=1639542
      console.error(
        stripIndent`
          A DOMException 'InvalidStateError' was thrown when storing the profile data to a local indexedDB.
          Are you in private mode?
          We'll ignore the error, but you won't be able to act on this profile's data in the future.
        `
      );
    } else {
      console.error(
        'An error was thrown while storing the profile data to a local indexedDB.',
        e
      );
    }
  }
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
      // Grab the original pre-published state, so that we can revert back to it if needed.
      const prePublishedState = getState();

      // We'll persist any computed profileName, because we may lose it otherwise
      // (This is the case with zip files).
      const profileName = getProfileName(prePublishedState);

      // Get the current generation of this request. It can be aborted midway through.
      // This way we can check inside this async function if we need to bail out early.
      const uploadGeneration = getUploadGeneration(prePublishedState);

      // Create an abort function before the first async call, but we won't
      // start the upload until much later.
      const { abortUpload, startUpload } = uploadBinaryProfileData();
      const abortfunction = () => {
        // We dispatch the action right away, so that the UI is updated.
        // Otherwise if the user pressed "Cancel" during a long process, like
        // the compression, we wouldn't get a feedback until the end.
        // Later on the promise from `startUpload` will get rejected too, and we
        // handle this in the `catch` block.
        dispatch({ type: 'UPLOAD_ABORTED' });
        abortUpload();
      };
      dispatch(uploadCompressionStarted(abortfunction));

      const sanitizedInformation = getSanitizedProfile(prePublishedState);
      const gzipData: Uint8Array = await getSanitizedProfileData(
        prePublishedState
      );

      // The previous line was async, check to make sure that this request is still valid.
      // The upload could have been aborted while we were compressing the data.
      if (uploadGeneration !== getUploadGeneration(getState())) {
        return false;
      }

      dispatch(uploadStarted());

      // Upload the profile, and notify it with the amount of data that has been
      // uploaded.
      const hashOrToken = await startUpload(gzipData, uploadProgress => {
        dispatch(updateUploadProgress(uploadProgress));
      });

      const hash = extractProfileTokenFromJwt(hashOrToken);

      // Because we want to store the published profile even when the upload
      // generation changed, we store the data here, before the state is fully
      // updated, and we'll have to predict the state inside this function.
      // Note that this function is asynchronous, we don't await it on purpose.
      // We catch all errors in this function.
      storeJustPublishedProfileData(
        hash,
        hashOrToken === hash ? null : hashOrToken,
        sanitizedInformation,
        prePublishedState
      );

      // The previous lines were async, check to make sure that this request is still valid.
      // Make sure that the generation is incremented again when there's an
      // asynchronous operation later on, so that this works well as a guard.
      if (uploadGeneration !== getUploadGeneration(getState())) {
        return false;
      }

      const removeProfileInformation = getRemoveProfileInformation(
        prePublishedState
      );
      if (removeProfileInformation) {
        const {
          committedRanges,
          oldThreadIndexToNew,
          profile,
        } = sanitizedInformation;
        // Hide the old UI gracefully.
        await dispatch(hideStaleProfile());

        // Update the UrlState so that we are sanitized.
        dispatch(
          profileSanitized(
            hash,
            committedRanges,
            oldThreadIndexToNew,
            profileName,
            prePublishedState
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
        dispatch(
          profilePublished(
            hash,
            profileName,
            // Only include the pre-published state if we want to be able to revert
            // the profile. If we are viewing from-addon, then it's only a single
            // profile.
            getDataSource(prePublishedState) === 'from-addon'
              ? null
              : prePublishedState
          )
        );
      }

      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'succeeded',
      });
    } catch (error) {
      if (error.name === 'UploadAbortedError') {
        // We already dispatched an action in the augmentedAbortFunction above,
        // so we just handle analytics here.
        sendAnalytics({
          hitType: 'event',
          eventCategory: 'profile upload',
          eventAction: 'aborted',
        });
      } else {
        dispatch(uploadFailed(error));
        sendAnalytics({
          hitType: 'event',
          eventCategory: 'profile upload',
          eventAction: 'failed',
        });
      }
      return false;
    }
    return true;
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
  profileName: string | null,
  prePublishedState: State | null
): Action {
  return {
    type: 'SANITIZED_PROFILE_PUBLISHED',
    hash,
    committedRanges,
    oldThreadIndexToNew,
    profileName,
    prePublishedState,
  };
}

/**
 * Report that the profile was published, but not sanitized.
 */
export function profilePublished(
  hash: string,
  profileName: string | null,
  // If we're publishing from a URL or Zip file, then offer to revert to the previous
  // state.
  prePublishedState: State | null
): Action {
  return {
    type: 'PROFILE_PUBLISHED',
    hash,
    profileName,
    prePublishedState,
  };
}

export function revertToPrePublishedState(): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const prePublishedState = ensureExists(
      getPrePublishedState(getState()),
      'Expected to find an original profile when reverting to it.'
    );

    await dispatch(hideStaleProfile());

    dispatch({
      type: 'REVERT_TO_PRE_PUBLISHED_STATE',
      prePublishedState: prePublishedState,
    });
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
