/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { ThunkAction, SourceLoadingError } from 'firefox-profiler/types';
import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from '../utils/special-paths';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

export function fetchSourceForFile(file: string): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    const errors: SourceLoadingError[] = [];
    const parsedName = parseFileNameFromSymbolication(file);
    const downloadRecipe = getDownloadRecipeForSourceFile(parsedName);

    // First, try to fetch just the single file from the web.
    switch (downloadRecipe.type) {
      case 'CORS_ENABLED_SINGLE_FILE': {
        const { url } = downloadRecipe;
        dispatch({ type: 'SOURCE_LOADING_BEGIN', file, url });

        try {
          const response = await fetch(url, { credentials: 'omit' });

          if (response.status !== 200) {
            throw new Error(
              `The request to ${url} returned HTTP status ${response.status}`
            );
          }

          const source = await response.text();
          dispatch({ type: 'SOURCE_LOADING_SUCCESS', file, source });
          return;
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
    dispatch({
      type: 'SOURCE_LOADING_ERROR',
      file,
      errors,
    });
  };
}
