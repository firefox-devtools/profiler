/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeDurationStats,
  computeRateStats,
  collectMarkerInfo,
  collectMarkerStack,
  collectThreadMarkers,
  collectThreadNetwork,
} from 'firefox-profiler/profile-query/formatters/marker-info';
import { MarkerMap } from 'firefox-profiler/profile-query/marker-map';
import { ThreadMap } from 'firefox-profiler/profile-query/thread-map';
import { getCategories } from 'firefox-profiler/selectors/profile';
import {
  getProfileWithMarkers,
  getProfileFromTextSamples,
  getNetworkMarkers,
} from '../../fixtures/profiles/processed-profile';
import type { NetworkMarkersOptions } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { INTERVAL } from 'firefox-profiler/app-logic/constants';

import type { Marker } from 'firefox-profiler/types';

function setupWithMarkers(
  markers: Parameters<typeof getProfileWithMarkers>[0]
) {
  const profile = getProfileWithMarkers(markers);
  const store = storeWithProfile(profile);
  const threadMap = new ThreadMap();
  const markerMap = new MarkerMap();
  threadMap.handleForThreadIndex(0);

  function registerMarker(markerIndex: number): string {
    return markerMap.handleForMarker(new Set([0]), markerIndex);
  }

  return { store, threadMap, markerMap, registerMarker };
}

describe('marker-info utility functions', function () {
  describe('computeDurationStats', function () {
    function makeMarker(start: number, end: number | null): Marker {
      return {
        start,
        end,
        name: 'TestMarker',
        category: 0,
        data: null,
        threadId: null,
      };
    }

    it('returns undefined for empty marker list', function () {
      expect(computeDurationStats([])).toBe(undefined);
    });

    it('returns undefined for instant markers only', function () {
      const markers = [
        makeMarker(0, null),
        makeMarker(1, null),
        makeMarker(2, null),
      ];
      expect(computeDurationStats(markers)).toBe(undefined);
    });

    it('computes stats for interval markers', function () {
      const markers = [
        makeMarker(0, 1), // 1ms
        makeMarker(1, 3), // 2ms
        makeMarker(3, 6), // 3ms
        makeMarker(6, 10), // 4ms
        makeMarker(10, 15), // 5ms
      ];

      const stats = computeDurationStats(markers);
      expect(stats).toBeDefined();
      expect(stats!.min).toBe(1);
      expect(stats!.max).toBe(5);
      expect(stats!.avg).toBe(3);
      expect(stats!.median).toBe(3);
      // For 5 items: p95 = floor(5 * 0.95) = floor(4.75) = 4th index (0-based) = 5
      expect(stats!.p95).toBe(5);
      // For 5 items: p99 = floor(5 * 0.99) = floor(4.95) = 4th index (0-based) = 5
      expect(stats!.p99).toBe(5);
    });

    it('handles mixed instant and interval markers', function () {
      const markers = [
        makeMarker(0, null), // instant
        makeMarker(1, 2), // 1ms
        makeMarker(2, null), // instant
        makeMarker(3, 5), // 2ms
      ];

      const stats = computeDurationStats(markers);
      expect(stats).toBeDefined();
      expect(stats!.min).toBe(1);
      expect(stats!.max).toBe(2);
      expect(stats!.avg).toBe(1.5);
    });

    it('computes correct percentiles for larger datasets', function () {
      // Create 100 markers with durations 1-100ms
      const markers = Array.from({ length: 100 }, (_, i) =>
        makeMarker(i * 10, i * 10 + i + 1)
      );

      const stats = computeDurationStats(markers);
      expect(stats).toBeDefined();
      expect(stats!.min).toBe(1);
      expect(stats!.max).toBe(100);
      // Median: floor(100/2) = 50th index (0-based) = value 51
      expect(stats!.median).toBe(51);
      // p95 = floor(100 * 0.95) = 95th index (0-based) = value 96
      expect(stats!.p95).toBe(96);
      // p99 = floor(100 * 0.99) = 99th index (0-based) = value 100
      expect(stats!.p99).toBe(100);
    });
  });

  describe('computeRateStats', function () {
    function makeMarker(start: number, end: number | null): Marker {
      return {
        start,
        end,
        name: 'TestMarker',
        category: 0,
        data: null,
        threadId: null,
      };
    }

    it('handles empty marker list', function () {
      const stats = computeRateStats([]);
      expect(stats.markersPerSecond).toBe(0);
      expect(stats.minGap).toBe(0);
      expect(stats.avgGap).toBe(0);
      expect(stats.maxGap).toBe(0);
    });

    it('handles single marker', function () {
      const stats = computeRateStats([makeMarker(5, 10)]);
      expect(stats.markersPerSecond).toBe(0);
      expect(stats.minGap).toBe(0);
      expect(stats.avgGap).toBe(0);
      expect(stats.maxGap).toBe(0);
    });

    it('computes rate for evenly spaced markers', function () {
      // Markers at 0, 100, 200, 300, 400 (100ms gaps)
      const markers = [
        makeMarker(0, null),
        makeMarker(100, null),
        makeMarker(200, null),
        makeMarker(300, null),
        makeMarker(400, null),
      ];

      const stats = computeRateStats(markers);
      // Time range: 400 - 0 = 400ms = 0.4s
      // 5 markers in 0.4s = 12.5 markers/sec
      expect(stats.markersPerSecond).toBeCloseTo(12.5, 5);
      expect(stats.minGap).toBe(100);
      expect(stats.avgGap).toBe(100);
      expect(stats.maxGap).toBe(100);
    });

    it('computes rate for unevenly spaced markers', function () {
      const markers = [
        makeMarker(0, null),
        makeMarker(10, null), // 10ms gap
        makeMarker(15, null), // 5ms gap
        makeMarker(100, null), // 85ms gap
      ];

      const stats = computeRateStats(markers);
      // Time range: 100 - 0 = 100ms = 0.1s
      // 4 markers in 0.1s = 40 markers/sec
      expect(stats.markersPerSecond).toBeCloseTo(40, 5);
      expect(stats.minGap).toBe(5);
      expect(stats.avgGap).toBeCloseTo((10 + 5 + 85) / 3, 5);
      expect(stats.maxGap).toBe(85);
    });

    it('sorts markers by start time before computing gaps', function () {
      // Provide markers out of order
      const markers = [
        makeMarker(100, null),
        makeMarker(0, null),
        makeMarker(50, null),
      ];

      const stats = computeRateStats(markers);
      // After sorting: 0, 50, 100
      // Gaps: 50, 50
      expect(stats.minGap).toBe(50);
      expect(stats.avgGap).toBe(50);
      expect(stats.maxGap).toBe(50);
    });

    it('handles markers at same timestamp', function () {
      const markers = [
        makeMarker(100, null),
        makeMarker(100, null), // Same timestamp
        makeMarker(200, null),
      ];

      const stats = computeRateStats(markers);
      // Gaps: 0, 100
      expect(stats.minGap).toBe(0);
      expect(stats.avgGap).toBe(50);
      expect(stats.maxGap).toBe(100);
    });
  });

  describe('collectThreadMarkers', function () {
    it('creates nested custom groups for multi-key marker grouping', function () {
      const profile = getProfileWithMarkers([
        [
          'DOMEvent',
          0,
          2,
          { eventType: 'click', latency: 1 } as Record<string, unknown>,
        ],
        [
          'DOMEvent',
          3,
          6,
          { eventType: 'keydown', latency: 2 } as Record<string, unknown>,
        ],
        [
          'DOMEvent',
          7,
          9,
          { eventType: 'click', latency: 3 } as Record<string, unknown>,
        ],
      ]);
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(
        store,
        threadMap,
        markerMap,
        undefined,
        {
          groupBy: 'type,field:eventType',
        }
      );

      expect(result.customGroups).toBeDefined();
      expect(result.customGroups).toHaveLength(1);
      expect(result.customGroups?.[0].groupName).toBe('DOMEvent');
      expect(result.customGroups?.[0].count).toBe(3);
      expect(result.customGroups?.[0].subGroups).toEqual([
        expect.objectContaining({
          groupName: 'click',
          count: 2,
        }),
        expect.objectContaining({
          groupName: 'keydown',
          count: 1,
        }),
      ]);
    });

    it('reports the raw categoryIndex in byCategory (not recovered by name)', function () {
      // Guard against regressions that look up the index via findIndex on
      // the category name, which would both be O(n) and collide if two
      // categories shared a name.
      const profile = getProfileWithMarkers([
        [
          'DOMEvent',
          0,
          2,
          { eventType: 'click', latency: 1 } as Record<string, unknown>,
        ],
      ]);
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(store, threadMap, markerMap);
      expect(result.byCategory).toHaveLength(1);
      const entry = result.byCategory[0];
      expect(typeof entry.categoryIndex).toBe('number');
      expect(entry.categoryIndex).toBeGreaterThanOrEqual(0);
      // categoryName must resolve from the same index it reports.
      const categories = getCategories(store.getState());
      expect(categories[entry.categoryIndex]?.name).toBe(entry.categoryName);
    });

    it('resolves unique-string field values via the string table when grouping', function () {
      // The Log marker schema declares `level` as format: 'unique-string',
      // meaning the raw payload value is a string-table index. Grouping must
      // resolve it back to the interned string (e.g. "Error") rather than
      // returning the numeric index.
      const profile = getProfileWithMarkers([
        [
          'Log',
          0,
          null,
          { type: 'Log', level: 'Error', message: 'a' } as Record<
            string,
            unknown
          >,
        ],
        [
          'Log',
          1,
          null,
          { type: 'Log', level: 'Error', message: 'b' } as Record<
            string,
            unknown
          >,
        ],
        [
          'Log',
          2,
          null,
          { type: 'Log', level: 'Warning', message: 'c' } as Record<
            string,
            unknown
          >,
        ],
      ]);
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(
        store,
        threadMap,
        markerMap,
        undefined,
        { groupBy: 'field:level' }
      );

      expect(result.customGroups).toEqual([
        expect.objectContaining({ groupName: 'Error', count: 2 }),
        expect.objectContaining({ groupName: 'Warning', count: 1 }),
      ]);
    });

    it('auto-groups by a schema-declared enum-like field (schema-driven)', function () {
      // With --auto-group and enough markers of the same name, pick a field
      // from the schema (not ad-hoc Object.keys heuristics) whose format is
      // enum-like (string / unique-string / integer / pid / tid) to sub-group
      // on. DOMEvent's `eventType` is declared `format: 'string'`.
      const eventTypes = [
        'click',
        'mousemove',
        'keydown',
        'focus',
        'blur',
        'input',
      ];
      const profile = getProfileWithMarkers(
        eventTypes.map(
          (eventType, i) =>
            [
              'DOMEvent',
              i,
              i + 1,
              { type: 'DOMEvent', eventType, latency: i } as Record<
                string,
                unknown
              >,
            ] as [string, number, number, Record<string, unknown>]
        )
      );
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(
        store,
        threadMap,
        markerMap,
        undefined,
        { autoGroup: true }
      );

      const domEventStats = result.byType.find(
        (s) => s.markerName === 'DOMEvent'
      );
      expect(domEventStats).toBeDefined();
      expect(domEventStats!.subGroupKey).toBe('eventType');
      // 6 distinct values, so every eventType should show up as its own group.
      const groupNames = domEventStats!.subGroups!.map((g) => g.groupName);
      expect(new Set(groupNames)).toEqual(new Set(eventTypes));
    });

    it('auto-groups on unique-string fields with resolved string values', function () {
      // Log.level is `format: 'unique-string'`; auto-group must resolve the
      // string-table index before scoring cardinality, and the resulting sub-
      // group names must be the interned strings, not integers.
      const levels = ['Error', 'Error', 'Warning', 'Warning', 'Info', 'Debug'];
      const profile = getProfileWithMarkers(
        levels.map(
          (level, i) =>
            [
              'Log',
              i,
              null,
              { type: 'Log', level, message: `m${i}` } as Record<
                string,
                unknown
              >,
            ] as [string, number, null, Record<string, unknown>]
        )
      );
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(
        store,
        threadMap,
        markerMap,
        undefined,
        { autoGroup: true }
      );

      const logStats = result.byType.find((s) => s.markerName === 'Log');
      expect(logStats).toBeDefined();
      expect(logStats!.subGroupKey).toBe('level');
      const groupNames = logStats!.subGroups!.map((g) => g.groupName);
      // Must be interned strings, not integer indices.
      expect(new Set(groupNames)).toEqual(
        new Set(['Error', 'Warning', 'Info', 'Debug'])
      );
    });
  });
});

describe('collectMarkerInfo', function () {
  it('returns structured data with correct fields for an interval marker', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      [
        'DOMEvent',
        10,
        30,
        { type: 'DOMEvent', eventType: 'click', latency: 5 },
      ],
    ]);
    const handle = registerMarker(0);

    const result = collectMarkerInfo(store, markerMap, threadMap, handle);

    expect(result.type).toBe('marker-info');
    expect(result.name).toBe('DOMEvent');
    expect(result.markerType).toBe('DOMEvent');
    expect(result.start).toBe(10);
    expect(result.end).toBe(30);
    expect(result.duration).toBe(20);
    expect(result.fields).toBeDefined();
    const eventTypeField = result.fields!.find((f) => f.key === 'eventType');
    expect(eventTypeField).toBeDefined();
    expect(eventTypeField!.label).toBe('Event Type');
    expect(eventTypeField!.value).toBe('click');
  });

  it('returns undefined duration for instant markers', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      ['DOMEvent', 5, null, { type: 'DOMEvent', eventType: 'scroll' }],
    ]);
    const handle = registerMarker(0);

    const result = collectMarkerInfo(store, markerMap, threadMap, handle);

    expect(result.end).toBeNull();
    expect(result.duration).toBeUndefined();
  });

  it('excludes hidden fields from result', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      [
        'MarkerWithHiddenField',
        0,
        5,
        { type: 'MarkerWithHiddenField', hiddenString: 'secret' },
      ],
    ]);
    const handle = registerMarker(0);

    const result = collectMarkerInfo(store, markerMap, threadMap, handle);

    const hiddenField = result.fields?.find((f) => f.key === 'hiddenString');
    expect(hiddenField).toBeUndefined();
  });
});

describe('collectThreadMarkers topN option', function () {
  it('defaults to 5 top markers per group', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['Phase', 0, 1, { type: 'tracing', interval: 'start' }],
      ['Phase', 1, 2, { type: 'tracing', interval: 'start' }],
      ['Phase', 2, 3, { type: 'tracing', interval: 'start' }],
      ['Phase', 3, 4, { type: 'tracing', interval: 'start' }],
      ['Phase', 4, 5, { type: 'tracing', interval: 'start' }],
      ['Phase', 5, 6, { type: 'tracing', interval: 'start' }],
      ['Phase', 6, 7, { type: 'tracing', interval: 'start' }],
    ]);

    const result = collectThreadMarkers(store, threadMap, markerMap);

    const phaseStats = result.byType.find((s) => s.markerName === 'Phase');
    expect(phaseStats).toBeDefined();
    expect(phaseStats!.count).toBe(7);
    expect(phaseStats!.topMarkers).toHaveLength(5);
  });

  it('respects topN option', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['Phase', 0, 1, { type: 'tracing', interval: 'start' }],
      ['Phase', 1, 2, { type: 'tracing', interval: 'start' }],
      ['Phase', 2, 3, { type: 'tracing', interval: 'start' }],
      ['Phase', 3, 4, { type: 'tracing', interval: 'start' }],
      ['Phase', 4, 5, { type: 'tracing', interval: 'start' }],
      ['Phase', 5, 6, { type: 'tracing', interval: 'start' }],
      ['Phase', 6, 7, { type: 'tracing', interval: 'start' }],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        topN: 10,
      }
    );

    const phaseStats = result.byType.find((s) => s.markerName === 'Phase');
    expect(phaseStats).toBeDefined();
    expect(phaseStats!.count).toBe(7);
    expect(phaseStats!.topMarkers).toHaveLength(7);
  });
});

describe('collectThreadMarkers list option', function () {
  it('returns flatMarkers when list: true', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
      ['DOMEvent', 20, null, { type: 'DOMEvent', eventType: 'keydown' }],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
      }
    );

    expect(result.flatMarkers).toBeDefined();
    expect(result.flatMarkers).toHaveLength(2);
  });

  it('flatMarkers is undefined without list option', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
    ]);

    const result = collectThreadMarkers(store, threadMap, markerMap);

    expect(result.flatMarkers).toBeUndefined();
  });

  it('each flat marker has correct fields', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 5, 15, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
      }
    );

    const m = result.flatMarkers![0];
    expect(m.handle).toMatch(/^m-/);
    expect(m.name).toBe('DOMEvent');
    expect(m.start).toBe(5);
    expect(m.duration).toBe(10);
    expect(m.hasStack).toBe(false);
    expect(m.category).toBeDefined();
  });

  it('instant markers have undefined duration', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 5, null, { type: 'DOMEvent', eventType: 'scroll' }],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
      }
    );

    expect(result.flatMarkers![0].duration).toBeUndefined();
  });

  it('uses schema-derived label separate from name', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
      }
    );

    const m = result.flatMarkers![0];
    expect(m.name).toBe('DOMEvent');
    expect(m.label).toContain('click');
    expect(m.label).not.toBe(m.name);
  });

  it('search filter applies to flat list', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 5, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
      [
        'UserTiming',
        10,
        15,
        { type: 'UserTiming', name: 'myMark', entryType: 'measure' },
      ],
    ]);

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
        searchString: 'DOMEvent',
      }
    );

    expect(result.flatMarkers).toHaveLength(1);
    expect(result.flatMarkers![0].name).toBe('DOMEvent');
  });
});

describe('collectMarkerStack', function () {
  it('returns null stack for a marker without a cause', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      ['DOMEvent', 0, 5, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
    ]);
    const handle = registerMarker(0);

    const result = collectMarkerStack(store, markerMap, threadMap, handle);

    expect(result.type).toBe('marker-stack');
    expect(result.markerName).toBe('DOMEvent');
    expect(result.stack).toBeNull();
  });

  it('returns stack frames for a marker with a cause stack', function () {
    const { profile } = getProfileFromTextSamples(`
      rootFunc
      leafFunc
    `);
    const thread = profile.threads[0];
    const stackIndex = thread.samples.stack[0];

    if (stackIndex === null || stackIndex === undefined) {
      throw new Error('Expected a non-null stack index from text samples');
    }

    const stringTable = StringTable.withBackingArray(
      profile.shared.stringArray
    );
    const markerNameIdx = stringTable.indexForString('TestMarker');
    thread.markers.name.push(markerNameIdx);
    thread.markers.startTime.push(1);
    thread.markers.endTime.push(5);
    thread.markers.phase.push(INTERVAL);
    thread.markers.category.push(0);
    thread.markers.data.push({
      type: 'Text',
      name: 'TestMarker',
      cause: { stack: stackIndex },
    });
    thread.markers.length++;

    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    const markerMap = new MarkerMap();
    threadMap.handleForThreadIndex(0);
    const handle = markerMap.handleForMarker(new Set([0]), 0);

    const result = collectMarkerStack(store, markerMap, threadMap, handle);

    expect(result.stack).not.toBeNull();
    expect(result.stack!.frames.length).toBeGreaterThan(0);
    // Leaf frame first
    expect(result.stack!.frames[0].name).toBe('leafFunc');
  });
});

describe('collectThreadNetwork', function () {
  function setupWithNetworkMarkers(
    options: Array<Partial<NetworkMarkersOptions>>
  ) {
    const markers = options.flatMap((o) => getNetworkMarkers(o));
    const profile = getProfileWithMarkers(markers);
    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);
    return { store, threadMap };
  }

  it('counts only STATUS_STOP markers, ignoring STATUS_START', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/a',
        startTime: 0,
        fetchStart: 1,
        endTime: 5,
      },
      {
        id: 2,
        uri: 'https://example.com/b',
        startTime: 6,
        fetchStart: 7,
        endTime: 10,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.totalRequestCount).toBe(2);
    expect(result.requests).toHaveLength(2);
  });

  it('filters by searchString case-insensitively', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://api.example.com/data',
        startTime: 0,
        fetchStart: 1,
        endTime: 5,
      },
      {
        id: 2,
        uri: 'https://static.example.com/img.png',
        startTime: 6,
        fetchStart: 7,
        endTime: 10,
      },
      {
        id: 3,
        uri: 'https://api.example.com/users',
        startTime: 11,
        fetchStart: 12,
        endTime: 15,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      searchString: 'API',
    });

    expect(result.totalRequestCount).toBe(3);
    expect(result.filteredRequestCount).toBe(2);
    expect(result.requests.every((r) => r.url.includes('api'))).toBe(true);
  });

  it('filters by minDuration', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/fast',
        startTime: 0,
        fetchStart: 0,
        endTime: 1,
      },
      {
        id: 2,
        uri: 'https://example.com/slow',
        startTime: 2,
        fetchStart: 2,
        endTime: 10,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      minDuration: 5,
    });

    expect(result.filteredRequestCount).toBe(1);
    expect(result.requests[0].url).toContain('slow');
  });

  it('filters by maxDuration', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/fast',
        startTime: 0,
        fetchStart: 0,
        endTime: 1,
      },
      {
        id: 2,
        uri: 'https://example.com/slow',
        startTime: 2,
        fetchStart: 2,
        endTime: 10,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      maxDuration: 5,
    });

    expect(result.filteredRequestCount).toBe(1);
    expect(result.requests[0].url).toContain('fast');
  });

  it('limit restricts the requests list but summary stats cover all filtered results', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/a',
        startTime: 0,
        fetchStart: 0,
        endTime: 5,
      },
      {
        id: 2,
        uri: 'https://example.com/b',
        startTime: 6,
        fetchStart: 6,
        endTime: 11,
      },
      {
        id: 3,
        uri: 'https://example.com/c',
        startTime: 12,
        fetchStart: 12,
        endTime: 17,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      limit: 2,
    });

    expect(result.filteredRequestCount).toBe(3);
    expect(result.requests).toHaveLength(2);
    // All 3 counted in summary, not just the 2 returned
    expect(result.summary.cacheUnknown).toBe(3);
  });

  it('limit 0 means no limit — all requests are returned', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 0, endTime: 5 },
      { id: 2, startTime: 6, fetchStart: 6, endTime: 11 },
      { id: 3, startTime: 12, fetchStart: 12, endTime: 17 },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      limit: 0,
    });

    expect(result.requests).toHaveLength(3);
  });

  it('accumulates cache stats correctly', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 1,
        payload: { cache: 'Hit' },
      },
      {
        id: 2,
        startTime: 2,
        fetchStart: 2,
        endTime: 3,
        payload: { cache: 'MemoryHit' },
      },
      {
        id: 3,
        startTime: 4,
        fetchStart: 4,
        endTime: 5,
        payload: { cache: 'Prefetched' },
      },
      {
        id: 4,
        startTime: 6,
        fetchStart: 6,
        endTime: 7,
        payload: { cache: 'Miss' },
      },
      {
        id: 5,
        startTime: 8,
        fetchStart: 8,
        endTime: 9,
        payload: { cache: 'DiskStorage' },
      },
      { id: 6, startTime: 10, fetchStart: 10, endTime: 11 },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.summary.cacheHit).toBe(3);
    expect(result.summary.cacheMiss).toBe(2);
    expect(result.summary.cacheUnknown).toBe(1);
  });

  it('extracts phase timings per request', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 100,
        payload: {
          domainLookupStart: 0,
          domainLookupEnd: 5,
          connectStart: 5,
          tcpConnectEnd: 15,
          requestStart: 20,
          responseStart: 50,
          responseEnd: 80,
        },
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);
    const phases = result.requests[0].phases;

    expect(phases.dns).toBe(5);
    expect(phases.tcp).toBe(10);
    expect(phases.ttfb).toBe(30);
    expect(phases.download).toBe(30);
    expect(phases.mainThread).toBe(20);
    expect(phases.tls).toBeUndefined();
  });

  it('extracts TLS phase only when secureConnectionStart > 0', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 50,
        payload: {
          connectStart: 5,
          tcpConnectEnd: 10,
          secureConnectionStart: 10,
          connectEnd: 18,
        },
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.requests[0].phases.tls).toBe(8);
  });

  it('skips TLS phase when secureConnectionStart is 0', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 50,
        payload: {
          secureConnectionStart: 0,
          connectEnd: 10,
        },
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.requests[0].phases.tls).toBeUndefined();
  });

  it('accumulates phase totals in summary across all filtered requests', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        startTime: 0,
        fetchStart: 0,
        endTime: 20,
        payload: { requestStart: 0, responseStart: 8 },
      },
      {
        id: 2,
        startTime: 21,
        fetchStart: 21,
        endTime: 41,
        payload: { requestStart: 21, responseStart: 33 },
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.summary.phaseTotals.ttfb).toBe(20);
  });

  it('sets filters field only when at least one filter is applied', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 0, endTime: 5 },
    ]);

    const noFilters = collectThreadNetwork(store, threadMap);
    const withFilter = collectThreadNetwork(store, threadMap, undefined, {
      searchString: 'example',
    });

    expect(noFilters.filters).toBeUndefined();
    expect(withFilter.filters).toBeDefined();
    expect(withFilter.filters?.searchString).toBe('example');
  });

  it('returns zero requests when no markers match filters', function () {
    const { store, threadMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/',
        startTime: 0,
        fetchStart: 0,
        endTime: 5,
      },
    ]);

    const result = collectThreadNetwork(store, threadMap, undefined, {
      searchString: 'no-match-here',
    });

    expect(result.totalRequestCount).toBe(1);
    expect(result.filteredRequestCount).toBe(0);
    expect(result.requests).toHaveLength(0);
  });

  it('returns correct duration on each request entry', function () {
    // The merged marker sets data.startTime to the START marker's table time
    // (0), so total duration = endTime - startTime = 25 - 0 = 25.
    const { store, threadMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 5, endTime: 25 },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.requests[0].duration).toBe(25);
  });
});
