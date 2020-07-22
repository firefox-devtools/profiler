/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { makeProfileSerializable } from '../../profile-logic/process-profile';
import { getView, getUrlSetupPhase } from '../../selectors/app';
import { UrlManager } from '../../components/app/UrlManager';
import { blankStore } from '../fixtures/stores';
import {
  getDataSource,
  getHash,
  getCurrentSearchString,
  getTimelineTrackOrganization,
} from '../../selectors/url-state';
import { waitUntilState } from '../fixtures/utils';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { CURRENT_URL_VERSION } from '../../app-logic/url-handling';
import { autoMockFullNavigation } from '../fixtures/mocks/window-navigation';
import { profilePublished } from 'firefox-profiler/actions/publish';
import {
  changeCallTreeSearchString,
  setDataSource,
} from 'firefox-profiler/actions/profile-view';

jest.mock('../../profile-logic/symbol-store');

describe('UrlManager', function() {
  autoMockFullNavigation();

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
          makeProfileSerializable(getProfileFromTextSamples('A').profile)
        ),
    }: any): Response);
    return fetch200Response;
  }

  function setup(urlPath: ?string) {
    if (typeof urlPath === 'string') {
      window.location.replace(urlPath);
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

  it('allows navigating back and forward when changing view options', async () => {
    window.fetch.mockResolvedValue(getSuccessfulFetchResponse());

    const urlPath = '/public/FAKE_HASH/calltree/';
    const searchString = 'v=' + CURRENT_URL_VERSION;

    const {
      getState,
      createUrlManager,
      waitUntilUrlSetupPhase,
      dispatch,
    } = setup(urlPath + '?' + searchString);

    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();

    await waitUntilUrlSetupPhase('done');

    expect(window.history.length).toBe(1);

    // The user changes is looking for some specific call node.
    dispatch(changeCallTreeSearchString('B'));
    expect(getCurrentSearchString(getState())).toBe('B');
    expect(window.history.length).toBe(2);

    // The user can't find anything, he goes back in history.
    window.history.back();
    expect(getCurrentSearchString(getState())).toBe('');
    expect(window.history.length).toBe(2);

    // Look again at this search.
    window.history.forward();
    expect(getCurrentSearchString(getState())).toBe('B');
  });

  it('allows navigating back and forward when moving between content pages', async () => {
    // The test will start at the home.
    const urlPath = '/ ';
    const {
      getState,
      createUrlManager,
      waitUntilUrlSetupPhase,
      dispatch,
    } = setup(urlPath);
    createUrlManager();

    await waitUntilUrlSetupPhase('done');
    expect(getDataSource(getState())).toBe('none');
    expect(window.history.length).toBe(1);

    // Now the user clicks on the "all recordings" link. This will change the
    // datasource, we're simulating that.
    dispatch(setDataSource('uploaded-recordings'));
    expect(getDataSource(getState())).toBe('uploaded-recordings');
    expect(window.history.length).toBe(2);

    // The user goes back to the home by pressing the browser's back button.
    window.history.back();
    expect(getDataSource(getState())).toBe('none');

    // Now the user goes to the compare form clicking a link on the homepage,
    // we're simulating that by changing the data source.
    dispatch(setDataSource('compare'));
    expect(getDataSource(getState())).toBe('compare');
    // Click on the header
    dispatch(setDataSource('none'));
    expect(window.history.length).toBe(3);

    // The user goes back to the compare form using the browser's back button.
    window.history.back();
    expect(getDataSource(getState())).toBe('compare');
    // The user goes back to the home using the browser's back button.
    window.history.back();
    expect(getDataSource(getState())).toBe('none');
  });

  it('prevents navigating back after publishing', async () => {
    // This loads a profile using the add-on.
    const {
      getState,
      dispatch,
      createUrlManager,
      waitUntilUrlSetupPhase,
    } = setup('/from-addon/');
    createUrlManager();
    await waitUntilUrlSetupPhase('done');

    expect(window.history.length).toBe(1);

    // Now the user publishes.
    dispatch(profilePublished('SOME_HASH', '', null));
    expect(getDataSource(getState())).toMatch('public');
    expect(getHash(getState())).toMatch('SOME_HASH');
    expect(window.history.length).toBe(2);

    // Then wants to go back in history. This shouldn't work!
    let previousLocation = window.location.href;
    window.history.back();
    expect(getDataSource(getState())).toMatch('public');
    expect(getHash(getState())).toMatch('SOME_HASH');
    expect(previousLocation).toEqual(window.location.href);

    // We went back, the entry number 2 has been replaced, but there are still 3
    // entries in the history.
    expect(window.history.length).toBe(2);

    // Now let's publish again
    dispatch(profilePublished('SOME_OTHER_HASH', '', null));
    expect(getDataSource(getState())).toMatch('public');
    expect(getHash(getState())).toMatch('SOME_OTHER_HASH');

    // It's still 3 because the 3rd entry has been removed and replaced by this
    // new state (remember we were at entry number 2).
    expect(window.history.length).toBe(2);

    // The user wants to go back, but this won't work!
    previousLocation = window.location.href;
    window.history.back();
    expect(getDataSource(getState())).toMatch('public');
    expect(getHash(getState())).toMatch('SOME_OTHER_HASH');
    expect(previousLocation).toEqual(window.location.href);
  });

  it('persists view query string for `from-addon` data source', async function() {
    const { getState, waitUntilUrlSetupPhase, createUrlManager } = setup(
      '/from-addon/?view=active-tab'
    );
    await createUrlManager();
    await waitUntilUrlSetupPhase('done');

    // It should successfully preserve the view query string and update the
    // timeline track organization state.
    expect(getTimelineTrackOrganization(getState()).type).toBe('active-tab');
  });
});
