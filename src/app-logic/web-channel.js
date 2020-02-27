/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * This file is in charge of handling the message managing between profiler.firefox.com
 * and the browser internals. This is done through a WebChannel mechanism. This mechanism
 * allows us to safely send messages between the browser and an allowed domain.
 */

/**
 * The messages are typed as an object so that the "type" field can be extracted
 * using the $Keys utility type.
 */
type MessageToBrowserObject = {|
  STATUS_QUERY: {| type: 'STATUS_QUERY', requestId: number |},
  ENABLE_MENU_BUTTON: {| type: 'ENABLE_MENU_BUTTON', requestId: number |},
|};

/**
 * The messages are typed as an object so that the "type" field can be extracted
 * using the $Keys utility type.
 */
type MessageFromBrowserObject = {|
  STATUS_RESPONSE: {|
    type: 'STATUS_RESPONSE',
    menuButtonIsEnabled: boolean,
    requestId: number,
  |},
  ENABLE_MENU_BUTTON_DONE: {|
    type: 'ENABLE_MENU_BUTTON_DONE',
    requestId: number,
  |},
|};

// Extract out the different values. Exported for tests.
export type MessageToBrowser = $Values<MessageToBrowserObject>;
export type MessageFromBrowser = $Values<MessageFromBrowserObject>;
export type MessageFromBrowserTypes = $Keys<MessageFromBrowserObject>;

/**
 * Ask the browser if the menu button is enabled.
 */
export async function queryIsMenuButtonEnabled(): Promise<boolean> {
  type ExpectedResponse = $PropertyType<
    MessageFromBrowserObject,
    'STATUS_RESPONSE'
  >;

  const response: ExpectedResponse = await _sendMessageWithResponse({
    type: 'STATUS_QUERY',
    requestId: _requestId++,
  });

  return response.menuButtonIsEnabled;
}

/**
 * Enable the profiler menu button.
 */
export async function enableMenuButton(): Promise<void> {
  type ExpectedResponse = $PropertyType<
    MessageFromBrowserObject,
    'ENABLE_MENU_BUTTON_DONE'
  >;

  await _sendMessageWithResponse<ExpectedResponse>({
    type: 'ENABLE_MENU_BUTTON',
    requestId: _requestId++,
  });

  // The response does not return any additional information other than we know
  // the request was handled.
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
function _sendMessage(message) {
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

function _sendMessageWithResponse<Returns: MessageFromBrowser>(
  messageToBrowser: MessageToBrowser
): Promise<Returns> {
  return new Promise((resolve, reject) => {
    function listener(event) {
      const { id, message: messageFromBrowser } = event.detail;

      // Don't trust the message too much, and do some checking for known properties.
      if (
        id === 'profiler.firefox.com' &&
        messageFromBrowser &&
        typeof messageFromBrowser === 'object'
      ) {
        if (typeof messageFromBrowser.error === 'string') {
          // There was some kind of error with the message. This is expected for older
          // versions of Firefox that don't have this WebChannel set up yet, or
          // if the about:config preference points to a different URL.
          console.error(
            `[webchannel] %c${messageFromBrowser.error}`,
            LOG_STYLE
          );
          window.removeEventListener(
            'WebChannelMessageToContent',
            listener,
            true
          );
          reject(messageFromBrowser);
        } else if (
          messageToBrowser.requestId === messageFromBrowser.requestId
        ) {
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[webchannel] %creceived "${String(messageFromBrowser.type)}"`,
              LOG_STYLE,
              messageFromBrowser
            );
          }
          window.removeEventListener(
            'WebChannelMessageToContent',
            listener,
            true
          );

          resolve(
            // Make the type system assume that we have the right message.
            (messageFromBrowser: any)
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

    _sendMessage(messageToBrowser);
  });
}
