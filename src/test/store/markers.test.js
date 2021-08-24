/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  selectedThreadSelectors,
  getMarkerSchemaByName,
} from 'firefox-profiler/selectors';
import { changeTimelineTrackOrganization } from 'firefox-profiler/actions/receive-profile';
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

describe('selectors/getMarkerChartTimingAndBuckets', function() {
  function getMarkerChartTimingAndBuckets(testMarkers: TestDefinedMarkers) {
    const profile = getProfileWithMarkers(testMarkers);
    const { getState } = storeWithProfile(profile);
    return selectedThreadSelectors.getMarkerChartTimingAndBuckets(getState());
  }

  it('has no marker timing if no markers are present', function() {
    expect(getMarkerChartTimingAndBuckets([])).toEqual([]);
  });

  describe('markers of the same name', function() {
    it('puts markers of the same time in two rows', function() {
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

    it('puts markers of disjoint times in one row', function() {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*  *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, 10],
        ['Marker Name', 15, 25],
      ]);
      expect(markerTiming).toHaveLength(2);
    });

    it('puts markers of overlapping times in two rows', function() {
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

    it('puts markers of inclusive overlapping times in two rows', function() {
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

  describe('markers of the different names', function() {
    it('puts them in different rows', function() {
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

  describe('markers that are crossing the profile start or end', function() {
    it('renders properly markers starting before profile start', function() {
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
          label: [''],
          bucket: 'Other',
          length: 1,
        },
      ]);
    });
  });

  describe('network markers', function() {
    function getTimingAndBucketsForNetworkMarkers(testMarkers) {
      const profile = getProfileWithMarkers(testMarkers);

      // Let's monkey patch the returned profile to set the Network category on
      // all markers.
      const networkCategory = ensureExists(profile.meta.categories).findIndex(
        category => category.name === 'Network'
      );
      profile.threads.forEach(thread => {
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
          label: [
            'https://www.mozilla.org/',
            'https://www.mozilla.org/image.jpg',
          ],
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
          label: [''],
          length: 1,
        },
        {
          name: 'Network Requests',
          bucket: 'Network',
          start: [0],
          end: [1],
          index: [0],
          label: ['https://mozilla.org'],
          length: 1,
        },
      ]);
    });
  });
});

describe('getTimelineVerticalMarkers', function() {
  it('gets the appropriate markers', function() {
    const { getState } = storeWithProfile(getNetworkTrackProfile());
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes = selectedThreadSelectors.getTimelineVerticalMarkerIndexes(
      getState()
    );
    const allMarkers = selectedThreadSelectors.getFullMarkerListIndexes(
      getState()
    );

    expect(allMarkers.length).toBeGreaterThan(markerIndexes.length);
    expect(markerIndexes).toHaveLength(5);
    expect(markerIndexes.map(getMarker)).toMatchSnapshot();
  });
});

describe('memory markers', function() {
  function setup() {
    // GC markers have some complicated data structures that are just mocked here with
    // this "any".
    const any = (null: any);

    return storeWithProfile(
      getProfileWithMarkers([
        ['DOMEvent', 0, null],
        ['Navigation', 1, null],
        ['Paint', 2, null],
        ['IdleForgetSkippable', 3, 4, { type: 'tracing', category: 'CC' }],
        ['GCMinor', 5, null, { type: 'GCMinor', nursery: any }],
        ['GCMajor', 6, null, { type: 'GCMajor', timings: any }],
        ['GCSlice', 7, null, { type: 'GCSlice', timings: any }],
      ])
    );
  }

  it('can get memory markers using getMemoryMarkers', function() {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes = selectedThreadSelectors.getTimelineMemoryMarkerIndexes(
      getState()
    );
    expect(
      markerIndexes.map(markerIndex => getMarker(markerIndex).name)
    ).toEqual(['IdleForgetSkippable', 'GCMinor', 'GCMajor', 'GCSlice']);
  });

  it('ignores memory markers in getTimelineOverviewMarkerIndexes', function() {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes = selectedThreadSelectors.getTimelineOverviewMarkerIndexes(
      getState()
    );
    expect(
      markerIndexes.map(markerIndex => getMarker(markerIndex).name)
    ).toEqual(['DOMEvent', 'Navigation', 'Paint']);
  });
});

describe('selectors/getUserTimingMarkerTiming', function() {
  it('simple profile', function() {
    const profile = getProfileWithMarkers([
      getUserTiming('renderFunction', 0, 10),
      getUserTiming('componentA', 1, 8),
      getUserTiming('componentB', 2, 4),
    ]);
    const { getState } = storeWithProfile(profile);

    expect(
      selectedThreadSelectors.getUserTimingMarkerTiming(getState())
    ).toEqual([
      {
        start: [0],
        end: [10],
        index: [0],
        label: ['renderFunction'],
        name: 'UserTiming',
        bucket: 'None',
        length: 1,
      },
      {
        start: [1],
        end: [9],
        index: [1],
        label: ['componentA'],
        name: 'UserTiming',
        bucket: 'None',
        length: 1,
      },
      {
        start: [2],
        end: [6],
        index: [2],
        label: ['componentB'],
        name: 'UserTiming',
        bucket: 'None',
        length: 1,
      },
    ]);
  });
});

describe('selectors/getCommittedRangeAndTabFilteredMarkerIndexes', function() {
  const tabID = 123123;
  const innerWindowID = 2;

  function setup(ctxId, markers: ?Array<any>) {
    const profile = getProfileWithMarkers(
      markers || [
        [
          'Dummy 1',
          10,
          null,
          {
            type: 'tracing',
            category: 'Navigation',
            innerWindowID,
          },
        ],
        ['Dummy 2', 20, null],
        [
          'Dummy 3',
          30,
          null,
          {
            type: 'tracing',
            category: 'Navigation',
            innerWindowID: 111111,
          },
        ],
        [
          'Dummy 4',
          30,
          null,
          {
            type: 'tracing',
            category: 'Navigation',
            innerWindowID,
          },
        ],
        ['Dummy 5', 40],
      ]
    );
    profile.pages = [
      {
        tabID: tabID,
        innerWindowID: innerWindowID,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeTabID: tabID,
    };
    const { getState, dispatch } = storeWithProfile(profile);

    if (ctxId) {
      dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          tabID,
        })
      );
    }
    const markerIndexes = selectedThreadSelectors.getCommittedRangeAndTabFilteredMarkerIndexes(
      getState()
    );

    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    return markerIndexes.map(markerIndex => getMarker(markerIndex).name);
  }

  it('does not filter markers if we are not in the single tab view', function() {
    const markers = setup(false);
    expect(markers).toEqual([
      'Dummy 1',
      'Dummy 2',
      'Dummy 3',
      'Dummy 4',
      'Dummy 5',
    ]);
  });

  it('filters markers by their tab if we are in the single tab view', function() {
    const markers = setup(true);
    expect(markers).toEqual(['Dummy 1', 'Dummy 4']);
  });

  it('preserves global markers', function() {
    const markers = setup(true, [
      ['Dummy 1', 20, null],
      ['Jank', 20, null],
      ['Dummy 2', 20, null],
    ]);
    expect(markers).toEqual(['Jank']);
  });
});

describe('Marker schema filtering', function() {
  function getProfileForMarkerSchema() {
    // prettier-ignore
    const profile = getProfileWithMarkers([
      ['no payload',        0, null, null],
      // $FlowExpectError - Invalid payload by our type system.
      ['payload no schema', 0, null, { type: 'no schema marker' }],
      ['RefreshDriverTick', 0, null, { type: 'Text', name: 'RefreshDriverTick' }],
      ['UserTiming',        5, 6,    { type: 'UserTiming', name: 'name', entryType: 'mark' }],
      // The following is a tracing marker without a schema attached, this was a
      // regression reported in Bug 1678698.
      // $FlowExpectError - Invalid payload by our type system.
      ['RandomTracingMarker', 7, 8,  { type: 'tracing', category: 'RandomTracingMarker' }],
      ...getNetworkMarkers(),
    ]);
    return profile;
  }

  function setup(profile) {
    const { getState } = storeWithProfile(profile);
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerSchemaByName = getMarkerSchemaByName(getState());

    if (markerSchemaByName.RandomTracingMarker) {
      throw new Error(
        'This test assumes that the RandomTracingMarker marker has no schema. If this ' +
          'schema were added somewhere else, then rename RandomTracingMarker to ' +
          'something else. '
      );
    }

    function getMarkerNames(selector): string[] {
      return selector(getState())
        .map(getMarker)
        .map(marker => marker.name);
    }

    return { getMarkerNames };
  }

  it('filters for getMarkerTableMarkerIndexes', function() {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
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
  });

  it('filters for getMarkerChartMarkerIndexes', function() {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
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

  it('filters for MarkerChartMarkerIndexes also for profiles upgraded from version 32', async function() {
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
        extensions: {
          id: [],
          name: [],
          baseURL: [],
          length: 0,
        },
        categories: [
          {
            name: 'Idle',
            color: 'transparent',
            subcategories: ['Other'],
          },
          {
            name: 'Other',
            color: 'grey',
            subcategories: ['Other'],
          },
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
              {
                type: 'no schema marker',
              },
              {
                type: 'Text',
                name: 'RefreshDriverTick',
              },
              {
                type: 'UserTiming',
                name: 'name',
                entryType: 'mark',
              },
              {
                type: 'tracing',
                category: 'RandomTracingMarker',
              },
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
            optimizations: [],
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
          resourceTable: {
            lib: [],
            name: [],
            host: [],
            type: [],
            length: 0,
          },
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

  it('filters for getTimelineOverviewMarkerIndexes', function() {
    const { getMarkerNames } = setup(getProfileForMarkerSchema());
    expect(
      getMarkerNames(selectedThreadSelectors.getTimelineOverviewMarkerIndexes)
    ).toEqual(['RefreshDriverTick']);
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
        extensions: {
          id: [],
          name: [],
          baseURL: [],
          length: 0,
        },
        categories: [
          {
            name: 'Idle',
            color: 'transparent',
            subcategories: ['Other'],
          },
          {
            name: 'Other',
            color: 'grey',
            subcategories: ['Other'],
          },
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
              {
                type: 'UserTiming',
                name: 'name',
                entryType: 'mark',
              },
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
            optimizations: [null],
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
          resourceTable: {
            lib: [],
            name: [],
            host: [],
            type: [],
            length: 0,
          },
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
