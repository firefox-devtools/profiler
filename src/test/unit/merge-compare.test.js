/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  mergeProfilesForDiffing,
  mergeThreads,
} from '../../profile-logic/merge-compare';
import { stateFromLocation } from '../../app-logic/url-handling';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';

import type { Thread } from 'firefox-profiler/types';

describe('mergeProfilesForDiffing function', function() {
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
    const { profile: mergedProfile } = mergeProfilesForDiffing(
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

    const mergedProfile = mergeProfilesForDiffing(
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
      return mergeProfilesForDiffing(
        [profile1, profile2],
        [profileState1, profileState2]
      ).profile.meta.symbolicated;
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

describe('mergeThreads function', function() {
  function getFriendlyFuncLibResources(thread: Thread): string[] {
    const { funcTable, resourceTable, stringTable, libs } = thread;
    const strings = [];
    for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
      const funcName = stringTable.getString(funcTable.name[funcIndex]);
      const resourceIndex = funcTable.resource[funcIndex];

      let resourceName = '';
      let libName = '';
      if (resourceIndex >= 0) {
        const nameIndex = resourceTable.name[resourceIndex];
        if (nameIndex >= 0) {
          resourceName = stringTable.getString(nameIndex);
        }

        const libIndex = resourceTable.lib[resourceIndex];
        if (libIndex !== null && libIndex !== undefined && libIndex >= 0) {
          libName = libs[libIndex].name;
        }
      }
      strings.push(`${funcName} [${resourceName}:${libName}]`);
    }
    return strings;
  }

  it('merges the various tables for 2 threads properly', function() {
    const { profile } = getProfileFromTextSamples(
      'A[lib:libA]  B[lib:libA]',
      'A[lib:libA]  A[lib:libB]  C[lib:libC]'
    );

    const mergedThread = mergeThreads(profile.threads);

    const mergedLibs = mergedThread.libs;
    const mergedResources = mergedThread.resourceTable;
    const mergedFunctions = mergedThread.funcTable;

    expect(mergedLibs).toHaveLength(3);
    expect(mergedResources).toHaveLength(3);
    expect(mergedFunctions).toHaveLength(4);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, and 1 C function.
    expect(getFriendlyFuncLibResources(mergedThread)).toEqual([
      'A [libA:libA]',
      'B [libA:libA]',
      'A [libB:libB]',
      'C [libC:libC]',
    ]);
  });

  it('merges the various tables for more than 2 threads properly', function() {
    const { profile } = getProfileFromTextSamples(
      'A[lib:libA]  B[lib:libA]',
      'A[lib:libA]  A[lib:libB]  C[lib:libC]',
      'A[lib:libA]  A[lib:libB]  D[lib:libD]'
    );

    const mergedThread = mergeThreads(profile.threads);

    const mergedLibs = mergedThread.libs;
    const mergedResources = mergedThread.resourceTable;
    const mergedFunctions = mergedThread.funcTable;

    expect(mergedLibs).toHaveLength(4);
    expect(mergedResources).toHaveLength(4);
    expect(mergedFunctions).toHaveLength(5);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, 1 C function and 1 D function.
    expect(getFriendlyFuncLibResources(mergedThread)).toEqual([
      'A [libA:libA]',
      'B [libA:libA]',
      'A [libB:libB]',
      'C [libC:libC]',
      'D [libD:libD]',
    ]);
  });

  it('merges the marker tables properly', function() {
    const profile = getProfileWithMarkers(
      [
        ['Thread1 Marker1', 2],
        ['Thread1 Marker2', 3, 5],
        [
          'Thread1 Marker3',
          6,
          7,
          { type: 'Log', name: 'test name 1', module: 'test module 1' },
        ],
      ],
      [
        ['Thread2 Marker1', 1],
        ['Thread2 Marker2', 3, 4],
        [
          'Thread2 Marker3',
          8,
          9,
          { type: 'Log', name: 'test name 2', module: 'test module 2' },
        ],
      ]
    );

    const mergedThread = mergeThreads(profile.threads);

    const mergedMarkers = mergedThread.markers;
    const mergedStringTable = mergedThread.stringTable;
    expect(mergedMarkers).toHaveLength(6);
    expect(mergedStringTable.serializeToArray()).toHaveLength(6);

    const markerNames = [];
    const markerStartTimes = [];
    const markerEndTimes = [];
    for (
      let markerIndex = 0;
      markerIndex < mergedMarkers.length;
      markerIndex++
    ) {
      const markerNameIdx = mergedMarkers.name[markerIndex];

      const markerStarTime = mergedMarkers.startTime[markerIndex];
      const markerEndTime = mergedMarkers.endTime[markerIndex];
      const markerName = mergedStringTable.getString(markerNameIdx);
      markerNames.push(markerName);
      markerStartTimes.push(markerStarTime);
      markerEndTimes.push(markerEndTime);
    }

    expect(markerNames).toEqual([
      'Thread1 Marker1',
      'Thread1 Marker2',
      'Thread1 Marker3',
      'Thread2 Marker1',
      'Thread2 Marker2',
      'Thread2 Marker3',
    ]);

    // New marker table doesn't have to be sorted. Because we sort it while we
    // are getting it from selector anyway.
    expect(markerStartTimes).toEqual([2, 3, 6, 1, 3, 8]);
    expect(markerEndTimes).toEqual([null, 5, 7, null, 4, 9]);
  });
});
