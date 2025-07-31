/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Reducer, L10nState, PseudoStrategy } from 'firefox-profiler/types';
import { ReactLocalization } from '@fluent/react';
import { combineReducers } from 'redux';

const requestedLocales: Reducer<string[] | null> = (state = null, action) => {
  switch (action.type) {
    case 'REQUEST_L10N':
      return action.locales;
    default:
      return state;
  }
};

const pseudoStrategy: Reducer<PseudoStrategy> = (state = null, action) => {
  switch (action.type) {
    case 'TOGGLE_PSEUDO_STRATEGY':
      return action.pseudoStrategy;
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

const primaryLocale: Reducer<string | null> = (state = null, action) => {
  switch (action.type) {
    case 'RECEIVE_L10N':
      return action.primaryLocale;
    default:
      return state;
  }
};

const direction: Reducer<'ltr' | 'rtl'> = (state = 'ltr', action) => {
  switch (action.type) {
    case 'RECEIVE_L10N':
      return action.direction;
    default:
      return state;
  }
};

const l10nReducer: Reducer<L10nState> = combineReducers({
  localization,
  primaryLocale,
  direction,
  requestedLocales,
  pseudoStrategy,
});

export default l10nReducer;
