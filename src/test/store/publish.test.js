/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getCheckedSharingOptions } from '../../selectors/publish';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

describe('getCheckedSharingOptions', function() {
  describe('default filtering by channel', function() {
    function getDefaultsWith(updateChannel: string) {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.updateChannel = updateChannel;
      const { getState } = storeWithProfile(profile);
      return getCheckedSharingOptions(getState());
    }

    it('does not filter with nightly', function() {
      expect(getDefaultsWith('nightly')).toMatchObject({
        isFiltering: false,
      });
    });

    it('does not filter with nightly-try', function() {
      expect(getDefaultsWith('nightly-try')).toMatchObject({
        isFiltering: false,
      });
    });

    it('does not filter with default', function() {
      expect(getDefaultsWith('default')).toMatchObject({
        isFiltering: false,
      });
    });

    it('does filter with aurora', function() {
      expect(getDefaultsWith('aurora')).toMatchObject({
        isFiltering: true,
      });
    });

    it('does filter with release', function() {
      expect(getDefaultsWith('release')).toMatchObject({
        isFiltering: true,
      });
    });
  });
});
