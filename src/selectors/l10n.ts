/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Selector,
  L10nState,
  Localization,
  PseudoStrategy,
} from 'firefox-profiler/types';

export const getL10nState: Selector<L10nState> = (state) => state.l10n;
export const getLocalization: Selector<Localization> = (state) =>
  getL10nState(state).localization;
export const getPrimaryLocale: Selector<string | null> = (state) =>
  getL10nState(state).primaryLocale;
export const getDirection: Selector<'ltr' | 'rtl'> = (state) =>
  getL10nState(state).direction;
export const getRequestedLocales: Selector<string[] | null> = (state) =>
  getL10nState(state).requestedLocales;
export const getPseudoStrategy: Selector<PseudoStrategy> = (state) =>
  getL10nState(state).pseudoStrategy;
