/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render, waitFor } from '@testing-library/react';

import { LoadStoredProfileDataManager } from 'firefox-profiler/components/app/LoadStoredProfileDataManager';
import { getCachedStoredProfileData } from 'firefox-profiler/selectors/app';
import { updateUrlState } from 'firefox-profiler/actions/app';

import { storeProfileData } from 'firefox-profiler/app-logic/published-profiles-store';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';

import { blankStore } from '../fixtures/stores';

import 'fake-indexeddb/auto';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';

function resetIndexedDb() {
  // This is the recommended way to reset the IDB state between test runs, but
  // neither flow nor eslint like that we assign to indexedDB directly, for
  // different reasons.
  /* $FlowExpectError */ /* eslint-disable-next-line no-global-assign */
  indexedDB = new FDBFactory();
}
beforeEach(resetIndexedDb);
afterEach(resetIndexedDb);

describe('app/LoadStoredProfileDataManager', () => {
  function setup() {
    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <LoadStoredProfileDataManager />
      </Provider>
    );

    function nextTick() {
      return new Promise(resolve => setTimeout(resolve));
    }

    function navigateToHash(hash: string) {
      const newUrlState = stateFromLocation({
        pathname: `/public/${hash}/calltree`,
        search: '',
        hash: '',
      });
      store.dispatch(updateUrlState(newUrlState));
    }

    return {
      ...renderResult,
      ...store,
      nextTick,
      navigateToHash,
    };
  }

  // eslint-disable-next-line jest/expect-expect
  it('bails out if there is no indexedDB object', async () => {
    window.indexedDB = undefined;
    const { nextTick } = setup();

    // All IndexedDB behavior is asynchronous, and errors themselves will be
    // rejected promises that the test runner will catch. That's why we have to
    // wait a bit to be sure that there's no error.
    await nextTick();
  });

  it('populates the state if a known hash is loaded, resets it otherwise', async () => {
    const profileData = {
      profileToken: 'MACOSX',
      jwtToken: null,
      publishedDate: new Date('5 Jul 2020 11:00'), // This is the future!
      name: 'MacOS X profile',
      preset: null,
      originHostname: 'https://mozilla.org',
      meta: {
        product: 'Firefox',
        platform: 'Macintosh',
        toolkit: 'cocoa',
        misc: 'rv:62.0',
        oscpu: 'Intel Mac OS X 10.12',
      },
      urlPath: '/public/MACOSX/marker-chart/',
      publishedRange: { start: 2000, end: 40000 },
    };

    await storeProfileData(profileData);

    const { navigateToHash, getState } = setup();
    navigateToHash('MACOSX');
    await waitFor(() =>
      expect(getCachedStoredProfileData(getState())).toEqual(profileData)
    );

    // Then navigate to some unknown hash
    navigateToHash('UNKNOWN_HASH');
    await waitFor(() =>
      expect(getCachedStoredProfileData(getState())).toBe(null)
    );
  });
});
