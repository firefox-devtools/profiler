/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  ResponseFromBrowser,
  MessageFromBrowser,
} from '../../../app-logic/web-channel';

/**
 * Mock out the WebChannel, a Firefox internal mechanism that allows us to
 * post messages from content pages to privileged contexts.
 */
export function mockWebChannel() {
  const messagesSentToBrowser = [];
  const listeners = [];

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
    messagesSentToBrowser.push(JSON.parse(event.detail));
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

  return {
    messagesSentToBrowser,
    listeners,
    triggerResponse,
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
