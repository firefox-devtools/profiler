/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type {
  Selector,
  L10nState,
  Localization,
  L10nFetchingPhase,
} from 'firefox-profiler/types';

export const getL10nState: Selector<L10nState> = (state) => state.l10n;
export const getL10nFetchingPhase: Selector<L10nFetchingPhase> = (state) =>
  getL10nState(state).l10nFetchingPhase;
export const getLocalization: Selector<Localization> = (state) =>
  getL10nState(state).localization;
export const getPrimaryLocale: Selector<string | null> = (state) =>
  getL10nState(state).primaryLocale;
export const getDirection: Selector<'ltr' | 'rtl'> = (state) =>
  getL10nState(state).direction;
