/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { oneLine } from 'common-tags';
import { assertExhaustiveCheck } from './types';
import { TemporaryError } from './errors';
import { decompress, isGzip } from './gz';
import { isLocalURL } from './url';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';
import type JSZip from 'jszip';

/**
 * Shared utilities for fetching profiles from URLs.
 * Used by both the web app (receive-profile.ts) and the CLI (profile-query).
 *
 * This module was extracted from receive-profile.ts to make the fetching
 * logic reusable across different contexts (Redux vs CLI).
 */

/**
 * Convert a profile hash to its Google Cloud Storage URL.
 * Public profiles are stored in Google Cloud Storage in the profile-store bucket.
 * See https://cloud.google.com/storage/docs/access-public-data
 */
export function getProfileUrlForHash(hash: string): string {
  return `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${hash}`;
}

/**
 * Extract the actual profile URL from a profiler.firefox.com URL.
 *
 * Parses URLs like:
 * - https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
 * - https://profiler.firefox.com/public/g9w0fmjjx4bqrky4zg0wb90n65b8g3w0qjjx1t0/calltree/
 *
 * Returns the decoded profile URL, or null if this is not a supported datasource.
 * This mimics the logic in retrieveProfileFromStore and retrieveProfileForRawUrl
 * from receive-profile.ts
 */
export function extractProfileUrlFromProfilerUrl(
  profilerUrl: string
): string | null {
  try {
    // Handle both full URLs and just pathnames
    let pathname: string;
    if (
      profilerUrl.startsWith('http://') ||
      profilerUrl.startsWith('https://')
    ) {
      const url = new URL(profilerUrl);
      pathname = url.pathname;
    } else {
      pathname = profilerUrl;
    }

    const pathParts = pathname.split('/').filter((d) => d);

    // Check if this is a from-url datasource
    // URL structure: /from-url/{encoded-profile-url}/...
    if (pathParts[0] === 'from-url' && pathParts[1]) {
      return decodeURIComponent(pathParts[1]);
    }

    // Check if this is a public datasource
    // URL structure: /public/{hash}/...
    // Profile is stored in Google Cloud Storage
    if (pathParts[0] === 'public' && pathParts[1]) {
      const hash = pathParts[1];
      return getProfileUrlForHash(hash);
    }

    return null;
  } catch (error) {
    console.error('Failed to parse profiler URL:', error);
    return null;
  }
}

function _wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Check if a load failure is likely due to Safari's localhost HTTP restriction.
 * Safari blocks mixed content (HTTP on HTTPS page) even for localhost.
 * This check works in both browser and Node.js (returns false in Node).
 */
function _loadProbablyFailedDueToSafariLocalhostHTTPRestriction(
  url: string,
  error: Error
): boolean {
  // In Node.js, navigator won't exist
  if (
    typeof navigator === 'undefined' ||
    !navigator.userAgent.match(/Safari\/\d+\.\d+/)
  ) {
    return false;
  }
  // Check if Safari considers this mixed content.
  try {
    const parsedUrl = new URL(url);
    return (
      error.name === 'TypeError' &&
      parsedUrl.protocol === 'http:' &&
      isLocalURL(parsedUrl) &&
      typeof location !== 'undefined' &&
      location.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

export class SafariLocalhostHTTPLoadError extends Error {
  override name = 'SafariLocalhostHTTPLoadError';
}

/**
 * Deduce the file type from a URL and content type.
 * This is used to detect zip files vs profile files.
 * Exported for use in receive-profile.ts for file handling.
 */
export function deduceContentType(
  url: string,
  contentType: string | null
): 'application/json' | 'application/zip' | null {
  if (contentType === 'application/zip' || contentType === 'application/json') {
    return contentType;
  }
  if (url.match(/\.zip$/)) {
    return 'application/zip';
  }
  if (url.match(/\.json/)) {
    return 'application/json';
  }
  return null;
}

/**
 * Parse JSON from an optionally gzipped array buffer.
 * Exported for use in receive-profile.ts for direct file processing.
 */
export async function extractJsonFromArrayBuffer(
  arrayBuffer: ArrayBuffer
): Promise<unknown> {
  let profileBytes = new Uint8Array(arrayBuffer);
  // Check for the gzip magic number in the header.
  if (isGzip(profileBytes)) {
    profileBytes = await decompress(profileBytes);
  }

  const textDecoder = new TextDecoder();
  return JSON.parse(textDecoder.decode(profileBytes));
}

/**
 * Don't trust third party data, try and handle a variety of inputs gracefully.
 */
async function _extractJsonFromBuffer(
  buffer: ArrayBuffer,
  response: Response,
  reportError: (...data: Array<any>) => void,
  fileType: 'application/json' | null
): Promise<unknown> {
  try {
    return await extractJsonFromArrayBuffer(buffer);
  } catch (error) {
    // Change the error message depending on the circumstance:
    let message;
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      message = 'The network request to load the profile was aborted.';
    } else if (fileType === 'application/json') {
      message = 'The profile’s JSON could not be decoded.';
    } else if (fileType === null) {
      // If the content type is not specified, use a raw array buffer
      // to fallback to other supported profile formats.
      return buffer;
    } else {
      message = oneLine`
        The profile could not be downloaded and decoded. This does not look like a supported file
        type.
      `;
    }

    // Provide helpful debugging information to the console.
    reportError(message);
    reportError('JSON parsing error:', error);
    reportError('Fetch response:', response);

    throw new Error(
      `${message} The full error information has been printed out to the DevTool’s console.`
    );
  }
}

/**
 * Attempt to load a zip file from a pre-read buffer. This process can fail, so make
 * sure to handle and report the error if it does.
 */
async function _extractZipFromBuffer(
  buffer: ArrayBuffer,
  response: Response,
  reportError: (...data: Array<any>) => void
): Promise<JSZip> {
  // Workaround for https://github.com/Stuk/jszip/issues/941
  // When running this code in tests, `buffer` doesn't inherits from _this_
  // realm's ArrayBuffer object, and this breaks JSZip which doesn't account for
  // this case. We workaround the issue by wrapping the buffer in an Uint8Array
  // that comes from this realm.
  const typedBuffer = new Uint8Array(buffer);
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(typedBuffer);
    // Catch the error if unable to load the zip.
    return zip;
  } catch (error) {
    const message = 'Unable to open the archive file.';
    reportError(message);
    reportError('Error:', error);
    reportError('Fetch response:', response);
    throw new Error(
      `${message} The full error information has been printed out to the DevTool’s console.`
    );
  }
}

export type ProfileOrZip =
  | { responseType: 'PROFILE'; profile: unknown }
  | { responseType: 'ZIP'; zip: JSZip };

/**
 * This function guesses the correct content-type (even if one isn't sent) and then
 * attempts to use the proper method to extract the profile or zip from a pre-read buffer.
 */
async function _extractProfileOrZipFromBuffer(
  url: string,
  buffer: ArrayBuffer,
  response: Response,
  reportError: (...data: Array<any>) => void
): Promise<ProfileOrZip> {
  const contentType = deduceContentType(
    url,
    response.headers.get('content-type')
  );
  switch (contentType) {
    case 'application/zip':
      return {
        responseType: 'ZIP',
        zip: await _extractZipFromBuffer(buffer, response, reportError),
      };
    case 'application/json':
    case null:
      // The content type is null if it is unknown, or an unsupported type. Go ahead
      // and try to process it as a profile.
      return {
        responseType: 'PROFILE',
        profile: await _extractJsonFromBuffer(
          buffer,
          response,
          reportError,
          contentType
        ),
      };
    default:
      throw assertExhaustiveCheck(contentType);
  }
}

export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
};

/**
 * Read the full response body as an ArrayBuffer, reporting download progress
 * via the onProgress callback. If the response body is not streamable (e.g. in
 * older browsers or test environments), falls back to response.arrayBuffer().
 */
async function _readResponseWithProgress(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void
): Promise<ArrayBuffer> {
  if (!onProgress || !response.body) {
    return response.arrayBuffer();
  }

  const PROGRESS_THROTTLE_MS = 100;
  const contentLength = response.headers.get('Content-Length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
  const reader = response.body.getReader();

  const chunks: Uint8Array[] = [];
  let lastProgressTime = 0;
  let lastReportedBytes = -1;
  let receivedBytes = 0;

  // When Content-Length is known and trustworthy, pre-allocate a single buffer
  // and write directly into it to avoid a 2x memory spike. If the server sends
  // more data than declared, fall back to chunk accumulation.
  let preAllocated: Uint8Array | null =
    totalBytes && totalBytes > 0 ? new Uint8Array(totalBytes) : null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (preAllocated) {
      if (receivedBytes + value.length <= totalBytes!) {
        preAllocated.set(value, receivedBytes);
      } else {
        // Content-Length was wrong; abandon pre-allocated buffer and switch
        // to chunk accumulation for the rest of the download.
        chunks.push(preAllocated.slice(0, receivedBytes));
        chunks.push(value);
        preAllocated = null;
      }
    } else {
      chunks.push(value);
    }

    receivedBytes += value.length;

    // Throttle progress callbacks to avoid excessive Redux dispatches.
    const now = performance.now();
    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
      onProgress({ receivedBytes, totalBytes });
      lastProgressTime = now;
      lastReportedBytes = receivedBytes;
    }
  }

  // Report final progress so the bar reaches 100%, unless we just reported it.
  if (lastReportedBytes !== receivedBytes) {
    onProgress({ receivedBytes, totalBytes });
  }

  if (preAllocated) {
    return preAllocated.buffer as ArrayBuffer;
  }

  // Concatenate accumulated chunks.
  const result = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer as ArrayBuffer;
}

export type FetchProfileArgs = {
  url: string;
  onTemporaryError: (param: TemporaryError) => void;
  onDownloadProgress?: (progress: DownloadProgress) => void;
  // Allow tests to capture the reported error, but normally use console.error.
  reportError?: (...data: Array<any>) => void;
};

/**
 * Tries to fetch a profile on `url`. If the profile is not found,
 * `onTemporaryError` is called with an appropriate error, we wait 1 second, and
 * then tries again. If we still can't find the profile after 11 tries, the
 * returned promise is rejected with a fatal error.
 * If we can retrieve the profile properly, the returned promise is resolved
 * with the parsed profile or zip file.
 *
 * This function was moved from receive-profile.ts to make it reusable by
 * both the web app and CLI.
 */
export async function fetchProfile(
  args: FetchProfileArgs
): Promise<ProfileOrZip> {
  const MAX_WAIT_SECONDS = 10;
  let i = 0;
  const { url, onTemporaryError, onDownloadProgress } = args;
  // Allow tests to capture the reported error, but normally use console.error.
  const reportError = args.reportError || console.error;

  while (true) {
    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      // Case 1: Exception.
      if (
        _loadProbablyFailedDueToSafariLocalhostHTTPRestriction(url, e as Error)
      ) {
        throw new SafariLocalhostHTTPLoadError();
      }
      throw e;
    }

    // Case 2: successful answer.
    if (response.ok) {
      const buffer = await _readResponseWithProgress(
        response,
        onDownloadProgress
      );
      return _extractProfileOrZipFromBuffer(url, buffer, response, reportError);
    }

    // case 3: unrecoverable error.
    if (response.status !== 403) {
      throw new Error(oneLine`
          Could not fetch the profile on remote server.
          Response was: ${response.status} ${response.statusText}.
        `);
    }

    // case 4: 403 errors can be transient while a profile is uploaded.

    if (i++ === MAX_WAIT_SECONDS) {
      // In the last iteration we don't send a temporary error because we'll
      // throw an error right after the while loop.
      break;
    }

    onTemporaryError(
      new TemporaryError(
        'Profile not found on remote server.',
        { count: i, total: MAX_WAIT_SECONDS + 1 } // 11 tries during 10 seconds
      )
    );

    await _wait(1000);
  }

  throw new Error(oneLine`
    Could not fetch the profile on remote server:
    still not found after ${MAX_WAIT_SECONDS} seconds.
  `);
}
