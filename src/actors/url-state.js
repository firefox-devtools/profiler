/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getUrlState } from '../reducers/url-state';
import {
  urlStateHasChanged,
  updateUrlState,
  show404,
} from '../actions/url-state';
import { urlFromState, stateFromLocation } from '../url-handling';

import type { Dispatch } from '../types/store';
import type { State, UrlState } from '../types/reducers';

let previousUrlState = null;
export default function stateWatcher(state: State, dispatch: Dispatch) {
  function updateState() {
    if (window.history.state) {
      dispatch(updateUrlState(window.history.state));
    } else {
      try {
        const urlState = stateFromLocation(window.location);
        // replacing the existing location ensures we get the latest format for the URL
        updateLocation(urlState, true);
        dispatch(updateUrlState(urlState));
      } catch (e) {
        console.error(e);
        show404(window.location.pathname + window.location.search);
      }
    }
  }

  function initialSetup() {
    updateState();
    window.addEventListener('popstate', updateState);
  }

  function updateLocation(urlState: UrlState, replace: boolean = false) {
    const newUrl = urlFromState(urlState);
    const operation = replace
      ? window.history.replaceState.bind(window.history)
      : window.history.pushState.bind(window.history);
    if (newUrl !== window.location.pathname + window.location.search) {
      operation(urlState, document.title, newUrl);
    }
  }

  const newUrlState = getUrlState(state);
  if (!previousUrlState) {
    // first run
    previousUrlState = newUrlState;
    initialSetup();
  } else if (newUrlState !== previousUrlState) {
    previousUrlState = newUrlState;
    updateLocation(newUrlState);
    dispatch(urlStateHasChanged());
  }
}
