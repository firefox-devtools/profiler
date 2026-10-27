/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * localStorage access for the profile chat: the feature flag and the user's
 * Anthropic API key. Storage can throw (e.g. disabled cookies), in which case
 * the feature behaves as disabled and the key as missing.
 */

const API_KEY_STORAGE_KEY = 'profiler.chat.anthropicApiKey';
const ENABLED_STORAGE_KEY = 'profiler.chat.enabled';

/**
 * The chat is hidden unless enabled from the console with:
 *   localStorage.setItem('profiler.chat.enabled', 'true')
 */
export function isChatFeatureEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getApiKey(): string | null {
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setApiKey(apiKey: string): void {
  try {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch {
    // The key then only lives until the page is reloaded, see hasApiKey.
  }
}

export function removeApiKey(): void {
  try {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // Nothing to remove.
  }
}
