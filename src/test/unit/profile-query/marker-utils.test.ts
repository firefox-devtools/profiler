/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeDurationStats,
  computeRateStats,
  collectMarkerInfo,
  collectMarkerStack,
  collectProfileLogs,
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
import type {
  NetworkMarkersOptions,
  TestDefinedMarker,
} from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { getRawMarkerTableBuilderFromExisting } from 'firefox-profiler/profile-logic/data-structures';
import { INSTANT, INTERVAL } from 'firefox-profiler/app-logic/constants';

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

    it('handles more markers than fit in a spread call', function () {
      // The gap statistics used to be computed with Math.min(...gaps) /
      // Math.max(...gaps), which throws "Maximum call stack size exceeded"
      // above roughly 100k elements. The parent process main thread of a long
      // profile easily has that many markers with the same name.
      const count = 300000;
      const markers = Array.from({ length: count }, (_, i) =>
        makeMarker(i * 2, null)
      );
      // Make one gap smaller and one larger than the uniform 2ms gap.
      markers[1] = makeMarker(1, null);
      markers[count - 1] = makeMarker((count - 2) * 2 + 10, null);

      const stats = computeRateStats(markers);
      expect(stats.minGap).toBe(1);
      expect(stats.maxGap).toBe(10);
      expect(stats.avgGap).toBeCloseTo(
        ((count - 2) * 2 + 10) / (count - 1),
        10
      );
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

    it('aggregates a thread with more markers than fit in a spread call', function () {
      // Regression test: `thread markers` on the parent process main thread of
      // a long profile used to fail with "Maximum call stack size exceeded"
      // because the per-name gap statistics were computed by spreading the gap
      // array into Math.min/Math.max.
      const count = 150000;
      const markers: TestDefinedMarker[] = Array.from(
        { length: count },
        (_, i) => ['NotifyObservers', i * 2, i * 2 + 1] as TestDefinedMarker
      );
      const profile = getProfileWithMarkers(markers);
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      const result = collectThreadMarkers(store, threadMap, markerMap);
      expect(result.totalMarkerCount).toBe(count);
      expect(result.byType).toHaveLength(1);
      expect(result.byType[0].markerName).toBe('NotifyObservers');
      expect(result.byType[0].count).toBe(count);
      expect(result.byType[0].rateStats?.minGap).toBe(2);
      expect(result.byType[0].rateStats?.maxGap).toBe(2);
    });

    it('reports an unknown thread handle as-is', function () {
      const profile = getProfileWithMarkers([['A', 0, 1]]);
      const store = storeWithProfile(profile);
      const threadMap = new ThreadMap();
      const markerMap = new MarkerMap();

      expect(() =>
        collectThreadMarkers(store, threadMap, markerMap, 't-999')
      ).toThrow(/^Unknown thread t-999$/);
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
    // `zeroAt` is the first marker at 10ms, so this one starts at 0.
    expect(result.start).toBe(0);
    expect(result.end).toBe(20);
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
    // Relative to the profile start, which is the only marker's start (5ms).
    expect(m.start).toBe(0);
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

  it('includes schema fields and raw payload data per marker', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      [
        'DOMEvent',
        0,
        10,
        {
          type: 'DOMEvent',
          eventType: 'keydown',
          latency: 5,
          innerWindowID: 1234,
        },
      ],
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
    expect(m.markerType).toBe('DOMEvent');

    // `fields` carries both the raw value (comparable/matchable) and the
    // schema-formatted rendering, exactly like `marker info --json`.
    const eventType = m.fields!.find((f) => f.key === 'eventType');
    expect(eventType).toEqual({
      key: 'eventType',
      label: expect.any(String),
      value: 'keydown',
      formattedValue: 'keydown',
    });
    const latency = m.fields!.find((f) => f.key === 'latency');
    expect(latency!.value).toBe(5);
    expect(typeof latency!.formattedValue).toBe('string');

    // `data` is the raw payload, and `innerWindowID` is surfaced at the top
    // level because it correlates a marker to a specific document load.
    expect(m.data).toMatchObject({
      eventType: 'keydown',
      latency: 5,
      innerWindowID: 1234,
    });
    expect(m.innerWindowID).toBe(1234);
    // `type` is reported as `markerType` instead.
    expect(m.data).not.toHaveProperty('type');
  });

  it('reports the same field values as marker info for the same marker', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 3 }],
    ]);
    const handle = registerMarker(0);

    const listed = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        list: true,
      }
    );
    const info = collectMarkerInfo(store, markerMap, threadMap, handle);

    expect(listed.flatMarkers![0].fields).toEqual(info.fields);
  });

  it('omits `cause` from data but still reports hasStack', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      [
        'DOMEvent',
        0,
        10,
        {
          type: 'DOMEvent',
          eventType: 'click',
          latency: 1,
          cause: { time: 1, stack: 0 },
        },
      ],
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
    expect(m.hasStack).toBe(true);
    expect(m.data).not.toHaveProperty('cause');
  });

  it('leaves fields/data/innerWindowID absent for markers with no payload beyond `type`', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['NoPayload', 0, 10],
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
    expect(m.fields).toBeUndefined();
    expect(m.data).toBeUndefined();
    expect(m.innerWindowID).toBeUndefined();
  });

  /**
   * Build a profile with one CompositorScreenshot marker whose `url` is a real
   * index into the string table, rather than an already-resolved string.
   *
   * `getProfileWithMarkers` stores payload values verbatim, so passing a string
   * for `url` would not exercise the string-table resolution at all.
   */
  function setupWithScreenshotMarker(url: string) {
    const { profile } = getProfileFromTextSamples('someFunc');
    const thread = profile.threads[0];
    const stringTable = StringTable.withBackingArray(
      profile.shared.stringArray
    );
    const urlIdx = stringTable.indexForString(url);
    const markerNameIdx = stringTable.indexForString('CompositorScreenshot');
    const markers = getRawMarkerTableBuilderFromExisting(thread.markers);
    thread.markers = markers;
    markers.name.push(markerNameIdx);
    markers.startTime.push(1);
    markers.endTime.push(null);
    markers.phase.push(INSTANT);
    markers.category.push(0);
    markers.data.push({
      type: 'CompositorScreenshot',
      url: urlIdx,
      windowID: '0x1',
      windowWidth: 1280,
      windowHeight: 951,
    });
    markers.length++;

    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    const markerMap = new MarkerMap();
    threadMap.handleForThreadIndex(0);
    return { store, threadMap, markerMap, urlIdx };
  }

  it('resolves string-table indexes in data to their strings', function () {
    // CompositorScreenshot's `url` holds an index into the string table. A bare
    // index would be useless to a caller that only sees the JSON output.
    // `url` is also an elided field, so resolution is observed through the
    // stub's `preview`/`length`, which are computed from the resolved string --
    // an unresolved index would be a number and never reach either.
    const url = 'data:image/jpeg;base64,AAAA';
    const { store, threadMap, markerMap, urlIdx } =
      setupWithScreenshotMarker(url);

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
    // Guard against the fixture silently storing a string: if `url` were not an
    // index, resolution would be a no-op and this test would prove nothing.
    expect(typeof urlIdx).toBe('number');
    expect(m.data!.url).toEqual({
      elided: true,
      length: url.length,
      preview: url,
    });
    expect(m.data!.windowWidth).toBe(1280);
  });

  it('elides screenshot image blobs from data but keeps the key', function () {
    // Screenshot data URLs run from ~2.8KB to tens of KB each. Inlining them on
    // every row of a --list response is what turns a 27KB payload into 940KB.
    // Note the length here is well under any plausible length cap: the field is
    // elided by identity, not by size.
    const url = `data:image/jpeg;base64,${'A'.repeat(600)}`;
    const { store, threadMap, markerMap } = setupWithScreenshotMarker(url);

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
    expect(m.data!.url).toEqual({
      elided: true,
      length: url.length,
      preview: url.slice(0, 64),
    });
    // The small fields next to it must survive: for this marker type there is
    // no schema, so `data` is the only route to the window dimensions.
    expect(m.fields).toBeUndefined();
    expect(m.data!.windowWidth).toBe(1280);
    expect(m.data!.windowHeight).toBe(951);
    // The whole row must stay small.
    expect(JSON.stringify(m).length).toBeLessThan(1000);
  });

  it('keeps long values of fields that are not image blobs', function () {
    // A real profile had a 2939-char `prefValue` only 84 chars away from a
    // 2855-char screenshot data URL, so a length-based cap would either keep
    // the blobs or drop this. Eliding by field identity keeps it.
    const prefValue = 'x'.repeat(5000);
    const { store, threadMap, markerMap } = setupWithMarkers([
      [
        'Preference Read',
        0,
        null,
        {
          type: 'PreferenceRead',
          prefName: 'some.long.pref',
          prefKind: 'User',
          prefType: 'String',
          prefValue,
        },
      ],
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

    expect(result.flatMarkers![0].data!.prefValue).toBe(prefValue);
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
    const markers = getRawMarkerTableBuilderFromExisting(thread.markers);
    thread.markers = markers;
    markers.name.push(markerNameIdx);
    markers.startTime.push(1);
    markers.endTime.push(5);
    markers.phase.push(INTERVAL);
    markers.category.push(0);
    markers.data.push({
      type: 'Text',
      name: 'TestMarker',
      cause: { stack: stackIndex },
    });
    markers.length++;

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

// Marker times are ms since the profile start (`zeroAt`), never raw timestamps.
describe('marker time base', function () {
  // The earliest marker sits here, so `zeroAt` is 1000: reported times are
  // 1000ms below the raw ones.
  const ZERO_AT = 1000;

  function setup() {
    return setupWithMarkers([
      ['Anchor', ZERO_AT, null, { type: 'Text', name: 'Anchor' }],
      [
        'DOMEvent',
        ZERO_AT + 500,
        ZERO_AT + 520,
        { type: 'DOMEvent', eventType: 'keydown', latency: 1 },
      ],
    ]);
  }

  it('reports flatMarkers start relative to the profile start', function () {
    const { store, threadMap, markerMap } = setup();

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      { list: true }
    );

    const starts = result.flatMarkers!.map((m) => m.start);
    expect(starts).toEqual([0, 500]);
  });

  it('reports topMarkers start relative to the profile start', function () {
    const { store, threadMap, markerMap } = setup();

    const result = collectThreadMarkers(store, threadMap, markerMap);

    const domEvent = result.byType.find((s) => s.markerName === 'DOMEvent');
    expect(domEvent!.topMarkers[0].start).toBe(500);
  });

  it('reports grouped topMarkers start relative to the profile start', function () {
    const { store, threadMap, markerMap } = setup();

    const result = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      { groupBy: 'name' }
    );

    const domEvent = result.customGroups!.find(
      (g) => g.groupName === 'DOMEvent'
    );
    expect(domEvent!.topMarkers[0].start).toBe(500);
  });

  it('reports markerInfo start and end relative to the profile start', function () {
    const { store, threadMap, markerMap, registerMarker } = setup();
    const handle = registerMarker(1);

    const result = collectMarkerInfo(store, markerMap, threadMap, handle);

    expect(result.start).toBe(500);
    expect(result.end).toBe(520);
    // The duration is a difference, so the time base cancels out.
    expect(result.duration).toBe(20);
  });

  it('reports the flat list and markerInfo on the same time base', function () {
    const { store, threadMap, markerMap, registerMarker } = setup();
    const handle = registerMarker(1);

    const listResult = collectThreadMarkers(
      store,
      threadMap,
      markerMap,
      undefined,
      { list: true }
    );
    const infoResult = collectMarkerInfo(store, markerMap, threadMap, handle);

    const listed = listResult.flatMarkers!.find((m) => m.handle === handle);
    expect(listed!.start).toBe(infoResult.start);
    // Both paths read the same `zeroAt`, so agreement alone would pass even
    // unrebased. Pin the value too.
    expect(listed!.start).toBe(500);
  });

  it('reports the stack capturedAt relative to the profile start', function () {
    const { profile } = getProfileFromTextSamples(`
      rootFunc
      leafFunc
    `);
    const thread = profile.threads[0];
    const stackIndex = thread.samples.stack[0];

    if (stackIndex === null || stackIndex === undefined) {
      throw new Error('Expected a non-null stack index from text samples');
    }

    // Without this the profile starts at 0 and the two bases coincide.
    const { time } = thread.samples;
    if (time === undefined) {
      throw new Error('Expected the text-sample thread to have sample times');
    }
    thread.samples.time = time.map((t) => t + ZERO_AT);

    const stringTable = StringTable.withBackingArray(
      profile.shared.stringArray
    );
    const markerNameIdx = stringTable.indexForString('TestMarker');
    const markers = getRawMarkerTableBuilderFromExisting(thread.markers);
    thread.markers = markers;
    markers.name.push(markerNameIdx);
    markers.startTime.push(ZERO_AT + 30);
    markers.endTime.push(ZERO_AT + 50);
    markers.phase.push(INTERVAL);
    markers.category.push(0);
    markers.data.push({
      type: 'Text',
      name: 'TestMarker',
      cause: { stack: stackIndex, time: ZERO_AT + 30 },
    });
    markers.length++;

    const store = storeWithProfile(profile);
    const threadMap = new ThreadMap();
    const markerMap = new MarkerMap();
    threadMap.handleForThreadIndex(0);
    const handle = markerMap.handleForMarker(new Set([0]), 0);

    const stackResult = collectMarkerStack(store, markerMap, threadMap, handle);
    const infoResult = collectMarkerInfo(store, markerMap, threadMap, handle);

    expect(stackResult.stack!.capturedAt).toBe(30);
    expect(infoResult.start).toBe(30);
    expect(infoResult.stack!.capturedAt).toBe(30);
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
    const markerMap = new MarkerMap();
    return { store, threadMap, markerMap };
  }

  it('counts only STATUS_STOP markers, ignoring STATUS_START', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.totalRequestCount).toBe(2);
    expect(result.requests).toHaveLength(2);
  });

  it('counts a request that started before the recording as completed', function () {
    // A lone STOP marker (no matching START): the request completed during the
    // recording but started before it, so derivation flags it incomplete even
    // though it did finish. It must count as completed, not in flight.
    const stopOnly: TestDefinedMarker = [
      'Load 1: https://example.com/early',
      0,
      10,
      {
        type: 'Network',
        id: 1,
        startTime: 0,
        endTime: 10,
        pri: 0,
        status: 'STATUS_STOP',
        URI: 'https://example.com/early',
        responseStatus: 200,
        contentType: 'text/html',
      },
    ];
    const store = storeWithProfile(getProfileWithMarkers([stopOnly]));
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);

    const result = collectThreadNetwork(store, threadMap, new MarkerMap());

    expect(result.totalRequestCount).toBe(1);
    expect(result.incompleteCount).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].incomplete).toBe(false);
    expect(result.requests[0].startedBeforeRecording).toBe(true);
    expect(result.requests[0].httpStatus).toBe(200);
  });

  it('lists a redirect leg but does not count it as a completed request', function () {
    // A redirect chain: the original channel (id 1) starts then redirects to a
    // new channel (id 2) that completes. Gecko emits START(1) -> REDIRECT(1)
    // and START(2) -> STOP(2), which derive to two separate markers.
    const start1: TestDefinedMarker = [
      'Load 1: https://example.com/from',
      0,
      1,
      {
        type: 'Network',
        id: 1,
        startTime: 0,
        endTime: 1,
        pri: 0,
        status: 'STATUS_START',
        URI: 'https://example.com/from',
      },
    ];
    const redirect1: TestDefinedMarker = [
      'Load 1: https://example.com/from',
      1,
      5,
      {
        type: 'Network',
        id: 1,
        startTime: 1,
        endTime: 5,
        pri: 0,
        status: 'STATUS_REDIRECT',
        URI: 'https://example.com/from',
        RedirectURI: 'https://example.com/to',
        redirectId: 2,
      },
    ];
    const store = storeWithProfile(
      getProfileWithMarkers([
        start1,
        redirect1,
        ...getNetworkMarkers({
          id: 2,
          uri: 'https://example.com/to',
          startTime: 5,
          fetchStart: 6,
          endTime: 20,
        }),
      ])
    );
    const threadMap = new ThreadMap();
    threadMap.handleForThreadIndex(0);

    const result = collectThreadNetwork(store, threadMap, new MarkerMap());

    // Only the final STOP leg counts as a completed request.
    expect(result.totalRequestCount).toBe(1);
    expect(result.incompleteCount).toBe(0);
    // But both legs are listed, so the redirect is visible for drill-down.
    expect(result.requests).toHaveLength(2);
    const redirectLeg = result.requests.find(
      (r) => r.status === 'STATUS_REDIRECT'
    );
    expect(redirectLeg).toBeDefined();
    expect(redirectLeg!.url).toBe('https://example.com/from');
  });

  it('filters by searchString case-insensitively', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        searchString: 'API',
      }
    );

    expect(result.totalRequestCount).toBe(3);
    expect(result.filteredRequestCount).toBe(2);
    expect(result.requests.every((r) => r.url.includes('api'))).toBe(true);
  });

  it('filters by minDuration', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        minDuration: 5,
      }
    );

    expect(result.filteredRequestCount).toBe(1);
    expect(result.requests[0].url).toContain('slow');
  });

  it('filters by maxDuration', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        maxDuration: 5,
      }
    );

    expect(result.filteredRequestCount).toBe(1);
    expect(result.requests[0].url).toContain('fast');
  });

  it('limit restricts the requests list but summary stats cover all filtered results', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        limit: 2,
      }
    );

    expect(result.filteredRequestCount).toBe(3);
    expect(result.requests).toHaveLength(2);
    // All 3 counted in summary, not just the 2 returned
    expect(result.summary.cacheUnknown).toBe(3);
  });

  it('limit 0 means no limit — all requests are returned', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 0, endTime: 5 },
      { id: 2, startTime: 6, fetchStart: 6, endTime: 11 },
      { id: 3, startTime: 12, fetchStart: 12, endTime: 17 },
    ]);

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        limit: 0,
      }
    );

    expect(result.requests).toHaveLength(3);
  });

  it('accumulates cache stats correctly', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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
        payload: { cache: 'HitViaReval' },
      },
      {
        id: 3,
        startTime: 4,
        fetchStart: 4,
        endTime: 5,
        payload: { cache: 'Missed' },
      },
      {
        id: 4,
        startTime: 6,
        fetchStart: 6,
        endTime: 7,
        payload: { cache: 'MissedViaReval' },
      },
      {
        id: 5,
        startTime: 8,
        fetchStart: 8,
        endTime: 9,
        payload: { cache: 'Unresolved' },
      },
      { id: 6, startTime: 10, fetchStart: 10, endTime: 11 },
    ]);

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.summary.cacheHit).toBe(2);
    expect(result.summary.cacheMiss).toBe(2);
    expect(result.summary.cacheUnknown).toBe(2);
  });

  it('extracts phase timings per request', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(store, threadMap, markerMap);
    const phases = result.requests[0].phases;

    expect(phases.dns).toBe(5);
    expect(phases.tcp).toBe(10);
    expect(phases.ttfb).toBe(30);
    expect(phases.download).toBe(30);
    expect(phases.mainThread).toBe(20);
    expect(phases.tls).toBeUndefined();
  });

  it('extracts TLS phase only when secureConnectionStart > 0', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.requests[0].phases.tls).toBe(8);
  });

  it('skips TLS phase when secureConnectionStart is 0', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.requests[0].phases.tls).toBeUndefined();
  });

  it('accumulates phase totals in summary across all filtered requests', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
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

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.summary.phaseTotals.ttfb).toBe(20);
  });

  it('sets filters field only when at least one filter is applied', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 0, endTime: 5 },
    ]);

    const noFilters = collectThreadNetwork(store, threadMap, markerMap);
    const withFilter = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        searchString: 'example',
      }
    );

    expect(noFilters.filters).toBeUndefined();
    expect(withFilter.filters).toBeDefined();
    expect(withFilter.filters?.searchString).toBe('example');
  });

  it('returns zero requests when no markers match filters', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
      {
        id: 1,
        uri: 'https://example.com/',
        startTime: 0,
        fetchStart: 0,
        endTime: 5,
      },
    ]);

    const result = collectThreadNetwork(
      store,
      threadMap,
      markerMap,
      undefined,
      {
        searchString: 'no-match-here',
      }
    );

    expect(result.totalRequestCount).toBe(1);
    expect(result.filteredRequestCount).toBe(0);
    expect(result.requests).toHaveLength(0);
  });

  it('returns correct duration on each request entry', function () {
    // The merged marker sets data.startTime to the START marker's table time
    // (0), so total duration = endTime - startTime = 25 - 0 = 25.
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 5, endTime: 25 },
    ]);

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.requests[0].duration).toBe(25);
  });

  it('assigns a marker handle to each request entry', function () {
    const { store, threadMap, markerMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 0, endTime: 5 },
    ]);

    const result = collectThreadNetwork(store, threadMap, markerMap);

    expect(result.requests[0].markerHandle).toBe('m-1');
  });
});

describe('collectProfileLogs', function () {
  it('filters on the text of a message held as a string table index', function () {
    // The fixtures intern `level` and `message`, so these payloads hold string
    // table indexes like the ones Firefox emits now. The search filter runs
    // against the message, so it has to be resolved first.
    const { store, threadMap } = setupWithMarkers([
      [
        'nsHttp',
        170,
        null,
        { type: 'Log', level: 'Error', message: 'ParentChannelListener' },
      ],
      [
        'nsJarProtocol',
        190,
        null,
        { type: 'Log', level: 'Debug', message: 'nsJARChannel::nsJARChannel' },
      ],
    ]);

    const { entries } = collectProfileLogs(store, threadMap, {
      search: 'nsJARChannel',
    });
    expect(entries).toEqual([
      '1970-01-01 00:00:00.190000000 UTC - [Unknown Process 0: Empty]: D/nsJarProtocol nsJARChannel::nsJARChannel',
    ]);
  });
});
