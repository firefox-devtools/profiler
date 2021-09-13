/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { ThunkAction } from 'firefox-profiler/types';
import {
  getUrlsForSourceFile,
  parseFileNameFromSymbolication,
} from '../profile-logic/profile-data';

export function fetchSourceForFile(file: string): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    const parsedName = parseFileNameFromSymbolication(file);
    const urls = getUrlsForSourceFile(parsedName);
    if (!urls.corsFetchableRawSource) {
      dispatch({
        type: 'SOURCE_LOADING_ERROR',
        file,
        error: {
          // `The file ${parsedName.path} cannot be loaded by the profiler. There is no CORS-enabled URL for it.`
          type: 'DONT_KNOW_WHERE_TO_GET_SOURCE',
          allowRetry: false,
          path: parsedName.path,
        },
      });
      return;
    }

    const url = urls.corsFetchableRawSource;
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
    } catch (e) {
      const error = e.toString();
      dispatch({
        type: 'SOURCE_LOADING_ERROR',
        file,
        error: {
          type: 'NETWORK_ERROR',
          url,
          allowRetry: true,
          networkErrorMessage: error,
        },
      });
    }
  };
}
