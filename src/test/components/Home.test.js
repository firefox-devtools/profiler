/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import Home from '../../components/app/Home';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import createStore from '../../create-store';

// Provide a mechanism to overwrite the navigator.userAgent, which can't be set.
const FIREFOX_WEBEXT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:55.0) Gecko/20100101 Firefox/55.0';
const FIREFOX_LEGACY =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:53.0) Gecko/20100101 Firefox/53.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8';
let userAgent;

// Flow doesn't understand Object.defineProperty. Use the "any" type to use it anyway.
(Object.defineProperty: any)(window.navigator, 'userAgent', {
  get: () => userAgent,
});

describe('app/Home', function() {
  it('renders the install screen for the extension', () => {
    userAgent = FIREFOX_WEBEXT;

    const home = renderer.create(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    expect(home.toJSON()).toMatchSnapshot();
  });

  it('renders the install screen for the legacy add-on', () => {
    userAgent = FIREFOX_LEGACY;

    const home = renderer.create(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    expect(home.toJSON()).toMatchSnapshot();
  });

  it('renders the information screen for other browsers', () => {
    userAgent = SAFARI;

    const home = renderer.create(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    expect(home.toJSON()).toMatchSnapshot();
  });

  it('renders the usage instructions for pages with the extension installed', () => {
    userAgent = FIREFOX_WEBEXT;

    window.isGeckoProfilerAddonInstalled = true;

    const home = renderer.create(
      <Provider store={createStore()}>
        <Home specialMessage="This is a special message" />
      </Provider>
    );

    expect(home.toJSON()).toMatchSnapshot();

    delete window.isGeckoProfilerAddonInstalled;
  });
});
