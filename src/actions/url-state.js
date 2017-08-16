/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';
import type { UrlState } from '../types/reducers';

export function urlStateHasChanged(): Action {
  return {
    type: 'URL_STATE_HAS_CHANGED',
  };
}

export function updateUrlState(urlState: UrlState): Action {
  return { type: '@@urlenhancer/updateUrlState', urlState };
}

export function show404(url: string): Action {
  return { type: 'ROUTE_NOT_FOUND', url };
}
