/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Selector, L10nState, Localization } from 'firefox-profiler/types';

export const getL10nState: Selector<L10nState> = state => state.l10n;
export const getIsL10nFetching: Selector<boolean> = state =>
  getL10nState(state).isL10nFetching;
export const getLocalization: Selector<Localization> = state =>
  getL10nState(state).localization;
