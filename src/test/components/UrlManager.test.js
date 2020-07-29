/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { serializeProfile } from '../../profile-logic/process-profile';
import { getView, getUrlSetupPhase } from '../../selectors/app';
import UrlManager from '../../components/app/UrlManager';
import { blankStore } from '../fixtures/stores';
import { getDataSource } from '../../selectors/url-state';
import { waitUntilState } from '../fixtures/utils';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { CURRENT_URL_VERSION } from '../../app-logic/url-handling';

jest.mock('../../profile-logic/symbol-store');

describe('UrlManager', function() {
  // This is a quite complicated function, that does something very simple:
  // it returns a response with a good profile suitable to mock a fetch result.
  function getSuccessfulFetchResponse() {
    const fetch200Response = (({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: () =>
        Promise.resolve(
          JSON.parse(serializeProfile(getProfileFromTextSamples('A').profile))
        ),
    }: any): Response);
    return fetch200Response;
  }

  function setup(urlPath: ?string) {
    if (typeof urlPath === 'string') {
      // jsdom doesn't allow us to rewrite window.location. Instead, use the
      // History API to properly set the current location.
      window.history.pushState(undefined, 'Firefox Profiler', urlPath);
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
      .mockRejectedValue(new Error('Simulated network error'));
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

  it(`sets the data source to public and doesn't change the URL when there's a fetch error`, async function() {
    const urlPath = '/public/FAKE_HASH/marker-chart';
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      urlPath
    );
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('public');
    const view: any = getView(getState());
    expect(view.phase).toBe('FATAL_ERROR');
    expect(view.error).toBeTruthy();
    expect(view.error.message).toBe('Simulated network error');
    expect(window.location.pathname).toBe(urlPath);
  });

  it(`sets the data source to public and doesn't change the URL when there's a URL upgrading error`, async function() {
    window.fetch.mockResolvedValue(getSuccessfulFetchResponse());

    const urlPath = '/public/FAKE_HASH/calltree';
    const searchString = '?v=' + (CURRENT_URL_VERSION + 1);
    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      urlPath + searchString
    );
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('public');
    const view: any = getView(getState());
    expect(view.phase).toBe('FATAL_ERROR');
    expect(view.error).toBeTruthy();
    expect(view.error.message).toMatch('Unable to parse a url');
    expect(view.error.name).toBe('UrlUpgradeError');
    expect(window.location.pathname).toBe(urlPath);
    expect(window.location.search).toBe(searchString);
  });

  it(`fetches profile and sets the phase to done when everything works`, async function() {
    window.fetch.mockResolvedValue(getSuccessfulFetchResponse());

    const urlPath = '/public/FAKE_HASH/';
    const expectedResultingPath = urlPath + 'calltree/';
    const searchString = 'v=' + CURRENT_URL_VERSION;

    const { getState, createUrlManager, waitUntilUrlSetupPhase } = setup(
      urlPath + '?' + searchString
    );

    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toMatch('public');
    expect(getView(getState()).phase).toBe('DATA_LOADED');
    expect(window.location.pathname).toBe(expectedResultingPath);
    expect(window.location.search).toContain(searchString);
  });
});
