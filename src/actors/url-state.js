/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getURLState } from '../reducers/url-state';
import { urlStateHasChanged } from '../actions/url-state';
import type { Dispatch } from '../types/store';
import type { State } from '../types/reducers';

let previousUrlState = null;
export default function stateWatcher(state: State, dispatch: Dispatch) {
  const newUrlState = getURLState(state);
  if (!previousUrlState) {
    previousUrlState = newUrlState;
  } else if (newUrlState !== previousUrlState) {
    previousUrlState = newUrlState;
    dispatch(urlStateHasChanged());
  }
}
