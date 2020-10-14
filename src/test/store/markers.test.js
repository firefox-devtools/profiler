/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getUserTiming,
  getProfileWithMarkers,
  getNetworkTrackProfile,
  type TestDefinedMarkers,
  getNetworkMarkers,
} from '../fixtures/profiles/processed-profile';
import { changeTimelineTrackOrganization } from '../../actions/receive-profile';

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
          null,
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
        [
          'IdleForgetSkippable',
          3,
          4,
          { type: 'tracing', category: 'CC', interval: 'end' },
        ],
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
  const browsingContextID = 123123;
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
            interval: 'start',
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
            interval: 'start',
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
            interval: 'start',
            innerWindowID,
          },
        ],
        ['Dummy 5', 40],
      ]
    );
    profile.pages = [
      {
        browsingContextID: browsingContextID,
        innerWindowID: innerWindowID,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeBrowsingContextID: browsingContextID,
    };
    const { getState, dispatch } = storeWithProfile(profile);

    if (ctxId) {
      dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          browsingContextID,
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
  function getMarkerNames(selector): string[] {
    // prettier-ignore
    const profile = getProfileWithMarkers([
      ['no payload',        0, null, null],
      // $FlowExpectError - Invalid payload by our type system.
      ['payload no schema', 0, null, { type: 'no schema marker' }],
      ['RefreshDriverTick', 0, null, { type: 'Text', name: 'RefreshDriverTick' }],
      ['UserTiming',        5, 6,    { type: 'UserTiming', name: 'name', entryType: 'mark' }],
      ...getNetworkMarkers(),
    ]);
    const { getState } = storeWithProfile(profile);
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());
    return selector(getState())
      .map(getMarker)
      .map(marker => marker.name);
  }

  it('filters for getMarkerTableMarkerIndexes', function() {
    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerTableMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'Load 0: https://mozilla.org',
      'UserTiming',
    ]);
  });

  it('filters for getMarkerChartMarkerIndexes', function() {
    expect(
      getMarkerNames(selectedThreadSelectors.getMarkerChartMarkerIndexes)
    ).toEqual([
      'no payload',
      'payload no schema',
      'RefreshDriverTick',
      'UserTiming',
    ]);
  });

  it('filters for getTimelineOverviewMarkerIndexes', function() {
    expect(
      getMarkerNames(selectedThreadSelectors.getTimelineOverviewMarkerIndexes)
    ).toEqual(['RefreshDriverTick']);
  });
});
