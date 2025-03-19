/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  extractFuncsAndResourcesFromFrameLocations,
  processGeckoProfile,
  serializeProfile,
  unserializeProfileOfArbitraryFormat,
  GlobalDataCollector,
} from '../../profile-logic/process-profile';
import { computeTimeColumnForRawSamplesTable } from '../../profile-logic/profile-data';
import { StringTable } from '../../utils/string-table';
import {
  createGeckoProfile,
  createGeckoCounter,
  createGeckoMarkerStack,
  createGeckoProfilerOverhead,
  getVisualMetrics,
} from '../fixtures/profiles/gecko-profile';
import { ensureExists } from '../../utils/flow';
import type {
  JsAllocationPayload_Gecko,
  NativeAllocationPayload_Gecko,
  GeckoProfile,
  GeckoThread,
  GeckoCounter,
  GeckoProfilerOverhead,
  IndexIntoGeckoStackTable,
  Milliseconds,
  RawProfileSharedData,
  RawThread,
  Pid,
} from 'firefox-profiler/types';

describe('extract functions and resource from location strings', function () {
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
  const geckoThreadStringArray = [];
  const geckoThreadStringTable = StringTable.withBackingArray(
    geckoThreadStringArray
  );
  const locationIndexes = locations.map((location) =>
    geckoThreadStringTable.indexForString(location)
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
  const globalDataCollector = new GlobalDataCollector();

  it('extracts the information for all different types of locations', function () {
    const { funcTable, resourceTable, frameFuncs } =
      extractFuncsAndResourcesFromFrameLocations(
        locationIndexes,
        locationIndexes.map(() => false),
        geckoThreadStringArray,
        libs,
        extensions,
        globalDataCollector
      );

    const stringTable = globalDataCollector.getStringTable();

    expect(
      frameFuncs.map((funcIndex, locationIndex) => {
        // Map all the results into a human readable object for easy snapshotting.
        const locationName = locations[locationIndex];

        const funcName = stringTable.getString(funcTable.name[funcIndex]);
        const resourceIndex = funcTable.resource[funcIndex];
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

describe('gecko counters processing', function () {
  function setup(): {|
    parentGeckoProfile: GeckoProfile,
    parentPid: Pid,
    childPid: Pid,
    parentCounter: GeckoCounter,
    childCounter: GeckoCounter,
  |} {
    // Create a gecko profile with counters.
    const findMainThread = (profile): GeckoThread =>
      ensureExists(
        profile.threads.find((thread) => thread.name === 'GeckoMain'),
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
      samples: {
        schema: {
          time: 0,
          count: 1,
          number: 2,
        },
        data: [],
      },
    };

    parentGeckoProfile.counters = [parentCounter, emptyCounterEntry];
    childGeckoProfile.counters = [childCounter];
    return {
      parentGeckoProfile,
      parentPid: `${parentPid}`,
      childPid: `${childPid}`,
      parentCounter,
      childCounter,
    };
  }

  it('can extract the counter information correctly', function () {
    const { parentGeckoProfile, parentPid, childPid } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const counters = ensureExists(
      processedProfile.counters,
      'Expected to find counters on the processed profile'
    );
    expect(counters.length).toBe(2);
    expect(counters[0].pid).toBe(parentPid);
    expect(counters[1].pid).toBe(childPid);

    const findMainThreadIndexByPid = (pid: Pid): number =>
      processedProfile.threads.findIndex(
        (thread) => thread.name === 'GeckoMain' && thread.pid === pid
      );

    expect(counters[0].mainThreadIndex).toBe(
      findMainThreadIndexByPid(parentPid)
    );
    expect(counters[1].mainThreadIndex).toBe(
      findMainThreadIndexByPid(childPid)
    );
  });

  it('offsets the counter timing for child processes', function () {
    const { parentGeckoProfile, parentCounter, childCounter } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const processedCounters = ensureExists(processedProfile.counters);

    const originalTime = [0, 1, 2, 3, 4, 5, 6];
    const offsetTime = originalTime.map((n) => n + 1000);

    const extractTime = (counter) => {
      if (counter.samples.data.length === 0) {
        return [];
      }
      return counter.samples.data.map((tuple) => tuple[0]);
    };

    // The original times and parent process are not offset.
    expect(extractTime(parentCounter)).toEqual(originalTime);
    expect(extractTime(childCounter)).toEqual(originalTime);

    expect(
      computeTimeColumnForRawSamplesTable(processedCounters[0].samples)
    ).toEqual(originalTime);

    // The subprocess times are offset when processed:
    expect(
      computeTimeColumnForRawSamplesTable(processedCounters[1].samples)
    ).toEqual(offsetTime);
  });
});

describe('gecko profilerOverhead processing', function () {
  function setup(): {|
    parentGeckoProfile: GeckoProfile,
    parentPid: Pid,
    childPid: Pid,
    parentOverhead: GeckoProfilerOverhead,
    childOverhead: GeckoProfilerOverhead,
  |} {
    // Create a gecko profile with profilerOverhead.
    const findMainThread = (profile) =>
      ensureExists(
        profile.threads.find((thread) => thread.name === 'GeckoMain'),
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
      parentPid: `${parentPid}`,
      childPid: `${childPid}`,
      parentOverhead,
      childOverhead,
    };
  }

  it('can extract the overhead information correctly', function () {
    const { parentGeckoProfile, parentPid, childPid } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const overhead = ensureExists(
      processedProfile.profilerOverhead,
      'Expected to find profilerOverhead on the processed profile'
    );
    expect(overhead.length).toBe(2);
    expect(overhead[0].pid).toBe(parentPid);
    expect(overhead[1].pid).toBe(childPid);

    const findMainThreadIndexByPid = (pid: Pid): number =>
      processedProfile.threads.findIndex(
        (thread) => thread.name === 'GeckoMain' && thread.pid === pid
      );

    expect(overhead[0].mainThreadIndex).toBe(
      findMainThreadIndexByPid(parentPid)
    );
    expect(overhead[1].mainThreadIndex).toBe(
      findMainThreadIndexByPid(childPid)
    );
  });

  it('offsets the overhead timing for child processes', function () {
    const { parentGeckoProfile, parentOverhead, childOverhead } = setup();
    const processedProfile = processGeckoProfile(parentGeckoProfile);
    const processedOverheads = ensureExists(processedProfile.profilerOverhead);

    const originalTime = [0, 1000, 2000, 3000, 4000, 5000, 6000];
    const processedTime = originalTime.map((n) => n / 1000);
    const offsetTime = processedTime.map((n) => n + 1000);

    const extractTime = (overhead) =>
      overhead.samples.data.map((tuple) => tuple[0]);

    // The original times are not offset and in microseconds.
    expect(extractTime(parentOverhead)).toEqual(originalTime);
    expect(extractTime(childOverhead)).toEqual(originalTime);

    // The parent process times are not offset and in milliseconds.
    expect(processedOverheads[0].samples.time).toEqual(processedTime);

    // The subprocess times are offset and in milliseconds when processed
    expect(processedOverheads[1].samples.time).toEqual(offsetTime);
  });
});

describe('serializeProfile', function () {
  it('should produce a parsable profile string', async function () {
    const profile = processGeckoProfile(createGeckoProfile());
    const serialized = serializeProfile(profile);
    expect(JSON.parse.bind(null, serialized)).not.toThrow();
  });

  it('should produce the same profile in a roundtrip', async function () {
    const profile = processGeckoProfile(createGeckoProfile());
    const serialized = serializeProfile(profile);
    const roundtrip = await unserializeProfileOfArbitraryFormat(serialized);
    // FIXME: Uncomment this line after resolving `undefined` serialization issue
    // See: https://github.com/firefox-devtools/profiler/issues/1599
    // expect(profile).toEqual(roundtrip);

    const secondSerialized = serializeProfile(roundtrip);
    const secondRountrip =
      await unserializeProfileOfArbitraryFormat(secondSerialized);
    expect(roundtrip).toEqual(secondRountrip);
  });
});

describe('js allocation processing', function () {
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
  function getFrameAddressesForStack(thread, stackIndex) {
    const addresses = [];
    let stack = stackIndex;
    while (stack !== null) {
      addresses.push(thread.frameTable.address[thread.stackTable.frame[stack]]);
      stack = thread.stackTable.prefix[stack];
    }
    addresses.reverse();
    return addresses;
  }

  it('should process JS allocation markers into a JS allocation table', function () {
    const geckoProfile = createGeckoProfile();
    const geckoThread = geckoProfile.threads[0];
    const createAllocation = getAllocationMarkerHelper(geckoThread);

    // Verify the test found the parent process' main thread.
    expect(geckoThread.name).toBe('GeckoMain');
    expect(geckoThread.processType).toBe('default');

    // Create 3 allocations, and note the marker lengths.
    const originalMarkersLength = geckoThread.markers.data.length;
    // Note: the stack indexes used here must exist in the thread's stackTable.
    createAllocation({ byteSize: 3, stackIndex: 5 });
    createAllocation({ byteSize: 5, stackIndex: 6 });
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

    // All addressses should be nudged by 1 byte, because js allocation stack frames
    // all come from stack walking (the instruction pointer frame is removed by gecko).
    expect(
      getFrameAddressesForStack(processedThread, jsAllocations.stack[0])
    ).toEqual([-1, 0xf83, 0x1a44, 0x1bcc]);
    expect(
      getFrameAddressesForStack(processedThread, jsAllocations.stack[1])
    ).toEqual([-1, 0xf83, 0x1a44, 0x1bcd]);
    expect(
      getFrameAddressesForStack(processedThread, jsAllocations.stack[2])
    ).toEqual([]);
  });
});

describe('native allocation processing', function () {
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

  it('should process native allocation markers into a native allocation table', function () {
    const geckoProfile = createGeckoProfile();
    const geckoThread = geckoProfile.threads[0];
    const createAllocation = getAllocationMarkerHelper(geckoThread);

    // Verify the test found the parent process' main thread.
    expect(geckoThread.name).toBe('GeckoMain');
    expect(geckoThread.processType).toBe('default');

    // Create 3 allocations, and note the marker lengths.
    const originalMarkersLength = geckoThread.markers.data.length;
    // Note: the stack indexes used below must exist in the stackTable.
    createAllocation({ byteSize: 3, stackIndex: 5 });
    createAllocation({ byteSize: 5, stackIndex: 6 });
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
    expect(nativeAllocations.stack).toEqual([8, 9, null]);
  });
});

describe('gecko samples table processing', function () {
  it('properly converts all the fields in the schema', function () {
    const geckoProfile = createGeckoProfile();
    const geckoSamples = geckoProfile.threads[0].samples;

    // Check if the gecko sample schema is correct.
    expect(geckoSamples.schema).toEqual({
      stack: 0,
      time: 1,
      eventDelay: 2,
      threadCPUDelta: 3,
    });

    // Add some values to the samples table so we can have hardcoded tests.
    const hardcodedTime: Milliseconds[] = [1, 2];
    const hardcodedStack: Array<null | IndexIntoGeckoStackTable> = [6, 5];
    const hardcodedStackAfterProcessing: Array<null | IndexIntoGeckoStackTable> =
      [9, 8];
    const hardcodedEventDelay: Milliseconds[] = [0, 1];
    const hardcodedThreadCPUDelta: Array<number | null> = [0.1, 0.2];
    const hardcodedSamplesTable = [
      [
        hardcodedStack[0],
        hardcodedTime[0],
        hardcodedEventDelay[0],
        hardcodedThreadCPUDelta[0],
      ],
      [
        hardcodedStack[1],
        hardcodedTime[1],
        hardcodedEventDelay[1],
        hardcodedThreadCPUDelta[1],
      ],
    ];

    geckoSamples.data = [...hardcodedSamplesTable, ...geckoSamples.data];

    // Process the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedSamples = processedProfile.threads[0].samples;

    // Check the processed samples length.
    expect(processedSamples.length).toBe(geckoSamples.data.length);

    // Let's check the hardcoded values here.
    expect(processedSamples.stack.slice(0, 2)).toEqual(
      hardcodedStackAfterProcessing
    );
    const sampleTimes = computeTimeColumnForRawSamplesTable(processedSamples);
    expect(sampleTimes.slice(0, 2)).toEqual(hardcodedTime);
    expect(ensureExists(processedSamples.eventDelay).slice(0, 2)).toEqual(
      hardcodedEventDelay
    );
    expect(ensureExists(processedSamples.threadCPUDelta).slice(0, 2)).toEqual(
      hardcodedThreadCPUDelta
    );

    // Check the processed profile samples array to see if we properly processed
    // the sample fields.
    for (const fieldName in geckoSamples.schema) {
      if (fieldName === 'stack' || fieldName === 'time') {
        // Don't check the stack here because profile processing changes the shape
        // of the stack table and converts times to deltas, so the value is
        // expected to change.
        continue;
      }
      const fieldIndex = geckoSamples.schema[fieldName];

      for (let i = 0; i < processedSamples.length; i++) {
        expect(processedSamples[fieldName][i]).toBe(
          geckoSamples.data[i][fieldIndex]
        );
      }
    }
  });
});

describe('threadCPUDelta processing', function () {
  it('removes threadCPUDelta data when the array is filled with null values', () => {
    const geckoProfile = createGeckoProfile();
    const geckoSamples = geckoProfile.threads[0].samples;
    const geckoSchema = geckoSamples.schema;
    if (!geckoSchema.threadCPUDelta) {
      throw new Error(
        'This test works with threads that can contain threadCPUDelta data.'
      );
    }

    // Fill the threadCPUDelta with null values.
    for (const item of geckoSamples.data) {
      // $FlowExpectError because Flow thinks this access can be out of bounds, but it is not.
      item[geckoSchema.threadCPUDelta] = null;
    }

    // Process the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedSamples = processedProfile.threads[0].samples;

    // Check that the threadCPUdelta array has been removed.
    expect(processedSamples.threadCPUDelta).not.toBeDefined();
  });

  it('keeps threadCPUDelta data when the array contains at least one non-null value', () => {
    const geckoProfile = createGeckoProfile();
    const geckoSamples = geckoProfile.threads[0].samples;
    const geckoSchema = geckoSamples.schema;
    if (!geckoSchema.threadCPUDelta) {
      throw new Error(
        'This test works with threads that can contain threadCPUDelta data.'
      );
    }

    // Fill the threadCPUDelta with null values except the first.
    for (const item of geckoSamples.data) {
      // $FlowExpectError because Flow thinks this access can be out of bounds, but it is not.
      item[geckoSchema.threadCPUDelta] = null;
    }
    // $FlowExpectError same reason as above
    geckoSamples.data[0][geckoSchema.threadCPUDelta] = 2;

    // Process the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedSamples = processedProfile.threads[0].samples;

    // Check that the threadCPUdelta array has been removed.
    expect(processedSamples.threadCPUDelta).toBeDefined();
  });
});

describe('profile meta processing', function () {
  it('keeps the sampleUnits object successfully', function () {
    const geckoProfile = createGeckoProfile();
    const geckoMeta = geckoProfile.meta;

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedMeta = processedProfile.meta;

    // Checking if it keeps the sampleUnits object.
    expect(processedMeta.sampleUnits).toEqual(geckoMeta.sampleUnits);
  });

  it('keeps the profilingStartTime and profilingEndTime', function () {
    const geckoProfile = createGeckoProfile();
    const geckoMeta = geckoProfile.meta;

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedMeta = processedProfile.meta;

    expect(processedMeta.profilingStartTime).toEqual(
      geckoMeta.profilingStartTime
    );
    expect(processedMeta.profilingEndTime).toEqual(geckoMeta.profilingEndTime);
  });

  it('does not create the profilingStartTime and profilingEndTime fields', function () {
    const geckoProfile = createGeckoProfile();
    const geckoMeta = geckoProfile.meta;
    delete geckoMeta.profilingStartTime;
    delete geckoMeta.profilingEndTime;

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const processedMeta = processedProfile.meta;

    expect(processedMeta.profilingStartTime).toEqual(undefined);
    expect(processedMeta.profilingEndTime).toEqual(undefined);
  });
});

describe('visualMetrics processing', function () {
  function checkVisualMetricsForThread(
    thread: RawThread,
    shared: RawProfileSharedData,
    metrics: Array<{|
      name: string,
      hasProgressMarker: boolean,
      changeMarkerLength: number,
    |}>
  ) {
    for (const { name, hasProgressMarker, changeMarkerLength } of metrics) {
      // Check the visual metric progress markers.
      const metricProgressMarkerName = `${name} Progress`;
      const metricProgressMarker = thread.markers.name.find(
        (name) => shared.stringArray[name] === metricProgressMarkerName
      );

      if (hasProgressMarker) {
        expect(metricProgressMarker).toBeTruthy();
      } else {
        expect(metricProgressMarker).toBeFalsy();
      }

      // Check the visual metric change markers.
      const metricChangeMarkerName = `${name} Change`;
      const metricChangeMarkers = thread.markers.name.filter(
        (name) => shared.stringArray[name] === metricChangeMarkerName
      );
      expect(metricChangeMarkers).toHaveLength(changeMarkerLength);
    }
  }

  it('adds markers to the parent process', function () {
    const geckoProfile = createGeckoProfile();
    const visualMetrics = getVisualMetrics();
    geckoProfile.meta.visualMetrics = visualMetrics;
    // Make sure that the visual metrics are not changed.
    expect(visualMetrics.VisualProgress).toHaveLength(7);
    expect(visualMetrics.ContentfulSpeedIndexProgress).toHaveLength(6);
    expect(visualMetrics.PerceptualSpeedIndexProgress).toHaveLength(6);

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const parentProcessMainThread = processedProfile.threads.find(
      (thread) =>
        thread.name === 'GeckoMain' && thread.processType === 'default'
    );

    if (!parentProcessMainThread) {
      throw new Error('Could not find the parent process main thread.');
    }

    checkVisualMetricsForThread(
      parentProcessMainThread,
      processedProfile.shared,
      [
        { name: 'Visual', hasProgressMarker: true, changeMarkerLength: 7 },
        {
          name: 'ContentfulSpeedIndex',
          hasProgressMarker: true,
          changeMarkerLength: 6,
        },
        {
          name: 'PerceptualSpeedIndex',
          hasProgressMarker: true,
          changeMarkerLength: 6,
        },
      ]
    );
  });

  it('adds markers to the tab process', function () {
    const geckoProfile = createGeckoProfile();
    const visualMetrics = getVisualMetrics();
    geckoProfile.meta.visualMetrics = visualMetrics;
    // Make sure that the visual metrics are not changed.
    expect(visualMetrics.VisualProgress).toHaveLength(7);
    expect(visualMetrics.ContentfulSpeedIndexProgress).toHaveLength(6);
    expect(visualMetrics.PerceptualSpeedIndexProgress).toHaveLength(6);

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const tabProcessMainThread = processedProfile.threads.find(
      (thread) => thread.name === 'GeckoMain' && thread.processType === 'tab'
    );

    if (!tabProcessMainThread) {
      throw new Error('Could not find the tab process main thread.');
    }

    checkVisualMetricsForThread(tabProcessMainThread, processedProfile.shared, [
      { name: 'Visual', hasProgressMarker: true, changeMarkerLength: 7 },
      {
        name: 'ContentfulSpeedIndex',
        hasProgressMarker: true,
        changeMarkerLength: 6,
      },
      {
        name: 'PerceptualSpeedIndex',
        hasProgressMarker: true,
        changeMarkerLength: 6,
      },
    ]);
  });

  it('does not add markers to the parent process if metric timestamps are null', function () {
    const geckoProfile = createGeckoProfile();
    const visualMetrics = getVisualMetrics();

    // Make all the VisualProgress timestamps null on purpose.
    visualMetrics.VisualProgress = visualMetrics.VisualProgress.map(
      (progress) => ({ ...progress, timestamp: null })
    );
    // Make only one ContentfulSpeedIndexProgress timestamp null on purpose.
    ensureExists(visualMetrics.ContentfulSpeedIndexProgress)[0].timestamp =
      null;

    // Add the visual metrics to the profile.
    geckoProfile.meta.visualMetrics = visualMetrics;
    // Make sure that the visual metrics are not changed.
    expect(visualMetrics.VisualProgress).toHaveLength(7);
    expect(visualMetrics.ContentfulSpeedIndexProgress).toHaveLength(6);
    expect(visualMetrics.PerceptualSpeedIndexProgress).toHaveLength(6);

    // Processing the profile.
    const processedProfile = processGeckoProfile(geckoProfile);
    const parentProcessMainThread = processedProfile.threads.find(
      (thread) =>
        thread.name === 'GeckoMain' && thread.processType === 'default'
    );

    if (!parentProcessMainThread) {
      throw new Error('Could not find the parent process main thread.');
    }

    checkVisualMetricsForThread(
      parentProcessMainThread,
      processedProfile.shared,
      [
        // Instead of 7, we should have 0 markers for Visual because we made all
        // the timestamps null.
        { name: 'Visual', hasProgressMarker: false, changeMarkerLength: 0 },
        // Instead of 6, we should have 5 markers for ContentfulSpeedIndex.
        {
          name: 'ContentfulSpeedIndex',
          hasProgressMarker: true,
          changeMarkerLength: 5,
        },
        // We didn't change the PerceptualSpeedIndexProgress, so we should have 6.
        {
          name: 'PerceptualSpeedIndex',
          hasProgressMarker: true,
          changeMarkerLength: 6,
        },
      ]
    );
  });
});
