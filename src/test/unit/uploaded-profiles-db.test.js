/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// Main use cases of storing profiles are tested in the publish flow
// (test/store/publish.test.js). In this file we'll test more specific cases.

import {
  persistUploadedProfileInformationToDb,
  listAllUploadedProfileInformationFromDb,
  retrieveUploadedProfileInformationFromDb,
  deleteUploadedProfileInformationFromDb,
  type UploadedProfileInformation,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

describe('uploaded-profiles-db', function () {
  async function storeGenericUploadedProfileInformation(
    overrides: $Shape<UploadedProfileInformation>
  ) {
    const basicUploadedProfileInformation = {
      profileToken: 'PROFILE-1',
      jwtToken: null,
      publishedDate: new Date(),
      name: '',
      preset: null,
      meta: {
        product: 'Firefox',
      },
      urlPath: '/',
      publishedRange: { start: 1000, end: 3000 },
    };

    await persistUploadedProfileInformationToDb({
      ...basicUploadedProfileInformation,
      ...overrides,
    });
  }

  async function setup() {
    await storeGenericUploadedProfileInformation({
      profileToken: 'PROFILE-1',
      publishedDate: new Date('2020-07-01'),
    });
    await storeGenericUploadedProfileInformation({
      profileToken: 'PROFILE-2',
      publishedDate: new Date('2018-07-01'),
    });
    await storeGenericUploadedProfileInformation({
      profileToken: 'PROFILE-3',
      publishedDate: new Date('2019-07-01'),
    });
  }

  it('retrieves individual profile information', async () => {
    await setup();

    expect(
      await retrieveUploadedProfileInformationFromDb('PROFILE-1')
    ).toMatchObject({
      profileToken: 'PROFILE-1',
    });
  });

  it('retrieves a sorted list', async () => {
    // 1. Store some profile data in an unsorted order.
    await setup();

    // 2. Retrieve the list and expect it's in the expected sorted order.
    const listOfUploadedProfileInformation =
      await listAllUploadedProfileInformationFromDb();
    expect(listOfUploadedProfileInformation).toEqual([
      expect.objectContaining({ profileToken: 'PROFILE-2' }),
      expect.objectContaining({ profileToken: 'PROFILE-3' }),
      expect.objectContaining({ profileToken: 'PROFILE-1' }),
    ]);
  });

  it('can delete profile information', async () => {
    await setup();

    await deleteUploadedProfileInformationFromDb('PROFILE-2');
    expect(await retrieveUploadedProfileInformationFromDb('PROFILE-2')).toBe(
      null
    );
    expect(await listAllUploadedProfileInformationFromDb()).toEqual([
      expect.objectContaining({ profileToken: 'PROFILE-3' }),
      expect.objectContaining({ profileToken: 'PROFILE-1' }),
    ]);
  });
});
