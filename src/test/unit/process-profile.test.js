/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  extractFuncsAndResourcesFromFrameLocations,
  processGeckoProfile,
  serializeProfile,
  unserializeProfileOfArbitraryFormat,
} from '../../profile-logic/process-profile';
import { UniqueStringArray } from '../../utils/unique-string-array';
import {
  createGeckoProfile,
  createGeckoCounter,
  createGeckoMarkerStack,
  createGeckoProfilerOverhead,
} from '../fixtures/profiles/gecko-profile';
import { ensureExists } from '../../utils/flow';
import type {
  JsAllocationPayload_Gecko,
  NativeAllocationPayload_Gecko,
  GeckoThread,
} from 'firefox-profiler/types';

describe('extract functions and resource from location strings', function() {
  // These location strings are turned into the proper funcs.
  const locations = [
    // Extract unsymbolicated memory and match them to libraries.
    '0xc0ff33',
    '0xe0ff33',

    // Extract C++ function names and resources
    'cppFunction1 (in c++ resource name1) + 123',
    'cppFunction2 (in c++ resource name2) (234:345)',
    'cppFunction3 (in c++ resource name2)',

    // Extract JS functions URL information
    'jsFunction1 (http://script.com/one.js:456:1)',
    'http://script.com/one.js:456:1',

    // Extension locations
    'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/background.js:1:0',
    'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/content.js:1:0',
    'backgroundFunction (moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/background.js:2:1)',
    'contentfunction (moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/content.js:2:1)',

    // Something unknown
    'mysterious location',
  ];
  const libs = [
    // This library will match the '0xc0ff33' location.
    {
      start: 0xc00000,
      end: 0xd00000,
      offset: 0,
      arch: '',
      name: 'No symbols library',
      path: '',
      debugName: '',
      debugPath: '',
      breakpadId: '',
    },
    // This library will match the '0xe0ff33' location, and it has an offset.
    {
      start: 0xe01000,
      end: 0xf00000,
      offset: 0x1000,
      arch: '',
      name: 'No symbols library',
      path: '',
      debugName: '',
      debugPath: '',
      breakpadId: '',
    },
  ];
  const stringTable = new UniqueStringArray();
  const locationIndexes = locations.map(location =>
    stringTable.indexForString(location)
  );
  const extensions = {
    baseURL: [
      'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
      'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
    ],
    id: ['geckoprofiler@mozilla.com', 'screenshots@mozilla.org'],
    name: ['Gecko Profiler', 'Firefox Screenshots'],
    length: 2,
  };

  it('extracts the information for all different types of locations', function() {
    const [
      funcTable,
      resourceTable,
      frameFuncs,
    ] = extractFuncsAndResourcesFromFrameLocations(
      locationIndexes,
      locationIndexes.map(() => false),
      stringTable,
      libs,
      extensions
    );

    expect(
      frameFuncs.map((funcIndex, locationIndex) => {
        // Map all the results into a human readable object for easy snapshotting.
        const locationName = locations[locationIndex];

        const funcName = stringTable.getString(funcTable.name[funcIndex]);
        const resourceIndex = funcTable.resource[funcIndex];
        const address = funcTable.address[funcIndex];
        const isJS = funcTable.isJS[funcIndex];
        const fileNameIndex = funcTable.fileName[funcIndex];
        const fileName =
          fileNameIndex === null ? null : stringTable.getString(fileNameIndex);
        const lineNumber = funcTable.lineNumber[funcIndex];
        const columnNumber = funcTable.columnNumber[funcIndex];

        let libIndex, resourceName, host, resourceType;
        if (resourceIndex === -1) {
          resourceName = null;
          host = null;
          resourceType = null;
        } else {
          const hostStringIndex = resourceTable.host[resourceIndex];
          libIndex = resourceTable.lib[resourceIndex];
          resourceName = stringTable.getString(
            resourceTable.name[resourceIndex]
          );
          host =
            hostStringIndex === undefined || hostStringIndex === null
              ? null
              : stringTable.getString(hostStringIndex);
          resourceType = resourceTable.type[resourceIndex];
        }
        const lib =
          libIndex === undefined || libIndex === null || libIndex === -1
            ? undefined
            : libs[libIndex];

        return [
          locationName,
          {
            funcName,
            isJS,
            resourceIndex,
            address,
            fileName,
            lineNumber,
            columnNumber,
            libIndex,
            resourceName,
            host,
            resourceType,
            lib,
          },
        ];
      })
    ).toMatchSnapshot();
  });
});

describe('gecko counters processing', function() {
  function setup() {
    // Create a gecko profile with counters.
    const findMainThread = profile =>
      ensureExists(
        profile.threads.find(thread => thread.name === 'GeckoMain'),
        'There should be a GeckoMain thread in the Gecko profile'
      );

    const parentGeckoProfile = createGeckoProfile();
    const [childGeckoProfile] = parentGeckoProfile.processes;

    const parentPid = findMainThread(parentGeckoProfile).pid;
    const childPid = findMainThread(childGeckoProfile).pid;
    expect(parentPid).toEqual(3333);
    expect(childPid).toEqual(2222);

    const parentCounter = createGeckoCounter(
      findMainThread(parentGeckoProfile)
    );
    const childCounter = createGeckoCounter(findMainThread(childGeckoProfile));

    // It's possible that no sample has been collected during our capture
    // session, ignore this counter if that's the case.
    const emptyCounterEntry = {
      name: 'Empty counter',
      category: 'Some category',
      description: 'Some description',
      sample_groups: [],
    };

    parentGeckoProfile.counters = [parentCounter, emptyCounterEntry];
    childGeckoProfile.counters = [childCounter];
    return {
      parentGeckoProfile,
      parentPid,
      childPid,
      parentCounter,
      childCounter,
    };
  }

  it('can extract the counter information correctly', function() {
    const { parentGeckoProfile, parentPid, childPid } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const counters = ensureExists(
      processedProfile.counters,
      'Expected to find counters on the processed profile'
    );
    expect(counters.length).toBe(2);
    expect(counters[0].pid).toBe(parentPid);
    expect(counters[1].pid).toBe(childPid);

    const findMainThreadIndexByPid = (pid: number): number =>
      processedProfile.threads.findIndex(
        thread => thread.name === 'GeckoMain' && thread.pid === pid
      );

    expect(counters[0].mainThreadIndex).toBe(
      findMainThreadIndexByPid(parentPid)
    );
    expect(counters[1].mainThreadIndex).toBe(
      findMainThreadIndexByPid(childPid)
    );
  });

  it('offsets the counter timing for child processes', function() {
    const { parentGeckoProfile, parentCounter, childCounter } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const processedCounters = ensureExists(processedProfile.counters);

    const originalTime = [0, 1, 2, 3, 4, 5, 6];
    const offsetTime = originalTime.map(n => n + 1000);

    const extractTime = counter => {
      if (counter.sample_groups.length === 0) {
        return [];
      }
      return counter.sample_groups[0].samples.data.map(tuple => tuple[0]);
    };

    // The original times and parent process are not offset.
    expect(extractTime(parentCounter)).toEqual(originalTime);
    expect(extractTime(childCounter)).toEqual(originalTime);
    expect(processedCounters[0].sampleGroups[0].samples.time).toEqual(
      originalTime
    );

    // The subprocess times are offset when processed:
    expect(processedCounters[1].sampleGroups[0].samples.time).toEqual(
      offsetTime
    );
  });
});

describe('gecko profilerOverhead processing', function() {
  function setup() {
    // Create a gecko profile with profilerOverhead.
    const findMainThread = profile =>
      ensureExists(
        profile.threads.find(thread => thread.name === 'GeckoMain'),
        'There should be a GeckoMain thread in the Gecko profile'
      );

    const parentGeckoProfile = createGeckoProfile();
    const [childGeckoProfile] = parentGeckoProfile.processes;

    const parentPid = findMainThread(parentGeckoProfile).pid;
    const childPid = findMainThread(childGeckoProfile).pid;
    expect(parentPid).toEqual(3333);
    expect(childPid).toEqual(2222);

    const parentOverhead = createGeckoProfilerOverhead(
      findMainThread(parentGeckoProfile)
    );
    const childOverhead = createGeckoProfilerOverhead(
      findMainThread(childGeckoProfile)
    );
    parentGeckoProfile.profilerOverhead = parentOverhead;
    childGeckoProfile.profilerOverhead = childOverhead;
    return {
      parentGeckoProfile,
      parentPid,
      childPid,
      parentOverhead,
      childOverhead,
    };
  }

  it('can extract the overhead information correctly', function() {
    const { parentGeckoProfile, parentPid, childPid } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const overhead = ensureExists(
      processedProfile.profilerOverhead,
      'Expected to find profilerOverhead on the processed profile'
    );
    expect(overhead.length).toBe(2);
    expect(overhead[0].pid).toBe(parentPid);
    expect(overhead[1].pid).toBe(childPid);

    const findMainThreadIndexByPid = (pid: number): number =>
      processedProfile.threads.findIndex(
        thread => thread.name === 'GeckoMain' && thread.pid === pid
      );

    expect(overhead[0].mainThreadIndex).toBe(
      findMainThreadIndexByPid(parentPid)
    );
    expect(overhead[1].mainThreadIndex).toBe(
      findMainThreadIndexByPid(childPid)
    );
  });

  it('offsets the overhead timing for child processes', function() {
    const { parentGeckoProfile, parentOverhead, childOverhead } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const processedOverheads = ensureExists(processedProfile.profilerOverhead);

    const originalTime = [0, 1000, 2000, 3000, 4000, 5000, 6000];
    const processedTime = originalTime.map(n => n / 1000);
    const offsetTime = processedTime.map(n => n + 1000);

    const extractTime = overhead =>
      overhead.samples.data.map(tuple => tuple[0]);

    // The original times are not offset and in microseconds.
    expect(extractTime(parentOverhead)).toEqual(originalTime);
    expect(extractTime(childOverhead)).toEqual(originalTime);

    // The parent process times are not offset and in milliseconds.
    expect(processedOverheads[0].samples.time).toEqual(processedTime);

    // The subprocess times are offset and in milliseconds when processed
    expect(processedOverheads[1].samples.time).toEqual(offsetTime);
  });
});

describe('serializeProfile', function() {
  it('should produce a parsable profile string', async function() {
    const profile = processGeckoProfile(createGeckoProfile());
    const serialized = serializeProfile(profile);
    expect(JSON.parse.bind(null, serialized)).not.toThrow();
  });

  it('should produce the same profile in a roundtrip', async function() {
    const profile = processGeckoProfile(createGeckoProfile());
    const serialized = serializeProfile(profile);
    const roundtrip = await unserializeProfileOfArbitraryFormat(serialized);
    // FIXME: Uncomment this line after resolving `undefined` serialization issue
    // See: https://github.com/firefox-devtools/profiler/issues/1599
    // expect(profile).toEqual(roundtrip);

    const secondSerialized = serializeProfile(roundtrip);
    const secondRountrip = await unserializeProfileOfArbitraryFormat(
      secondSerialized
    );
    expect(roundtrip).toEqual(secondRountrip);
  });
});

describe('js allocation processing', function() {
  function getAllocationMarkerHelper(geckoThread: GeckoThread) {
    let time = 0;
    return ({ byteSize, stackIndex }) => {
      const thisTime = time++;
      // Opt out of type checking, due to the schema look-up not being type checkable.
      const markerTuple: any = [];
      const payload: JsAllocationPayload_Gecko = {
        type: 'JS allocation',
        className: 'Function',
        typeName: 'JSObject',
        coarseType: 'Object',
        size: byteSize,
        inNursery: true,
        stack: createGeckoMarkerStack({ stackIndex, time: thisTime }),
      };

      markerTuple[geckoThread.markers.schema.name] = 'JS allocation';
      markerTuple[geckoThread.markers.schema.startTime] = thisTime;
      markerTuple[geckoThread.markers.schema.endTime] = null;
      markerTuple[geckoThread.markers.schema.phase] = 0;
      markerTuple[geckoThread.markers.schema.data] = payload;
      markerTuple[geckoThread.markers.schema.category] = 0;

      geckoThread.markers.data.push(markerTuple);
    };
  }

  it('should process JS allocation markers into a JS allocation table', function() {
    const geckoProfile = createGeckoProfile();
    const geckoThread = geckoProfile.threads[0];
    const createAllocation = getAllocationMarkerHelper(geckoThread);

    // Verify the test found the parent process' main thread.
    expect(geckoThread.name).toBe('GeckoMain');
    expect(geckoThread.processType).toBe('default');

    // Create 3 allocations, and note the marker lengths.
    const originalMarkersLength = geckoThread.markers.data.length;
    createAllocation({ byteSize: 3, stackIndex: 11 });
    createAllocation({ byteSize: 5, stackIndex: 13 });
    createAllocation({ byteSize: 7, stackIndex: null });
    const markersAndAllocationsLength = geckoThread.markers.data.length;

    // Do a simple assertion to verify that the allocations were added by the test
    // fixture as expected.
    expect(markersAndAllocationsLength).toEqual(originalMarkersLength + 3);

    // Process the profile and get out the new thread.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedThread = processedProfile.threads[0];

    // Check for the existence of the allocations.
    const { jsAllocations } = processedThread;
    if (!jsAllocations) {
      throw new Error('Could not find the jsAllocations on the main thread.');
    }

    // Assert that the transformation makes sense.
    expect(jsAllocations.time).toEqual([0, 1, 2]);
    expect(jsAllocations.weight).toEqual([3, 5, 7]);
    expect(jsAllocations.stack).toEqual([11, 13, null]);
  });
});

describe('native allocation processing', function() {
  type CreateAllocation = ({
    byteSize: number,
    stackIndex: number | null,
  }) => void;

  // This helper will create a function that can be used to easily add allocations to
  // the GeckoThread.
  function getAllocationMarkerHelper(
    geckoThread: GeckoThread
  ): CreateAllocation {
    let time = 0;
    return ({ byteSize, stackIndex }) => {
      const thisTime = time++;
      // Opt out of type checking, due to the schema look-up not being type checkable.
      const markerTuple: any = [];
      const payload: NativeAllocationPayload_Gecko = {
        type: 'Native allocation',
        size: byteSize,
        stack: createGeckoMarkerStack({ stackIndex, time: thisTime }),
      };

      markerTuple[geckoThread.markers.schema.name] = 'Native allocation';
      markerTuple[geckoThread.markers.schema.startTime] = thisTime;
      markerTuple[geckoThread.markers.schema.endTime] = null;
      markerTuple[geckoThread.markers.schema.phase] = 0;
      markerTuple[geckoThread.markers.schema.data] = payload;
      markerTuple[geckoThread.markers.schema.category] = 0;

      geckoThread.markers.data.push(markerTuple);
    };
  }

  it('should process native allocation markers into a native allocation table', function() {
    const geckoProfile = createGeckoProfile();
    const geckoThread = geckoProfile.threads[0];
    const createAllocation = getAllocationMarkerHelper(geckoThread);

    // Verify the test found the parent process' main thread.
    expect(geckoThread.name).toBe('GeckoMain');
    expect(geckoThread.processType).toBe('default');

    // Create 3 allocations, and note the marker lengths.
    const originalMarkersLength = geckoThread.markers.data.length;
    createAllocation({ byteSize: 3, stackIndex: 11 });
    createAllocation({ byteSize: 5, stackIndex: 13 });
    createAllocation({ byteSize: 7, stackIndex: null });
    const markersAndAllocationsLength = geckoThread.markers.data.length;

    // Do a simple assertion to verify that the allocations were added by the test
    // fixture as expected.
    expect(markersAndAllocationsLength).toEqual(originalMarkersLength + 3);

    // Process the profile and get out the new thread.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedThread = processedProfile.threads[0];

    // Check for the existence of the allocations.
    const { nativeAllocations } = processedThread;
    if (!nativeAllocations) {
      throw new Error(
        'Could not find the nativeAllocations on the main thread.'
      );
    }

    // Assert that the transformation makes sense.
    expect(nativeAllocations.time).toEqual([0, 1, 2]);
    expect(nativeAllocations.weight).toEqual([3, 5, 7]);
    expect(nativeAllocations.stack).toEqual([11, 13, null]);
  });
});
