/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  intervalUnionMs,
  peakConcurrency,
  classifyCache,
  computeThreadNetworkSummary,
  computeProfileNetworkSummary,
} from 'firefox-profiler/profile-query/network-summary';
import { MarkerMap } from 'firefox-profiler/profile-query/marker-map';
import { ThreadMap } from 'firefox-profiler/profile-query/thread-map';
import {
  getProfileWithMarkers,
  getNetworkMarkers,
} from '../../fixtures/profiles/processed-profile';
import type {
  NetworkMarkersOptions,
  TestDefinedMarker,
} from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import { commitRange } from 'firefox-profiler/actions/profile-view';

// A START-only network marker: no matching STOP, so derivation leaves it
// "incomplete" (in flight when the recording stopped).
function incompleteNetworkMarker(
  id: number,
  uri: string,
  startTime: number,
  fetchStart: number
): TestDefinedMarker {
  return [
    `Load ${id}: ${uri}`,
    startTime,
    fetchStart,
    {
      type: 'Network',
      id,
      startTime,
      endTime: fetchStart,
      pri: 0,
      status: 'STATUS_START',
      URI: uri,
    },
  ];
}

// A STOP-only network marker: no matching START, so its START predates the
// recording. Derivation flags it incomplete, but it DID complete.
function completedBeforeRecordingMarker(
  id: number,
  uri: string,
  endTime: number
): TestDefinedMarker {
  return [
    `Load ${id}: ${uri}`,
    0,
    endTime,
    {
      type: 'Network',
      id,
      startTime: 0,
      endTime,
      pri: 0,
      status: 'STATUS_STOP',
      URI: uri,
      responseStatus: 200,
      contentType: 'text/html',
    },
  ];
}

describe('interval helpers', function () {
  describe('intervalUnionMs', function () {
    it('returns 0 for no intervals', function () {
      expect(intervalUnionMs([])).toBe(0);
    });

    it('sums disjoint intervals', function () {
      expect(
        intervalUnionMs([
          [0, 10],
          [20, 25],
        ])
      ).toBe(15);
    });

    it('merges overlapping intervals', function () {
      expect(
        intervalUnionMs([
          [0, 10],
          [5, 20],
        ])
      ).toBe(20);
    });

    it('absorbs nested intervals', function () {
      expect(
        intervalUnionMs([
          [0, 100],
          [10, 20],
          [30, 40],
        ])
      ).toBe(100);
    });

    it('handles unsorted input', function () {
      expect(
        intervalUnionMs([
          [30, 40],
          [0, 10],
          [5, 12],
        ])
      ).toBe(22);
    });
  });

  describe('peakConcurrency', function () {
    it('returns 0 for no intervals', function () {
      expect(peakConcurrency([])).toBe(0);
    });

    it('counts the maximum overlap', function () {
      expect(
        peakConcurrency([
          [0, 10],
          [2, 8],
          [4, 6],
        ])
      ).toBe(3);
    });

    it('does not double-count touching intervals', function () {
      expect(
        peakConcurrency([
          [0, 10],
          [10, 20],
        ])
      ).toBe(1);
    });

    it('is 1 for a single interval', function () {
      expect(peakConcurrency([[0, 100]])).toBe(1);
    });
  });

  describe('classifyCache', function () {
    it('classifies hits', function () {
      expect(classifyCache('Hit')).toBe('hit');
      expect(classifyCache('HitViaReval')).toBe('hit');
    });

    it('classifies misses', function () {
      expect(classifyCache('Missed')).toBe('miss');
      expect(classifyCache('MissedViaReval')).toBe('miss');
    });

    it('classifies unresolved and everything else as unknown', function () {
      expect(classifyCache('Unresolved')).toBe('unknown');
      expect(classifyCache(undefined)).toBe('unknown');
      expect(classifyCache('Whatever')).toBe('unknown');
    });
  });
});

describe('computeThreadNetworkSummary', function () {
  function setup(options: Array<Partial<NetworkMarkersOptions>>) {
    const markers = options.flatMap((o) => getNetworkMarkers(o));
    return setupRaw(markers);
  }

  function setupRaw(markers: TestDefinedMarker[]) {
    const profile = getProfileWithMarkers(markers);
    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);
    const markerMap = new MarkerMap();
    return { store, threadMap, markerMap };
  }

  it('returns null when the thread has no network markers', function () {
    const profile = getProfileWithMarkers([['SomeMarker', 0, 1, null]]);
    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);
    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      new MarkerMap(),
      threadMap
    );
    expect(summary).toBeNull();
  });

  it('counts completed requests and computes in-flight union', function () {
    const { store, threadMap, markerMap } = setup([
      {
        id: 1,
        uri: 'https://a.com/x',
        startTime: 0,
        fetchStart: 0,
        endTime: 10,
      },
      {
        id: 2,
        uri: 'https://b.com/y',
        startTime: 5,
        fetchStart: 5,
        endTime: 20,
      },
    ]);

    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      markerMap,
      threadMap
    );

    expect(summary).not.toBeNull();
    expect(summary!.requestCount).toBe(2);
    expect(summary!.incompleteCount).toBe(0);
    // union of [0,10] and [5,20] = 20
    expect(summary!.inFlightMs).toBe(20);
    expect(summary!.peakConcurrency).toBe(2);
  });

  it('counts incomplete (in flight) requests separately', function () {
    const { store, threadMap, markerMap } = setupRaw([
      ...getNetworkMarkers({
        id: 1,
        uri: 'https://a.com/x',
        startTime: 0,
        fetchStart: 0,
        endTime: 10,
      }),
      incompleteNetworkMarker(2, 'https://b.com/stream', 2, 3),
    ]);

    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      markerMap,
      threadMap
    );

    expect(summary!.requestCount).toBe(1);
    expect(summary!.incompleteCount).toBe(1);
  });

  it('counts a request that started before the recording as completed', function () {
    const { store, threadMap, markerMap } = setupRaw([
      completedBeforeRecordingMarker(1, 'https://a.com/early', 10),
    ]);

    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      markerMap,
      threadMap
    );

    expect(summary!.requestCount).toBe(1);
    expect(summary!.incompleteCount).toBe(0);
    expect(summary!.slowest[0].incomplete).toBe(false);
    expect(summary!.slowest[0].startedBeforeRecording).toBe(true);
    expect(summary!.slowest[0].status).toBe('STATUS_STOP');
  });

  it('counts HTTP errors and classifies cache', function () {
    const { store, threadMap, markerMap } = setup([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 5,
        payload: { responseStatus: 200, cache: 'Hit' },
      },
      {
        id: 2,
        startTime: 6,
        fetchStart: 6,
        endTime: 10,
        payload: { responseStatus: 404, cache: 'Missed' },
      },
    ]);

    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      markerMap,
      threadMap
    );

    expect(summary!.errorCount).toBe(1);
    expect(summary!.cacheHit).toBe(1);
    expect(summary!.cacheMiss).toBe(1);
  });

  it('clamps in-flight time to the committed zoom range', function () {
    const { store, threadMap, markerMap } = setup([
      {
        id: 1,
        uri: 'https://a.com/x',
        startTime: 0,
        fetchStart: 0,
        endTime: 100,
      },
    ]);

    const zeroAt = getProfileRootRange(store.getState()).start;
    // Zoom to absolute [20, 50] -> clamped in-flight = 30.
    store.dispatch(commitRange(20 - zeroAt, 50 - zeroAt));

    const summary = computeThreadNetworkSummary(
      store,
      new Set([0]),
      markerMap,
      threadMap
    );

    expect(summary!.inFlightMs).toBe(30);
  });
});

describe('computeProfileNetworkSummary', function () {
  function setupTwoThreads() {
    // Parent-process copy (no innerWindowID) and content-process copy (with
    // innerWindowID) of the same channel id: should dedupe to one request.
    const parentMarkers = getNetworkMarkers({
      id: 1,
      uri: 'https://docs.google.com/bind',
      startTime: 0,
      fetchStart: 0,
      endTime: 50,
    });
    const contentMarkers = getNetworkMarkers({
      id: 1,
      uri: 'https://docs.google.com/bind',
      startTime: 0,
      fetchStart: 0,
      endTime: 50,
      payload: { innerWindowID: 7 },
    });
    const profile = getProfileWithMarkers(parentMarkers, contentMarkers);
    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);
    threadMap.handleForThreadIndex(1);
    const markerMap = new MarkerMap();
    return { store, threadMap, markerMap };
  }

  it('returns null when no thread has network markers', function () {
    const profile = getProfileWithMarkers(
      [['SomeMarker', 0, 1, null]],
      [['Other', 0, 1, null]]
    );
    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);
    threadMap.handleForThreadIndex(1);
    const summary = computeProfileNetworkSummary(
      store,
      threadMap,
      new MarkerMap()
    );
    expect(summary).toBeNull();
  });

  it('dedupes the same channel id across processes for the headline count', function () {
    const { store, threadMap, markerMap } = setupTwoThreads();

    const summary = computeProfileNetworkSummary(store, threadMap, markerMap);

    expect(summary).not.toBeNull();
    // Two raw copies, one deduped request.
    expect(summary!.requestCount).toBe(1);
    // But both threads keep their own counts in the breakdown.
    expect(summary!.byThread).toHaveLength(2);
    expect(summary!.byThread.every((t) => t.requestCount === 1)).toBe(true);
  });

  it('prefers the content-process copy (page attribution) in slowest', function () {
    const { store, threadMap, markerMap } = setupTwoThreads();

    const summary = computeProfileNetworkSummary(store, threadMap, markerMap);

    // The content copy is on thread index 1 -> handle t-1.
    expect(summary!.slowest).toHaveLength(1);
    expect(summary!.slowest[0].threadHandle).toBe('t-1');
  });
});
