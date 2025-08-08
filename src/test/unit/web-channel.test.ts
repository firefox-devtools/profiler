/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  enableMenuButton,
  queryIsMenuButtonEnabled,
  WebChannelError,
} from '../../app-logic/web-channel';

import { mockWebChannel } from '../fixtures/mocks/web-channel';

describe('event handlers for Firefox WebChannel events', function () {
  it('can test if the menu button is enabled', async () => {
    const {
      messagesSentToBrowser,
      listeners,
      triggerResponse,
      getLastRequestId,
    } = mockWebChannel();

    // Initially there are no listeners
    expect(listeners).toHaveLength(0);
    expect(messagesSentToBrowser).toHaveLength(0);

    // Query the menu button is enabled.
    const response = queryIsMenuButtonEnabled();

    // Now there should be a listener.
    expect(messagesSentToBrowser).toHaveLength(1);
    expect(listeners).toHaveLength(1);
    expect(messagesSentToBrowser[0].message.type).toEqual('STATUS_QUERY');

    // Trigger the response from the browser.
    triggerResponse({
      type: 'SUCCESS_RESPONSE',
      requestId: getLastRequestId(),
      response: {
        menuButtonIsEnabled: true,
      },
    });

    // Check that the response makes sense and the listeners are cleared.
    const isMenuButtonEnabled = await response;
    expect(listeners).toHaveLength(0);
    expect(isMenuButtonEnabled).toBe(true);
  });

  it('handles legacy STATUS_QUERY responses correctly', async () => {
    // This test can be removed once the oldest supported Firefox ESR version is 93 or newer.

    const { triggerResponse, getLastRequestId } = mockWebChannel();

    // Query the menu button is enabled.
    const responseForTrue = queryIsMenuButtonEnabled();

    // Trigger the response from the browser.
    triggerResponse({
      // @ts-expect-error unknown STATUS_RESPONSE (our types don't cover the pre-93 messages variants)
      type: 'STATUS_RESPONSE',
      requestId: getLastRequestId(),
      menuButtonIsEnabled: true,
    });

    const isMenuButtonEnabledForTrue = await responseForTrue;
    expect(isMenuButtonEnabledForTrue).toBe(true);

    // Query the menu button is enabled.
    const responseForFalse = queryIsMenuButtonEnabled();

    // Trigger the response from the browser.
    triggerResponse({
      // @ts-expect-error unknown STATUS_RESPONSE (our types don't cover the pre-93 messages variants)
      type: 'STATUS_RESPONSE',
      requestId: getLastRequestId(),
      menuButtonIsEnabled: false,
    });

    const isMenuButtonEnabledForFalse = await responseForFalse;
    expect(isMenuButtonEnabledForFalse).toBe(false);
  });

  it('handles legacy ENABLE_MENU_BUTTON_DONE responses correctly', async () => {
    // This test can be removed once the oldest supported Firefox ESR version is 93 or newer.

    const { triggerResponse, getLastRequestId } = mockWebChannel();

    // Ask the browser to enable the menu button.
    const response = enableMenuButton();

    // Trigger the response from the browser.
    triggerResponse({
      // @ts-expect-error unknown STATUS_RESPONSE (our types don't cover the pre-93 messages variants)
      type: 'ENABLE_MENU_BUTTON_DONE',
      requestId: getLastRequestId(),
    });

    await expect(response).resolves.toBe(undefined);
  });

  it('will error if the message is not understood by Firefox', async function () {
    const { triggerResponse } = mockWebChannel();

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = queryIsMenuButtonEnabled();

    triggerResponse({
      errno: 2,
      error: 'No Such Channel',
    });

    await expect(response).rejects.toEqual(
      new WebChannelError({
        errno: 2,
        error: 'No Such Channel',
      })
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('will error if the messages are received that are malformed', async function () {
    const { triggerResponse } = mockWebChannel();

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = queryIsMenuButtonEnabled();

    // The triggerResponse doesn't allow unknown message types, so coerce it
    // into a Function to test the error path.
    (triggerResponse as any)('Invalid message');

    await expect(response).rejects.toEqual(
      new Error('A malformed WebChannel event was received.')
    );
    expect(consoleError).toHaveBeenCalled();
  });
});
