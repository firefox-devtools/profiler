/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { FluentBundle, FluentResource } from '@fluent/bundle';
import {
  PSEUDO_STRATEGIES,
  PSEUDO_STRATEGIES_DIRECTION,
} from 'firefox-profiler/utils/l10n-pseudo';
import { SHORTDATE } from 'firefox-profiler/utils/l10n-ftl-functions';

// This object contains the locales that are at least 90% complete and
// that we enable by default. Don't forget to update the array RTL_LOCALES when
// adding a RTL locale, if necessary.
// The localized names are copied from the curated list that can be found at
// https://mozilla-l10n.github.io/firefox-languages/.
// We use the language names in their own language.
// Also note that the order specified here is the order they'll be displayed in the
// language switcher, so it's important to keep the alphabetical order.
export const AVAILABLE_LOCALES_TO_LOCALIZED_NAMES = {
  de: 'Deutsch',
  el: 'Ελληνικά',
  'en-GB': 'English (GB)',
  'en-US': 'English (US)',
  'es-CL': 'Español', // Use "Español (CL)" once we have more spanish versions
  fr: 'Français',
  'fy-NL': 'Frysk',
  ia: 'Interlingua',
  it: 'Italiano',
  nl: 'Nederlands',
  'pt-BR': 'Português (BR)',
  'sv-SE': 'Svenska',
  uk: 'Українська',
  'zh-CN': '简体中文',
  'zh-TW': '正體中文',
};

// This constant contains all locales available to our application. The default
// is to use the keys of the previous object.
// However when running the yarn scripts with the environment variable L10N=1,
// webpack replaces AVAILABLE_STAGING_LOCALES with all locales that have an FTL
// file in the repository, and this becomes the value for this constant. This
// is used in our l10n branch when deployed on netlify.
export const AVAILABLE_LOCALES: Array<string> =
  AVAILABLE_STAGING_LOCALES ||
  Object.keys(AVAILABLE_LOCALES_TO_LOCALIZED_NAMES);

export const DEFAULT_LOCALE = 'en-US';

// This array contains only the locales that are RTL (Right-To-Left).
// This list has been copied from the l20n library in the Firefox OS project
// (ancestor of Fluent):
// https://github.com/mozilla-b2g/gaia/blob/975a35c0f5010df341e96d6c5ec60217f5347412/shared/js/intl/l20n-client.js#L31-L35
const RTL_LOCALES = ['ar', 'he', 'fa', 'ps', 'ur'];

/**
 * Fetches ftl file of different locales.
 * Returns the locale and the ftl string grouped as an Array.
 */
export async function fetchMessages(locale: string): Promise<[string, string]> {
  const response = await fetch(`/locales/${locale}/app.ftl`);
  const messages = await response.text();
  return [locale, messages];
}

/**
 * A generator function responsible for building the sequence
 * of FluentBundle instances in the order of user's language
 * preferences.
 */
export function* lazilyParsedBundles(
  fetchedMessages: Array<[string, string]>,
  pseudoStrategy?: 'accented' | 'bidi' | null
): Generator<FluentBundle, void, void> {
  const transform = pseudoStrategy
    ? PSEUDO_STRATEGIES[pseudoStrategy]
    : undefined;
  for (const [locale, messages] of fetchedMessages) {
    const resource = new FluentResource(messages);
    const bundle = new FluentBundle(locale, {
      transform,
      functions: { SHORTDATE },
    });
    bundle.addResource(resource);
    yield bundle;
  }
}

/**
 * From a language string and a pseudoStrategy, this returns which direction the
 * document should be in.
 */
export function getLocaleDirection(
  language: string,
  pseudoStrategy?: 'accented' | 'bidi' | null
): 'ltr' | 'rtl' {
  if (pseudoStrategy && pseudoStrategy in PSEUDO_STRATEGIES_DIRECTION) {
    return PSEUDO_STRATEGIES_DIRECTION[pseudoStrategy];
  }

  // The language can be simple like "fr" but also more precise like "fr-FR".
  const tag = language.split('-')[0];
  return RTL_LOCALES.includes(tag) ? 'rtl' : 'ltr';
}
