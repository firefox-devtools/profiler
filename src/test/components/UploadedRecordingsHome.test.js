/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { UploadedRecordingsHome } from 'firefox-profiler/components/app/UploadedRecordingsHome';
import { persistUploadedProfileInformationToDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { blankStore } from '../fixtures/stores';
import { mockDate } from '../fixtures/mocks/date';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

describe('UploadedRecordingsHome', () => {
  function setup() {
    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <UploadedRecordingsHome />
      </Provider>
    );
    return renderResult;
  }

  it('matches a snapshot when there is no published profiles', async () => {
    const { container, findByText } = setup();
    await findByText(/No profile has been uploaded/);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches a snapshot when rendering published profiles', async () => {
    // Because the rendering is dependent on the timezone, all dates in this
    // test are using a timezone-dependent format so that the rendering is the
    // same in all timezones.
    mockDate('4 Jul 2020 15:00'); // Now is 4th of July, at 3pm local timezone.

    // 1. Add some profiles to the local indexeddb.
    await persistUploadedProfileInformationToDb({
      profileToken: '0123456789',
      jwtToken: 'FAKE_TOKEN',
      publishedDate: new Date('4 Jul 2020 14:00'), // "today" earlier
      name: '',
      preset: null,
      meta: {
        product: 'Fennec',
        // Not more meta information, to test that we can handle profiles that
        // don't have this information.
      },
      urlPath: '/',
      publishedRange: { start: 1000, end: 3000 },
    });

    await persistUploadedProfileInformationToDb({
      profileToken: 'ABCDEFGHI',
      jwtToken: null,
      publishedDate: new Date('3 Jul 2020 08:00'), // yesterday
      name: 'Layout profile',
      preset: 'web',
      meta: {
        product: 'Firefox',
        platform: 'X11',
        toolkit: 'gtk',
        oscpu: 'Linux x86_64',
        misc: 'rv:68.0',
      },
      urlPath: '/',
      publishedRange: { start: 1000, end: 1005 },
    });

    await persistUploadedProfileInformationToDb({
      profileToken: '123abc456',
      jwtToken: null,
      publishedDate: new Date('20 May 2018'), // ancient date
      name: '',
      preset: null,
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
    });

    await persistUploadedProfileInformationToDb({
      profileToken: 'WINDOWS',
      jwtToken: null,
      publishedDate: new Date('4 Jul 2020 13:00'),
      name: 'Another good profile',
      preset: null,
      meta: {
        product: 'Firefox',
        platform: 'Windows',
        toolkit: 'windows',
        misc: 'rv:77.0',
        oscpu: 'Windows NT 10.0; Win64; x64',
      },
      urlPath: '/public/WINDOWS/marker-chart/',
      publishedRange: { start: 2000, end: 40000 },
    });

    await persistUploadedProfileInformationToDb({
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
    });

    // 2. Render the component and test.
    const { container, findByText } = setup();
    await findByText(/macOS/);

    expect(container.firstChild).toMatchSnapshot();
  });
});
