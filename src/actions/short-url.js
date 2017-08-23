/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import doShortenURL from '../utils/shorten-url';
import { getURLState } from '../reducers/url-state';

import type { Action, Dispatch, ThunkAction } from '../types/store';
import type { State } from '../types/reducers';

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
