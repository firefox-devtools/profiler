/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { stripIndent } from 'common-tags';

import { uploadBinaryProfileData } from 'firefox-profiler/profile-logic/profile-store';
import { sendAnalytics } from 'firefox-profiler/utils/analytics';
import type { SanitizeProfileResult } from 'firefox-profiler/profile-logic/sanitize';
import {
  getUploadGeneration,
  getSanitizedProfile,
  getRemoveProfileInformation,
  getPrePublishedState,
  getSanitizedProfileEncodingState,
} from 'firefox-profiler/selectors/publish';
import {
  getDataSource,
  getProfileNameForStorage,
  getUrlPredictor,
} from 'firefox-profiler/selectors/url-state';
import {
  getProfile,
  getZeroAt,
  getCommittedRange,
} from 'firefox-profiler/selectors/profile';
import { viewProfile } from './receive-profile';
import { ensureExists } from 'firefox-profiler/utils/types';
import { extractProfileTokenFromJwt } from 'firefox-profiler/utils/jwt';
import { withHistoryReplaceStateSync } from 'firefox-profiler/app-logic/url-handling';
import { persistUploadedProfileInformationToDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';

import type {
  Action,
  ThunkAction,
  CheckedSharingOptions,
  StartEndRange,
  State,
  Profile,
  ProfileIndexTranslationMaps,
} from 'firefox-profiler/types';
import { compress } from 'firefox-profiler/utils/gz';
import { serializeProfile } from 'firefox-profiler/profile-logic/process-profile';

export function updateSharingOption(
  slug: keyof CheckedSharingOptions,
  value: boolean
): Action {
  return {
    type: 'UPDATE_SHARING_OPTION',
    slug,
    value,
  };
}

export function sanitizedProfileEncodingStarted(
  sanitizedProfile: Profile
): Action {
  return {
    type: 'SANITIZED_PROFILE_ENCODING_STARTED',
    sanitizedProfile,
  };
}

export function sanitizedProfileEncodingCompleted(
  sanitizedProfile: Profile,
  profileData: Blob
): Action {
  return {
    type: 'SANITIZED_PROFILE_ENCODING_COMPLETED',
    sanitizedProfile,
    profileData,
  };
}

export function sanitizedProfileEncodingFailed(
  sanitizedProfile: Profile,
  error: Error
): Action {
  return {
    type: 'SANITIZED_PROFILE_ENCODING_FAILED',
    sanitizedProfile,
    error,
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
export function uploadFailed(error: unknown): Action {
  return { type: 'UPLOAD_FAILED', error };
}

// This function stores information about the published profile, depending on
// various states. Especially it handles the case that we sanitized part of the
// profile. The sanitized information is passed along because it can be costly
// to rerun in case the selectors have been invalidated.
// Note that the returned promise won't ever be rejected, all errors are handled
// here.
async function persistJustUploadedProfileInformationToDb(
  profileToken: string,
  jwtToken: string | null,
  sanitizedInformation: SanitizeProfileResult,
  prepublishedState: State
): Promise<void> {
  if (process.env.NODE_ENV === 'test' && !window.indexedDB) {
    // In tests where we're not especially testing this behavior, we may still
    // want to test behavior related to publication. In that case we won't
    // always have the indexeddb mock, so let's opt-out of the indexeddb-related
    // behavior.
    return;
  }

  const zeroAt = getZeroAt(prepublishedState);
  const adjustRange = (range: StartEndRange) => ({
    start: range.start - zeroAt,
    end: range.end - zeroAt,
  });

  // We'll persist any computed profileName, because we may lose it otherwise
  // (This is the case with zip files).
  const profileName = getProfileNameForStorage(prepublishedState);

  // The url predictor returns the URL that would be serialized out of the state
  // resulting of the actions passed in argument.
  // We need this here because the action of storing the profile data in the DB
  // happens before the sanitization really happens in the main state, so we
  // need to simulate it.
  const urlPredictor = getUrlPredictor(prepublishedState);
  let predictedUrl;

  const removeProfileInformation =
    getRemoveProfileInformation(prepublishedState);
  if (removeProfileInformation) {
    // In case you wonder, committedRanges is either an empty array (if the
    // range was sanitized) or `null` (otherwise).
    const { committedRanges, translationMaps } = sanitizedInformation;

    // Predicts the URL we'll have after local sanitization.
    predictedUrl = urlPredictor(
      profileSanitized(
        profileToken,
        committedRanges,
        translationMaps,
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

  try {
    await persistUploadedProfileInformationToDb({
      profileToken,
      jwtToken,
      publishedDate: new Date(),
      name: profileName,
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

export type ProfileEncodingResult =
  | {
      type: 'SUCCESS';
      profileData: Blob;
    }
  | { type: 'ERROR'; error: Error };

function unwrapEncodedProfile(encodingResult: ProfileEncodingResult): Blob {
  if (encodingResult.type === 'ERROR') {
    throw encodingResult.error;
  }
  return encodingResult.profileData;
}

export type InflightProfileEncoding = {
  sanitizedProfile: Profile;
  encodingPromise: Promise<ProfileEncodingResult>;
};

/**
 * Kick off "encoding" of the sanitized profile. Specifically this means:
 * - Compute the sanitized profile
 * - Serialize the profile to a buffer
 * - Kick off the asynchronous compression of the buffer
 *
 * The asynchronous compression can take a few seconds, so we want to kick
 * it off immediately when the profile publishing panel is opened. We also
 * want to be able to make use of the current in-flight compression if the
 * user clicks the upload button before compression is done. This is why
 * we return an `InflightProfileEncoding` object from this action; it contains
 * a promise which lets other parts of the publishing pipeline wait on the
 * compressed results.
 *
 * This thunk action is synchronous.
 */
export function encodeSanitizedProfile(
  previousInflightEncoding?: InflightProfileEncoding
): ThunkAction<InflightProfileEncoding> {
  return (dispatch, getState): InflightProfileEncoding => {
    const state = getState();
    const sanitizedProfile = getSanitizedProfile(state).profile;

    if (previousInflightEncoding?.sanitizedProfile === sanitizedProfile) {
      // No need to kick of another compression. The current encoding may still
      // be in-flight, and returning the original promise allows the caller to
      // await it.
      return previousInflightEncoding;
    }

    const encodingState = getSanitizedProfileEncodingState(state);
    if (
      encodingState.phase === 'DONE' &&
      encodingState.sanitizedProfile === sanitizedProfile
    ) {
      // We already have an encoded version of this profile in our state! Use it.
      return {
        sanitizedProfile,
        encodingPromise: Promise.resolve({
          type: 'SUCCESS',
          profileData: encodingState.profileData,
        }),
      };
    }

    // Kick off a new encoding for this profile. Don't await the promise,
    // just return it as part of the InflightProfileEncoding.
    const encodingPromise: Promise<ProfileEncodingResult> = (async function () {
      try {
        dispatch(sanitizedProfileEncodingStarted(sanitizedProfile));
        const gzipData = await compress(serializeProfile(sanitizedProfile));
        const blob = new Blob([gzipData], { type: 'application/octet-binary' });
        dispatch(sanitizedProfileEncodingCompleted(sanitizedProfile, blob));
        return { type: 'SUCCESS', profileData: blob };
      } catch (error) {
        dispatch(sanitizedProfileEncodingFailed(sanitizedProfile, error));
        console.error('Error while compressing the profile data', error);
        return { type: 'ERROR', error };
      }
    })();

    return { sanitizedProfile, encodingPromise };
  };
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
export function attemptToPublish(
  previousInflightEncoding?: InflightProfileEncoding
): ThunkAction<Promise<boolean>> {
  return async (dispatch, getState) => {
    try {
      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'start',
      });
      // Grab the original pre-published state, so that we can revert back to it if needed.
      const prePublishedState = getState();

      // We'll persist any computed profileName in the URL, because we may lose
      // it otherwise (This is the case with zip files).
      const profileName = getProfileNameForStorage(prePublishedState);

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
      const profileEncoding = dispatch(
        encodeSanitizedProfile(previousInflightEncoding)
      );
      const encodingResult = await profileEncoding.encodingPromise;

      // The previous line was async, check to make sure that this request is still valid.
      // The upload could have been aborted while we were compressing the data.
      if (uploadGeneration !== getUploadGeneration(getState())) {
        return false;
      }

      const encodedProfile = unwrapEncodedProfile(encodingResult);

      dispatch(uploadStarted());

      // Upload the profile, and notify it with the amount of data that has been
      // uploaded.
      const hashOrToken = await startUpload(
        encodedProfile,
        (uploadProgress) => {
          dispatch(updateUploadProgress(uploadProgress));
        }
      );

      const hash = extractProfileTokenFromJwt(hashOrToken);

      // Because we want to store the published profile even when the upload
      // generation changed, we store the data here, before the state is fully
      // updated, and we'll have to predict the state inside this function.
      // We catch all errors in this function.
      await persistJustUploadedProfileInformationToDb(
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

      const removeProfileInformation =
        getRemoveProfileInformation(prePublishedState);
      if (removeProfileInformation) {
        const { committedRanges, translationMaps, profile } =
          sanitizedInformation;
        // Hide the old UI gracefully.
        await dispatch(hideStaleProfile());

        // Update the UrlState so that we are sanitized.
        dispatch(
          profileSanitized(
            hash,
            committedRanges,
            translationMaps,
            profileName,
            prePublishedState
          )
        );

        // At this moment, we don't have the profile data in state anymore,
        // because the action profileSanitized will reset all the state of
        // profile-view, including the profile data. In the future we may want
        // to fix this (for example move the profile data in another reducer, or
        // keep the profile state when resetting the state).
        // This still works because it also sets the "phase" state to
        // "TRANSITIONING_FROM_STALE_PROFILE" that avoids rendering anything
        // (see AppViewRouter).
        // viewProfile below needs to synchronously dispatch the new profile
        // again so that the user doesn't see a glitch. This is still most
        // probably a performance problem because all components are unmounted
        // and mounted again.

        // Swap out the URL state, since the view profile calculates all of the default
        // settings. If we don't do this then we can go back in history to where we
        // are trying to view a profile without valid view settings.
        withHistoryReplaceStateSync(() => {
          // Multiple dispatches are usually to be avoided, but viewProfile requires
          // the next UrlState in place. It could be rewritten to have a UrlState passed
          // in as a paremeter, but that doesn't seem worth it at the time of this writing.
          dispatch(viewProfile(profile));
        });
      } else {
        const dataSource = getDataSource(prePublishedState);
        const isUnpublished =
          dataSource === 'unpublished' ||
          dataSource === 'from-browser' ||
          dataSource === 'from-post-message';
        dispatch(
          profilePublished(
            hash,
            profileName,
            // Only include the pre-published state if we want to be able to revert
            // the profile. If we are viewing from-browser, then it's only a single
            // profile.
            isUnpublished ? null : prePublishedState
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
  translationMaps: ProfileIndexTranslationMaps | null,
  profileName: string,
  prePublishedState: State | null
): Action {
  return {
    type: 'SANITIZED_PROFILE_PUBLISHED',
    hash,
    committedRanges,
    translationMaps,
    profileName,
    prePublishedState,
  };
}

/**
 * Report that the profile was published, but not sanitized.
 */
export function profilePublished(
  hash: string,
  profileName: string,
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
  return (dispatch) => {
    dispatch({ type: 'HIDE_STALE_PROFILE' });
    return new Promise((resolve) => {
      // This timing should match .profileViewerFadeOut.
      setTimeout(resolve, 300);
    });
  };
}
