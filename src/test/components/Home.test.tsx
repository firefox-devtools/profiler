/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { Home } from '../../components/app/Home';
import createStore from '../../app-logic/create-store';
import { mockWebChannel } from '../fixtures/mocks/web-channel';
import { fireFullClick } from '../fixtures/utils';

// ListOfPublishedProfiles depends on IDB and renders asynchronously, so we'll
// just test we want to render it, but otherwise test it more fully in a
// separate test file.
jest.mock('../../components/app/ListOfPublishedProfiles', () => ({
  ListOfPublishedProfiles: 'list-of-published-profiles',
}));

// Provide a mechanism to overwrite the navigator.userAgent, which can't be set.
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:55.0) Gecko/20100101 Firefox/55.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
let userAgent: string | undefined;

// Flow doesn't understand Object.defineProperty. Use the "any" type to use it anyway.
(Object.defineProperty as any)(window.navigator, 'userAgent', {
  get: () => userAgent,
});

describe('app/Home', function () {
  function setup(userAgentToConfigure: string) {
    userAgent = userAgentToConfigure;
    const renderResults = render(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    return { ...renderResults };
  }

  it('renders a button to enable the popup in Firefox', () => {
    const { container } = setup(FIREFOX);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the Chrome extension instructions for Chromium based browsers', () => {
    const { container } = setup(CHROME);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the information screen for other browsers', () => {
    const { container } = setup(SAFARI);
    expect(container.firstChild).toMatchSnapshot();
  });

  // This test's assertions are that it can find elements through getByTestId.
  // eslint-disable-next-line jest/expect-expect
  it('will switch to recording instructions when enabling the popup', async () => {
    const { triggerResponse, getLastRequestId } = mockWebChannel();
    const { findByTestId, getByText } = setup(FIREFOX);

    // Respond back from the browser that the menu button is not yet enabled.
    triggerResponse({
      type: 'SUCCESS_RESPONSE',
      requestId: getLastRequestId(),
      response: {
        menuButtonIsEnabled: false,
      },
    });
    await findByTestId('home-enable-popup-instructions');

    fireFullClick(getByText('Enable \u2068Firefox Profiler\u2069 Menu Button'));

    // Respond back from the browser that the menu button was enabled.
    triggerResponse({
      type: 'SUCCESS_RESPONSE',
      requestId: getLastRequestId(),
      response: undefined,
    });
    await findByTestId('home-record-instructions');
  });

  it('renders an error if the WebChannel is not available', async () => {
    // This simulates what happens if the profiler is run from a host which
    // is not the configured profiler base-url, or in an old Firefox version (<76)
    // which has WebChannels but no profiler WebChannel.

    const { listeners, triggerResponse } = mockWebChannel();

    // No one has asked anything to the WebChannel.
    expect(listeners).toHaveLength(0);

    const { findByText } = setup(FIREFOX);

    // There is an outstanding question to the WebChannel
    expect(listeners.length).toBeGreaterThan(0);

    // Respond from the browser that the WebChannel does not exist.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    triggerResponse({
      errno: 2, // ERRNO_NO_SUCH_CHANNEL
      error: 'No such channel',
    });
    expect(console.error).toHaveBeenCalled();

    // The UI should update to include a note about the WebChannel being unavailable,
    // which is an async handler of the WebChannel message.
    const webChannelUnavailableMessage = await findByText(
      /This profiler instance was unable to connect to the WebChannel/
    );

    expect(webChannelUnavailableMessage).toMatchSnapshot();
  });
});
