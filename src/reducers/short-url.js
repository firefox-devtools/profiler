/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { combineReducers } from 'redux';
import type { Action } from '../types/actions';
import type { ShortUrlState, State, Reducer } from '../types/reducers';

function value(state: string = window.location.href, action: Action): string {
  switch (action.type) {
    case 'SHORTENING_URL':
      return action.url;
    case 'SHORTENED_URL':
      return action.shortURL;
    case 'RESET_SHORT_URL':
      return window.location.href;
    default:
      return state;
  }
}

function originalUrl(state: string = '', action: Action): string {
  switch (action.type) {
    case 'SHORTENED_URL':
      return action.longURL;
    case 'RESET_SHORT_URL':
      return '';
    default:
      return state;
  }
}

const shortUrlStateReducer: Reducer<ShortUrlState> = combineReducers({
  value,
  originalUrl,
});

export default shortUrlStateReducer;

export const getShortUrl = (state: State): ShortUrlState => state.shortUrl;
export const getValue = (state: State): string => getShortUrl(state).value;
export const getOriginalUrl = (state: State): string =>
  getShortUrl(state).originalUrl;
