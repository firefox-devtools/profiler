/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  ResponseFromBrowser,
  MessageFromBrowser,
  MessageToBrowser,
} from '../../../app-logic/web-channel';

/**
 * Mock out the WebChannel, a Firefox internal mechanism that allows us to
 * post messages from content pages to privileged contexts.
 */
export function mockWebChannel() {
  const messagesSentToBrowser = [];
  const listeners = [];
  let onMessageToChrome = null;

  jest
    .spyOn(window, 'addEventListener')
    .mockImplementation((name, listener) => {
      if (name === 'WebChannelMessageToContent') {
        listeners.push(listener);
      }
    });

  jest
    .spyOn(window, 'removeEventListener')
    .mockImplementation((name, listener) => {
      if (name === 'WebChannelMessageToContent') {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    });

  jest.spyOn(window, 'dispatchEvent').mockImplementation(event => {
    if (
      event instanceof CustomEvent &&
      event.type === 'WebChannelMessageToChrome'
    ) {
      messagesSentToBrowser.push(JSON.parse(event.detail));
      if (onMessageToChrome) {
        onMessageToChrome(JSON.parse(event.detail).message);
      }
    }
  });

  function triggerResponse<R: ResponseFromBrowser>(
    message: MessageFromBrowser<R>
  ) {
    for (const listener of listeners.slice()) {
      listener({
        detail: {
          id: 'profiler.firefox.com',
          message,
        },
      });
    }
  }

  function registerMessageToChromeListener(
    listener: MessageToBrowser => void
  ): void {
    onMessageToChrome = listener;
  }

  return {
    messagesSentToBrowser,
    listeners,
    triggerResponse,
    registerMessageToChromeListener,
    getLastRequestId: (): number => {
      const message = messagesSentToBrowser[messagesSentToBrowser.length - 1];
      if (!message) {
        throw new Error('No messages were sent to the browser.');
      }
      const { requestId } = message.message;
      if (typeof requestId !== 'number') {
        throw new Error('Could not find the requestId in the message.');
      }
      return requestId;
    },
  };
}
