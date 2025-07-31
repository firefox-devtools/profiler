/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Action, Localization, PseudoStrategy } from 'firefox-profiler/types';

/**
 * Notify that translations for the UI are being fetched.
 */
export function requestL10n(locales: Array<string>): Action {
  return {
    type: 'REQUEST_L10N',
    locales,
  };
}

/**
 * Receive translations for a locale.
 */
export function receiveL10n(
  localization: Localization,
  primaryLocale: string,
  direction: 'ltr' | 'rtl'
): Action {
  return {
    type: 'RECEIVE_L10N',
    localization: localization,
    primaryLocale,
    direction,
  };
}

export function togglePseudoStrategy(pseudoStrategy: PseudoStrategy): Action {
  return {
    type: 'TOGGLE_PSEUDO_STRATEGY',
    pseudoStrategy,
  };
}
