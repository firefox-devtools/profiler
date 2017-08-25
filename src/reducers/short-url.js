/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/actions';
import type { ShortUrlState, State, Reducer } from '../types/reducers';

const shortUrlStateReducer: Reducer<ShortUrlState> = (
  state: ShortUrlState = { value: window.location.href, originalUrl: '' },
  action: Action
): ShortUrlState => {
  switch (action.type) {
    case 'SHORTENING_URL':
      return {
        value: action.url,
        originalUrl: '',
      };
    case 'SHORTENED_URL':
      return {
        value: action.shortURL,
        originalUrl: action.longURL,
      };
    case 'URL_STATE_HAS_CHANGED':
      if (state.originalUrl !== window.location.href) {
        return {
          value: window.location.href,
          originalUrl: '',
        };
      }
      return state;
    default:
      return state;
  }
};

export default shortUrlStateReducer;

export const getShortUrl = (state: State): ShortUrlState => state.shortUrl;
export const getValue = (state: State): string => getShortUrl(state).value;
export const getOriginalUrl = (state: State): string =>
  getShortUrl(state).originalUrl;
