/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { assertExhaustiveCheck } from './flow';
import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from './special-paths';
import type { SourceLoadingError } from 'firefox-profiler/types';

export type FetchSourceCallbacks = {|
  fetchUrlResponse: (url: string) => Promise<Response>,
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
  callbacks: FetchSourceCallbacks
): Promise<FetchSourceResult> {
  const errors: SourceLoadingError[] = [];
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
