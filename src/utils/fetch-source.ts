/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from './types';
import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from './special-paths';
import { isGzip, decompress } from './gz';
import { UntarFileStream } from './untar';
import { isLocalURL } from './url';
import { queryApiWithFallback } from './query-api';
import type { ExternalCommunicationDelegate } from './query-api';
import type {
  SourceCodeLoadingError,
  AddressProof,
} from 'firefox-profiler/types';

export type FetchSourceResult =
  | { type: 'SUCCESS'; source: string }
  | { type: 'ERROR'; errors: SourceCodeLoadingError[] };

/**
 * Fetch the source code for a file path from the web.
 *
 * For example, if `file` is "hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28",
 * then this will call `callbacks.fetchUrlResponse("https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm")`.
 *
 * @param file - The path of the file that should be fetched
 * @param sourceUUid - The optional UUID of the JS source file that should be
 *    fetched. It's null for non-JS files.
 * @param symbolServerUrl - The symbol server URL, used for getting source code
 *    from local servers via the symbolication API /source/v1.
 * @param addressProof - An "address proof" for the requested file, if known. Otherwise null.
 * @param archiveCache - A map which allows reusing the bytes of the archive file.
 *    Stores promises to the bytes of uncompressed tar files.
 * @param delegate - An object which handles web requests and browser connection queries.
 */
export async function fetchSource(
  file: string,
  sourceUuid: string | null,
  symbolServerUrl: string,
  addressProof: AddressProof | null,
  archiveCache: Map<string, Promise<Uint8Array>>,
  delegate: ExternalCommunicationDelegate
): Promise<FetchSourceResult> {
  const errors: SourceCodeLoadingError[] = [];

  if (addressProof !== null) {
    // Prepare a request to /source/v1. The API format for this endpoint is documented
    // at https://github.com/mstange/profiler-get-symbols/blob/master/API.md#sourcev1
    // This API is used both by the browser connection's querySymbolicationApi method
    // as well as by the local symbol server.
    const symbolServerUrlForFallback = _serverMightSupportSource(
      symbolServerUrl
    )
      ? symbolServerUrl
      : null;
    const { debugName, breakpadId, address } = addressProof;

    // See if we can get sources via the API, either from the browser or from a
    // symbol server.
    const queryResult = await queryApiWithFallback(
      '/source/v1',
      JSON.stringify({
        debugName,
        debugId: breakpadId,
        moduleOffset: `0x${address.toString(16)}`,
        file,
      }),
      symbolServerUrlForFallback,
      delegate,
      convertResponseJsonToSourceCode
    );
    switch (queryResult.type) {
      case 'SUCCESS':
        return {
          type: 'SUCCESS',
          source: queryResult.convertedResponse,
        };
      case 'ERROR': {
        errors.push(...queryResult.errors);
        break;
      }
      default:
        throw assertExhaustiveCheck(queryResult);
    }
  }

  // Try to obtain the source by downloading a file from the browser if it's a
  // JS source.
  if (sourceUuid !== null) {
    try {
      const response = await delegate.fetchJSSourceFromBrowser(sourceUuid);
      if (response) {
        return {
          type: 'SUCCESS',
          source: response,
        };
      }

      errors.push({
        type: 'NOT_PRESENT_IN_BROWSER',
        sourceUuid,
        url: file,
      });
    } catch (e) {
      errors.push({
        type: 'BROWSER_API_ERROR',
        apiErrorMessage: e.message,
      });
    }
  }

  // Try to obtain the source by downloading a file from the web.

  const parsedName = parseFileNameFromSymbolication(file);
  const downloadRecipe = getDownloadRecipeForSourceFile(parsedName);

  switch (downloadRecipe.type) {
    case 'CORS_ENABLED_SINGLE_FILE': {
      const { url } = downloadRecipe;
      try {
        const response = await delegate.fetchUrlResponse(url);
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
      // Download the archive, and then get the file from the archive.
      // This is the path for source code from crates.io: We download the entire
      // crate, which is a .tar.gz file, and then we store the uncompressed bytes
      // in the archive cache.
      // We only download each archive once, and reuse the stored bytes when we
      // want to show other files from the same archive.

      const { archiveUrl: url, pathInArchive } = downloadRecipe;
      let promise: Promise<Uint8Array> | void = archiveCache.get(url);

      if (promise === undefined) {
        // Create a promise to load the archive, but don't await it yet.
        promise = (async () => {
          const response = await delegate.fetchUrlResponse(url);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return isGzip(bytes) ? decompress(bytes) : bytes;
        })();
        archiveCache.set(url, promise);
      } else {
        // TODO: callbacks.onWaitingForUrlWhichIsAlreadyBeingFetched(url)
      }

      try {
        // Now we await the promise. If we only just started loading the archive,
        // then this is where we wait for the network load to complete.
        // If the archive has already finished loading, then this is just a
        // microtask round-trip.
        const bytes = await promise;

        // Find the file inside of the archive.
        const stream = new UntarFileStream(bytes.buffer);
        const textDecoder = new TextDecoder();

        while (stream.hasNext()) {
          const entry = stream.next();
          if (entry.name === pathInArchive && entry.buffer !== null) {
            const source = textDecoder.decode(entry.buffer);
            return { type: 'SUCCESS', source };
          }
        }
        errors.push({
          type: 'NOT_PRESENT_IN_ARCHIVE',
          url,
          pathInArchive,
        });
      } catch (e) {
        errors.push({
          type: 'ARCHIVE_PARSING_ERROR',
          url,
          parsingErrorMessage: e.toString(),
        });
      }
      break;
    }

    case 'NO_KNOWN_CORS_URL': {
      errors.push({ type: 'NO_KNOWN_CORS_URL' });
      break;
    }

    default:
      throw assertExhaustiveCheck(downloadRecipe);
  }
  return { type: 'ERROR', errors };
}

function convertResponseJsonToSourceCode(responseJson: any): string {
  if (!('source' in responseJson) || typeof responseJson.source !== 'string') {
    throw new Error('No string "source" property on API response');
  }
  return responseJson.source;
}

// At the moment, the official Mozilla symbolication server does not have an
// endpoint for requesting source code. The /source/v1 URL is only supported by
// local symbol servers. Check the symbol server URL to avoid hammering the
// official Mozilla symbolication server with requests it can't handle.
// This check can be removed once it adds support for /source/v1.
function _serverMightSupportSource(symbolServerUrl: string): boolean {
  return isLocalURL(symbolServerUrl);
}
