/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getThreadSelectors } from '../../selectors/per-thread';
import { processProfile } from '../../profile-logic/process-profile';
import {
  deriveMarkersFromRawMarkerTable,
  filterRawMarkerTableToRange,
  filterRawMarkerTableToRangeWithMarkersToDelete,
} from '../../profile-logic/marker-data';

import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { getThreadWithMarkers } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

import type { Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';

describe('deriveMarkersFromRawMarkerTable', function() {
  function setup() {
    // We have a broken marker on purpose in our test data, which outputs an
    // error. Let's silence an error to have a clean output. We check that the
    // mock is called in one of the tests.
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const profile = processProfile(createGeckoProfile());
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

  it('creates a reasonable processed profile', function() {
    const { thread, contentThread } = setup();
    expect(thread.name).toBe('GeckoMain');
    expect(thread.processType).toBe('default');
    expect(contentThread.name).toBe('GeckoMain');
    expect(contentThread.processType).toBe('tab');
  });

  it('creates 14 markers given the test data', function() {
    const { markers } = setup();
    expect(markers.length).toEqual(14);
  });
  it('creates a marker even if there is no start or end time', function() {
    const { markers } = setup();
    expect(markers[1]).toMatchObject({
      start: 2,
      dur: 0,
      name: 'VsyncTimestamp',
      title: null,
    });
  });
  it('should create a marker', function() {
    const { markers } = setup();
    expect(markers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two reflow markers into one marker', function() {
    const { markers } = setup();
    expect(markers.length).toEqual(14);
    expect(markers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two Rasterize markers into one marker, after the reflow marker', function() {
    const { markers } = setup();
    expect(markers[3]).toMatchObject({
      start: 4,
      dur: 1,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should create a marker for the MinorGC startTime/endTime marker', function() {
    const { markers } = setup();
    expect(markers[5]).toMatchObject({
      start: 11,
      dur: 1,
      name: 'MinorGC',
      title: null,
    });
  });
  it('should create a marker for the DOMEvent marker', function() {
    const { markers } = setup();
    expect(markers[4]).toMatchObject({
      dur: 1,
      name: 'DOMEvent',
      start: 9,
      title: null,
    });
  });
  it('should create a marker for the marker UserTiming', function() {
    const { markers } = setup();
    expect(markers[6]).toMatchObject({
      dur: 1,
      name: 'UserTiming',
      start: 12,
      title: null,
    });
  });
  it('should handle markers without a start', function() {
    const { markers } = setup();
    expect(markers[0]).toMatchObject({
      start: 0, // Truncated to the time of the first captured sample.
      dur: 1,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle markers without an end', function() {
    const { markers } = setup();
    expect(markers[9]).toMatchObject({
      start: 20,
      dur: 0,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle nested markers correctly', function() {
    const { markers } = setup();
    expect(markers[7]).toMatchObject({
      start: 13,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
    expect(markers[8]).toMatchObject({
      start: 14,
      dur: 1,
      name: 'Reflow',
      title: null,
    });
  });
  it('should handle arbitrary event markers correctly', function() {
    const { markers } = setup();
    expect(markers[10]).toMatchObject({
      start: 21,
      dur: 0,
      name: 'ArbitraryName',
      title: null,
      data: { category: 'ArbitraryCategory', type: 'tracing' },
    });
    // Such a marker is unexpected, so we output an error to the console in this
    // case.
    expect(console.error).toHaveBeenCalled();
  });

  // Note that the network markers are also extensively tested below in the part
  // for filterRawMarkerTableToRange.
  it('shifts content process marker times correctly, especially in network markers', function() {
    const { thread, contentThread, markers, contentMarkers } = setup();
    expect(thread.processStartupTime).toBe(0);
    expect(contentThread.processStartupTime).toBe(1000);
    expect(markers[11]).toEqual({
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
      dur: 2,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 22,
      title: null,
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
      dur: 2,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 1022,
      title: null,
    });
    expect(contentMarkers[12]).toEqual({
      data: {
        // Stack property is converted to a cause.
        cause: {
          stack: 2,
          time: 1,
        },
        endTime: 1024,
        filename: '/foo/bar/',
        operation: 'create/open',
        source: 'PoisionOIInterposer',
        startTime: 1022,
        type: 'FileIO',
      },
      dur: 2,
      name: 'FileIO',
      start: 1022,
      title: null,
    });
  });
  it('should create a marker for the marker CompositorScreenshot', function() {
    const { markers } = setup();
    expect(markers[13]).toMatchObject({
      data: {
        type: 'CompositorScreenshot',
        url: 16,
        windowID: '0x136888400',
        windowWidth: 1280,
        windowHeight: 1000,
      },
      name: 'CompositorScreenshot',
      start: 25,
      dur: 0,
      title: null,
    });
  });
});

describe('filterRawMarkerTableToRange', () => {
  function setup(
    markers: Array<[string, Milliseconds, null | Object]>
  ): Thread {
    markers = markers.map(([name, time, payload]) => {
      if (payload) {
        // Force a type 'DummyForTests' if it's inexistant
        payload = { type: 'DummyForTests', ...payload };
      }
      return [name, time, payload];
    });

    // Our marker payload union type is too difficult to work with in a
    // generic way here.
    return getThreadWithMarkers((markers: any), 1);
  }

  it('filters generic markers', () => {
    const markers = [
      ['0', 0, null],
      ['1', 1, null],
      ['2', 2, null],
      ['3', 3, null],
      ['4', 4, null],
      ['5', 5, null],
      ['6', 6, null],
      ['7', 7, null],
    ];
    const { markers: markerTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      markerTable,
      2.3,
      5.6
    );
    // Note: because the test fixture utility adds the strings in order, the
    // string indices are actually the same as the name themselves, which make
    // it possible to do an easy and readable assertion.
    expect(filteredMarkerTable.name).toEqual([3, 4, 5]);
  });

  it('filters generic markers with payload', () => {
    const markers = [
      ['0', 0, {}],
      ['1', 1, {}],
      ['2', 2, {}],
      ['3', 3, {}],
      ['4', 4, {}],
      ['5', 5, {}],
      ['6', 6, {}],
      ['7', 7, {}],
    ];
    const { markers: markerTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      markerTable,
      2.3,
      5.6
    );
    expect(filteredMarkerTable.name).toEqual([3, 4, 5]);
  });

  it('filters markers with start/end in the payload', () => {
    const markers = [
      ['0', 0, { startTime: 0, endTime: 4 }],
      ['1', 1, { startTime: 1, endTime: 7 }],
      ['2', 2, { startTime: 2, endTime: 2.2 }],
      ['3', 3, { startTime: 3, endTime: 4 }],
      ['4', 4, { startTime: 4, endTime: 6 }],
      ['5', 5, { startTime: 5, endTime: 5 }],
      ['6', 6, { startTime: 6, endTime: 8 }],
      ['7', 7, { startTime: 7, endTime: 7 }],
    ];

    const { markers: markerTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      markerTable,
      2.3,
      5.6
    );
    expect(filteredMarkerTable.name).toEqual([0, 1, 3, 4, 5]);
  });

  it('filters tracing markers', () => {
    // Note: these tracing markers define the same set of markers as in the
    // previous test.
    const markers = [
      ['0', 0, { type: 'tracing', interval: 'start' }],
      ['1', 1, { type: 'tracing', interval: 'start' }],
      ['2', 2, { type: 'tracing', interval: 'start' }],
      ['2', 2.2, { type: 'tracing', interval: 'end' }],
      ['3', 3, { type: 'tracing', interval: 'start' }],
      ['4', 4, { type: 'tracing', interval: 'start' }],
      ['3', 4, { type: 'tracing', interval: 'end' }],
      ['0', 4, { type: 'tracing', interval: 'end' }],
      ['5', 5, { type: 'tracing', interval: 'start' }],
      ['5', 5, { type: 'tracing', interval: 'end' }],
      ['6', 6, { type: 'tracing', interval: 'start' }],
      ['4', 6, { type: 'tracing', interval: 'end' }],
      ['7', 7, { type: 'tracing', interval: 'start' }],
      ['7', 7, { type: 'tracing', interval: 'end' }],
      ['1', 7, { type: 'tracing', interval: 'end' }],
      ['6', 8, { type: 'tracing', interval: 'end' }],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for tracing markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    ).sort((markerA, markerB) => markerA.start - markerB.start);
    expect(processedMarkers.map(marker => marker.name)).toEqual([
      '0',
      '1',
      '3',
      '4',
      '5',
    ]);
  });

  it('filters nested tracing markers', () => {
    // In this test we're testing the more complex case of nested markers
    const markers = [
      ['0', 0, { type: 'tracing', interval: 'start' }],
      ['0', 1, { type: 'tracing', interval: 'start' }],
      ['0', 2, { type: 'tracing', interval: 'end' }],
      ['0', 6, { type: 'tracing', interval: 'end' }],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for tracing markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    ).sort((markerA, markerB) => markerA.start - markerB.start);
    expect(processedMarkers).toHaveLength(1);
    // Only the marker starting from 0 and ending at 6 is kept. The marker
    // between 1 and 2 is filtered out.
    expect(processedMarkers[0]).toMatchObject({ start: 0, dur: 6 });
  });

  it('filters markers without start/end items', () => {
    const markers = [
      ['1', 1, { type: 'tracing', interval: 'end' }],
      ['2', 2, { type: 'tracing', interval: 'start' }],
      ['3', 3, { type: 'tracing', interval: 'start' }],
      ['4', 4, { type: 'tracing', interval: 'end' }],
      ['6', 6, { type: 'tracing', interval: 'end' }],
      ['7', 7, { type: 'tracing', interval: 'start' }],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for tracing markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    ).sort((markerA, markerB) => markerA.start - markerB.start);

    expect(processedMarkers.map(marker => marker.name)).toEqual([
      '2',
      '4',
      '6',
      '3',
    ]);
  });

  it('filters screenshot markers', () => {
    const markers = [
      ['CompositorScreenshot', 0, { type: 'CompositorScreenshot', url: 0 }],
      ['CompositorScreenshot', 3, { type: 'CompositorScreenshot', url: 3 }],
      ['CompositorScreenshot', 7, { type: 'CompositorScreenshot', url: 7 }],
    ];

    const { markers: markerTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      markerTable,
      2.3,
      5.6
    );
    expect(filteredMarkerTable.time).toEqual([0, 3]);
  });

  it('keeps a screenshot markers happening before the range if there is no other marker', () => {
    const markers = [
      ['CompositorScreenshot', 0, { type: 'CompositorScreenshot', url: 0 }],
    ];

    const { markers: markerTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      markerTable,
      2.3,
      5.6
    );
    expect(filteredMarkerTable.time).toEqual([0]);
  });

  it('filters network markers', () => {
    const markers = [
      [
        'Load 1',
        0,
        {
          type: 'Network',
          id: 1,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 2',
        0,
        {
          type: 'Network',
          id: 2,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 4 will be filtered',
        0,
        {
          type: 'Network',
          id: 4,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 4 will be filtered',
        1,
        {
          type: 'Network',
          id: 4,
          status: 'STATUS_STOP',
          startTime: 1,
          endTime: 2,
        },
      ],
      [
        'Load 1',
        1,
        {
          type: 'Network',
          id: 1,
          status: 'STATUS_STOP',
          startTime: 1,
          endTime: 3,
        },
      ],
      [
        'Load 2',
        1,
        {
          type: 'Network',
          id: 2,
          status: 'STATUS_STOP',
          startTime: 1,
          endTime: 7,
        },
      ],
      [
        'Load 3',
        2,
        {
          type: 'Network',
          id: 3,
          status: 'STATUS_START',
          startTime: 2,
          endTime: 6,
        },
      ],
      [
        'Load 3',
        6,
        {
          type: 'Network',
          id: 3,
          status: 'STATUS_STOP',
          startTime: 6,
          endTime: 7,
        },
      ],
      [
        'Load 5 will be filtered',
        6,
        {
          type: 'Network',
          id: 5,
          status: 'STATUS_START',
          startTime: 6,
          endTime: 7,
        },
      ],
      [
        'Load 5 will be filtered',
        7,
        {
          type: 'Network',
          id: 5,
          status: 'STATUS_STOP',
          startTime: 7,
          endTime: 8,
        },
      ],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for network markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    );

    expect(
      processedMarkers.map(marker => [
        marker.name,
        marker.data && (marker.data: any).id,
        marker.data && (marker.data: any).status,
        marker.start,
        marker.start + marker.dur,
      ])
    ).toEqual([
      ['Load 1', 1, 'STATUS_STOP', 0, 3],
      ['Load 2', 2, 'STATUS_STOP', 0, 7],
      ['Load 3', 3, 'STATUS_STOP', 2, 7],
    ]);
  });

  it('filters network markers with only a start marker', () => {
    const markers = [
      [
        'Load 1',
        0,
        {
          type: 'Network',
          id: 1,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 2',
        2,
        {
          type: 'Network',
          id: 2,
          status: 'STATUS_START',
          startTime: 2,
          endTime: 4,
        },
      ],
      [
        'Load 3',
        2,
        {
          type: 'Network',
          id: 3,
          status: 'STATUS_START',
          startTime: 2,
          endTime: 6,
        },
      ],
      [
        'Load 4',
        3,
        {
          type: 'Network',
          id: 4,
          status: 'STATUS_START',
          startTime: 3,
          endTime: 5,
        },
      ],
      [
        'Load 5',
        3,
        {
          type: 'Network',
          id: 5,
          status: 'STATUS_START',
          startTime: 3,
          endTime: 7,
        },
      ],
      [
        'Load 6',
        6,
        {
          type: 'Network',
          id: 6,
          status: 'STATUS_START',
          startTime: 6,
          endTime: 7,
        },
      ],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for network markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    );
    expect(
      processedMarkers.map(marker => [
        marker.name,
        marker.data && (marker.data: any).id,
      ])
    ).toEqual([
      ['Load 1', 1],
      ['Load 2', 2],
      ['Load 3', 3],
      ['Load 4', 4],
      ['Load 5', 5],
    ]);
  });

  it('filters network markers with only an end marker', () => {
    const markers = [
      [
        'Load 1',
        0,
        {
          type: 'Network',
          id: 1,
          status: 'STATUS_STOP',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 2',
        2,
        {
          type: 'Network',
          id: 2,
          status: 'STATUS_STOP',
          startTime: 2,
          endTime: 4,
        },
      ],
      [
        'Load 3',
        2,
        {
          type: 'Network',
          id: 3,
          status: 'STATUS_STOP',
          startTime: 2,
          endTime: 6,
        },
      ],
      [
        'Load 4',
        3,
        {
          type: 'Network',
          id: 4,
          status: 'STATUS_STOP',
          startTime: 3,
          endTime: 5,
        },
      ],
      [
        'Load 5',
        3,
        {
          type: 'Network',
          id: 5,
          status: 'STATUS_STOP',
          startTime: 3,
          endTime: 7,
        },
      ],
      [
        'Load 6',
        6,
        {
          type: 'Network',
          id: 6,
          status: 'STATUS_STOP',
          startTime: 6,
          endTime: 7,
        },
      ],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for network markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    );
    expect(
      processedMarkers.map(marker => [
        marker.name,
        marker.data && (marker.data: any).id,
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
    // Network markers can be unique despite sharing the same name if
    // they are from processes with different process ids which are
    // stored in the highest 4 bytes.
    const markers = [
      [
        'Load 1',
        0,
        {
          type: 'Network',
          id: 0x0000000100000001,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 1',
        0,
        {
          type: 'Network',
          id: 0x0000000200000001,
          status: 'STATUS_START',
          startTime: 0,
          endTime: 1,
        },
      ],
      [
        'Load 2',
        1,
        {
          type: 'Network',
          id: 0x0000000200000002,
          status: 'STATUS_STOP',
          startTime: 1,
          endTime: 2,
        },
      ],
      [
        'Load 1',
        1,
        {
          type: 'Network',
          id: 0x0000000100000001,
          status: 'STATUS_STOP',
          startTime: 1,
          endTime: 3,
        },
      ],
      [
        'Load 2',
        2,
        {
          type: 'Network',
          id: 0x0000000100000002,
          status: 'STATUS_START',
          startTime: 2,
          endTime: 4,
        },
      ],
      [
        'Load 2',
        4,
        {
          type: 'Network',
          id: 0x0000000100000002,
          status: 'STATUS_STOP',
          startTime: 4,
          endTime: 7,
        },
      ],
      [
        'Load 2',
        5,
        {
          type: 'Network',
          id: 0x0000000300000002,
          status: 'STATUS_START',
          startTime: 5,
          endTime: 6,
        },
      ],
      [
        'Load 2',
        6,
        {
          type: 'Network',
          id: 0x0000000300000002,
          status: 'STATUS_STOP',
          startTime: 6,
          endTime: 7,
        },
      ],
    ];

    const thread = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRange(
      thread.markers,
      2.3,
      5.6
    );

    // We're using `deriveMarkersFromRawMarkerTable` here because it makes it
    // easier to assert the result for network markers.
    const processedMarkers = deriveMarkersFromRawMarkerTable(
      filteredMarkerTable,
      thread.stringTable,
      2.3 /* first sample time */,
      5.6 /* last sample time */,
      1 /* interval */
    );

    expect(
      processedMarkers.map(marker => [
        marker.name,
        marker.data && (marker.data: any).id,
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
  function setup(
    markers: Array<[string, Milliseconds, null | Object]>
  ): Thread {
    markers = markers.map(([name, time, payload]) => {
      if (payload) {
        // Force a type 'DummyForTests' if it's inexistant
        payload = { type: 'DummyForTests', ...payload };
      }
      return [name, time, payload];
    });

    // Our marker payload union type is too difficult to work with in a
    // generic way here.
    return getThreadWithMarkers((markers: any), 1);
  }

  it('filters generic markers without markerToDelete', () => {
    const markers = [
      ['A', 0, null],
      ['B', 1, null],
      ['C', 2, null],
      ['D', 3, null],
      ['E', 4, null],
      ['F', 5, null],
      ['G', 6, null],
      ['H', 7, null],
    ];
    const { markers: markerTable, stringTable } = setup(markers);
    const filteredMarkerTable = filterRawMarkerTableToRangeWithMarkersToDelete(
      markerTable,
      new Set(),
      { start: 2.3, end: 5.6 }
    ).rawMarkerTable;
    const filteredMarkerNames = filteredMarkerTable.name.map(stringIndex =>
      stringTable.getString(stringIndex)
    );
    expect(filteredMarkerNames).toEqual(['D', 'E', 'F']);
  });

  it('filters generic markers with markerToDelete', () => {
    const markers = [
      ['A', 0, null],
      ['B', 1, null],
      ['C', 2, null],
      ['D', 3, null],
      ['E', 4, null],
      ['F', 5, null],
      ['G', 6, null],
      ['H', 7, null],
    ];

    const { markers: markerTable, stringTable } = setup(markers);
    const markersToDelete = new Set([3, 5]);
    const filteredMarkerTable = filterRawMarkerTableToRangeWithMarkersToDelete(
      markerTable,
      markersToDelete,
      { start: 2.3, end: 5.6 }
    ).rawMarkerTable;

    const filteredMarkerNames = filteredMarkerTable.name.map(stringIndex =>
      stringTable.getString(stringIndex)
    );
    expect(filteredMarkerNames).toEqual(['E']);
  });

  it('filters generic markers with markerToDelete but without time range', () => {
    const markers = [
      ['A', 0, null],
      ['B', 1, null],
      ['C', 2, null],
      ['D', 3, null],
      ['E', 4, null],
      ['F', 5, null],
      ['G', 6, null],
      ['H', 7, null],
    ];
    const { markers: markerTable, stringTable } = setup(markers);
    const markersToDelete = new Set([2, 3, 5, 7]);
    const filteredMarkerTable = filterRawMarkerTableToRangeWithMarkersToDelete(
      markerTable,
      markersToDelete,
      null
    ).rawMarkerTable;

    const filteredMarkerNames = filteredMarkerTable.name.map(stringIndex =>
      stringTable.getString(stringIndex)
    );
    expect(filteredMarkerNames).toEqual(['A', 'B', 'E', 'G']);
  });
});
