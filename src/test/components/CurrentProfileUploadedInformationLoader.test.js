/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import { Provider } from 'react-redux';

import {
  render,
  waitFor,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { CurrentProfileUploadedInformationLoader } from 'firefox-profiler/components/app/CurrentProfileUploadedInformationLoader';
import { getCurrentProfileUploadedInformation } from 'firefox-profiler/selectors/app';
import { updateUrlState } from 'firefox-profiler/actions/app';

import { persistUploadedProfileInformationToDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';

import { blankStore } from 'firefox-profiler/test/fixtures/stores';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

describe('app/CurrentProfileUploadedInformationLoader', () => {
  function setup() {
    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <CurrentProfileUploadedInformationLoader />
      </Provider>
    );

    function nextTick() {
      return new Promise((resolve) => setTimeout(resolve));
    }

    function navigateToHash(hash: string) {
      const newUrlState = stateFromLocation({
        pathname: `/public/${hash}/calltree`,
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
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
    // In tests we don't always have the indexeddb object for simplicity.
    // Because this component is used high in the component tree it may be
    // inserted in tests that don't want to test this behavior. Therefore the
    // component will bail out if the indexedDB object is missing. This test
    // tests for this behavior.

    window.indexedDB = undefined;
    const { nextTick } = setup();

    // All IndexedDB behavior is asynchronous, and errors themselves will be
    // rejected promises that the test runner will catch. That's why we have to
    // wait a bit to be sure that there's no error.
    await nextTick();
  });

  it('populates the state if a known hash is loaded, resets it otherwise', async () => {
    const uploadedProfileInformation = {
      profileToken: 'MACOSX',
      jwtToken: null,
      publishedDate: new Date('5 Jul 2020 11:00'), // This is the future!
      name: 'MacOS X profile',
      preset: null,
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

    await persistUploadedProfileInformationToDb(uploadedProfileInformation);

    const { navigateToHash, getState } = setup();
    navigateToHash('MACOSX');
    await waitFor(() =>
      expect(getCurrentProfileUploadedInformation(getState())).toEqual(
        uploadedProfileInformation
      )
    );

    // Then navigate to some unknown hash
    navigateToHash('UNKNOWN_HASH');
    await waitFor(() =>
      expect(getCurrentProfileUploadedInformation(getState())).toBe(null)
    );
  });
});
