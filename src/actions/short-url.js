/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import doShortenURL from '../utils/shorten-url';

import type { Action, ThunkAction } from '../types/store';

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

export function shortenURL(url: string): ThunkAction<Promise<string>> {
  return async dispatch => {
    dispatch(shorteningURL(url));
    const shortURL = await doShortenURL(url);
    dispatch(shortenedURL(url, shortURL));
    return shortURL;
  };
}
