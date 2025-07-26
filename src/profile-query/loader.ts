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
import type { StartEndRange } from 'firefox-profiler/types';

/**
 * Helper function to detect if the input is a URL
 */
function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://');
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
 */
export async function loadProfileFromFileOrUrl(
  filePathOrUrl: string
): Promise<LoadResult> {
  const store = createStore();
  console.log(`Loading profile from ${filePathOrUrl}`);

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

  await store.dispatch(loadProfile(profile, {}, true));
  await store.dispatch(finalizeProfileView());
  const state = store.getState();
  const rootRange = getProfileRootRange(state);
  return { store, rootRange };
}
