/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Reducer, L10nState } from 'firefox-profiler/types';
import { ReactLocalization } from '@fluent/react';
import { combineReducers } from 'redux';

const isL10nFetching: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'REQUEST_L10N':
      return true;
    case 'RECEIVE_L10N':
      return false;
    default:
      return state;
  }
};

const localization: Reducer<ReactLocalization> = (
  state = new ReactLocalization([]),
  action
) => {
  switch (action.type) {
    case 'RECEIVE_L10N':
      return action.localization;
    default:
      return state;
  }
};

const l10nReducer: Reducer<L10nState> = combineReducers({
  isL10nFetching,
  localization,
});

export default l10nReducer;
