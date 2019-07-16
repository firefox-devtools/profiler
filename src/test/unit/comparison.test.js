/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { mergeProfiles } from '../../profile-logic/comparison';
import { stateFromLocation } from '../../app-logic/url-handling';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

describe('mergeProfiles function', function() {
  it('merges the various tables properly in the diffing profile', function() {
    const sampleProfileA = getProfileFromTextSamples(
      'A[lib:libA]  B[lib:libA]'
    );
    const sampleProfileB = getProfileFromTextSamples(
      'A[lib:libA]  A[lib:libB]  C[lib:libC]'
    );
    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });
    const { profile: mergedProfile } = mergeProfiles(
      [sampleProfileA.profile, sampleProfileB.profile],
      [profileState, profileState]
    );
    expect(mergedProfile.threads).toHaveLength(3);

    const mergedThread = mergedProfile.threads[2];
    const mergedLibs = mergedThread.libs;
    const mergedResources = mergedThread.resourceTable;
    const mergedFunctions = mergedThread.funcTable;
    const stringTable = mergedThread.stringTable;

    expect(mergedLibs).toHaveLength(3);
    expect(mergedResources).toHaveLength(3);
    expect(mergedFunctions).toHaveLength(4);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, and 1 C function.
    const libsForA = [];
    const resourcesForA = [];
    for (let funcIndex = 0; funcIndex < mergedFunctions.length; funcIndex++) {
      const funcName = stringTable.getString(mergedFunctions.name[funcIndex]);
      const resourceIndex = mergedFunctions.resource[funcIndex];

      let resourceName = '';
      let libName = '';
      if (resourceIndex >= 0) {
        const nameIndex = mergedResources.name[resourceIndex];
        if (nameIndex >= 0) {
          resourceName = stringTable.getString(nameIndex);
        }

        const libIndex = mergedResources.lib[resourceIndex];
        if (libIndex !== null && libIndex !== undefined && libIndex >= 0) {
          libName = mergedLibs[libIndex].name;
        }
      }

      switch (funcName) {
        case 'A':
          libsForA.push(libName);
          resourcesForA.push(resourceName);
          break;
        case 'B':
          expect(libName).toBe('libA');
          expect(resourceName).toBe('libA');
          break;
        case 'C':
          expect(libName).toBe('libC');
          expect(resourceName).toBe('libC');
          break;
        default:
      }
    }
    expect(libsForA).toEqual(['libA', 'libB']);
    expect(resourcesForA).toEqual(['libA', 'libB']);
  });

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
    sampleProfileB.profile.meta.interval = 20;

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
