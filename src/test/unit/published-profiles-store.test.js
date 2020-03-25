/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// Main use cases of storing profiles are tested in the publish flow
// (test/store/publish.test.js). In this file we'll test more specific cases.

import {
  storeProfileData,
  listAllProfileData,
  retrieveProfileData,
  deleteProfileData,
  type ProfileData,
} from 'firefox-profiler/app-logic/published-profiles-store';

import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

describe('published-profiles-store', function() {
  async function storeGenericProfileData(overrides: $Shape<ProfileData>) {
    const basicProfileData = {
      profileToken: 'PROFILE-1',
      jwtToken: null,
      publishedDate: new Date(),
      name: '',
      preset: null,
      originHostname: null,
      meta: {
        product: 'Firefox',
      },
      urlPath: '/',
      publishedRange: { start: 1000, end: 3000 },
    };

    await storeProfileData({ ...basicProfileData, ...overrides });
  }

  async function setup() {
    await storeGenericProfileData({
      profileToken: 'PROFILE-1',
      publishedDate: new Date('2020-07-01'),
    });
    await storeGenericProfileData({
      profileToken: 'PROFILE-2',
      publishedDate: new Date('2018-07-01'),
    });
    await storeGenericProfileData({
      profileToken: 'PROFILE-3',
      publishedDate: new Date('2019-07-01'),
    });
  }

  it('retrieves individual profile information', async () => {
    await setup();

    expect(await retrieveProfileData('PROFILE-1')).toMatchObject({
      profileToken: 'PROFILE-1',
    });
  });

  it('retrieves a sorted list', async () => {
    // 1. Store some profile data in an unsorted order.
    await setup();

    // 2. Retrieve the list and expect it's in the expected sorted order.
    const listOfProfileData = await listAllProfileData();
    expect(listOfProfileData).toEqual([
      expect.objectContaining({ profileToken: 'PROFILE-2' }),
      expect.objectContaining({ profileToken: 'PROFILE-3' }),
      expect.objectContaining({ profileToken: 'PROFILE-1' }),
    ]);
  });

  it('can delete profile information', async () => {
    await setup();

    await deleteProfileData('PROFILE-2');
    expect(await retrieveProfileData('PROFILE-2')).toBe(null);
    expect(await listAllProfileData()).toEqual([
      expect.objectContaining({ profileToken: 'PROFILE-3' }),
      expect.objectContaining({ profileToken: 'PROFILE-1' }),
    ]);
  });
});
