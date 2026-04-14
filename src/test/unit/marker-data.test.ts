/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  getThreadSelectors,
  selectedThreadSelectors,
} from 'firefox-profiler/selectors';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';
import { processGeckoProfile } from '../../profile-logic/process-profile';
import {
  filterRawMarkerTableToRange,
  filterRawMarkerTableToRangeWithMarkersToDelete,
} from '../../profile-logic/marker-data';

import {
  createGeckoProfile,
  createGeckoProfileWithMarkers,
  type TestDefinedGeckoMarker,
} from '../fixtures/profiles/gecko-profile';
import {
  getTestFriendlyDerivedMarkerInfo,
  type TestDefinedRawMarker,
  getThreadWithRawMarkers,
  makeIntervalMarker,
  makeInstantMarker,
  makeCompositorScreenshot,
  makeStartMarker,
  makeEndMarker,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { getEmptySharedData } from '../../profile-logic/data-structures';

import type {
  IndexIntoRawMarkerTable,
  Milliseconds,
  NetworkPayload,
  ScreenshotPayload,
} from 'firefox-profiler/types';

describe('Derive markers from Gecko phase markers', function () {
  function setupWithTestDefinedMarkers(markers: TestDefinedGeckoMarker[]) {
    const profile = processGeckoProfile(createGeckoProfileWithMarkers(markers));
    profile.meta.symbolicated = true; // Avoid symbolication.
    const { getState } = storeWithProfile(profile);
    const mainGetMarker = selectedThreadSelectors.getMarkerGetter(getState());

    return {
      profile,
      getState,
      markers: selectedThreadSelectors
        .getFullMarkerListIndexes(getState())
        .map(mainGetMarker),
    };
  }

  it('creates an instant marker', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        startTime: 5,
        endTime: null,
        phase: INSTANT,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        end: null,
        name: 'TestDefinedMarker',
        start: 5,
        threadId: null,
      },
    ]);
  });

  it('creates an interval marker', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        startTime: 5,
        endTime: 6,
        phase: INTERVAL,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        end: 6,
        name: 'TestDefinedMarker',
        start: 5,
        threadId: null,
      },
    ]);
  });

  it('matches an IntervalStart and IntervalEnd marker', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        startTime: 5,
        endTime: null,
        phase: INTERVAL_START,
        data: {
          category: 'CC',
          type: 'tracing',
          first: 'Hello',
          second: 'World',
        },
      },
      {
        startTime: null,
        endTime: 6,
        phase: INTERVAL_END,
        data: {
          category: 'CC',
          type: 'tracing',
          first: 'Goodbye',
          desc: 'O Cruel',
        },
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: {
          category: 'CC',
          type: 'tracing',
          first: 'Goodbye',
          desc: 'O Cruel',
          second: 'World',
        },
        end: 6,
        name: 'TestDefinedMarker',
        start: 5,
        threadId: null,
      },
    ]);
  });

  it('completes an unmatched IntervalEnd marker', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        startTime: null,
        endTime: 6,
        phase: INTERVAL_END,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        end: 6,
        name: 'TestDefinedMarker',
        start: 0,
        incomplete: true,
        threadId: null,
      },
    ]);
  });

  it('completes an unmatched IntervalStart marker', function () {
    const startTime = 2;
    const { markers, profile } = setupWithTestDefinedMarkers([
      {
        startTime,
        endTime: null,
        phase: INTERVAL_START,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        // This could fail in the future if we determine thread length some other way.
        end: profile.threads[0].samples.length,
        name: 'TestDefinedMarker',
        start: 2,
        incomplete: true,
        threadId: null,
      },
    ]);
  });

  it('handles nested interval start/end markers', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        startTime: 2,
        endTime: null,
        phase: INTERVAL_START,
      },
      {
        startTime: 3,
        endTime: null,
        phase: INTERVAL_START,
      },
      {
        startTime: null,
        endTime: 5,
        phase: INTERVAL_END,
      },
      {
        startTime: null,
        endTime: 7,
        phase: INTERVAL_END,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        end: 7,
        name: 'TestDefinedMarker',
        start: 2,
        threadId: null,
      },
      {
        category: 0,
        data: null,
        end: 5,
        name: 'TestDefinedMarker',
        start: 3,
        threadId: null,
      },
    ]);
  });

  it('only nests markers of the same name', function () {
    const { markers } = setupWithTestDefinedMarkers([
      {
        name: 'Marker A',
        startTime: 2,
        endTime: null,
        phase: INTERVAL_START,
      },
      {
        name: 'Marker B',
        startTime: 3,
        endTime: null,
        phase: INTERVAL_START,
      },
      {
        name: 'Marker A',
        startTime: null,
        endTime: 5,
        phase: INTERVAL_END,
      },
      {
        name: 'Marker B',
        startTime: null,
        endTime: 7,
        phase: INTERVAL_END,
      },
    ]);

    expect(markers).toEqual([
      {
        category: 0,
        data: null,
        end: 5,
        name: 'Marker A',
        start: 2,
        threadId: null,
      },
      {
        category: 0,
        data: null,
        end: 7,
        name: 'Marker B',
        start: 3,
        threadId: null,
      },
    ]);
  });

  it('has special handling for CompositorScreenshot', function () {
    const basePayload = {
      type: 'CompositorScreenshot' as const,
      url: 16,
      windowWidth: 1280,
      windowHeight: 1000,
    };
    const payloadsForWindowA: ScreenshotPayload[] = [
      {
        ...basePayload,
        windowID: '0xAAAAAAAAA',
      },
      {
        ...basePayload,
        windowWidth: 500,
        windowID: '0xAAAAAAAAA',
      },
    ];
    const payloadsForWindowB = payloadsForWindowA.map((payload) => ({
      ...payload,
      windowID: '0xBBBBBBBBB',
    }));

    const startTimesForWindowA = [2, 5];
    const startTimesForWindowB = [3, 6];

    const { markers, getState } = setupWithTestDefinedMarkers([
      {
        name: 'CompositorScreenshot',
        startTime: startTimesForWindowA[0],
        endTime: null,
        phase: INTERVAL_START,
        data: payloadsForWindowA[0],
      },
      {
        name: 'CompositorScreenshot',
        startTime: startTimesForWindowB[0],
        endTime: null,
        phase: INTERVAL_START,
        data: payloadsForWindowB[0],
      },
      {
        name: 'CompositorScreenshot',
        startTime: startTimesForWindowA[1],
        endTime: null,
        phase: INTERVAL_START,
        data: payloadsForWindowA[1],
      },
      {
        name: 'CompositorScreenshot',
        startTime: startTimesForWindowB[1],
        endTime: null,
        phase: INTERVAL_START,
        data: payloadsForWindowB[1],
      },
    ]);

    const threadRange = selectedThreadSelectors.getThreadRange(getState());

    expect(markers).toEqual([
      // The two firsts have a duration from the first screenshot to the next in
      // the same window.
      {
        name: 'CompositorScreenshot',
        data: {
          ...payloadsForWindowA[0],
          url: expect.anything(),
        },
        start: startTimesForWindowA[0],
        end: startTimesForWindowA[1],
        category: 0,
        threadId: null,
      },
      {
        name: 'CompositorScreenshot',
        data: {
          ...payloadsForWindowB[0],
          url: expect.anything(),
        },
        start: startTimesForWindowB[0],
        end: startTimesForWindowB[1],
        category: 0,
        threadId: null,
      },

      // The 2 lasts have a duration until the end of the thread range.
      {
        name: 'CompositorScreenshot',
        data: {
          ...payloadsForWindowA[1],
          url: expect.anything(),
        },
        start: startTimesForWindowA[1],
        end: threadRange.end,
        category: 0,
        threadId: null,
      },
      {
        name: 'CompositorScreenshot',
        data: {
          ...payloadsForWindowB[1],
          url: expect.anything(),
        },
        start: startTimesForWindowB[1],
        end: threadRange.end,
        category: 0,
        threadId: null,
      },
    ]);
  });
});

describe('deriveMarkersFromRawMarkerTable', function () {
  function setup() {
    // We have a broken marker on purpose in our test data, which outputs an
    // error. Let's silence an error to have a clean output. We check that the
    // mock is called in one of the tests.
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const profile = processGeckoProfile(createGeckoProfile());
    profile.meta.symbolicated = true; // avoid to kick off the symbolication process
    const thread = profile.threads[0]; // This is the parent process main thread
    const contentThread = profile.threads[2]; // This is the content process main thread

    const store = storeWithProfile(profile);
    const state = store.getState();

    const mainThreadSelectors = getThreadSelectors(0);
    const contentThreadSelectors = getThreadSelectors(2);
    const mainGetMarker = mainThreadSelectors.getMarkerGetter(state);
    const contentGetMarker = contentThreadSelectors.getMarkerGetter(state);

    return {
      profile,
      markers: mainThreadSelectors
        .getFullMarkerListIndexes(state)
        .map(mainGetMarker),
      thread,
      contentThread,
      contentMarkers: contentThreadSelectors
        .getFullMarkerListIndexes(state)
        .map(contentGetMarker),
    };
  }

  it('creates a reasonable processed profile', function () {
    const { thread, contentThread } = setup();
    expect(thread.name).toBe('GeckoMain');
    expect(thread.processType).toBe('default');
    expect(contentThread.name).toBe('GeckoMain');
    expect(contentThread.processType).toBe('tab');
  });

  it('matches the snapshot', function () {
    const { markers } = setup();
    expect(markers).toMatchSnapshot();
  });

  it('creates 19 markers given the test data', function () {
    const { markers } = setup();
    const markerNames = markers.map(
      (marker) => (marker.data ? marker.data.type : 'null') + ':' + marker.name
    );
    expect(markerNames).toEqual([
      'tracing:Rasterize',
      'VsyncTimestamp:VsyncTimestamp',
      'tracing:Reflow',
      'tracing:Rasterize',
      'DOMEvent:DOMEvent',
      'GCMinor:MinorGC',
      'UserTiming:UserTiming',
      'tracing:Reflow',
      'tracing:Reflow',
      'tracing:ArbitraryName',
      'Network:Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      'FileIO:FileIO',
      'CompositorScreenshot:CompositorScreenshot',
      'PreferenceRead:PreferenceRead',
      'Text:RefreshDriverTick',
      'NoPayloadUserData:Navigation::Start',
      'IPC:IPCOut',
      'IPC:IPCOut',
      'tracing:Rasterize',
    ]);
  });

  it('creates a marker even if there is no start or end time', function () {
    const { markers } = setup();
    expect(markers[1]).toMatchObject({
      start: 2,
      end: null,
      name: 'VsyncTimestamp',
    });
  });

  it('should create a marker', function () {
    const { markers } = setup();
    expect(markers[2]).toMatchObject({
      start: 3,
      end: 8,
      name: 'Reflow',
    });
  });

  it('should fold the two reflow markers into one marker', function () {
    const { markers } = setup();
    expect(markers.length).toEqual(19);
    expect(markers[2]).toMatchObject({
      start: 3,
      end: 8,
      name: 'Reflow',
    });
  });

  it('should fold the two Rasterize markers into one marker, after the reflow marker', function () {
    const { markers } = setup();
    expect(markers[3]).toMatchObject({
      start: 4,
      end: 5,
      name: 'Rasterize',
    });
  });

  it('should correlate the IPC markers together and fold transferStart/transferEnd markers', function () {
    const { markers, contentMarkers } = setup();
    expect(markers[16]).toMatchObject({
      start: 30,
      end: 1031,
      name: 'IPCOut',
      data: { phase: 'endpoint' },
    });
    expect(contentMarkers[0]).toMatchObject({
      start: 30,
      end: 1031,
      name: 'IPCIn',
      data: { phase: 'endpoint' },
    });
    expect(markers[17]).toMatchObject({
      start: 40,
      end: 40,
      name: 'IPCOut',
      data: { phase: 'endpoint' },
    });
  });

  it('should create a marker for the MinorGC startTime/endTime marker', function () {
    const { markers } = setup();
    expect(markers[5]).toMatchObject({
      start: 11,
      end: 12,
      name: 'MinorGC',
    });
  });

  it('should create a marker for the DOMEvent marker', function () {
    const { markers } = setup();
    expect(markers[4]).toMatchObject({
      end: 10,
      name: 'DOMEvent',
      start: 9,
    });
  });

  it('should create a marker for the marker UserTiming', function () {
    const { markers } = setup();
    expect(markers[6]).toMatchObject({
      end: 13,
      name: 'UserTiming',
      start: 12,
    });
  });

  it('should handle markers without a start', function () {
    const { markers } = setup();
    expect(markers[0]).toMatchObject({
      start: 0, // Truncated to the time of the first captured sample.
      end: 1,
      name: 'Rasterize',
    });
  });

  it('should handle markers without an end', function () {
    const { markers } = setup();
    expect(markers[18]).toMatchObject({
      start: 100,
      end: 100,
      name: 'Rasterize',
      incomplete: true,
    });
  });

  it('should handle nested markers correctly', function () {
    const { markers } = setup();
    expect(markers[7]).toMatchObject({
      start: 13,
      end: 18,
      name: 'Reflow',
    });
    expect(markers[8]).toMatchObject({
      start: 14,
      end: 15,
      name: 'Reflow',
    });
  });

  it('should handle arbitrary tracing markers correctly', function () {
    const { markers } = setup();
    expect(markers[9]).toMatchObject({
      start: 21,
      end: null,
      name: 'ArbitraryName',
      data: { category: 'ArbitraryCategory', type: 'tracing' },
    });
  });

  // Note that the network markers are also extensively tested below in the part
  // for filterRawMarkerTableToRange.
  it('shifts content process marker times correctly, especially in network markers', function () {
    const { thread, contentThread, markers, contentMarkers } = setup();

    expect(thread.processStartupTime).toBe(0);
    expect(contentThread.processStartupTime).toBe(1000);
    expect(markers[10]).toEqual({
      data: {
        type: 'Network',
        startTime: 22,
        endTime: 24,
        id: 388634410746504,
        status: 'STATUS_STOP',
        pri: -20,
        count: 37838,
        URI: 'https://github.com/rustwasm/wasm-bindgen/issues/5',
        fetchStart: 23,
        domainLookupStart: 23.1,
        domainLookupEnd: 23.2,
        connectStart: 23.3,
        tcpConnectEnd: 23.4,
        secureConnectionStart: 23.5,
        connectEnd: 23.6,
        requestStart: 23.7,
        responseStart: 23.8,
        responseEnd: 23.9,
      },
      end: 24,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 22,
      category: 0,
      threadId: null,
    });
    expect(markers[16]).toEqual({
      data: {
        type: 'IPC',
        startTime: 30,
        sendStartTime: 30.1,
        sendEndTime: 30.2,
        recvEndTime: 1030.3,
        endTime: 1031,
        otherPid: '2222',
        sendTid: 3333,
        recvTid: 1111,
        sendThreadName: 'Parent Process (Thread ID: 3333)',
        recvThreadName: 'Content Process (Thread ID: 1111)',
        messageSeqno: 1,
        messageType: 'PContent::Msg_PreferenceUpdate',
        niceDirection: 'sent to Content Process (Thread ID: 1111)',
        side: 'parent',
        direction: 'sending',
        phase: 'endpoint',
        sync: false,
      },
      end: 1031,
      incomplete: false,
      name: 'IPCOut',
      start: 30,
      category: 0,
      threadId: null,
    });

    // Test for a marker with a stack
    expect(markers[11]).toEqual({
      data: {
        // Stack property is converted to a cause.
        cause: {
          stack: 4,
          tid: 1111,
          // The cause's time hasn't been changed.
          time: 1,
        },
        filename: '/foo/bar/',
        operation: 'create/open',
        source: 'PoisionOIInterposer',
        type: 'FileIO',
      },
      start: 22,
      end: 24,
      name: 'FileIO',
      category: 0,
      threadId: null,
    });

    expect(contentMarkers[0]).toEqual({
      data: {
        type: 'IPC',
        startTime: 30,
        sendStartTime: 30.1,
        sendEndTime: 30.2,
        recvEndTime: 1030.3,
        endTime: 1031,
        otherPid: '3333',
        sendTid: 3333,
        recvTid: 1111,
        sendThreadName: 'Parent Process (Thread ID: 3333)',
        recvThreadName: 'Content Process (Thread ID: 1111)',
        messageSeqno: 1,
        messageType: 'PContent::Msg_PreferenceUpdate',
        niceDirection: 'received from Parent Process (Thread ID: 3333)',
        side: 'child',
        direction: 'receiving',
        phase: 'endpoint',
        sync: false,
      },
      end: 1031,
      incomplete: false,
      name: 'IPCIn',
      start: 30,
      category: 0,
      threadId: null,
    });
    expect(contentMarkers[11]).toEqual({
      data: {
        type: 'Network',
        startTime: 1022,
        endTime: 1024,
        id: 388634410746504,
        status: 'STATUS_STOP',
        pri: -20,
        count: 37838,
        URI: 'https://github.com/rustwasm/wasm-bindgen/issues/5',
        fetchStart: 1023,
        domainLookupStart: 1023.1,
        domainLookupEnd: 1023.2,
        connectStart: 1023.3,
        tcpConnectEnd: 1023.4,
        secureConnectionStart: 1023.5,
        connectEnd: 1023.6,
        requestStart: 1023.7,
        responseStart: 1023.8,
        responseEnd: 1023.9,
      },
      end: 1024,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 1022,
      category: 0,
      threadId: null,
    });
    expect(contentMarkers[12]).toEqual({
      data: {
        // Stack property is converted to a cause.
        cause: {
          stack: 20,
          tid: 1111,
          // The cause's time has been properly increased of 1000ms (this is the
          // difference between the start times for the content process and the
          // parent process, see `contentProcessMeta` in
          // fixtures/profiles/gecko-profile.js).
          time: 1 + 1000,
        },
        filename: '/foo/bar/',
        operation: 'create/open',
        source: 'PoisionOIInterposer',
        type: 'FileIO',
      },
      start: 1022,
      end: 1024,
      name: 'FileIO',
      category: 0,
      threadId: null,
    });
  });

  it('should create a marker for the marker CompositorScreenshot', function () {
    const { markers } = setup();
    expect(markers[12]).toMatchObject({
      data: {
        type: 'CompositorScreenshot',
        url: expect.anything(),
        windowID: '0x136888400',
        windowWidth: 1280,
        windowHeight: 1000,
      },
      name: 'CompositorScreenshot',
      start: 25,
      end: 25,
    });
  });
});

describe('filterRawMarkerTableToRange', () => {
  type TestConfig = {
    start: Milliseconds;
    end: Milliseconds;
    markers: Array<TestDefinedRawMarker>;
  };

  function setup({ start, end, markers }: TestConfig) {
    const shared = getEmptySharedData();
    const thread = getThreadWithRawMarkers(shared, markers);

    const derivedMarkerInfo = getTestFriendlyDerivedMarkerInfo(thread, shared);
    const rawMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      derivedMarkerInfo,
      start,
      end
    );
    const rawMarkerNames = rawMarkerTable.name.map(
      (i) => shared.stringArray[i]
    );
    const processedMarkers = getTestFriendlyDerivedMarkerInfo(
      {
        ...thread,
        markers: rawMarkerTable,
      },
      shared
    ).markers;

    const processedMarkerNames = processedMarkers.map(({ name }) => name);

    return {
      rawMarkerTable,
      rawMarkerNames,
      processedMarkers,
      processedMarkerNames,
    };
  }

  it('filters instant markers', () => {
    const { rawMarkerNames } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeInstantMarker('0', 0),
        makeInstantMarker('1', 1),
        makeInstantMarker('2', 2),
        makeInstantMarker('3', 3),
        makeInstantMarker('4', 4),
        makeInstantMarker('5', 5),
        makeInstantMarker('6', 6),
        makeInstantMarker('7', 7),
      ],
    });
    // Note: because the test fixture utility adds the strings in order, the
    // string indices are actually the same as the name themselves, which make
    // it possible to do an easy and readable assertion.
    expect(rawMarkerNames).toEqual(['3', '4', '5']);
  });

  it('filters interval markers', () => {
    const { rawMarkerNames } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeIntervalMarker('0', 0, 4),
        makeIntervalMarker('1', 1, 7),
        makeIntervalMarker('2', 2, 2.2),
        makeIntervalMarker('3', 3, 4),
        makeIntervalMarker('4', 4, 6),
        makeIntervalMarker('5', 5, 5),
        makeIntervalMarker('6', 6, 8),
        makeIntervalMarker('7', 7, 7),
      ],
    });

    expect(rawMarkerNames).toEqual(['0', '1', '3', '4', '5']);
  });

  it('filters interval start/end markers', () => {
    const { processedMarkerNames } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeStartMarker('InA', 0),
        makeStartMarker('InB', 1),
        makeStartMarker('OutA', 2),
        makeEndMarker('OutA', 2.2),
        makeStartMarker('InC', 3),
        makeStartMarker('InD', 4),
        makeEndMarker('InC', 4),
        makeEndMarker('InA', 4),
        makeStartMarker('InE', 5),
        makeEndMarker('InE', 5),
        makeStartMarker('OutB', 6),
        makeEndMarker('InD', 6),
        makeStartMarker('OutC', 7),
        makeEndMarker('OutC', 7),
        makeEndMarker('InB', 7),
        makeEndMarker('OutB', 8),
      ],
    });
    expect(processedMarkerNames.sort()).toEqual([
      'InA',
      'InB',
      'InC',
      'InD',
      'InE',
    ]);
  });

  it('filters nested tracing markers', () => {
    // In this test we're testing the more complex case of nested markers
    const { processedMarkerNames } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeStartMarker('Marker', 0),
        makeStartMarker('Marker', 1),
        makeEndMarker('Marker', 2),
        makeEndMarker('Marker', 6),
      ],
    });

    expect(processedMarkerNames).toEqual(['Marker']);
  });

  it('filters screenshot markers', () => {
    const { rawMarkerTable } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeCompositorScreenshot(0),
        makeCompositorScreenshot(3),
        makeCompositorScreenshot(7),
      ],
    });

    expect(rawMarkerTable.startTime).toEqual([0, 3]);
  });

  it('keeps a screenshot markers happening before the range if there is no other marker', () => {
    const { processedMarkerNames } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        makeCompositorScreenshot(0),
        // The compositor marker will be all the way to the last marker.
        makeInstantMarker('EndMarkerOutOfRange', 8),
      ],
    });
    expect(processedMarkerNames).toEqual(['CompositorScreenshot']);
  });

  it('filters network markers', () => {
    const rest: Omit<NetworkPayload, 'id' | 'status'> = {
      type: 'Network',
      URI: 'https://example.com',
      pri: 0,
      startTime: 0,
      endTime: 0,
    };

    const { processedMarkers } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        {
          name: 'Load 1',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { ...rest, id: 1, status: 'STATUS_START' },
        },
        {
          name: 'Load 2',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { ...rest, id: 2, status: 'STATUS_START' },
        },
        {
          name: 'Load 4 will be filtered',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { ...rest, id: 4, status: 'STATUS_START' },
        },
        {
          name: 'Load 4 will be filtered',
          startTime: 1,
          endTime: 2,
          phase: INTERVAL,
          data: { ...rest, id: 4, status: 'STATUS_STOP' },
        },
        {
          name: 'Load 1',
          startTime: 1,
          endTime: 3,
          phase: INTERVAL,
          data: { ...rest, id: 1, status: 'STATUS_STOP' },
        },
        {
          name: 'Load 2',
          startTime: 1,
          endTime: 7,
          phase: INTERVAL,
          data: { ...rest, id: 2, status: 'STATUS_STOP' },
        },
        {
          name: 'Load 3',
          startTime: 2,
          phase: INTERVAL,
          endTime: 6,
          data: { ...rest, id: 3, status: 'STATUS_START' },
        },
        {
          name: 'Load 3',
          startTime: 6,
          endTime: 7,
          phase: INTERVAL,
          data: { ...rest, id: 3, status: 'STATUS_STOP' },
        },
        {
          name: 'Load 5 will be filtered',
          startTime: 6,
          endTime: 7,
          phase: INTERVAL,
          data: { ...rest, id: 5, status: 'STATUS_START' },
        },
        {
          name: 'Load 5 will be filtered',
          startTime: 7,
          endTime: 8,
          phase: INTERVAL,
          data: { ...rest, id: 5, status: 'STATUS_STOP' },
        },
      ],
    });

    expect(
      processedMarkers.map((marker) => [
        marker.name,
        marker.data && (marker.data as any).id,
        marker.data && (marker.data as any).status,
        marker.start,
        marker.end,
      ])
    ).toEqual([
      ['Load 1', 1, 'STATUS_STOP', 0, 3],
      ['Load 2', 2, 'STATUS_STOP', 0, 7],
      ['Load 3', 3, 'STATUS_STOP', 2, 7],
    ]);
  });

  it('filters network markers with only a start marker', () => {
    const rest: Omit<NetworkPayload, 'id' | 'status'> = {
      type: 'Network',
      URI: 'https://example.com',
      pri: 0,
      startTime: 0,
      endTime: 0,
    };

    const { processedMarkers } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        {
          name: 'Load 1',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { id: 1, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 2,
          endTime: 4,
          phase: INTERVAL,
          data: { id: 2, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 3',
          startTime: 2,
          endTime: 6,
          phase: INTERVAL,
          data: { id: 3, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 4',
          startTime: 3,
          endTime: 5,
          phase: INTERVAL,
          data: { id: 4, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 5',
          startTime: 3,
          endTime: 7,
          phase: INTERVAL,
          data: { id: 5, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 6',
          startTime: 6,
          endTime: 7,
          phase: INTERVAL,
          data: { id: 6, status: 'STATUS_START', ...rest },
        },
      ],
    });

    const result = processedMarkers.map((marker) => [
      marker.name,
      marker.data && (marker.data as any).id,
    ]);

    expect(result).toEqual([
      ['Load 1', 1],
      ['Load 2', 2],
      ['Load 3', 3],
      ['Load 4', 4],
      ['Load 5', 5],
    ]);
  });

  it('filters network markers with only an end marker', () => {
    const rest: Omit<NetworkPayload, 'id' | 'status'> = {
      type: 'Network',
      URI: 'https://example.com',
      pri: 0,
      startTime: 0,
      endTime: 0,
    };

    const { processedMarkers } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        {
          name: 'Load 1',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { id: 1, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 2,
          endTime: 4,
          phase: INTERVAL,
          data: { id: 2, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 3',
          startTime: 2,
          endTime: 6,
          phase: INTERVAL,
          data: { id: 3, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 4',
          startTime: 3,
          endTime: 5,
          phase: INTERVAL,
          data: { id: 4, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 5',
          startTime: 3,
          endTime: 7,
          phase: INTERVAL,
          data: { id: 5, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 6',
          startTime: 6,
          endTime: 7,
          phase: INTERVAL,
          data: { ...rest, id: 6, status: 'STATUS_STOP' },
        },
      ],
    });

    expect(
      processedMarkers.map((marker) => [
        marker.name,
        marker.data && (marker.data as any).id,
      ])
    ).toEqual([
      ['Load 2', 2],
      ['Load 3', 3],
      ['Load 4', 4],
      ['Load 5', 5],
      ['Load 6', 6],
    ]);
  });

  it('filters network markers based on their ids', () => {
    const rest: Omit<NetworkPayload, 'id' | 'status'> = {
      type: 'Network',
      URI: 'https://example.com',
      pri: 0,
      startTime: 0,
      endTime: 0,
    };

    // Network markers can be unique despite sharing the same name if
    // they are from processes with different process ids which are
    // stored in the highest 4 bytes.
    const { processedMarkers } = setup({
      start: 2.3,
      end: 5.6,
      markers: [
        {
          name: 'Load 1',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { id: 0x0000000100000001, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 1',
          startTime: 0,
          endTime: 1,
          phase: INTERVAL,
          data: { id: 0x0000000200000001, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 1,
          endTime: 2,
          phase: INTERVAL,
          data: { id: 0x0000000200000002, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 1',
          startTime: 1,
          endTime: 3,
          phase: INTERVAL,
          data: { id: 0x0000000100000001, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 2,
          endTime: 4,
          phase: INTERVAL,
          data: { id: 0x0000000100000002, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 4,
          endTime: 7,
          phase: INTERVAL,
          data: { id: 0x0000000100000002, status: 'STATUS_STOP', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 5,
          endTime: 6,
          phase: INTERVAL,
          data: { id: 0x0000000300000002, status: 'STATUS_START', ...rest },
        },
        {
          name: 'Load 2',
          startTime: 6,
          endTime: 7,
          phase: INTERVAL,
          data: { id: 0x0000000300000002, status: 'STATUS_STOP', ...rest },
        },
      ],
    });

    expect(
      processedMarkers.map((marker) => [
        marker.name,
        marker.data && (marker.data as any).id,
      ])
    ).toEqual([
      ['Load 1', 0x0000000100000001],
      ['Load 2', 0x0000000100000002],
      ['Load 2', 0x0000000300000002],
      ['Load 1', 0x0000000200000001],
    ]);
  });
});

// We don't need to test with other marker types since they are already being
// tested in `filterRawMarkerTableToRange` tests.
describe('filterRawMarkerTableToRangeWithMarkersToDelete', () => {
  type TestConfig = {
    timeRange: { start: Milliseconds; end: Milliseconds } | null;
    markersToDelete: Set<IndexIntoRawMarkerTable>;
    markers: Array<TestDefinedRawMarker>;
  };

  function setup({ timeRange, markersToDelete, markers }: TestConfig) {
    const shared = getEmptySharedData();

    const thread = getThreadWithRawMarkers(shared, markers);
    const derivedMarkerInfo = getTestFriendlyDerivedMarkerInfo(thread, shared);

    const { rawMarkerTable } = filterRawMarkerTableToRangeWithMarkersToDelete(
      thread.markers,
      derivedMarkerInfo,
      markersToDelete,
      timeRange
    );
    const markerNames = rawMarkerTable.name.map(
      (stringIndex) => shared.stringArray[stringIndex]
    );

    return {
      markerNames,
    };
  }

  it('filters generic markers without markerToDelete', () => {
    const { markerNames } = setup({
      timeRange: { start: 2.3, end: 5.6 },
      markersToDelete: new Set(),
      markers: [
        makeInstantMarker('A', 0),
        makeInstantMarker('B', 1),
        makeInstantMarker('C', 2),
        makeInstantMarker('D', 3),
        makeInstantMarker('E', 4),
        makeInstantMarker('F', 5),
        makeInstantMarker('G', 6),
        makeInstantMarker('H', 7),
      ],
    });

    expect(markerNames).toEqual(['D', 'E', 'F']);
  });

  it('filters generic markers with markerToDelete', () => {
    const { markerNames } = setup({
      timeRange: { start: 2.3, end: 5.6 },
      markersToDelete: new Set([3, 5]),
      markers: [
        makeInstantMarker('A', 0),
        makeInstantMarker('B', 1),
        makeInstantMarker('C', 2),
        makeInstantMarker('D', 3),
        makeInstantMarker('E', 4),
        makeInstantMarker('F', 5),
        makeInstantMarker('G', 6),
        makeInstantMarker('H', 7),
      ],
    });

    expect(markerNames).toEqual(['E']);
  });

  it('filters generic markers with markerToDelete but without time range', () => {
    const { markerNames } = setup({
      timeRange: null,
      markersToDelete: new Set([2, 3, 5, 7]),
      markers: [
        makeInstantMarker('A', 0),
        makeInstantMarker('B', 1),
        makeInstantMarker('C', 2),
        makeInstantMarker('D', 3),
        makeInstantMarker('E', 4),
        makeInstantMarker('F', 5),
        makeInstantMarker('G', 6),
        makeInstantMarker('H', 7),
      ],
    });

    expect(markerNames).toEqual(['A', 'B', 'E', 'G']);
  });
});
