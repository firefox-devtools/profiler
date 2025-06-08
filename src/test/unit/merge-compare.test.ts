/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  mergeProfilesForDiffing,
  mergeSharedData,
  mergeThreads,
} from '../../profile-logic/merge-compare';
import { stateFromLocation } from '../../app-logic/url-handling';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  addMarkersToThreadWithCorrespondingSamples,
} from '../fixtures/profiles/processed-profile';
import { markerSchemaForTests } from '../fixtures/profiles/marker-schema';
import { ensureExists } from 'firefox-profiler/utils/types';
import { getTimeRangeIncludingAllThreads } from 'firefox-profiler/profile-logic/profile-data';
import { StringTable } from '../../utils/string-table';
import type { RawProfileSharedData, Profile } from 'firefox-profiler/types';

describe('mergeProfilesForDiffing function', function () {
  it('merges the various tables properly in the diffing profile', function () {
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

    const mergedLibs = mergedProfile.libs;
    const mergedShared = mergedProfile.shared;
    const mergedResources = mergedShared.resourceTable;
    const mergedFunctions = mergedShared.funcTable;
    const stringArray = mergedShared.stringArray;

    expect(mergedLibs).toHaveLength(3);
    expect(mergedResources).toHaveLength(3);
    expect(mergedFunctions).toHaveLength(4);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, and 1 C function.
    const libsForA = [];
    const resourcesForA = [];
    for (let funcIndex = 0; funcIndex < mergedFunctions.length; funcIndex++) {
      const funcName = stringArray[mergedFunctions.name[funcIndex]];
      const resourceIndex = mergedFunctions.resource[funcIndex];

      let resourceName = '';
      let libName = '';
      if (resourceIndex >= 0) {
        const nameIndex = mergedResources.name[resourceIndex];
        if (nameIndex >= 0) {
          resourceName = stringArray[nameIndex];
        }

        const libIndex = mergedResources.lib[resourceIndex];
        if (libIndex !== null && libIndex !== undefined && libIndex >= 0) {
          libName = mergedLibs[libIndex].name;
        }
      }

      /* eslint-disable jest/no-conditional-expect */
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
      /* eslint-enable */
    }
    expect(libsForA).toEqual(['libA', 'libB']);
    expect(resourcesForA).toEqual(['libA', 'libB']);
  });

  it('should set interval of merged profile to minimum of all intervals', function () {
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

    const diffThread = mergedProfile.profile.threads[2];
    const weightColumn = ensureExists(diffThread.samples.weight);
    // Check that the weights have been adjusted based on the interval.
    // Profile B has interval 20ms, so it started out with half the number of
    // samples over the same duration as a profile with interval 10ms.
    // So profile B's sample weights should be multiplied by 2 to make sense
    // with the shared interval 10ms.
    expect(weightColumn[0]).toBe(2); // The first sample is from profile B.
    expect(weightColumn[1]).toBe(-1); // The second sample is from profile A.
  });

  it('should set the resulting profile to symbolicated if all are symbolicated', () => {
    const { profile: symbolicatedProfile } = getProfileFromTextSamples('A');
    const { profile: unsymbolicatedProfile } = getProfileFromTextSamples('B');
    const { profile: unknownSymbolicatedProfile } =
      getProfileFromTextSamples('C');
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

    function getMergedProfilesSymbolication(
      profile1: Profile,
      profile2: Profile
    ) {
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

  it('merges the nativeSymbols tables correctly', function () {
    const sampleProfileA = getProfileFromTextSamples(
      'X[lib:libA]  Y[lib:libA]'
    );
    const sampleProfileB = getProfileFromTextSamples(
      'Z[lib:libB]  W[lib:libB]'
    );

    const stringTableA = sampleProfileA.stringTable;
    const stringTableB = sampleProfileB.stringTable;

    sampleProfileA.profile.shared.nativeSymbols = {
      length: 2,
      name: [
        stringTableA.indexForString('X'),
        stringTableA.indexForString('Y'),
      ],
      address: [0x20, 0x50],
      libIndex: [0, 0],
      functionSize: [null, null],
    };

    sampleProfileB.profile.shared.nativeSymbols = {
      length: 2,
      name: [
        stringTableB.indexForString('Z'),
        stringTableB.indexForString('W'),
      ],
      address: [0x25, 0x45],
      libIndex: [0, 0],
      functionSize: [null, null],
    };

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });
    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [sampleProfileA.profile, sampleProfileB.profile],
      [profileState, profileState]
    );

    // The merged profile has a single merged libs list, so the native symbols
    // should now be merged with updated libIndexes.
    expect(mergedProfile.shared.nativeSymbols.libIndex).toEqual([0, 0, 1, 1]);
  });

  it('should use marker timing if there are no samples', () => {
    const profiles = [
      getProfileWithMarkers([
        ['Thread1 Marker1', 2],
        ['Thread1 Marker2', 3, 5],
        ['Thread1 Marker3', 6, 7],
      ]),

      getProfileWithMarkers([
        ['Thread1 Marker1', 5],
        ['Thread1 Marker2', 6, 8],
        ['Thread1 Marker3', 10, 15],
      ]),
    ];

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile } = mergeProfilesForDiffing(profiles, [
      profileState,
      profileState,
    ]);

    expect(getTimeRangeIncludingAllThreads(profile)).toEqual({
      start: 0,
      end: 11,
    });
  });
});

describe('mergeThreads function', function () {
  function getFriendlyFuncLibResources(shared: RawProfileSharedData): string[] {
    const { funcTable, resourceTable } = shared;
    const strings = [];
    for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
      const funcName = shared.stringArray[funcTable.name[funcIndex]];
      const resourceIndex = funcTable.resource[funcIndex];

      let resourceName = '';
      if (resourceIndex >= 0) {
        const nameIndex = resourceTable.name[resourceIndex];
        resourceName = shared.stringArray[nameIndex];
      }
      strings.push(`${funcName} [${resourceName}]`);
    }
    return strings;
  }

  it('merges the various tables for 2 threads properly', function () {
    const { profile: profile1 } = getProfileFromTextSamples(
      'A[lib:libA]  B[lib:libA]'
    );
    const { profile: profile2 } = getProfileFromTextSamples(
      'A[lib:libA]  A[lib:libB]  C[lib:libC]'
    );

    const { libs, shared } = mergeSharedData([profile1, profile2]);

    const mergedResources = shared.resourceTable;
    const mergedFunctions = shared.funcTable;

    expect(libs).toHaveLength(3);
    expect(mergedResources).toHaveLength(3);
    expect(mergedFunctions).toHaveLength(4);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, and 1 C function.
    expect(getFriendlyFuncLibResources(shared)).toEqual([
      'A [libA]',
      'B [libA]',
      'A [libB]',
      'C [libC]',
    ]);
  });

  it('merges the various tables for more than 2 threads properly', function () {
    const { profile: profile1 } = getProfileFromTextSamples(
      'A[lib:libA]  B[lib:libA]'
    );
    const { profile: profile2 } = getProfileFromTextSamples(
      'A[lib:libA]  A[lib:libB]  C[lib:libC]'
    );
    const { profile: profile3 } = getProfileFromTextSamples(
      'A[lib:libA]  A[lib:libB]  D[lib:libD]'
    );

    const { libs, shared } = mergeSharedData([profile1, profile2, profile3]);

    const mergedResources = shared.resourceTable;
    const mergedFunctions = shared.funcTable;

    expect(libs).toHaveLength(4);
    expect(mergedResources).toHaveLength(4);
    expect(mergedFunctions).toHaveLength(5);

    // Now check that all functions are linked to the right resources.
    // We should have 2 A functions, linked to 2 different resources.
    // And we should have 1 B function, 1 C function and 1 D function.
    expect(getFriendlyFuncLibResources(shared)).toEqual([
      'A [libA]',
      'B [libA]',
      'A [libB]',
      'C [libC]',
      'D [libD]',
    ]);
  });

  it('merges the marker tables properly', function () {
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
    expect(mergedMarkers).toHaveLength(6);
    expect(profile.shared.stringArray).toHaveLength(6);

    const markerNames = [];
    const markerStartTimes = [];
    const markerEndTimes = [];
    const markerThreadIds = [];
    for (
      let markerIndex = 0;
      markerIndex < mergedMarkers.length;
      markerIndex++
    ) {
      const markerNameIdx = mergedMarkers.name[markerIndex];

      const markerStarTime = mergedMarkers.startTime[markerIndex];
      const markerEndTime = mergedMarkers.endTime[markerIndex];
      const markerName = profile.shared.stringArray[markerNameIdx];
      markerNames.push(markerName);
      markerStartTimes.push(markerStarTime);
      markerEndTimes.push(markerEndTime);
      markerThreadIds.push(mergedMarkers.threadId?.[markerIndex]);
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
    expect(markerThreadIds).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('merges markers with stacks properly', function () {
    const { profile } = getProfileFromTextSamples(
      `
          A  A
          B  B
          C  D
        `,
      `
          A  A
          B  B
          E  C
        `
    );

    // Get a useful marker schema
    profile.meta.markerSchema = markerSchemaForTests;

    const stackABC = profile.threads[0].samples.stack[0];
    const stackABE = profile.threads[1].samples.stack[0];

    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      profile.shared,
      [
        [
          'Paint',
          2,
          3,
          {
            type: 'tracing',
            category: 'Paint',
            cause: { time: 2, stack: stackABC },
          },
        ],
      ]
    );
    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[1],
      profile.shared,
      [
        [
          'Paint',
          2,
          3,
          {
            type: 'tracing',
            category: 'Paint',
            cause: { time: 2, stack: stackABE },
          },
        ],
      ]
    );

    const mergedThread = mergeThreads(profile.threads);
    const mergedMarkers = mergedThread.markers;
    expect(mergedMarkers).toHaveLength(2);

    const markerStacksBeforeMerge = [stackABC, stackABE];

    const markerStacksAfterMerge = mergedMarkers.data.map((markerData) =>
      markerData && 'cause' in markerData && markerData.cause
        ? markerData.cause.stack
        : null
    );

    // The marker stacks in the merged thread should be the same as before merging.
    expect(markerStacksAfterMerge).toEqual(markerStacksBeforeMerge);
  });

  it('merges CompositorScreenshot marker urls properly', function () {
    const { profile, stringTable } = getProfileFromTextSamples(`A`, `B`);
    const thread1 = profile.threads[0];
    const thread2 = profile.threads[1];

    // This screenshot marker will be added to the first thread.
    const screenshotUrl1 = 'Url1';
    const screenshot1UrlIndex = stringTable.indexForString(screenshotUrl1);
    // This screenshot marker will be added to the second thread.
    const screenshotUrl2 = 'Url2';
    const screenshot2UrlIndex = stringTable.indexForString(screenshotUrl2);

    // Let's add the markers now.
    addMarkersToThreadWithCorrespondingSamples(thread1, profile.shared, [
      [
        'CompositorScreenshot',
        1,
        2,
        {
          type: 'CompositorScreenshot',
          url: screenshot1UrlIndex,
          windowID: 'XXX',
          windowWidth: 300,
          windowHeight: 600,
        },
      ],
    ]);

    addMarkersToThreadWithCorrespondingSamples(thread2, profile.shared, [
      [
        'CompositorScreenshot',
        2,
        3,
        {
          type: 'CompositorScreenshot',
          url: screenshot2UrlIndex,
          windowID: 'YYY',
          windowWidth: 300,
          windowHeight: 600,
        },
      ],
    ]);

    const mergedThread = mergeThreads(profile.threads);
    const mergedMarkers = mergedThread.markers;

    // Make sure that we have 2 markers in the merged thread.
    expect(mergedMarkers).toHaveLength(2);

    // Check if we properly merged the string tables and have the correct url fields.
    const markerUrlsAfterMerge = mergedMarkers.data.map((markerData) =>
      markerData && 'url' in markerData && typeof markerData.url === 'number'
        ? markerData.url
        : null
    );
    const url1AfterMerge = stringTable.getString(
      ensureExists(markerUrlsAfterMerge[0])
    );
    const url2AfterMerge = stringTable.getString(
      ensureExists(markerUrlsAfterMerge[1])
    );

    expect(url1AfterMerge).toBe(screenshotUrl1);
    expect(url2AfterMerge).toBe(screenshotUrl2);
  });

  it('merges schema markers with unique-string fields properly', function () {
    const { profile, stringTable } = getProfileFromTextSamples(`A`, `B`);
    profile.meta.markerSchema.push({
      name: 'testSchemaWithUniqueUrlField',
      display: [],
      fields: [{ key: 'fieldWithUniqueString', format: 'unique-string' }],
    });
    const thread1 = profile.threads[0];
    const thread2 = profile.threads[1];

    const uniqueString1 = 'Unique string value in thread 1';
    const uniqueString1Index = stringTable.indexForString(uniqueString1);
    const uniqueString2 = 'A different unique string value in thread 2';
    const uniqueString2Index = stringTable.indexForString(uniqueString2);

    addMarkersToThreadWithCorrespondingSamples(thread1, profile.shared, [
      [
        'Thread1Marker',
        1,
        2,
        {
          type: 'testSchemaWithUniqueUrlField',
          fieldWithUniqueString: uniqueString1Index,
        },
      ],
    ]);

    addMarkersToThreadWithCorrespondingSamples(thread2, profile.shared, [
      [
        'Thread2Marker',
        2,
        3,
        {
          type: 'testSchemaWithUniqueUrlField',
          fieldWithUniqueString: uniqueString2Index,
        },
      ],
    ]);

    const mergedThread = mergeThreads(profile.threads);
    const mergedMarkers = mergedThread.markers;

    // Make sure that we have 2 markers in the merged thread.
    expect(mergedMarkers).toHaveLength(2);

    // Check if we properly merged the string tables and have the correct fields.
    const string1AfterMerge = stringTable.getString(
      (ensureExists(mergedMarkers.data[0]) as any).fieldWithUniqueString
    );
    const string2AfterMerge = stringTable.getString(
      (ensureExists(mergedMarkers.data[1]) as any).fieldWithUniqueString
    );

    expect(string1AfterMerge).toBe(uniqueString1);
    expect(string2AfterMerge).toBe(uniqueString2);
  });
});

describe('mergeProfilesForDiffing with source tables', function () {
  it('should merge source tables from multiple profiles correctly', function () {
    // Create first profile with some sources
    const profileA = getProfileFromTextSamples(`
      A[file:one.js]  A[file:one.js]
      B[file:two.js]  C[file:three.js]
    `);

    // Create second profile with overlapping and unique sources
    const profileB = getProfileFromTextSamples(`
      X[file:two.js]  X[file:two.js]
      Y[file:four.js] Z[file:one.js]
    `);

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [profileA.profile, profileB.profile],
      [profileState, profileState]
    );

    const { sources } = mergedProfile.shared;
    const stringTable = StringTable.withBackingArray(
      mergedProfile.shared.stringArray
    );

    expect(sources.length).toBe(4);
    // Check that all unique sources are present
    const sourceFilenames = sources.filename.map((index) =>
      stringTable.getString(index)
    );

    expect(sourceFilenames).toHaveLength(4);
    expect(sourceFilenames).toEqual(
      expect.arrayContaining(['one.js', 'two.js', 'three.js', 'four.js'])
    );

    // Check that UUIDs are properly handled (should all be null for text samples)
    expect(sources.uuid).toEqual([null, null, null, null]);

    // Verify each filename index points to a valid string
    for (const filenameIndex of sources.filename) {
      expect(filenameIndex).toBeGreaterThanOrEqual(0);
      expect(filenameIndex).toBeLessThan(stringTable.getBackingArray().length);
      const filename = stringTable.getString(filenameIndex);
      expect(filename).toBeString();
      expect(filename.endsWith('.js')).toBe(true);
    }
  });

  it('should handle profiles with different UUID patterns', function () {
    // Create profiles with sources that have different UUIDs
    const profileA = getProfileFromTextSamples(`
      A[file:script.js]
    `);

    const profileB = getProfileFromTextSamples(`
      B[file:script.js]
    `);

    // Manually modify the source tables to have UUIDs
    profileA.profile.shared.sources.uuid[0] = 'uuid-a';
    profileB.profile.shared.sources.uuid[0] = 'uuid-b';

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [profileA.profile, profileB.profile],
      [profileState, profileState]
    );

    const { sources } = mergedProfile.shared;
    const stringTable = StringTable.withBackingArray(
      mergedProfile.shared.stringArray
    );

    // Should have two separate entries for the same filename with different UUIDs
    const sourceFilenames = sources.filename.map((index) =>
      stringTable.getString(index)
    );

    expect(sources.length).toBe(2);
    expect(sourceFilenames.filter((name) => name === 'script.js')).toHaveLength(
      2
    );
    expect(sources.uuid).toHaveLength(2);
    expect(sources.uuid).toEqual(expect.arrayContaining(['uuid-a', 'uuid-b']));

    // Both should point to the same filename string
    const filenameIndexes = sources.filename;
    expect(stringTable.getString(filenameIndexes[0])).toBe('script.js');
    expect(stringTable.getString(filenameIndexes[1])).toBe('script.js');
  });

  it('should correctly update funcTable source references after merging', function () {
    const profileA = getProfileFromTextSamples(`
      A[file:first.js]
      B[file:second.js]
    `);

    const profileB = getProfileFromTextSamples(`
      C[file:second.js]
      D[file:third.js]
    `);

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [profileA.profile, profileB.profile],
      [profileState, profileState]
    );

    // Check that all source references in the funcTable are valid
    for (let i = 0; i < mergedProfile.shared.funcTable.length; i++) {
      const sourceIndex = mergedProfile.shared.funcTable.source[i];
      // Source index should be valid
      expect(sourceIndex).not.toBeNull();
      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      expect(sourceIndex).toBeLessThan(mergedProfile.shared.sources.length);

      // Should reference a valid filename in the string table
      const filenameIndex =
        mergedProfile.shared.sources.filename[ensureExists(sourceIndex)];
      expect(filenameIndex).toBeGreaterThanOrEqual(0);
      expect(filenameIndex).toBeLessThan(
        mergedProfile.shared.stringArray.length
      );
    }
  });

  it('should preserve source information in empty profiles', function () {
    // Create minimal empty profiles manually since getProfileFromTextSamples doesn't handle empty strings
    const emptyProfileA = getProfileFromTextSamples('A').profile;
    const emptyProfileB = getProfileFromTextSamples('B').profile;

    // Clear the threads to make them effectively empty
    emptyProfileA.threads[0].samples.length = 0;
    emptyProfileA.threads[0].samples.stack = [];
    emptyProfileB.threads[0].samples.length = 0;
    emptyProfileB.threads[0].samples.stack = [];

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [emptyProfileA, emptyProfileB],
      [profileState, profileState]
    );

    // Should still have some sources from the profile structure
    expect(mergedProfile.shared.sources.filename).toBeArray();
    expect(mergedProfile.shared.sources.uuid).toBeArray();
    expect(mergedProfile.shared.sources.length).toBeNumber();
    expect(mergedProfile.shared.sources.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle single profile merge correctly', function () {
    const singleProfile = getProfileFromTextSamples(`
      A[file:single.js]
      B[file:single.js]
    `);

    const originalSourcesLength = singleProfile.profile.shared.sources.length;

    const profileState = stateFromLocation({
      pathname: '/public/fakehash1/',
      search: '?thread=0&v=3',
      hash: '',
    });

    const { profile: mergedProfile } = mergeProfilesForDiffing(
      [singleProfile.profile],
      [profileState]
    );

    // Should preserve original source table
    expect(mergedProfile.shared.sources.length).toBe(originalSourcesLength);
    expect(mergedProfile.shared.sources).toEqual(
      singleProfile.profile.shared.sources
    );
  });
});
