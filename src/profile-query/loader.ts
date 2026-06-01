/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as fs from 'fs';

import createStore from '../app-logic/create-store';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import {
  doSymbolicateProfile,
  finalizeProfileView,
  loadProfile,
  triggerLoadingFromUrl,
  waitingForProfileFromFile,
} from '../actions/receive-profile';
import { changeIncludeIdleSamples } from '../actions/profile-view';
import { updateUrlState } from '../actions/app';
import { stateFromLocation } from '../app-logic/url-handling';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import {
  getUrlState,
  getSymbolServerUrl,
} from 'firefox-profiler/selectors/url-state';
import {
  extractProfileUrlFromProfilerUrl,
  fetchProfile,
} from '../utils/profile-fetch';
import type { TemporaryError } from '../utils/errors';
import type { Store } from '../types/store';
import type { StartEndRange, Profile, UrlState } from 'firefox-profiler/types';
import type { ProfileUpgradeInfo } from 'firefox-profiler/profile-logic/processed-profile-versioning';
import { SymbolStore } from '../profile-logic/symbol-store';
import * as MozillaSymbolicationAPI from '../profile-logic/mozilla-symbolication-api';

/**
 * Load phases, reported via the onPhaseChange callback. Mirrors the visible
 * states the web UI goes through (`urlSetupPhase` + `symbolicationStatus`):
 *   fetching      -> downloading/reading the profile
 *   processing    -> parsing + PROFILE_LOADED + VIEW_FULL_PROFILE
 *   symbolicating -> doSymbolicateProfile in progress
 *   ready         -> everything done
 */
export type LoadPhase = 'fetching' | 'processing' | 'symbolicating' | 'ready';

export interface LoadOptions {
  /** Overrides both ?symbolServer= and the default server. */
  explicitSymbolServerUrl?: string;
  /** Skip symbolication entirely (intended for CLI tests). */
  skipSymbolication?: boolean;
  /** Reports loading phase transitions. */
  onPhaseChange?: (phase: LoadPhase) => void;
}

export interface LoadResult {
  store: Store;
  rootRange: StartEndRange;
}

function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
}

function isProfilerFrontendUrl(url: string): boolean {
  return (
    url.includes('profiler.firefox.com') || url.includes('share.firefox.dev')
  );
}

async function followRedirects(url: string): Promise<string> {
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return response.url;
}

/**
 * Build a Node-compatible SymbolStore that fetches from a remote symbol server.
 * Unlike the browser implementation, this does not cache in IndexedDB and has
 * no browser fallback path.
 */
function createNodeSymbolStore(symbolServerUrl: string): SymbolStore {
  return new SymbolStore({
    requestSymbolsFromServer: async (requests) =>
      MozillaSymbolicationAPI.requestSymbols(
        'symbol server',
        requests,
        async (path, json) => {
          const response = await fetch(symbolServerUrl + path, {
            body: json,
            method: 'POST',
          });
          return response.json();
        }
      ),
    requestSymbolsFromBrowser: async () => [],
    requestSymbolsViaSymbolTableFromBrowser: async () => {
      throw new Error('Symbol-table-from-browser is not supported in the CLI');
    },
  });
}

/**
 * Parsed form of the user-provided input. Exactly one of `filePath` or
 * `fetchUrl` is populated. When `fetchUrl` is populated, `location` is set
 * iff the input was a profiler.firefox.com URL (so we have view settings to
 * parse via `stateFromLocation`).
 */
type ParsedInput =
  | { kind: 'file'; filePath: string }
  | { kind: 'url'; fetchUrl: string; location: Location | null };

async function parseInput(input: string): Promise<ParsedInput> {
  if (!isUrl(input)) {
    return { kind: 'file', filePath: input };
  }

  // Short-URL redirects (share.firefox.dev -> profiler.firefox.com) must be
  // followed before we can extract view settings from the URL.
  let resolvedUrl = input;
  if (input.includes('share.firefox.dev')) {
    console.log('Following redirect from short URL...');
    resolvedUrl = await followRedirects(input);
    console.log(`Redirected to: ${resolvedUrl}`);
  }

  if (isProfilerFrontendUrl(resolvedUrl)) {
    const fetchUrl = extractProfileUrlFromProfilerUrl(resolvedUrl);
    if (fetchUrl === null) {
      throw new Error(
        `Unable to extract profile URL from profiler URL: ${resolvedUrl}`
      );
    }
    const parsed = new URL(resolvedUrl);
    const location = {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    } as Location;
    return { kind: 'url', fetchUrl, location };
  }

  // Direct URL pointing at a profile file. No view settings to parse.
  return { kind: 'url', fetchUrl: input, location: null };
}

async function fetchAndParseProfile(
  fetchUrl: string
): Promise<{ profile: Profile; upgradeInfo: ProfileUpgradeInfo }> {
  console.log(`Fetching profile from ${fetchUrl}`);
  const response = await fetchProfile({
    url: fetchUrl,
    onTemporaryError: (e: TemporaryError) => {
      if (e.attempt) {
        console.log(`Retry ${e.attempt.count}/${e.attempt.total}...`);
      }
    },
  });

  if (response.responseType === 'ZIP') {
    throw new Error(
      'Zip files are not yet supported in the CLI. ' +
        'Please extract the profile from the zip file first, or use the web interface at profiler.firefox.com'
    );
  }

  const upgradeInfo: ProfileUpgradeInfo = {};
  const profile = await unserializeProfileOfArbitraryFormat(
    response.profile,
    fetchUrl,
    upgradeInfo
  );
  if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
  }
  return { profile, upgradeInfo };
}

async function readAndParseFile(
  filePath: string
): Promise<{ profile: Profile; upgradeInfo: ProfileUpgradeInfo }> {
  const bytes = fs.readFileSync(filePath, null);
  const upgradeInfo: ProfileUpgradeInfo = {};
  const profile = await unserializeProfileOfArbitraryFormat(
    bytes,
    filePath,
    upgradeInfo
  );
  if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
  }
  return { profile, upgradeInfo };
}

/**
 * Override the symbolServerUrl field of the current URL state. `symbolServerUrl`
 * has no dedicated action (the reducer is a read-only pass-through), so the
 * only way to change it is to replace the whole UrlState via UPDATE_URL_STATE.
 */
function overrideSymbolServerUrl(store: Store, symbolServerUrl: string): void {
  const current = getUrlState(store.getState());
  const next: UrlState = { ...current, symbolServerUrl };
  store.dispatch(updateUrlState(next));
}

/**
 * Load a profile from a file path or URL.
 *
 * Mirrors the web app's profile loading pipeline:
 *   1. Dispatch source-specific waiting action (sets dataSource in URL state).
 *   2. Fetch/read + parse the profile, collecting upgradeInfo as an outparam.
 *   3. Dispatch loadProfile(profile, {}, initialLoad=true) to fire PROFILE_LOADED.
 *   4. For profiler.firefox.com URLs, build URL state via stateFromLocation
 *      (which runs the URL upgraders using upgradeInfo) and dispatch
 *      updateUrlState.
 *   5. If --symbol-server was provided, overwrite urlState.symbolServerUrl.
 *   6. Dispatch finalizeProfileView(null) to fire VIEW_FULL_PROFILE. In Node
 *      getSymbolStore() returns null, so symbolication is not kicked off here.
 *   7. Symbolicate through Redux via doSymbolicateProfile, reading the symbol
 *      server URL from getSymbolServerUrl (--symbol-server > ?symbolServer= >
 *      default Mozilla server).
 */
export async function loadProfileFromFileOrUrl(
  input: string,
  options: LoadOptions = {}
): Promise<LoadResult> {
  const { explicitSymbolServerUrl, skipSymbolication, onPhaseChange } = options;
  const store = createStore();
  console.log(`Loading profile from ${input}`);

  onPhaseChange?.('fetching');
  const parsed = await parseInput(input);

  let profile: Profile;
  let upgradeInfo: ProfileUpgradeInfo;
  if (parsed.kind === 'file') {
    store.dispatch(waitingForProfileFromFile());
    ({ profile, upgradeInfo } = await readAndParseFile(parsed.filePath));
  } else {
    store.dispatch(triggerLoadingFromUrl(parsed.fetchUrl));
    ({ profile, upgradeInfo } = await fetchAndParseProfile(parsed.fetchUrl));
  }

  onPhaseChange?.('processing');

  // PROFILE_LOADED. initialLoad=true suppresses auto-finalize so we can
  // apply URL state (and any --symbol-server override) before finalize runs.
  await store.dispatch(loadProfile(profile, {}, /* initialLoad */ true));

  // For profiler.firefox.com URLs, parse view settings (selected threads,
  // transforms, committed ranges, symbolServer, etc.) into a fresh UrlState.
  // For direct URLs and files, waitingForProfileFromFile / triggerLoadingFromUrl
  // already set dataSource; all other URL state fields stay at reducer defaults,
  // matching what the web app does for these inputs.
  if (parsed.kind === 'url' && parsed.location !== null) {
    const urlState = stateFromLocation(parsed.location, {
      profile,
      upgradeInfo,
    });
    store.dispatch(updateUrlState(urlState));
  }

  if (explicitSymbolServerUrl) {
    overrideSymbolServerUrl(store, explicitSymbolServerUrl);
  }

  // VIEW_FULL_PROFILE. finalizeProfileView reads URL state, so this must come
  // after updateUrlState. In Node, its internal symbolication attempt is a
  // no-op because getSymbolStore returns null without window.indexedDB.
  await store.dispatch(finalizeProfileView(null));

  if (!skipSymbolication && profile.meta.symbolicated === false) {
    onPhaseChange?.('symbolicating');
    const symbolServerUrl = getSymbolServerUrl(store.getState());
    console.log(`Symbolicating profile using ${symbolServerUrl}...`);
    const symbolStore = createNodeSymbolStore(symbolServerUrl);
    try {
      await doSymbolicateProfile(store.dispatch, profile, symbolStore);
      console.log('Symbolication complete');
    } catch (e) {
      console.warn(
        `Symbolication failed: ${e}. Loading profile without symbols.`
      );
    }
  }

  // The web defaults to "include idle samples"; the CLI defaults to "exclude".
  store.dispatch(changeIncludeIdleSamples(false));

  onPhaseChange?.('ready');

  const state = store.getState();
  const rootRange = getProfileRootRange(state);
  return { store, rootRange };
}
