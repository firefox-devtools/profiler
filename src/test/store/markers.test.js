/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getProfileWithMarkers,
  getNetworkTrackProfile,
} from '../fixtures/profiles/processed-profile';

describe('selectors/getMarkerChartTimingAndBuckets', function() {
  function getMarkerChartTimingAndBuckets(testMarkers) {
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
        ['Marker Name', 0, { startTime: 0, endTime: 10 }],
        ['Marker Name', 0, { startTime: 0, endTime: 10 }],
      ]);
      expect(markerTiming).toHaveLength(3);
    });

    it('puts markers of disjoint times in one row', function() {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*  *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, { startTime: 0, endTime: 10 }],
        ['Marker Name', 0, { startTime: 15, endTime: 25 }],
      ]);
      expect(markerTiming).toHaveLength(2);
    });

    it('puts markers of overlapping times in two rows', function() {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *------*
      //              :     *------*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, { startTime: 0, endTime: 10 }],
        ['Marker Name', 0, { startTime: 5, endTime: 15 }],
      ]);
      expect(markerTiming).toHaveLength(3);
    });

    it('puts markers of inclusive overlapping times in two rows', function() {
      // The timing should look like this:
      //              : 'Category'
      // 'Marker Name': *--------*
      //              :   *---*
      const markerTiming = getMarkerChartTimingAndBuckets([
        ['Marker Name', 0, { startTime: 0, endTime: 20 }],
        ['Marker Name', 0, { startTime: 5, endTime: 15 }],
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
        ['Marker Name A', 0, { startTime: 0, endTime: 10 }],
        ['Marker Name B', 0, { startTime: 20, endTime: 30 }],
      ]);
      expect(markerTiming).toHaveLength(3);
      const [category, markerTimingA, markerTimingB] = markerTiming;
      if (
        typeof markerTimingA === 'string' ||
        typeof markerTimingB === 'string'
      ) {
        throw new Error('Expected to find marker timing, but found a string');
      }
      expect(category).toEqual('Idle');
      expect(markerTimingA.name).toBe('Marker Name A');
      expect(markerTimingB.name).toBe('Marker Name B');
    });
  });

  describe('markers that are crossing the profile start or end', function() {
    it('renders properly markers starting before profile start', function() {
      const markerTiming = getMarkerChartTimingAndBuckets([
        [
          'Rasterize',
          1,
          { category: 'Paint', interval: 'end', type: 'tracing' },
        ],
      ]);
      expect(markerTiming).toEqual([
        'Idle',
        {
          name: 'Rasterize',
          // First sample is captured at time 1, so this incomplete
          // marker will start at that same point.
          start: [1],
          end: [1],
          index: [0],
          label: [''],
          bucket: 'Idle',
          length: 1,
        },
      ]);
    });

    it('renders properly markers ending after profile end', function() {
      const markerTiming = getMarkerChartTimingAndBuckets([
        [
          'Rasterize',
          20,
          { category: 'Paint', interval: 'start', type: 'tracing' },
        ],
      ]);
      expect(markerTiming).toEqual([
        'Idle',
        {
          name: 'Rasterize',
          start: [20],
          end: [21], // Truncated using the time of the last sample.
          index: [0],
          label: [''],
          bucket: 'Idle',
          length: 1,
        },
      ]);
    });
  });
});

describe('getProcessedRawMarkerTable', function() {
  function setup(testMarkers) {
    const profile = getProfileWithMarkers(testMarkers);
    const { getState } = storeWithProfile(profile);
    return selectedThreadSelectors.getProcessedRawMarkerTable(getState());
  }

  it('can process Invalidation markers', function() {
    const markers = setup([
      ['Invalidate http://mozilla.com/script.js:1234', 10, null],
      ['Invalidate self-hosted:2345', 20, null],
      ['Invalidate resource://foo -> resource://bar:3456', 30, null],
      ['Invalidate moz-extension://<URL>', 40, null],
    ]);
    expect(markers.time).toEqual([10, 20, 30, 40]);
    expect(markers.data).toEqual([
      {
        type: 'Invalidation',
        url: 'http://mozilla.com/script.js',
        line: '1234',
        startTime: 10,
        endTime: 10,
      },
      {
        type: 'Invalidation',
        url: 'self-hosted',
        line: '2345',
        startTime: 20,
        endTime: 20,
      },
      {
        type: 'Invalidation',
        url: 'resource://foo -> resource://bar',
        line: '3456',
        startTime: 30,
        endTime: 30,
      },
      {
        type: 'Invalidation',
        url: 'moz-extension://<URL>',
        line: null,
        startTime: 40,
        endTime: 40,
      },
    ]);
  });

  it('can process Bailout markers', function() {
    const markers = setup([
      [
        'Bailout_ShapeGuard after getelem on line 3666 of resource://foo.js -> resource://bar.js:3662',
        10,
        null,
      ],
      [
        'Bailout_TypeBarrierV at jumptarget on line 1021 of self-hosted:970',
        20,
        null,
      ],
      // Also handle sanitized profiles where URLs have been redacted
      [
        'Bailout_ShapeGuard at jumptarget on line 7 of moz-extension://<URL>',
        30,
        null,
      ],
    ]);
    expect(markers.time).toEqual([10, 20, 30]);
    expect(markers.data).toEqual([
      {
        type: 'Bailout',
        bailoutType: 'ShapeGuard',
        where: 'after getelem',
        script: 'resource://foo.js -> resource://bar.js',
        bailoutLine: 3666,
        functionLine: 3662,
        startTime: 10,
        endTime: 10,
      },
      {
        type: 'Bailout',
        bailoutType: 'TypeBarrierV',
        where: 'at jumptarget',
        script: 'self-hosted',
        bailoutLine: 1021,
        functionLine: 970,
        startTime: 20,
        endTime: 20,
      },
      {
        type: 'Bailout',
        bailoutType: 'ShapeGuard',
        where: 'at jumptarget',
        script: 'moz-extension://<URL>',
        bailoutLine: 7,
        functionLine: null,
        startTime: 30,
        endTime: 30,
      },
    ]);
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
        ['A', 0, null],
        ['B', 1, null],
        ['C', 2, null],
        [
          'IdleForgetSkippable',
          3,
          { type: 'tracing', category: 'CC', interval: 'start' },
        ],
        [
          'IdleForgetSkippable',
          4,
          { type: 'tracing', category: 'CC', interval: 'end' },
        ],
        [
          'GCMinor',
          5,
          { type: 'GCMinor', startTime: 5, endTime: 5, nursery: any },
        ],
        [
          'GCMajor',
          6,
          { type: 'GCMajor', startTime: 6, endTime: 6, timings: any },
        ],
        [
          'GCSlice',
          7,
          { type: 'GCSlice', startTime: 7, endTime: 7, timings: any },
        ],
      ])
    );
  }

  it('can get memory markers using getMemoryMarkers', function() {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes = selectedThreadSelectors.getMemoryMarkerIndexes(
      getState()
    );
    expect(
      markerIndexes.map(markerIndex => getMarker(markerIndex).name)
    ).toEqual(['IdleForgetSkippable', 'GCMinor', 'GCMajor', 'GCSlice']);
  });

  it('ignores memory markers in getCommittedRangeFilteredMarkersForHeader', function() {
    const { getState } = setup();
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    const markerIndexes = selectedThreadSelectors.getCommittedRangeFilteredMarkerIndexesForHeader(
      getState()
    );
    expect(
      markerIndexes.map(markerIndex => getMarker(markerIndex).name)
    ).toEqual(['A', 'B', 'C']);
  });
});
