/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { FluentBundle, FluentResource } from '@fluent/bundle';
import { PSEUDO_STRATEGIES } from 'firefox-profiler/utils/l10n-pseudo';

export const AVAILABLE_LOCALES: Array<string> = ['en-US'];
export const DEFAULT_LOCALE = 'en-US';

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
