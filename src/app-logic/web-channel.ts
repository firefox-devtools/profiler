/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { SymbolTableAsTuple } from '../profile-logic/symbol-store-db';
import type {
  Milliseconds,
  MixedObject,
  ExternalMarkersData,
  FaviconData,
} from 'firefox-profiler/types';

/**
 * This file is in charge of handling the message managing between profiler.firefox.com
 * and the browser internals. This is done through a WebChannel mechanism. This mechanism
 * allows us to safely send messages between the browser and an allowed domain.
 */

export type MessageToBrowser = {
  requestId: number;
} & Request;

export type Request =
  | StatusQueryRequest
  | EnableMenuButtonRequest
  | GetProfileRequest
  | GetExternalMarkersRequest
  | GetExternalPowerTracksRequest
  | GetSymbolTableRequest
  | QuerySymbolicationApiRequest
  | GetPageFaviconsRequest
  | OpenScriptInTabDebuggerRequest
  | GetJSSourcesRequest;

type StatusQueryRequest = { type: 'STATUS_QUERY' };
type EnableMenuButtonRequest = { type: 'ENABLE_MENU_BUTTON' };
type GetProfileRequest = { type: 'GET_PROFILE' };
type GetExternalMarkersRequest = {
  type: 'GET_EXTERNAL_MARKERS';
  startTime: Milliseconds;
  endTime: Milliseconds;
};
type GetExternalPowerTracksRequest = {
  type: 'GET_EXTERNAL_POWER_TRACKS';
  startTime: Milliseconds;
  endTime: Milliseconds;
};
type GetSymbolTableRequest = {
  type: 'GET_SYMBOL_TABLE';
  debugName: string;
  breakpadId: string;
};
type QuerySymbolicationApiRequest = {
  type: 'QUERY_SYMBOLICATION_API';
  path: string;
  requestJson: string;
};
type GetPageFaviconsRequest = {
  type: 'GET_PAGE_FAVICONS';
  pageUrls: Array<string>;
};
type OpenScriptInTabDebuggerRequest = {
  type: 'OPEN_SCRIPT_IN_DEBUGGER';
  tabId: number;
  scriptUrl: string;
  line: number | null;
  column: number | null;
};
type GetJSSourcesRequest = {
  type: 'GET_JS_SOURCES';
  sourceUuids: Array<string>;
};

export type MessageFromBrowser<R extends ResponseFromBrowser> =
  | OutOfBandErrorMessageFromBrowser
  | ErrorResponseMessageFromBrowser
  | SuccessResponseMessageFromBrowser<R>;

type OutOfBandErrorMessageFromBrowser = {
  errno: number;
  error: string;
};

type ErrorResponseMessageFromBrowser = {
  type: 'ERROR_RESPONSE';
  requestId: number;
  error: string;
};

type SuccessResponseMessageFromBrowser<R extends ResponseFromBrowser> = {
  type: 'SUCCESS_RESPONSE';
  requestId: number;
  response: R;
};

export type ResponseFromBrowser =
  | StatusQueryResponse
  | EnableMenuButtonResponse
  | GetProfileResponse
  | GetExternalMarkersResponse
  | GetExternalPowerTracksResponse
  | GetSymbolTableResponse
  | QuerySymbolicationApiResponse
  | GetPageFaviconsResponse
  // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
  | OpenScriptInTabDebuggerResponse;

type StatusQueryResponse = {
  menuButtonIsEnabled: boolean;
  // The version indicates which message types are supported by the browser.
  // No version:
  //   Shipped in Firefox 76.
  //   Supports the following message types:
  //    - STATUS_QUERY
  //    - ENABLE_MENU_BUTTON
  // Version 1:
  //   Shipped in Firefox 93.
  //   Adds support for the following message types:
  //    - GET_PROFILE
  //    - GET_SYMBOL_TABLE
  //    - QUERY_SYMBOLICATION_API
  // Version 2:
  //   Shipped in Firefox 121.
  //   Adds support for the following message types:
  //    - GET_EXTERNAL_POWER_TRACKS
  // Version 3:
  //   Shipped in Firefox 125.
  //   Adds support for the following message types:
  //    - GET_EXTERNAL_MARKERS
  // Version 4:
  //   Shipped in Firefox 134.
  //   Adds support for the following message types:
  //    - GET_PAGE_FAVICONS
  // Version 5:
  //  Shipped in Firefox 136.
  //  Adds support for showing the JS script in DevTools debugger.
  //    - OPEN_SCRIPT_IN_DEBUGGER
  // Version 6:
  //  Shipped in Firefox 145.
  //  Adds support for fetching JS sources.
  //    - GET_JS_SOURCES
  version?: number;
};
type EnableMenuButtonResponse = void;
type GetProfileResponse = ArrayBuffer | MixedObject;
type GetExternalMarkersResponse = ExternalMarkersData;
type GetExternalPowerTracksResponse = MixedObject[];
type GetSymbolTableResponse = SymbolTableAsTuple;
type QuerySymbolicationApiResponse = string;
type GetPageFaviconsResponse = Array<FaviconData | null>;
type OpenScriptInTabDebuggerResponse = void;
type GetJSSourceReponseItem = { sourceText: string } | { error: string };
type GetJSSourcesResponse = Array<GetJSSourceReponseItem>;

// TypeScript function overloads for request/response pairs.
function _sendMessageWithResponse(
  request: StatusQueryRequest
): Promise<StatusQueryResponse>;
function _sendMessageWithResponse(
  request: EnableMenuButtonRequest
): Promise<EnableMenuButtonResponse>;
function _sendMessageWithResponse(
  request: GetProfileRequest
): Promise<GetProfileResponse>;
function _sendMessageWithResponse(
  request: GetExternalMarkersRequest
): Promise<GetExternalMarkersResponse>;
function _sendMessageWithResponse(
  request: GetExternalPowerTracksRequest
): Promise<GetExternalPowerTracksResponse>;
function _sendMessageWithResponse(
  request: GetSymbolTableRequest
): Promise<GetSymbolTableResponse>;
function _sendMessageWithResponse(
  request: QuerySymbolicationApiRequest
): Promise<QuerySymbolicationApiResponse>;
function _sendMessageWithResponse(
  request: GetPageFaviconsRequest
): Promise<GetPageFaviconsResponse>;
function _sendMessageWithResponse(
  request: OpenScriptInTabDebuggerRequest
): Promise<OpenScriptInTabDebuggerResponse>;
function _sendMessageWithResponse(
  request: GetJSSourcesRequest
): Promise<GetJSSourcesResponse>;

function _sendMessageWithResponse(request: Request): Promise<any> {
  const requestId = _requestId++;
  const type = request.type;

  return new Promise((resolve, reject) => {
    function listener(event: any) {
      const { id, message } = event.detail;

      // Don't trust the message too much, and do some checking for known properties.
      if (
        id === 'profiler.firefox.com' &&
        message &&
        typeof message === 'object'
      ) {
        _fixupOldResponseMessageIfNeeded(message);

        // Make the type system assume that we have the right message.
        const messageFromBrowser: MessageFromBrowser<ResponseFromBrowser> =
          message as MessageFromBrowser<ResponseFromBrowser>;

        if ('type' in messageFromBrowser && messageFromBrowser.type) {
          if (
            'requestId' in messageFromBrowser &&
            messageFromBrowser.requestId === requestId
          ) {
            if (process.env.NODE_ENV === 'development') {
              console.log(
                `[webchannel] %creceived response to "${type}"`,
                LOG_STYLE,
                messageFromBrowser
              );
            }
            window.removeEventListener(
              'WebChannelMessageToContent',
              listener,
              true
            );

            if (messageFromBrowser.type === 'SUCCESS_RESPONSE') {
              resolve(
                (
                  messageFromBrowser as SuccessResponseMessageFromBrowser<ResponseFromBrowser>
                ).response
              );
            } else {
              reject(
                new Error(
                  (messageFromBrowser as ErrorResponseMessageFromBrowser).error
                )
              );
            }
          }
        } else if (
          'error' in messageFromBrowser &&
          typeof messageFromBrowser.error === 'string'
        ) {
          // There was some kind of error with the message. This is expected for older
          // versions of Firefox that don't have this WebChannel set up yet, or
          // if the about:config preference points to a different URL.
          console.error(
            `[webchannel] %c${(messageFromBrowser as OutOfBandErrorMessageFromBrowser).error}`,
            LOG_STYLE
          );
          window.removeEventListener(
            'WebChannelMessageToContent',
            listener,
            true
          );
          reject(
            new WebChannelError(
              messageFromBrowser as OutOfBandErrorMessageFromBrowser
            )
          );
        }
      } else {
        reject(new Error('A malformed WebChannel event was received.'));
        console.error(
          `[webchannel] %cmalformed event received`,
          LOG_STYLE,
          event
        );
      }
    }

    window.addEventListener('WebChannelMessageToContent', listener, true);

    // Add the requestId to the message.
    _sendMessage({
      requestId,
      ...request,
    } as MessageToBrowser);
  });
}

/**
 * Ask the browser if the menu button is enabled.
 */
export async function queryIsMenuButtonEnabled(): Promise<boolean> {
  const response = await _sendMessageWithResponse({
    type: 'STATUS_QUERY',
  });

  return response.menuButtonIsEnabled;
}

/**
 * Enable the profiler menu button.
 */
export async function enableMenuButton(): Promise<void> {
  await _sendMessageWithResponse({
    type: 'ENABLE_MENU_BUTTON',
  });

  // The response does not return any additional information other than we know
  // the request was handled.
}

/**
 * Ask the browser for the web channel version.
 */
export async function queryWebChannelVersionViaWebChannel(): Promise<number> {
  const response = await _sendMessageWithResponse({
    type: 'STATUS_QUERY',
  });

  return response.version || 0;
}

export async function getSymbolTableViaWebChannel(
  debugName: string,
  breakpadId: string
): Promise<SymbolTableAsTuple> {
  return _sendMessageWithResponse({
    type: 'GET_SYMBOL_TABLE',
    debugName,
    breakpadId,
  });
}

export async function getProfileViaWebChannel(): Promise<
  ArrayBuffer | MixedObject
> {
  return _sendMessageWithResponse({
    type: 'GET_PROFILE',
  });
}

export async function getExternalMarkersViaWebChannel(
  startTime: Milliseconds,
  endTime: Milliseconds
): Promise<ExternalMarkersData> {
  return _sendMessageWithResponse({
    type: 'GET_EXTERNAL_MARKERS',
    startTime,
    endTime,
  });
}

export async function getExternalPowerTracksViaWebChannel(
  startTime: Milliseconds,
  endTime: Milliseconds
): Promise<MixedObject[]> {
  return _sendMessageWithResponse({
    type: 'GET_EXTERNAL_POWER_TRACKS',
    startTime,
    endTime,
  });
}

export async function querySymbolicationApiViaWebChannel(
  path: string,
  requestJson: string
): Promise<string> {
  return _sendMessageWithResponse({
    type: 'QUERY_SYMBOLICATION_API',
    path,
    requestJson,
  });
}

export async function getPageFaviconsViaWebChannel(
  pageUrls: Array<string>
): Promise<GetPageFaviconsResponse> {
  return _sendMessageWithResponse({
    type: 'GET_PAGE_FAVICONS',
    pageUrls,
  });
}

export async function showFunctionInDevtoolsViaWebChannel(
  tabId: number,
  scriptUrl: string,
  line: number | null,
  column: number | null
): Promise<void> {
  return _sendMessageWithResponse({
    type: 'OPEN_SCRIPT_IN_DEBUGGER',
    tabId,
    scriptUrl,
    line,
    column,
  });
}

export async function getJSSourcesViaWebChannel(
  sourceUuids: Array<string>
): Promise<Array<GetJSSourceReponseItem>> {
  return _sendMessageWithResponse({
    type: 'GET_JS_SOURCES',
    sourceUuids,
  });
}

/**
 * -----------------------------------------------------------------------------
 *
 * Everything below here is implementation logic for handling messages with from
 * the WebChannel mechanism.
 */

const LOG_STYLE = 'font-weight: bold; color: #0a6';

/**
 * Send a message to the browser through the WebChannel.
 */
function _sendMessage(message: MessageToBrowser) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[webchannel] %csending "${message.type}"`, LOG_STYLE, message);
  }

  window.dispatchEvent(
    new CustomEvent('WebChannelMessageToChrome', {
      detail: JSON.stringify({
        id: 'profiler.firefox.com',
        message,
      }),
    })
  );
}

let _requestId = 0;

export class WebChannelError extends Error {
  override name = 'WebChannelError';
  errno: number;
  constructor(rawError: OutOfBandErrorMessageFromBrowser) {
    super(`${rawError.error} (errno: ${rawError.errno})`);
    this.errno = rawError.errno;
  }
}

// This can be removed once the oldest supported Firefox ESR version is 93 or newer.
function _fixupOldResponseMessageIfNeeded(message: MixedObject) {
  if (message.type === 'STATUS_RESPONSE') {
    const { menuButtonIsEnabled } = message;
    message.type = 'SUCCESS_RESPONSE';
    message.response = { menuButtonIsEnabled };
  } else if (message.type === 'ENABLE_MENU_BUTTON_DONE') {
    message.type = 'SUCCESS_RESPONSE';
    message.response = undefined;
  }
}
