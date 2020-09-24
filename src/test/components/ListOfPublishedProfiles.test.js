/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { ListOfPublishedProfiles } from 'firefox-profiler/components/app/ListOfPublishedProfiles';
import { storeProfileData } from 'firefox-profiler/app-logic/published-profiles-store';
import { blankStore } from '../fixtures/stores';
import { mockDate } from '../fixtures/mocks/date';

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

const listOfProfileInformations = [
  {
    profileToken: '0123456789',
    jwtToken: null,
    publishedDate: new Date('4 Jul 2020 14:00'), // "today" earlier
    name: '',
    preset: null,
    originHostname: null,
    meta: {
      product: 'Fennec',
      // Not more meta information, to test that we can handle profiles that
      // don't have this information.
    },
    urlPath: '/',
    publishedRange: { start: 1000, end: 3000 },
  },
  {
    profileToken: 'ABCDEFGHI',
    jwtToken: null,
    publishedDate: new Date('3 Jul 2020 08:00'), // yesterday
    name: 'Layout profile',
    preset: 'web',
    originHostname: null,
    meta: {
      product: 'Firefox',
      platform: 'X11',
      toolkit: 'gtk',
      oscpu: 'Linux x86_64',
      misc: 'rv:68.0',
    },
    urlPath: '/',
    publishedRange: { start: 1000, end: 1005 },
  },
  {
    profileToken: '123abc456',
    jwtToken: null,
    publishedDate: new Date('20 May 2018'), // ancient date
    name: '',
    preset: null,
    originHostname: 'https://www.cnn.com',
    meta: {
      product: 'Firefox Preview',
      platform: 'Android 7.0',
      toolkit: 'android',
      misc: 'rv:80.0',
      oscpu: 'Linux armv7l',
    },
    urlPath:
      '/public/123abc456/calltree/?globalTrackOrder=0-1-2-3-4-5-6-7-8-9-10&hiddenGlobalTracks=1-2-3-4-5-6-7-8-9&localTrackOrderByPid=32027-1-2-0~12629-0~12149-0~11755-0~11945-0~12533-0~11798-0~11862-0~12083-0~12118-0~12298-0-1~&search=bla&thread=11&v=5',
    // This tests ranges that should show up as µs
    publishedRange: { start: 40000, end: 40000.1 },
  },
  {
    profileToken: 'WINDOWS',
    jwtToken: null,
    publishedDate: new Date('4 Jul 2020 13:00'),
    name: 'Another good profile',
    preset: null,
    originHostname: 'https://profiler.firefox.com',
    meta: {
      product: 'Firefox',
      platform: 'Windows',
      toolkit: 'windows',
      misc: 'rv:77.0',
      oscpu: 'Windows NT 10.0; Win64; x64',
    },
    urlPath: '/public/WINDOWS/marker-chart/',
    publishedRange: { start: 2000, end: 40000 },
  },
  {
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
  },
];

async function storeProfileInformations(listOfProfileInformations) {
  for (const profileInfo of listOfProfileInformations) {
    await storeProfileData(profileInfo);
  }
}

describe('ListOfPublishedProfiles', () => {
  function setup(props) {
    // Because the rendering is dependent on the timezone, all dates in this
    // test are using a timezone-dependent format so that the rendering is the
    // same in all timezones.
    mockDate('4 Jul 2020 15:00'); // Now is 4th of July, at 3pm local timezone.

    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <ListOfPublishedProfiles withActionButtons={false} {...props} />
      </Provider>
    );

    const { getByText } = renderResult;

    function getAllRecordingsLink() {
      return getByText(/all your recordings/);
    }

    return {
      ...renderResult,
      getAllRecordingsLink,
    };
  }

  it('limits the number of rendered profiles with the limit prop', async () => {
    // 1. Add some profiles to the local indexeddb.
    await storeProfileInformations(listOfProfileInformations);

    // 2. Render the component and test.
    const { container, findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/macOS/);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    getAllRecordingsLink(); // This shouldn't throw.
    expect(container.firstChild).toMatchSnapshot();
  });

  it('does not display the link to all recordings when there is 3 profiles or less', async () => {
    await storeProfileInformations(listOfProfileInformations.slice(0, 3));
    const { findByText, getAllRecordingsLink } = setup({ limit: 3 });
    await findByText(/Layout profile/);
    expect(() => getAllRecordingsLink()).toThrow('Unable to find an element');
  });
});
