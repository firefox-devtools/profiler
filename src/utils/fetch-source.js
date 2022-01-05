/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { assertExhaustiveCheck } from './flow';
import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from './special-paths';
import type { SourceLoadingError, AddressProof } from 'firefox-profiler/types';

export type FetchSourceCallbacks = {|
  fetchUrlResponse: (url: string, postData?: MixedObject) => Promise<Response>,
|};

export type FetchSourceResult =
  | { type: 'SUCCESS', source: string }
  | { type: 'ERROR', errors: SourceLoadingError[] };

/**
 * Fetch the source code for a file path from the web.
 *
 * For example, if `file` is "hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28",
 * then this will call `callbacks.fetchUrlResponse("https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm")`.
 */
export async function fetchSource(
  file: string,
  symbolServerUrl: string,
  addressProof: AddressProof | null,
  callbacks: FetchSourceCallbacks
): Promise<FetchSourceResult> {
  const errors: SourceLoadingError[] = [];

  // See if we can get sources from a local symbol server first.
  if (_serverMightSupportSource(symbolServerUrl) && addressProof !== null) {
    const { debugName, breakpadId, address } = addressProof;

    // Make a request to /source/v1. The API format for this endpoint is documented
    // at https://github.com/mstange/profiler-get-symbols/blob/master/API.md#sourcev1
    const url = `${symbolServerUrl}/source/v1`;
    const body = JSON.stringify({
      debugName,
      debugId: breakpadId,
      moduleOffset: `0x${address.toString(16)}`,
      file,
    });

    try {
      const response = await callbacks.fetchUrlResponse(url, body);
      const responseJson = await response.json();
      if (!responseJson.error) {
        // Local symbol server gave us the source. Success!
        return { type: 'SUCCESS', source: responseJson.source };
      }
      errors.push({
        type: 'SYMBOL_SERVER_API_ERROR',
        apiErrorMessage: responseJson.error,
      });
    } catch (e) {
      errors.push({
        type: 'NETWORK_ERROR',
        url,
        networkErrorMessage: e.toString(),
      });
    }
  }

  // We did not get the source from a local symbol server. Try to obtain it
  // from the web instead.

  const parsedName = parseFileNameFromSymbolication(file);
  const downloadRecipe = getDownloadRecipeForSourceFile(parsedName);

  switch (downloadRecipe.type) {
    case 'CORS_ENABLED_SINGLE_FILE': {
      const { url } = downloadRecipe;
      try {
        const response = await callbacks.fetchUrlResponse(url);
        const source = await response.text();
        return { type: 'SUCCESS', source };
      } catch (e) {
        errors.push({
          type: 'NETWORK_ERROR',
          url,
          networkErrorMessage: e.toString(),
        });
      }
      break;
    }
    case 'CORS_ENABLED_ARCHIVE': {
      // Not handled yet.
      errors.push({ type: 'NO_KNOWN_CORS_URL' });
      break;
    }
    case 'NO_KNOWN_CORS_URL': {
      errors.push({ type: 'NO_KNOWN_CORS_URL' });
      break;
    }
    default:
      throw assertExhaustiveCheck(downloadRecipe.type);
  }
  return { type: 'ERROR', errors };
}

// At the moment, the official Mozilla symbolication server does not have an
// endpoint for requesting source code. The /source/v1 URL is only supported by
// local symbol servers. Check the symbol server URL to avoid hammering the
// official Mozilla symbolication server with requests it can't handle.
// This check can be removed once it adds support for /source/v1.
function _serverMightSupportSource(symbolServerUrl: string): boolean {
  try {
    const url = new URL(symbolServerUrl);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1'
    );
  } catch (e) {
    return false;
  }
}
