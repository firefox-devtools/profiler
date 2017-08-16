/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import doShortenUrl from '../utils/shorten-url';

import type { Action, ThunkAction } from '../types/store';

export function shorteningUrl(url: string): Action {
  return {
    type: 'SHORTENING_URL',
    url,
  };
}

export function shortenedUrl(longUrl: string, shortUrl: string): Action {
  return {
    type: 'SHORTENED_URL',
    longUrl,
    shortUrl,
  };
}

export function shortenUrl(url: string): ThunkAction<Promise<string>> {
  return async dispatch => {
    dispatch(shorteningUrl(url));
    const shortUrl = await doShortenUrl(url);
    dispatch(shortenedUrl(url, shortUrl));
    return shortUrl;
  };
}
