/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { changeViewAndRecomputeProfileData } from '../../actions/receive-profile';
import {
  getHumanReadableActiveTabTracks,
  getProfileWithNiceTracks,
} from '../fixtures/profiles/tracks';
import {
  getScreenshotTrackProfile,
  addActiveTabInformationToProfile,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

describe('ActiveTab', function() {
  function setup(p = getProfileWithNiceTracks()) {
    const { profile, ...pageInfo } = addActiveTabInformationToProfile(p);
    // Add the innerWindowIDs so we can compute the first thread as main track.
    profile.threads[0].frameTable.innerWindowID[0] =
      pageInfo.parentInnerWindowIDsWithChildren;
    if (profile.threads[0].frameTable.length < 1) {
      profile.threads[0].frameTable.length = 1;
    }

    const { dispatch, getState } = storeWithProfile(profile);
    dispatch(
      changeViewAndRecomputeProfileData(pageInfo.activeBrowsingContextID)
    );

    return {
      // Store:
      dispatch,
      getState,
      // BrowsingContextIDs and InnerWindowIDs of pages:
      ...pageInfo,
    };
  }

  describe('global tracks', function() {
    it('can initialize with active tab information', function() {
      const { getState } = setup();
      expect(getHumanReadableActiveTabTracks(getState())).toEqual([
        'main track [tab] SELECTED',
      ]);
    });

    it('can extract a screenshots track', function() {
      const profile = getScreenshotTrackProfile();
      profile.threads[0].name = 'GeckoMain';
      const { getState } = setup(profile);
      expect(getHumanReadableActiveTabTracks(getState())).toEqual([
        'screenshots',
        'screenshots',
        'main track [tab] SELECTED',
      ]);
    });
  });
});
