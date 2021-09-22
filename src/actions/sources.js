/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { ThunkAction } from 'firefox-profiler/types';
import {
  getUrlsForSourceFile,
  parseFileNameFromSymbolication,
} from '../profile-logic/profile-data';
import { decompress } from '../utils/gz';
import { UntarFileStream } from '../utils/untar';

const crateTarBallPromises: Map<string, Promise<Uint8Array>> = new Map();

export function fetchSourceForFile(file: string): ThunkAction<Promise<void>> {
  return async (dispatch) => {
    const parsedName = parseFileNameFromSymbolication(file);
    const urls = getUrlsForSourceFile(parsedName);

    // First, try to fetch just the single file from the web.
    if (urls.corsFetchableRawSource) {
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
      return;
    }

    // Now, try to fetch a crate and find the source file in the tar ball.
    if (urls.corsFetchableCrate) {
      const url = urls.corsFetchableCrate;

      let promise = crateTarBallPromises.get(url);

      if (promise === undefined) {
        promise = (async () => {
          const response = await fetch(url, { credentials: 'omit' });

          if (response.status !== 200) {
            throw new Error(
              `The request to ${url} returned HTTP status ${response.status}`
            );
          }

          const compressedBytes = await response.arrayBuffer();
          return decompress(new Uint8Array(compressedBytes));
        })();
        crateTarBallPromises.set(url, promise);
      }

      try {
        const bytes = await promise;
        const stream = new UntarFileStream(bytes.buffer);
        const textDecoder = new TextDecoder();

        while (stream.hasNext()) {
          const entry = stream.next();
          if (entry.name === parsedName.path) {
            const source = textDecoder.decode(entry.buffer);
            dispatch({ type: 'SOURCE_LOADING_SUCCESS', file, source });
            return;
          }
        }
        dispatch({
          type: 'SOURCE_LOADING_ERROR',
          file,
          error: {
            type: 'NETWORK_ERROR',
            url,
            allowRetry: true,
            networkErrorMessage: `Could not find entry ${parsedName.path} in the .crate file`,
          },
        });
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
      return;
    }

    // We ran out of options.
    dispatch({
      type: 'SOURCE_LOADING_ERROR',
      file,
      error: {
        type: 'DONT_KNOW_WHERE_TO_GET_SOURCE',
        allowRetry: false,
        path: parsedName.path,
      },
    });
  };
}
