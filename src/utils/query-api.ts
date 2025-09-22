/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { MixedObject, ApiQueryError } from 'firefox-profiler/types';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';

/**
 * An abstraction which simplifies writing tests for things like source and assembly
 * fetching. These things get their data from external sources like the browser or the
 * network.
 *
 * In most cases you'll want to use RegularExternalCommunicationDelegate.
 */
export interface ExternalCommunicationDelegate {
  // Fetch a cross-origin URL and return its Response. If postData is specified,
  // the method should be POST.
  fetchUrlResponse(url: string, postData?: string): Promise<Response>;

  // Query the symbolication API of the browser, if a connection to the browser
  // is available.
  queryBrowserSymbolicationApi(
    path: string,
    requestJson: string
  ): Promise<string>;

  fetchJSSourceFromBrowser(source: string): Promise<string>;
}

export type ApiQueryResult<T> =
  | { type: 'SUCCESS'; convertedResponse: T }
  | { type: 'ERROR'; errors: ApiQueryError[] };

/**
 * Sends a JSON query to the browser symbolication API and, if supplied, to a
 * symbol server.
 */
export async function queryApiWithFallback<T>(
  path: string,
  requestJson: string,
  symbolServerUrlForFallback: string | null,
  delegate: ExternalCommunicationDelegate,
  convertJsonResponse: (responseJson: MixedObject) => T
): Promise<ApiQueryResult<T>> {
  const errors: ApiQueryError[] = [];

  // See if we can get an API result from the browser.
  try {
    const response = await delegate.queryBrowserSymbolicationApi(
      path,
      requestJson
    );
    try {
      const responseJson = JSON.parse(response);
      if (!responseJson.error) {
        const convertedResponse = convertJsonResponse(responseJson);
        return { type: 'SUCCESS', convertedResponse };
      }
      errors.push({
        type: 'BROWSER_API_ERROR',
        apiErrorMessage: responseJson.error,
      });
    } catch (e) {
      errors.push({
        type: 'BROWSER_API_MALFORMED_RESPONSE',
        errorMessage: e.toString(),
      });
    }
  } catch (e) {
    errors.push({
      type: 'BROWSER_CONNECTION_ERROR',
      browserConnectionErrorMessage: e.toString(),
    });
  }

  // See if we can get sources from a local symbol server.
  if (symbolServerUrlForFallback !== null) {
    const url = symbolServerUrlForFallback + path;
    try {
      const response = await delegate.fetchUrlResponse(url, requestJson);
      const responseText = await response.text();

      try {
        const responseJson = JSON.parse(responseText);
        if (!responseJson.error) {
          const convertedResponse = convertJsonResponse(responseJson);
          return { type: 'SUCCESS', convertedResponse };
        }
        errors.push({
          type: 'SYMBOL_SERVER_API_ERROR',
          apiErrorMessage: responseJson.error,
        });
      } catch (e) {
        errors.push({
          type: 'SYMBOL_SERVER_API_MALFORMED_RESPONSE',
          errorMessage: e.toString(),
        });
      }
    } catch (e) {
      errors.push({
        type: 'NETWORK_ERROR',
        url,
        networkErrorMessage: e.toString(),
      });
    }
  }

  return { type: 'ERROR', errors };
}

export interface ExternalCommunicationCallbacks {
  onBeginUrlRequest(url: string): void;
  onBeginBrowserConnectionQuery(): void;
}

/**
 * The default implementation of the ExternalCommunicationDelegate interface.
 * Uses fetch for URL requests and the supplied browser connection for browser
 * connection requests.
 *
 * It also takes an object with callbacks, for loading indicators.
 */
export class RegularExternalCommunicationDelegate
  implements ExternalCommunicationDelegate
{
  _browserConnection: BrowserConnection | null;
  _callbacks: ExternalCommunicationCallbacks;

  constructor(
    browserConnection: BrowserConnection | null,
    callbacks: ExternalCommunicationCallbacks
  ) {
    this._browserConnection = browserConnection;
    this._callbacks = callbacks;
  }

  async fetchUrlResponse(url: string, postData?: string) {
    this._callbacks.onBeginUrlRequest(url);
    const requestInit: RequestInit =
      postData !== undefined
        ? {
            body: postData,
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
          }
        : { credentials: 'omit' };
    const response = await fetch(url, requestInit);
    if (response.status !== 200) {
      throw new Error(
        `The request to ${url} returned HTTP status ${response.status}`
      );
    }
    return response;
  }

  async queryBrowserSymbolicationApi(path: string, requestJson: string) {
    const browserConnection = this._browserConnection;
    if (browserConnection === null) {
      throw new Error('No connection to the browser.');
    }
    this._callbacks.onBeginBrowserConnectionQuery();
    return browserConnection.querySymbolicationApi(path, requestJson);
  }

  fetchJSSourceFromBrowser(source: string): Promise<string> {
    const browserConnection = this._browserConnection;
    if (browserConnection === null) {
      throw new Error('No connection to the browser.');
    }
    this._callbacks.onBeginBrowserConnectionQuery();
    return browserConnection.getJSSource(source);
  }
}
