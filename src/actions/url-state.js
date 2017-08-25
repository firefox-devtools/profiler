/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';

export function urlStateHasChanged(): Action {
  return {
    type: 'URL_STATE_HAS_CHANGED',
  };
}
