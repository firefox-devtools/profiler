/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { mergeProfiles } from '../../profile-logic/comparison';
import { stateFromLocation } from '../../app-logic/url-handling';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('mergeProfiles function', function() {
  it('should set interval of merged profile to minimum of all intervals', function() {
    const sampleProfileA = getProfileFromTextSamples('A');
    const sampleProfileB = getProfileFromTextSamples('B');
    const profileState1 = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });
    const profileState2 = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });
    sampleProfileA.profile.meta.interval = 10;
    sampleProfileA.profile.threads[0].samples.duration.fill(10);
    sampleProfileB.profile.meta.interval = 20;
    sampleProfileB.profile.threads[0].samples.duration.fill(20);

    const mergedProfile = mergeProfiles(
      [sampleProfileA.profile, sampleProfileB.profile],
      [profileState1, profileState2]
    );

    expect(mergedProfile.profile.meta.interval).toEqual(10);
  });

  it('should set the resulting profile to symbolicated if all are symbolicated', () => {
    const { profile: symbolicatedProfile } = getProfileFromTextSamples('A');
    const { profile: unsymbolicatedProfile } = getProfileFromTextSamples('B');
    const { profile: unknownSymbolicatedProfile } = getProfileFromTextSamples(
      'C'
    );
    unsymbolicatedProfile.meta.symbolicated = false;
    delete unknownSymbolicatedProfile.meta.symbolicated;

    const profileState1 = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });
    const profileState2 = stateFromLocation({
      pathname: '/public/fakehash2/',
      search: '?thread=0&v=3',
      hash: '',
    });

    function getMergedProfilesSymbolication(profile1, profile2) {
      return mergeProfiles([profile1, profile2], [profileState1, profileState2])
        .profile.meta.symbolicated;
    }

    expect(
      getMergedProfilesSymbolication(symbolicatedProfile, symbolicatedProfile)
    ).toBe(true);

    expect(
      getMergedProfilesSymbolication(
        unsymbolicatedProfile,
        unsymbolicatedProfile
      )
    ).toBe(false);

    expect(
      getMergedProfilesSymbolication(symbolicatedProfile, unsymbolicatedProfile)
    ).toBe(false);

    expect(
      getMergedProfilesSymbolication(
        unknownSymbolicatedProfile,
        unknownSymbolicatedProfile
      )
    ).toBe(undefined);

    expect(
      getMergedProfilesSymbolication(
        symbolicatedProfile,
        unknownSymbolicatedProfile
      )
    ).toBe(false);
  });
});
