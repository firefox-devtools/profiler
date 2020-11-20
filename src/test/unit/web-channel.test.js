/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { queryIsMenuButtonEnabled } from '../../app-logic/web-channel';

import { mockWebChannel } from '../fixtures/mocks/web-channel';

describe('event handlers for Firefox WebChannel events', function() {
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
      type: 'STATUS_RESPONSE',
      menuButtonIsEnabled: true,
      requestId: getLastRequestId(),
    });

    // Check that the response makes sense and the listeners are cleared.
    const isMenuButtonEnabled = await response;
    expect(listeners).toHaveLength(0);
    expect(isMenuButtonEnabled).toBe(true);
  });

  it('will error if the message is not understood by Firefox', async function() {
    const { triggerResponse } = mockWebChannel();

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = queryIsMenuButtonEnabled();

    // The triggerResponse doesn't allow unknown message types, so coerce it
    // into a Function to test the error path.
    (triggerResponse: any)({
      errno: 2,
      error: 'No Such Channel',
    });

    await expect(response).rejects.toEqual({
      errno: 2,
      error: 'No Such Channel',
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it('will error if the messages are received that are malformed', async function() {
    const { triggerResponse } = mockWebChannel();

    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const response = queryIsMenuButtonEnabled();

    // The triggerResponse doesn't allow unknown message types, so coerce it
    // into a Function to test the error path.
    (triggerResponse: any)('Invalid message');

    await expect(response).rejects.toEqual(
      new Error('A malformed WebChannel event was received.')
    );
    expect(consoleError).toHaveBeenCalled();
  });
});
