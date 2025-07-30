/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { selectedThreadSelectors } from 'firefox-profiler/selectors';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { ensureExists } from 'firefox-profiler/utils/flow';

import {
  getUserTiming,
  getProfileWithMarkers,
  getNetworkTrackProfile,
  type TestDefinedMarkers,
  getNetworkMarkers,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';

describe('selectors/getMarkerChartTimingAndBuckets', function () {
  function getMarkerChartTimingAndBuckets(testMarkers: TestDefinedMarkers) {
    const profile = getProfileWithMarkers(testMarkers);
    const { getState } = storeWithProfile(profile);
    return selectedThreadSelectors.getMarkerChartTimingAndBuckets(getState());
  }

  it('has no marker timing if no markers are present', function () {
    expect(getMarkerChartTimingAndBuckets([])).toEqual([]);
  });

  describe('markers of the same name', function () {
    it('puts markers of the same time in two rows', function () {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*
      //              : *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, 10],
        ['Marker Name', 0, 10],
      ]);
      expect(markerTiming).toHaveLength(3);
    });

    it('puts markers of disjoint times in one row', function () {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*  *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, 10],
        ['Marker Name', 15, 25],
      ]);
      expect(markerTiming).toHaveLength(2);
    });

    it('puts markers of overlapping times in two rows', function () {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*
      //              :     *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, 10],
        ['Marker Name', 5, 15],
      ]);
      expect(markerTiming).toHaveLength(3);
    });

    it('puts markers of inclusive overlapping times in two rows', function () {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *--------*
      //              :   *---*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, 20],
        ['Marker Name', 5, 15],
      ]);
      expect(markerTiming).toHaveLength(3);
    });
  });

  describe('markers of the different names', function () {
    it('puts them in different rows', function () {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name A': *------*
      // 'Marker Name B':           *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name A', 0, 10],
        ['Marker Name B', 20, 30],
      ]);
      expect(markerTiming).toHaveLength(3);
      const [category, markerTimingA, markerTimingB] = markerTiming;
      if (
        typeof markerTimingA === 'string' ||
        typeof markerTimingB === 'string'
      ) {
        throw new Error('Expected to find marker timing, but found a string');
      }
      expect(category).toEqual('Other');
      expect(markerTimingA.name).toBe('Marker Name A');
      expect(markerTimingB.name).toBe('Marker Name B');
    });
  });

  describe('markers that are crossing the profile start or end', function () {
    it('renders properly markers starting before profile start', function () {
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Rasterize', 1, null, { category: 'Paint', type: 'tracing' }],
      ]);
      expect(markerTiming).toEqual([
        'Other',
        {
          name: 'Rasterize',
          // First sample is captured at time 1, so this incomplete
          // marker will start at that same point.
          start: [1],
          end: [1],
          index: [0],
          bucket: 'Other',
          instantOnly: true,
          length: 1,
        },
      ]);
    });
  });

  describe('network markers', function () {
    function getTimingAndBucketsForNetworkMarkers(testMarkers) {
      const profile = getProfileWithMarkers(testMarkers);

      // Let's monkey patch the returned profile to set the Network category on
      // all markers.
      const networkCategory = ensureExists(profile.meta.categories).findIndex(
        (category) => category.name === 'Network'
      );
      profile.threads.forEach((thread) => {
        thread.markers.category.fill(networkCategory);
      });

      const { getState } = storeWithProfile(profile);
      return selectedThreadSelectors.getMarkerChartTimingAndBuckets(getState());
    }

    it('groups all network markers in the same line', () => {
      const markerTiming = getTimingAndBucketsForNetworkMarkers([
        ...getNetworkMarkers({
          startTime: 1,
          endTime: 5,
          uri: 'https://www.mozilla.org/',
          id: 1,
        }),
        ...getNetworkMarkers({
          startTime: 6, // starts after the previous one, to test the algorithm that put it in the same line
          endTime: 9,
          uri: 'https://www.mozilla.org/image.jpg',
          id: 1,
          payload: { contentType: 'image/jpg' },
        }),
      ]);

      expect(markerTiming).toEqual([
        'Network',
        {
          name: 'Network Requests',
          bucket: 'Network',
          start: [1, 6],
          end: [5, 9],
          index: [0, 1],
          instantOnly: false,
          length: 2,
        },
      ]);
    });

    it('puts network markers at the end of the Network category', () => {
      const markerTiming = getTimingAndBucketsForNetworkMarkers([
        ...getNetworkMarkers(),
        ['Unload', 3, null, { type: 'tracing', category: 'Navigation' }],
      ]);
      expect(markerTiming).toEqual([
        'Network',
        {
          name: 'Unload',
          bucket: 'Network',
          start: [3],
          end: [3],
          index: [1],
          instantOnly: true,
          length: 1,
        },
        {
          name: 'Network Requests',
          bucket: 'Network',
          start: [0],
          end: [1],
          index: [0],
          instantOnly: false,
          length: 1,
        },
      ]);
    });
  });
});

describe('getTimelineVerticalMarkers', function () {
  it('gets the appropriate markers', function () {
    const { getState } = storeWithProfile(getNetworkTrackProfile());
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes =
      selectedThreadSelectors.getTimelineVerticalMarkerIndexes(getState());
    const allMarkers =
      selectedThreadSelectors.getFullMarkerListIndexes(getState());

    expect(allMarkers.length).toBeGreaterThan(markerIndexes.length);
    expect(markerIndexes).toHaveLength(5);
    expect(markerIndexes.map(getMarker)).toMatchSnapshot();
  });
});

describe('memory markers', function () {
  function setup() {
    // GC markers have some complicated data structures that are just mocked here with
    // this "any".
    const any = (null: any);

    return storeWithProfile(
      getProfileWithMarkers([
        ['DOMEvent', 0, null, { type: 'tracing', category: 'JS' }],
        ['Navigation', 1, null, { type: 'tracing', category: 'Navigation' }],
        ['Paint', 2, null, { type: 'tracing', category: 'Paint' }],
        ['IdleForgetSkippable', 3, 4, { type: 'CC' }],
        ['GCMinor', 5, null, { type: 'GCMinor', nursery: any }],
        ['GCMajor', 6, null, { type: 'GCMajor', timings: any }],
        ['GCSlice', 7, null, { type: 'GCSlice', timings: any }],
      ])
    );
  }

  it('can get memory markers using getMemoryMarkers', function () {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes =
      selectedThreadSelectors.getTimelineMemoryMarkerIndexes(getState());
    expect(
      markerIndexes.map((markerIndex) => getMarker(markerIndex).name)
    ).toEqual(['IdleForgetSkippable', 'GCMinor', 'GCMajor', 'GCSlice']);
  });

  it('ignores memory markers in getTimelineOverviewMarkerIndexes', function () {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes =
      selectedThreadSelectors.getTimelineOverviewMarkerIndexes(getState());
    expect(
      markerIndexes.map((markerIndex) => getMarker(markerIndex).name)
    ).toEqual(['DOMEvent', 'Navigation', 'Paint']);
  });
});

describe('selectors/getUserTimingMarkerTiming', function () {
  it('simple profile', function () {
    const profile = getProfileWithMarkers([
      getUserTiming('renderFunction', 0, 10), // 0 -> 10
      getUserTiming('componentA', 1, 8), // 1 -> 9
      getUserTiming('componentB', 2, 3), // 2 -> 5
      getUserTiming('pointInTime', 6), // 6 -> 6
      getUserTiming('componentC', 7, 2), // 7 -> 9
    ]);
    const { getState } = storeWithProfile(profile);

    expect(
      selectedThreadSelectors.getUserTimingMarkerTiming(getState())
    ).toEqual([
      {
        start: [6],
        end: [6],
        index: [3],
        name: 'UserTiming',
        bucket: 'None',
        instantOnly: true,
        length: 1,
      },
      {
        start: [0],
        end: [10],
        index: [0],
        name: 'UserTiming',
        bucket: 'None',
        instantOnly: false,
        length: 1,
      },
      {
        start: [1],
        end: [9],
        index: [1],
        name: 'UserTiming',
        bucket: 'None',
        instantOnly: false,
        length: 1,
      },
      {
        start: [2, 7],
        end: [5, 9],
        index: [2, 4],
        name: 'UserTiming',
        bucket: 'None',
        instantOnly: false,
        length: 2,
      },
    ]);
  });
});

describe('Marker schema filtering', function () {
  function getProfileForMarkerSchema() {
    // prettier-ignore
    const profile = getProfileWithMarkers([
      ['no payload',        0, null, null],
      ['payload no schema', 0, null, { type: 'no schema marker' }],
      ['RefreshDriverTick', 0, null, { type: 'Text', name: 'Tick with 1 observer' }],
      ['VisibleInTimelineOverview', 0, null],
      ['UserTiming',        5, 6,    { type: 'UserTiming', name: 'name', entryType: 'mark' }],
      // The following is a tracing marker without a schema attached, this was a
      // regression reported in Bug 1678698.
      ['RandomTracingMarker', 7, 8,  { type: 'tracing', category: 'RandomTracingMarker' }],
      ...getNetworkMarkers(),
    ]);
    return profile;
  }

  function setup(profile) {
    const { getState } = storeWithProfile(profile);
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());

    function getMarkerNames(selector): string[] {
      return selector(getState())
        .map(getMarker)
        .map((marker) => marker.name);
    }

    return { getMarkerNames };
  }

  it('filters for getMarkerTableMarkerIndexes', function () {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerTableMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'VisibleInTimelineOverview',
      'Load 0: https://mozilla.org',
      'UserTiming',
      'RandomTracingMarker',
    ]);
  });

  it('filters for getMarkerChartMarkerIndexes', function () {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerChartMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'VisibleInTimelineOverview',
      'Load 0: https://mozilla.org',
      'UserTiming',
      'RandomTracingMarker',
    ]);
  });

  it('filters for MarkerChartMarkerIndexes also for profiles upgraded from version 32', async function () {
    // This is a profile purposefully stuck at version 32.
    const profile = {
      meta: {
        interval: 1,
        startTime: 0,
        abi: '',
        misc: '',
        oscpu: '',
        platform: '',
        processType: 0,
        extensions: { id: [], name: [], baseURL: [], length: 0 },
        categories: [
          { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
          { name: 'Other', color: 'grey', subcategories: ['Other'] },
        ],
        product: 'Firefox',
        stackwalk: 0,
        toolkit: '',
        version: 21,
        preprocessedProfileVersion: 32,
        appBuildID: '',
        sourceURL: '',
        physicalCPUs: 0,
        logicalCPUs: 0,
        symbolicated: true,
      },
      pages: [],
      threads: [
        {
          processType: 'default',
          processStartupTime: 0,
          processShutdownTime: null,
          registerTime: 0,
          unregisterTime: null,
          pausedRanges: [],
          name: 'Empty',
          pid: 0,
          tid: 0,
          samples: {
            weightType: 'samples',
            weight: null,
            eventDelay: [],
            stack: [],
            time: [],
            length: 0,
          },
          markers: {
            name: [0, 1, 2, 3, 4, 5, 5],
            startTime: [0, 0, 0, 5, 7, 0, 0.5],
            endTime: [null, null, null, 6, 8, 0.5, 1],
            phase: [0, 0, 0, 1, 1, 1, 1],
            category: [0, 0, 0, 0, 0, 0, 0],
            data: [
              null,
              { type: 'no schema marker' },
              { type: 'Text', name: 'RefreshDriverTick' },
              { type: 'UserTiming', name: 'name', entryType: 'mark' },
              { type: 'tracing', category: 'RandomTracingMarker' },
              {
                type: 'Network',
                id: 0,
                startTime: 0,
                endTime: 0.5,
                pri: 0,
                status: 'STATUS_START',
                URI: 'https://mozilla.org',
              },
              {
                type: 'Network',
                id: 0,
                startTime: 0.5,
                endTime: 1,
                pri: 0,
                status: 'STATUS_STOP',
                URI: 'https://mozilla.org',
                contentType: 'text/html',
              },
            ],
            length: 7,
          },
          stackTable: {
            frame: [],
            prefix: [],
            category: [],
            subcategory: [],
            length: 0,
          },
          frameTable: {
            address: [],
            category: [],
            subcategory: [],
            func: [],
            innerWindowID: [],
            implementation: [],
            line: [],
            column: [],
            length: 0,
          },
          stringArray: [
            'no payload',
            'payload no schema',
            'RefreshDriverTick',
            'UserTiming',
            'RandomTracingMarker',
            'Load 0: https://mozilla.org',
          ],
          libs: [],
          funcTable: {
            address: [],
            isJS: [],
            relevantForJS: [],
            name: [],
            resource: [],
            fileName: [],
            lineNumber: [],
            columnNumber: [],
            length: 0,
          },
          resourceTable: { lib: [], name: [], host: [], type: [], length: 0 },
        },
      ],
    };

    const upgradedProfile = await unserializeProfileOfArbitraryFormat(profile);
    const { getMarkerNames } = setup(upgradedProfile);

    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerTableMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'Load 0: https://mozilla.org',
      'UserTiming',
      'RandomTracingMarker',
    ]);

    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerChartMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'Load 0: https://mozilla.org',
      'UserTiming',
      'RandomTracingMarker',
    ]);
  });

  it('filters for getTimelineOverviewMarkerIndexes', function () {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
    expect(
      getMarkerNames(selectedThreadSelectors.getTimelineOverviewMarkerIndexes)
    ).toEqual(['VisibleInTimelineOverview', 'RandomTracingMarker']);
  });
});

describe('profile upgrading and markers', () => {
  it('upgrades cause timestamps from the processed version 33', async () => {
    // This is a profile purposefully stuck at version 33.
    const profile = {
      meta: {
        interval: 1,
        startTime: 0,
        abi: '',
        misc: '',
        oscpu: '',
        platform: '',
        processType: 0,
        extensions: { id: [], name: [], baseURL: [], length: 0 },
        categories: [
          { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
          { name: 'Other', color: 'grey', subcategories: ['Other'] },
        ],
        product: 'Firefox',
        stackwalk: 0,
        toolkit: '',
        version: 21,
        // This is the version right before the marker's cause timestamp update
        preprocessedProfileVersion: 33,
        appBuildID: '',
        sourceURL: '',
        physicalCPUs: 0,
        logicalCPUs: 0,
        symbolicated: true,
        markerSchema: [
          {
            name: 'GCMajor',
            display: ['marker-chart', 'marker-table', 'timeline-memory'],
            data: [],
          },
          {
            name: 'GCMinor',
            display: ['marker-chart', 'marker-table', 'timeline-memory'],
            data: [],
          },
          {
            name: 'GCSlice',
            display: ['marker-chart', 'marker-table', 'timeline-memory'],
            data: [],
          },
          {
            name: 'CC',
            tooltipLabel: 'Cycle Collect',
            display: ['marker-chart', 'marker-table', 'timeline-memory'],
            data: [],
          },
          {
            name: 'FileIO',
            display: ['marker-chart', 'marker-table'],
            data: [
              {
                key: 'operation',
                label: 'Operation',
                format: 'string',
                searchable: true,
              },
              {
                key: 'source',
                label: 'Source',
                format: 'string',
                searchable: true,
              },
              {
                key: 'filename',
                label: 'Filename',
                format: 'file-path',
                searchable: true,
              },
            ],
          },
          {
            name: 'MediaSample',
            display: ['marker-chart', 'marker-table'],
            data: [
              {
                key: 'sampleStartTimeUs',
                label: 'Sample start time',
                format: 'microseconds',
              },
              {
                key: 'sampleEndTimeUs',
                label: 'Sample end time',
                format: 'microseconds',
              },
            ],
          },
          {
            name: 'Styles',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [
              {
                key: 'elementsTraversed',
                label: 'Elements traversed',
                format: 'integer',
              },
              {
                key: 'elementsStyled',
                label: 'Elements styled',
                format: 'integer',
              },
              {
                key: 'elementsMatched',
                label: 'Elements matched',
                format: 'integer',
              },
              {
                key: 'stylesShared',
                label: 'Styles shared',
                format: 'integer',
              },
              {
                key: 'stylesReused',
                label: 'Styles reused',
                format: 'integer',
              },
            ],
          },
          {
            name: 'PreferenceRead',
            display: ['marker-chart', 'marker-table'],
            data: [
              { key: 'prefName', label: 'Name', format: 'string' },
              { key: 'prefKind', label: 'Kind', format: 'string' },
              { key: 'prefType', label: 'Type', format: 'string' },
              { key: 'prefValue', label: 'Value', format: 'string' },
            ],
          },
          {
            name: 'UserTiming',
            tooltipLabel: '{marker.data.name}',
            chartLabel: '{marker.data.name}',
            tableLabel: '{marker.data.name}',
            display: ['marker-chart', 'marker-table'],
            data: [
              // name
              { label: 'Marker', value: 'UserTiming' },
              { key: 'entryType', label: 'Entry Type', format: 'string' },
              {
                label: 'Description',
                value:
                  'UserTiming is created using the DOM APIs performance.mark() and performance.measure().',
              },
            ],
          },
          {
            name: 'Text',
            tableLabel: '{marker.name} — {marker.data.name}',
            chartLabel: '{marker.name} — {marker.data.name}',
            display: ['marker-chart', 'marker-table'],
            data: [{ key: 'name', label: 'Details', format: 'string' }],
          },
          {
            name: 'Log',
            display: ['marker-table'],
            tableLabel: '({marker.data.module}) {marker.data.name}',
            data: [
              { key: 'module', label: 'Module', format: 'string' },
              { key: 'name', label: 'Name', format: 'string' },
            ],
          },
          {
            name: 'DOMEvent',
            tooltipLabel: '{marker.data.eventType} — DOMEvent',
            tableLabel: '{marker.data.eventType}',
            chartLabel: '{marker.data.eventType}',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [{ key: 'latency', label: 'Latency', format: 'duration' }],
          },
          {
            name: 'Paint',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [{ key: 'category', label: 'Type', format: 'string' }],
          },
          {
            name: 'Navigation',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [{ key: 'category', label: 'Type', format: 'string' }],
          },
          {
            name: 'Layout',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [{ key: 'category', label: 'Type', format: 'string' }],
          },

          {
            name: 'IPC',
            tooltipLabel: 'IPC — {marker.data.niceDirection}',
            tableLabel:
              '{marker.name} — {marker.data.messageType} — {marker.data.niceDirection}',
            chartLabel: '{marker.data.messageType}',
            display: ['marker-chart', 'marker-table', 'timeline-ipc'],
            data: [
              { key: 'messageType', label: 'Type', format: 'string' },
              { key: 'sync', label: 'Sync', format: 'string' },
              { key: 'sendThreadName', label: 'From', format: 'string' },
              { key: 'recvThreadName', label: 'To', format: 'string' },
            ],
          },
          {
            name: 'RefreshDriverTick',
            display: ['marker-chart', 'marker-table', 'timeline-overview'],
            data: [{ key: 'name', label: 'Tick Reasons', format: 'string' }],
          },
          { name: 'Network', display: ['marker-table'], data: [] },
        ],
      },
      pages: [],
      threads: [
        {
          processType: 'default',
          // We want specifically a value > 0 for this test. The main thread in
          // the parent process should have 0 usually, but for content processes
          // this is a non-zero value.
          processStartupTime: 1000,
          processShutdownTime: null,
          registerTime: 0,
          unregisterTime: null,
          pausedRanges: [],
          name: 'Empty',
          pid: 0,
          tid: 0,
          samples: {
            weightType: 'samples',
            weight: null,
            eventDelay: [],
            stack: [],
            time: [],
            length: 0,
          },
          markers: {
            name: [0, 1, 2, 3],
            startTime: [0, 1, 2, 5],
            endTime: [null, null, null, 6],
            phase: [0, 0, 0, 1],
            category: [0, 0, 0, 0],
            data: [
              // One marker without data
              null,
              // One marker without cause
              { type: 'UserTiming', name: 'name', entryType: 'mark' },
              // One marker with a cause that was already processed in previous versions.
              {
                type: 'tracing',
                category: 'RandomTracingMarker',
                cause: {
                  tid: 1111,
                  time: 1001, // This was already processed
                  stack: 0, // (root)
                },
              },
              // One marker with a cause that wasn't already processed in
              // previous versions.
              {
                type: 'FileIO',
                source: 'PoisionOIInterposer',
                filename: '/foo/bar/',
                operation: 'create/open',
                cause: {
                  tid: 1111,
                  time: 10, // This wasn't already processed
                  stack: 0, // (root)
                },
              },
            ],
            length: 4,
          },
          stackTable: {
            frame: [0], // (root)
            prefix: [null],
            category: [0],
            subcategory: [0],
            length: 1,
          },
          frameTable: {
            address: [-1],
            category: [0],
            subcategory: [0],
            func: [0], // (root)
            innerWindowID: [null],
            implementation: [null],
            line: [null],
            column: [null],
            length: 1,
          },
          stringArray: [
            'no payload',
            'UserTiming',
            'RandomTracingMarker',
            'FileIO',
            '(root)',
          ],
          libs: [],
          funcTable: {
            address: [-1],
            isJS: [true],
            relevantForJS: [false],
            name: [4], // (root)
            resource: [-1],
            fileName: [null],
            lineNumber: [null],
            columnNumber: [null],
            length: 1,
          },
          resourceTable: { lib: [], name: [], host: [], type: [], length: 0 },
        },
      ],
    };

    const upgradedProfile = await unserializeProfileOfArbitraryFormat(profile);
    const { getState } = storeWithProfile(upgradedProfile);

    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const derivedMarkers = selectedThreadSelectors
      .getFullMarkerListIndexes(getState())
      .map(getMarker);
    // $FlowExpectError ignore Flow errors for simplicity.
    expect(derivedMarkers[2].data.cause.time).toEqual(1001); // This hasn't changed, as expected.
    // $FlowExpectError
    expect(derivedMarkers[3].data.cause.time).toEqual(1010); // This changed, as expected.
  });
});
