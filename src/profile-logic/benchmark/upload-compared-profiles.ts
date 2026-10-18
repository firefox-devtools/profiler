/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Uploading the profiles of a benchmark comparison, so that a link to the
 * comparison keeps working.
 *
 * The profiles this page usually compares are Taskcluster artifacts, which
 * expire. An uploaded copy at /public/<hash>/ does not. The copies are uploaded
 * as they were loaded, without sanitization: these are benchmark runs, and the
 * report is computed from exactly what was loaded, so a sanitized copy could
 * give a different report.
 */

import { uploadBinaryProfileData } from 'firefox-profiler/profile-logic/profile-store';
import {
  optimizeProfileForStorage,
  serializeProfileToJsonSlabsFile,
} from 'firefox-profiler/profile-logic/process-profile';
import { getTimeRangeIncludingAllThreads } from 'firefox-profiler/profile-logic/profile-data';
import { persistUploadedProfileInformationToDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { extractProfileTokenFromJwt } from 'firefox-profiler/utils/jwt';
import { compress } from 'firefox-profiler/utils/gz';

import {
  loadOneProfileCached,
  rememberRelocatedProfile,
} from './run-benchmark-comparison';
import type { LoadedProfile } from './run-benchmark-comparison';

export type UploadProgress = {
  /** Which of the profiles being uploaded this is, zero-based. */
  index: number;
  /** How many profiles are being uploaded, not counting the ones that already
   * were. */
  count: number;
  /** How much of this profile's upload has been sent, from 0 to 1. */
  fraction: number;
};

function dataSourceOf(url: string): string | null {
  try {
    return new URL(url).pathname.split('/').filter((d) => d)[0] ?? null;
  } catch {
    return null;
  }
}

/** Whether this URL already points at an uploaded profile. */
export function isPublicProfileUrl(url: string): boolean {
  return dataSourceOf(url) === 'public';
}

/**
 * The URL of the uploaded copy: the same view of the profile, with the data
 * source swapped for /public/<hash>/.
 *
 * The comparison only accepts /public/ and /from-url/ URLs, and both have
 * exactly one path segment after the data source, so that segment is the one
 * replaced. What follows it, such as a selected tab, is kept.
 */
export function publicUrlFor(viewerUrl: string, hash: string): string {
  const url = new URL(viewerUrl);
  const rest = url.pathname
    .split('/')
    .filter((d) => d)
    .slice(2);
  url.pathname = ['', 'public', hash, ...rest, ''].join('/');
  return url.toString();
}

async function persistToDb(
  loaded: LoadedProfile,
  name: string,
  hash: string,
  jwtToken: string | null,
  newUrl: string
): Promise<void> {
  if (process.env.NODE_ENV === 'test' && !window.indexedDB) {
    return;
  }
  const { meta } = loaded.profile;
  const range = getTimeRangeIncludingAllThreads(loaded.profile);
  const parsedUrl = new URL(newUrl);
  try {
    // So that the profile shows up in the list of uploaded recordings, and
    // can be deleted from there.
    await persistUploadedProfileInformationToDb({
      profileToken: hash,
      jwtToken,
      publishedDate: new Date(),
      name,
      preset: null,
      meta: {
        product: meta.product,
        abi: meta.abi,
        platform: meta.platform,
        toolkit: meta.toolkit,
        misc: meta.misc,
        oscpu: meta.oscpu,
        updateChannel: meta.updateChannel,
        appBuildID: meta.appBuildID,
      },
      urlPath: parsedUrl.pathname + parsedUrl.search,
      publishedRange: { start: 0, end: range.end - range.start },
    });
  } catch (e) {
    // The upload itself worked, and the URL is what matters here. Not being
    // able to delete the profile later from this browser is not worth failing
    // over; private browsing is the usual cause.
    console.error(
      'An error was thrown while storing the profile data to a local indexedDB.',
      e
    );
  }
}

async function uploadOne(
  loaded: LoadedProfile,
  name: string,
  onProgress: (fraction: number) => void
): Promise<string> {
  const gzipData = await compress(
    serializeProfileToJsonSlabsFile(optimizeProfileForStorage(loaded.profile))
  );
  const blob = new Blob([gzipData], { type: 'application/octet-binary' });
  const hashOrToken = await uploadBinaryProfileData().startUpload(
    blob,
    onProgress
  );
  const hash = extractProfileTokenFromJwt(hashOrToken);
  const newUrl = publicUrlFor(loaded.viewerUrl, hash);
  await persistToDb(
    loaded,
    name,
    hash,
    hashOrToken === hash ? null : hashOrToken,
    newUrl
  );
  rememberRelocatedProfile(newUrl, loaded);
  return newUrl;
}

/**
 * Upload every profile in `urls` that is not already uploaded, and resolve to
 * the list of URLs to use instead, in the same order.
 *
 * The profiles are the ones the comparison already loaded, so nothing is
 * downloaded again. They go up one at a time: each is several megabytes to
 * compress, and doing them together would only hold more of that in
 * memory at once.
 */
export async function uploadComparedProfiles(
  urls: string[],
  names: string[],
  onProgress: (progress: UploadProgress) => void
): Promise<string[]> {
  const loaded = await Promise.all(urls.map(loadOneProfileCached));
  const toUpload = [];
  for (let i = 0; i < loaded.length; i++) {
    if (!isPublicProfileUrl(loaded[i].viewerUrl)) {
      toUpload.push(i);
    } else if (loaded[i].viewerUrl !== urls[i]) {
      // A shortlink to an uploaded profile. It is replaced with the URL it
      // expands to, so that every URL on the page reads as uploaded.
      rememberRelocatedProfile(loaded[i].viewerUrl, loaded[i]);
    }
  }

  const newUrls = loaded.map(({ viewerUrl }) => viewerUrl);
  for (let index = 0; index < toUpload.length; index++) {
    const i = toUpload[index];
    const report = (fraction: number) =>
      onProgress({ index, count: toUpload.length, fraction });
    report(0);
    newUrls[i] = await uploadOne(loaded[i], names[i], report);
  }
  return newUrls;
}
