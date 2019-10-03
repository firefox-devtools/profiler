/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from 'react-testing-library';

import { getUrlSetupPhase } from '../../selectors/app';
import UrlManager from '../../components/app/UrlManager';
import { blankStore } from '../fixtures/stores';
import { getDataSource } from '../../selectors/url-state';
import { waitUntilState } from '../fixtures/utils';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import * as receiveProfile from '../../actions/receive-profile';

jest.mock('../../profile-logic/symbol-store');

describe('UrlManager', function() {
  function setup(urlPath: ?string) {
    (receiveProfile: any).doSymbolicateProfile = jest.fn(() => async () => {});

    if (typeof urlPath === 'string') {
      // jsdom doesn't allow us to rewrite window.location. Instead, use the
      // History API to properly set the current location.
      window.history.pushState(undefined, 'profiler.firefox.com', urlPath);
    }
    const store = blankStore();
    const { dispatch, getState } = store;

    const createUrlManager = () =>
      render(
        <Provider store={store}>
          <UrlManager>Contents</UrlManager>
        </Provider>
      );

    const waitUntilUrlSetupPhase = phase =>
      waitUntilState(store, state => getUrlSetupPhase(state) === phase);

    return { dispatch, getState, createUrlManager, waitUntilUrlSetupPhase };
  }

  beforeEach(function() {
    const profileJSON = createGeckoProfile();
    const mockGetProfile = jest.fn().mockResolvedValue(profileJSON);

    const geckoProfiler = {
      getProfile: mockGetProfile,
      getSymbolTable: jest
        .fn()
        .mockRejectedValue(new Error('No symbol tables available')),
    };
    window.fetch = jest
      .fn()
      .mockRejectedValue(new Error('No symbolication API in place'));
    window.geckoProfilerPromise = Promise.resolve(geckoProfiler);
  });

  afterEach(function() {
    delete window.geckoProfilerPromise;
    delete window.fetch;
  });

  it('sets up the URL', async function() {
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup();
    expect(getUrlSetupPhase(getState())).toBe('initial-load');
    createUrlManager();

    expect(getUrlSetupPhase(getState())).toBe('loading-profile');

    await waitUntilUrlSetupPhase('done');
    expect(getUrlSetupPhase(getState())).toBe('done');
    expect(getDataSource(getState())).toMatch('none');
  });

  it('has no data source by default', async function() {
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup();
    createUrlManager();
    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('none');
  });

  it('sets the data source to from-addon', async function() {
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      '/from-addon/'
    );
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('from-addon');
  });

  it('redirects from-file back to no data source', async function() {
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      '/from-file/'
    );
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('none');
  });

  it('sets the data source to public', async function() {
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      '/public/'
    );
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('public');
  });
});
