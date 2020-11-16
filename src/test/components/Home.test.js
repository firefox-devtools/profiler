/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Home } from '../../components/app/Home';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
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
let userAgent;

// Flow doesn't understand Object.defineProperty. Use the "any" type to use it anyway.
(Object.defineProperty: any)(window.navigator, 'userAgent', {
  get: () => userAgent,
});

describe('app/Home', function() {
  function setup(userAgentToConfigure: string) {
    userAgent = userAgentToConfigure;
    const renderResults = render(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    return { ...renderResults };
  }

  it('renders the install screen for the extension', () => {
    const { container } = setup(FIREFOX);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the information screen for other browsers', () => {
    const { container } = setup(SAFARI);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the usage instructions for pages with the extension installed', () => {
    window.isGeckoProfilerAddonInstalled = true;

    const { container } = setup(FIREFOX);

    expect(container.firstChild).toMatchSnapshot();

    delete window.isGeckoProfilerAddonInstalled;
  });

  it('renders a button to enable the popup when it is available', async () => {
    const { listeners, triggerResponse, getLastRequestId } = mockWebChannel();

    // No one has asked anything to the WebChannel.
    expect(listeners).toHaveLength(0);

    const { findByTestId } = setup(FIREFOX);

    // There is an outstanding question to the WebChannel
    expect(listeners.length).toBeGreaterThan(0);

    // Respond from the browser that the menu button is available.
    triggerResponse({
      type: 'STATUS_RESPONSE',
      menuButtonIsEnabled: false,
      requestId: getLastRequestId(),
    });

    // The UI should update for the record instructions, which is an async
    // handle of the WebChannel message.
    const instructions = await findByTestId('home-enable-popup-instructions');

    expect(instructions).toMatchSnapshot();
  });

  it('renders the usage instructions for when the popup is enabled', async () => {
    const { listeners, triggerResponse, getLastRequestId } = mockWebChannel();

    // No one has asked anything to the WebChannel.
    expect(listeners).toHaveLength(0);

    const { findByTestId } = setup(FIREFOX);

    // There is an outstanding question to the WebChannel
    expect(listeners.length).toBeGreaterThan(0);

    // Respond from the browser that the menu button is available.
    triggerResponse({
      type: 'STATUS_RESPONSE',
      menuButtonIsEnabled: true,
      requestId: getLastRequestId(),
    });

    // The UI should update for the record instructions, which is an async
    // handle of the WebChannel message.
    const instructions = await findByTestId('home-record-instructions');

    expect(instructions).toMatchSnapshot();
  });

  // This test's assertions are that it can find elements through getByTestId.
  // eslint-disable-next-line jest/expect-expect
  it('will switch to recording instructions when enabling the popup', async () => {
    const { triggerResponse, getLastRequestId } = mockWebChannel();
    const { findByTestId, getByText } = setup(FIREFOX);

    // Respond back from the browser that the menu button is not yet enabled.
    triggerResponse({
      type: 'STATUS_RESPONSE',
      menuButtonIsEnabled: false,
      requestId: getLastRequestId(),
    });
    await findByTestId('home-enable-popup-instructions');

    fireFullClick(getByText('Enable Profiler Menu Button'));

    // Respond back from the browser that the menu button was enabled.
    triggerResponse({
      type: 'ENABLE_MENU_BUTTON_DONE',
      requestId: getLastRequestId(),
    });
    await findByTestId('home-record-instructions');
  });
});
