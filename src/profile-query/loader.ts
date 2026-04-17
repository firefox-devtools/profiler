/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as fs from 'fs';

import createStore from '../app-logic/create-store';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { finalizeProfileView, loadProfile } from '../actions/receive-profile';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import {
  extractProfileUrlFromProfilerUrl,
  fetchProfile,
} from '../utils/profile-fetch';
import type { TemporaryError } from '../utils/errors';
import type { Store } from '../types/store';
import type { StartEndRange, Profile } from 'firefox-profiler/types';
import { SymbolStore } from '../profile-logic/symbol-store';
import {
  symbolicateProfile,
  applySymbolicationSteps,
} from '../profile-logic/symbolication';
import type { SymbolicationStepInfo } from '../profile-logic/symbolication';
import * as MozillaSymbolicationAPI from '../profile-logic/mozilla-symbolication-api';
import { SYMBOL_SERVER_URL } from '../app-logic/constants';

/**
 * Helper function to detect if the input is a URL
 */
function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

/**
 * Extract a ?symbolServer= query parameter from a profiler.firefox.com URL.
 */
function extractSymbolServerFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('symbolServer') ?? undefined;
  } catch (_) {
    return undefined;
  }
}

async function symbolicateInPlace(
  profile: Profile,
  symbolServerUrl: string,
  onSymbolicating: () => void
): Promise<void> {
  onSymbolicating();
  console.log(`Symbolicating profile using ${symbolServerUrl}...`);

  const symbolStore = new SymbolStore({
    requestSymbolsFromServer: async (requests) => {
      return MozillaSymbolicationAPI.requestSymbols(
        'symbol server',
        requests,
        async (path, json) => {
          const response = await fetch(symbolServerUrl + path, {
            body: json,
            method: 'POST',
          });
          return response.json();
        }
      );
    },
    requestSymbolsFromBrowser: async () => [],
    requestSymbolsViaSymbolTableFromBrowser: async () => {
      throw new Error('Not supported in this context');
    },
  });

  const symbolicationSteps: SymbolicationStepInfo[] = [];
  await symbolicateProfile(profile, symbolStore, (step) => {
    symbolicationSteps.push(step);
  });

  const { shared, threads } = applySymbolicationSteps(
    profile.threads,
    profile.shared,
    symbolicationSteps
  );
  profile.shared = shared;
  profile.threads = threads;
  profile.meta.symbolicated = true;
  console.log('Symbolication complete');
}

/**
 * Helper function to follow redirects and get the final URL.
 * This is useful for short URLs like https://share.firefox.dev/4oLEjCw
 */
async function followRedirects(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
  });
  return response.url;
}

export interface LoadResult {
  store: Store;
  rootRange: StartEndRange;
}

/**
 * Load a profile from a file path or URL.
 * Returns a store and root range that can be used to construct a ProfileQuerier.
 *
 * If the profile is not already symbolicated, symbolication is performed
 * automatically. The symbol server URL is resolved in this order:
 *   1. Explicit `symbolServerUrl` argument
 *   2. `?symbolServer=` query param in the input URL (for profiler.firefox.com URLs)
 *   3. The default Mozilla symbolication server
 *
 * `onSymbolicating` is called just before symbolication begins, so callers can
 * update their loading state (e.g. to show a "Symbolicating…" message).
 */
export async function loadProfileFromFileOrUrl(
  filePathOrUrl: string,
  symbolServerUrl?: string,
  onSymbolicating?: () => void
): Promise<LoadResult> {
  const store = createStore();
  console.log(`Loading profile from ${filePathOrUrl}`);

  // Extract ?symbolServer= from the URL. For short URLs (share.firefox.dev)
  // we re-extract after following the redirect, since the param lives on the
  // resolved profiler.firefox.com URL, not the short URL itself.
  let urlSymbolServer = isUrl(filePathOrUrl)
    ? extractSymbolServerFromUrl(filePathOrUrl)
    : undefined;

  if (isUrl(filePathOrUrl)) {
    // Handle URL input
    let finalUrl = filePathOrUrl;

    // If it's a profiler.firefox.com URL (or short URL that redirects to one),
    // extract the actual profile URL from it
    if (
      filePathOrUrl.includes('profiler.firefox.com') ||
      filePathOrUrl.includes('share.firefox.dev')
    ) {
      // Follow redirects for short URLs
      if (filePathOrUrl.includes('share.firefox.dev')) {
        console.log('Following redirect from short URL...');
        finalUrl = await followRedirects(filePathOrUrl);
        console.log(`Redirected to: ${finalUrl}`);
        urlSymbolServer = extractSymbolServerFromUrl(finalUrl);
      }

      // Extract the profile URL from the profiler.firefox.com URL
      const profileUrl = extractProfileUrlFromProfilerUrl(finalUrl);
      if (profileUrl) {
        console.log(`Extracted profile URL: ${profileUrl}`);
        finalUrl = profileUrl;
      } else {
        throw new Error(
          `Unable to extract profile URL from profiler URL: ${finalUrl}`
        );
      }
    }

    // Fetch the profile using shared utility
    console.log(`Fetching profile from ${finalUrl}`);
    const result = await fetchProfile({
      url: finalUrl,
      onTemporaryError: (e: TemporaryError) => {
        if (e.attempt) {
          console.log(`Retry ${e.attempt.count}/${e.attempt.total}...`);
        }
      },
    });

    // Check if this is a zip file - not yet supported in CLI
    if (result.responseType === 'ZIP') {
      throw new Error(
        'Zip files are not yet supported in the CLI. ' +
          'Please extract the profile from the zip file first, or use the web interface at profiler.firefox.com'
      );
    }

    // Extract the profile data
    const profile = await unserializeProfileOfArbitraryFormat(result.profile);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }

    await maybeSymbolicate(
      profile,
      symbolServerUrl,
      urlSymbolServer,
      onSymbolicating
    );

    await store.dispatch(loadProfile(profile, {}, true));
    await store.dispatch(finalizeProfileView());
    const state = store.getState();
    const rootRange = getProfileRootRange(state);
    return { store, rootRange };
  }

  // Handle file path input
  // Read the raw bytes from the file. It might be a JSON file, but it could also
  // be a binary file, e.g. a .json.gz file, or any of the binary formats supported
  // by our importers.
  const bytes = fs.readFileSync(filePathOrUrl, null);

  // Load the profile.
  const profile = await unserializeProfileOfArbitraryFormat(bytes);
  if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
  }

  await maybeSymbolicate(
    profile,
    symbolServerUrl,
    urlSymbolServer,
    onSymbolicating
  );

  await store.dispatch(loadProfile(profile, {}, true));
  await store.dispatch(finalizeProfileView());
  const state = store.getState();
  const rootRange = getProfileRootRange(state);
  return { store, rootRange };
}

async function maybeSymbolicate(
  profile: Profile,
  symbolServerUrl: string | undefined,
  urlSymbolServer: string | undefined,
  onSymbolicating: (() => void) | undefined
): Promise<void> {
  if (profile.meta.symbolicated === true) {
    return;
  }
  const serverUrl = symbolServerUrl ?? urlSymbolServer ?? SYMBOL_SERVER_URL;
  try {
    await symbolicateInPlace(profile, serverUrl, onSymbolicating ?? (() => {}));
  } catch (e) {
    console.warn(
      `Symbolication failed: ${e}. Loading profile without symbols.`
    );
  }
}
