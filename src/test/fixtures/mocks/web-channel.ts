/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  ResponseFromBrowser,
  MessageFromBrowser,
  MessageToBrowser,
} from '../../../app-logic/web-channel';
import type { FaviconData, MixedObject } from 'firefox-profiler/types';

/**
 * Mock out the WebChannel, a Firefox internal mechanism that allows us to
 * post messages from content pages to privileged contexts.
 */
export function mockWebChannel() {
  const messagesSentToBrowser: { message: MessageToBrowser }[] = [];
  const listeners: EventListener[] = [];
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  const originalDispatchEvent = window.dispatchEvent;
  let onMessageToChrome: ((param: MessageToBrowser) => void) | null = null;

  jest
    .spyOn(window, 'addEventListener')
    .mockImplementation((name, listener, options) => {
      if (name === 'WebChannelMessageToContent') {
        listeners.push(listener as EventListener);
      }
      originalAddEventListener.call(window, name, listener, options);
    });

  jest
    .spyOn(window, 'removeEventListener')
    .mockImplementation((name, listener, options) => {
      if (name === 'WebChannelMessageToContent') {
        const index = listeners.indexOf(listener as EventListener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
      originalRemoveEventListener.call(window, name, listener, options);
    });

  jest.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    if (
      event instanceof CustomEvent &&
      event.type === 'WebChannelMessageToChrome'
    ) {
      messagesSentToBrowser.push(JSON.parse(event.detail));
      if (onMessageToChrome) {
        onMessageToChrome(JSON.parse(event.detail).message);
      }
    } else {
      originalDispatchEvent.call(window, event);
    }
    return false;
  });

  function triggerResponse<R extends ResponseFromBrowser>(
    message: MessageFromBrowser<R>
  ) {
    for (const listener of listeners.slice()) {
      listener({
        detail: {
          id: 'profiler.firefox.com',
          message,
        },
      } as CustomEvent);
    }
  }

  function registerMessageToChromeListener(
    listener: (param: MessageToBrowser) => void
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

export function simulateOldWebChannelAndFrameScript(
  geckoProfiler: $GeckoProfiler
) {
  const webChannel = mockWebChannel();

  const { registerMessageToChromeListener, triggerResponse } = webChannel;
  // Pretend that this browser does not support obtaining the profile via
  // the WebChannel. This will trigger fallback to the frame script /
  // geckoProfiler API.
  registerMessageToChromeListener((message) => {
    switch (message.type) {
      case 'STATUS_QUERY': {
        triggerResponse({
          type: 'STATUS_RESPONSE',
          requestId: message.requestId,
          menuButtonIsEnabled: true,
        } as any);
        break;
      }
      default: {
        triggerResponse({
          error: `Unexpected message ${message.type}`,
        } as any);
        break;
      }
    }
  });

  // Simulate the frame script's geckoProfiler API.
  window.geckoProfilerPromise = Promise.resolve(geckoProfiler);

  return webChannel;
}

export function simulateWebChannel(
  profileGetter: () => ArrayBuffer | MixedObject,
  faviconsGetter?: () => Promise<Array<FaviconData | null>>
) {
  const webChannel = mockWebChannel();

  const { registerMessageToChromeListener, triggerResponse } = webChannel;
  async function simulateBrowserSide(message: MessageToBrowser) {
    switch (message.type) {
      case 'STATUS_QUERY': {
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: {
            menuButtonIsEnabled: true,
            version: 5,
          },
        });
        break;
      }
      case 'ENABLE_MENU_BUTTON': {
        triggerResponse({
          type: 'ERROR_RESPONSE',
          requestId: message.requestId,
          error:
            'ENABLE_MENU_BUTTON is a valid message but not covered by this test.',
        });
        break;
      }
      case 'GET_PROFILE': {
        const profile: ArrayBuffer | MixedObject = await profileGetter();
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: profile,
        });
        break;
      }
      case 'GET_SYMBOL_TABLE':
      case 'QUERY_SYMBOLICATION_API': {
        triggerResponse({
          type: 'ERROR_RESPONSE',
          requestId: message.requestId,
          error: 'No symbol tables available',
        });
        break;
      }
      case 'GET_EXTERNAL_MARKERS': {
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: {},
        });
        break;
      }
      case 'GET_EXTERNAL_POWER_TRACKS': {
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: [] as unknown[],
        });
        break;
      }
      case 'GET_PAGE_FAVICONS': {
        const favicons: Array<FaviconData | null> = faviconsGetter
          ? await faviconsGetter()
          : [];
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: favicons,
        });
        break;
      }
      case 'OPEN_SCRIPT_IN_DEBUGGER': {
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: undefined,
        });
        break;
      }

      default: {
        break;
      }
    }
  }

  registerMessageToChromeListener((message) => {
    simulateBrowserSide(message);
  });

  return webChannel;
}
