/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { FluentBundle, FluentResource } from '@fluent/bundle';
import {
  PSEUDO_STRATEGIES,
  PSEUDO_STRATEGIES_DIRECTION,
} from 'firefox-profiler/utils/l10n-pseudo';

// This contains the locales we support in the production. Don't forget to update
// the array RTL_LOCALES when adding a RTL locale, if necessary.
// AVAILABLE_STAGING_LOCALES is replaced, using webpack's DefinePlugin, by all
// available locales, when running with L10N=1, using the "l10n" versions of the
// yarn scripts. Especially this is done when building and deploying the l10n
// branch in netlify.
export const AVAILABLE_LOCALES: Array<string> = AVAILABLE_STAGING_LOCALES || [
  'de',
  'en-GB',
  'en-US',
  'it',
  'pt-BR',
  'zh-TW',
];
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
  pseudoStrategy?: 'accented' | 'bidi'
): Generator<FluentBundle, void, void> {
  const transform = pseudoStrategy
    ? PSEUDO_STRATEGIES[pseudoStrategy]
    : undefined;
  for (const [locale, messages] of fetchedMessages) {
    const resource = new FluentResource(messages);
    const bundle = new FluentBundle(locale, {
      transform,
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
  pseudoStrategy?: 'accented' | 'bidi'
): 'ltr' | 'rtl' {
  if (pseudoStrategy && pseudoStrategy in PSEUDO_STRATEGIES_DIRECTION) {
    return PSEUDO_STRATEGIES_DIRECTION[pseudoStrategy];
  }

  // The language can be simple like "fr" but also more precise like "fr-FR".
  const tag = language.split('-')[0];
  return RTL_LOCALES.includes(tag) ? 'rtl' : 'ltr';
}
