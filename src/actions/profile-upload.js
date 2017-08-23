/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import doShortenURL from '../utils/shorten-url';
import { getURLState } from '../reducers/url-state';

import type { Action, Dispatch, ThunkAction } from '../types/store';
import type { State } from '../types/reducers';

export function uploadStart(): Action {
  return {
    type: 'PROFILE_UPLOAD_START',
  };
}

export function uploadError(error: Error): Action {
  return {
    type: 'PROFILE_UPLOAD_ERROR',
    error,
  };
}

export function uploadSuccess(hash: string): Action {
  return {
    type: 'PROFILE_UPLOAD_SUCCESS',
    hash,
  };
}

export function uploadProgress(progress: number): Action {
  return {
    type: 'PROFILE_UPLOAD_PROGRESS',
    progress,
  };
}

export function shorteningURL(url: string): Action {
  return {
    type: 'SHORTENING_URL',
    url,
  };
}

export function shortenedURL(longURL: string, shortURL: string): Action {
  return {
    type: 'SHORTENED_URL',
    longURL,
    shortURL,
  };
}

export function resetShortURL(): Action {
  return {
    type: 'RESET_SHORT_URL',
  };
}

export function shortenURL(url: string): ThunkAction<Promise<string>> {
  return async dispatch => {
    dispatch(shorteningURL(url));
    const shortURL = await doShortenURL(url);
    dispatch(shortenedURL(url, shortURL));
    return shortURL;
  };
}

export function uploadBinaryProfileData(
  data: string // TODO find what this really is
): ThunkAction<Promise<void>> {
  return dispatch => {
    dispatch(uploadStart());
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.onload = () => {
        if (xhr.status === 200) {
          dispatch(uploadSuccess(xhr.responseText));
          resolve();
        } else {
          const error = new Error(
            `xhr onload with status != 200, xhr.statusText: ${xhr.statusText}`
          );
          dispatch(uploadError(error));
          reject(error);
        }
      };

      xhr.onerror = () => {
        const error = new Error(
          `xhr onerror was called, xhr.statusText: ${xhr.statusText}`
        );
        dispatch(uploadError(error));
        reject(error);
      };

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          dispatch(uploadProgress(e.loaded / e.total));
        }
      };

      xhr.open('POST', 'https://profile-store.appspot.com/compressed-store');
      xhr.send(data);
    });
  };
}

let previousUrlState = null;
export function stateWatcher(state: State, dispatch: Dispatch) {
  const newUrlState = getURLState(state);
  if (!previousUrlState) {
    previousUrlState = newUrlState;
  } else if (newUrlState !== previousUrlState) {
    previousUrlState = newUrlState;
    dispatch(resetShortURL());
  }
}
