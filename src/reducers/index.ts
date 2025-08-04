/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import profileView from './profile-view';
import app from './app';
import urlState from './url-state';
import icons from './icons';
import zippedProfiles from './zipped-profiles';
import publish from './publish';
import l10n from './l10n';
import code from './code';
import { combineReducers } from 'redux';
import type { Reducer, State } from 'firefox-profiler/types';

/**
 * This function provides a mechanism to swap out to an old state that we have
 * retained.
 */
const wrapReducerInResetter = (
  regularRootReducer: Reducer<State>
): Reducer<State> => {
  return (state, action) => {
    switch (action.type) {
      case 'REVERT_TO_PRE_PUBLISHED_STATE':
        return action.prePublishedState;
      default:
        return regularRootReducer(state, action);
    }
  };
};

const rootReducer: Reducer<State> = wrapReducerInResetter(
  combineReducers({
    app,
    profileView,
    urlState,
    icons,
    zippedProfiles,
    publish,
    l10n,
    code,
  })
);

export default rootReducer;
