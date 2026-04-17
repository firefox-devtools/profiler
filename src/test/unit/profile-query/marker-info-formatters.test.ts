/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  collectMarkerInfo,
  collectMarkerStack,
  collectThreadMarkers,
  collectThreadNetwork,
  formatMarkerInfo,
  formatMarkerStackFull,
  formatThreadMarkers,
} from 'firefox-profiler/profile-query/formatters/marker-info';
import { MarkerMap } from 'firefox-profiler/profile-query/marker-map';
import { ThreadMap } from 'firefox-profiler/profile-query/thread-map';
import {
  getProfileWithMarkers,
  getProfileFromTextSamples,
  getNetworkMarkers,
} from '../../fixtures/profiles/processed-profile';
import type { NetworkMarkersOptions } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { INTERVAL } from 'firefox-profiler/app-logic/constants';

/**
 * Sets up a store, threadMap, and markerMap for a single-thread profile with
 * the given markers. Returns helpers to register marker handles.
 */
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

describe('formatThreadMarkers', function () {
  it('shows interval markers with duration stats', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
      [
        'DOMEvent',
        20,
        40,
        { type: 'DOMEvent', eventType: 'click', latency: 5 },
      ],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap);

    expect(result).toContain('2 markers');
    expect(result).toContain('DOMEvent');
    // Interval markers should show duration stats, not "(instant)"
    expect(result).toContain('interval');
    expect(result).not.toContain('(instant)');
  });

  it('shows instant markers with (instant) label', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, null, { type: 'DOMEvent', eventType: 'click' }],
      ['DOMEvent', 5, null, { type: 'DOMEvent', eventType: 'keydown' }],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap);

    expect(result).toContain('(instant)');
  });

  it('shows filtered count annotation when search reduces marker count', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 5, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
      [
        'UserTiming',
        10,
        15,
        { type: 'UserTiming', name: 'myMark', entryType: 'measure' },
      ],
      [
        'DOMEvent',
        20,
        25,
        { type: 'DOMEvent', eventType: 'keydown', latency: 2 },
      ],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      searchString: 'DOMEvent',
    });

    // Should show 2 matches filtered from 3 total
    expect(result).toContain('2 markers');
    expect(result).toContain('(filtered from 3)');
  });

  it('shows nested sub-groups when groupBy specifies multiple keys', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 2, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
      [
        'DOMEvent',
        3,
        5,
        { type: 'DOMEvent', eventType: 'keydown', latency: 1 },
      ],
      ['DOMEvent', 6, 8, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      groupBy: 'type,field:eventType',
    });

    // Top-level group for DOMEvent, with sub-groups for click and keydown
    expect(result).toContain('DOMEvent');
    expect(result).toContain('click');
    expect(result).toContain('keydown');
    // click sub-group appears before keydown because it has more markers
    const clickPos = result.indexOf('click');
    const keydownPos = result.indexOf('keydown');
    expect(clickPos).toBeLessThan(keydownPos);
  });

  it('shows overflow notice when more than 15 groups exist', function () {
    // Create 16 markers with distinct names so each forms its own group
    const markers: Parameters<typeof getProfileWithMarkers>[0] = Array.from(
      { length: 16 },
      (_, i): [string, number, number, Record<string, unknown>] => [
        `Marker${i}`,
        i * 10,
        i * 10 + 5,
        { type: `Marker${i}` },
      ]
    );
    const { store, threadMap, markerMap } = setupWithMarkers(markers);

    const result = formatThreadMarkers(store, threadMap, markerMap);

    expect(result).toContain('more types');
  });
});

describe('formatMarkerInfo', function () {
  it('shows schema fields for a marker with data', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
    ]);
    const handle = registerMarker(0);

    const result = formatMarkerInfo(store, markerMap, threadMap, handle);

    expect(result).toContain('DOMEvent');
    // Schema field label: "Event Type" with value "click"
    expect(result).toContain('Event Type');
    expect(result).toContain('click');
    // Schema field label: "Latency" with value for latency
    expect(result).toContain('Latency');
  });

  it('shows duration for interval markers and "instant" for instant markers', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      ['DOMEvent', 0, 20, { type: 'DOMEvent', eventType: 'click', latency: 1 }],
      ['DOMEvent', 30, null, { type: 'DOMEvent', eventType: 'hover' }],
    ]);
    const intervalHandle = registerMarker(0);
    const instantHandle = registerMarker(1);

    const intervalResult = formatMarkerInfo(
      store,
      markerMap,
      threadMap,
      intervalHandle
    );
    const instantResult = formatMarkerInfo(
      store,
      markerMap,
      threadMap,
      instantHandle
    );

    // Interval: shows duration in ms
    expect(intervalResult).toContain('20.00ms');
    // Instant: shows "(instant)" label
    expect(instantResult).toContain('(instant)');
  });

  it('excludes hidden fields from output', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      [
        'MarkerWithHiddenField',
        0,
        5,
        { type: 'MarkerWithHiddenField', hiddenString: 'secret-value' },
      ],
    ]);
    const handle = registerMarker(0);

    const result = formatMarkerInfo(store, markerMap, threadMap, handle);

    expect(result).not.toContain('secret-value');
    expect(result).not.toContain('Hidden string');
  });

  it('shows schema description when available', function () {
    const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
      [
        'UserTiming',
        0,
        10,
        { type: 'UserTiming', name: 'myMeasure', entryType: 'measure' },
      ],
    ]);
    const handle = registerMarker(0);

    const result = formatMarkerInfo(store, markerMap, threadMap, handle);

    // UserTiming has a schema description
    expect(result).toContain('performance.mark()');
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
    // Fields from schema
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

    // Hidden fields should not appear
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
    // DOMEvent table label includes the eventType from the schema
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

describe('formatThreadMarkers list option', function () {
  it('shows one row per marker with handle and name', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
      [
        'DOMEvent',
        20,
        30,
        { type: 'DOMEvent', eventType: 'keydown', latency: 2 },
      ],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      list: true,
    });

    expect(result).toMatch(/m-\d+/);
    expect(result).toContain('DOMEvent');
  });

  it('does not show aggregated By Name header', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, 10, { type: 'DOMEvent', eventType: 'click', latency: 5 }],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      list: true,
    });

    expect(result).not.toContain('By Name');
  });

  it('appends schema label when it differs from the marker name', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, null, { type: 'DOMEvent', eventType: 'click' }],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      list: true,
    });

    expect(result).toContain('click');
  });

  it('shows "instant" for instant markers and omits it for interval markers', function () {
    const { store, threadMap, markerMap } = setupWithMarkers([
      ['DOMEvent', 0, null, { type: 'DOMEvent', eventType: 'click' }],
      [
        'DOMEvent',
        10,
        20,
        { type: 'DOMEvent', eventType: 'keydown', latency: 1 },
      ],
    ]);

    const result = formatThreadMarkers(store, threadMap, markerMap, undefined, {
      list: true,
    });

    expect(result).toContain('instant');
    // Interval marker should show a duration, not "instant"
    const lines = result.split('\n').filter((l) => l.includes('m-'));
    expect(lines).toHaveLength(2);
    const instantLine = lines.find((l) => l.includes('instant'));
    const intervalLine = lines.find((l) => !l.includes('instant'));
    expect(instantLine).toBeDefined();
    expect(intervalLine).toBeDefined();
  });
});

describe('collectMarkerStack and formatMarkerStackFull', function () {
  describe('for a marker without a cause', function () {
    it('collectMarkerStack returns null stack', function () {
      const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
        [
          'DOMEvent',
          0,
          5,
          { type: 'DOMEvent', eventType: 'click', latency: 1 },
        ],
      ]);
      const handle = registerMarker(0);

      const result = collectMarkerStack(store, markerMap, threadMap, handle);

      expect(result.type).toBe('marker-stack');
      expect(result.markerName).toBe('DOMEvent');
      expect(result.stack).toBeNull();
    });

    it('formatMarkerStackFull reports no stack trace', function () {
      const { store, threadMap, markerMap, registerMarker } = setupWithMarkers([
        [
          'DOMEvent',
          0,
          5,
          { type: 'DOMEvent', eventType: 'click', latency: 1 },
        ],
      ]);
      const handle = registerMarker(0);

      const result = formatMarkerStackFull(store, markerMap, threadMap, handle);

      expect(result).toContain('DOMEvent');
      expect(result).toContain('no stack trace');
    });
  });

  describe('for a marker with a cause stack', function () {
    function setupWithCauseStack() {
      const { profile } = getProfileFromTextSamples(`
        rootFunc
        leafFunc
      `);
      // profile.threads[0] has a stack table from the text samples
      const thread = profile.threads[0];
      // samples.stack[0] is the stack index for the leaf frame of the first sample
      const stackIndex = thread.samples.stack[0];

      if (stackIndex === null || stackIndex === undefined) {
        throw new Error('Expected a non-null stack index from text samples');
      }

      // Add a marker with a cause pointing to that stack
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
      // The marker we added is at the end of the marker list, but after processing
      // markers are time-sorted. Since our marker is at time 1 and there are no
      // other markers, it will be at index 0.
      const handle = markerMap.handleForMarker(new Set([0]), 0);
      return { store, threadMap, markerMap, handle };
    }

    it('collectMarkerStack returns stack frames', function () {
      const { store, threadMap, markerMap, handle } = setupWithCauseStack();

      const result = collectMarkerStack(store, markerMap, threadMap, handle);

      expect(result.stack).not.toBeNull();
      expect(result.stack!.frames.length).toBeGreaterThan(0);
      // The leaf frame should be "leafFunc"
      expect(result.stack!.frames[0].name).toBe('leafFunc');
    });

    it('formatMarkerStackFull shows numbered frames', function () {
      const { store, threadMap, markerMap, handle } = setupWithCauseStack();

      const result = formatMarkerStackFull(store, markerMap, threadMap, handle);

      expect(result).toContain('[1]');
      expect(result).toContain('leafFunc');
    });
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
    // getNetworkMarkers produces a START + STOP pair per entry
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
    expect(result.summary.cacheUnknown).toBe(3); // all 3 counted, not just 2
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
      { id: 6, startTime: 10, fetchStart: 10, endTime: 11 }, // no cache → unknown
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.summary.cacheHit).toBe(3); // Hit + MemoryHit + Prefetched
    expect(result.summary.cacheMiss).toBe(2); // Miss + DiskStorage
    expect(result.summary.cacheUnknown).toBe(1); // no cache field
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
          domainLookupEnd: 5, // dns = 5
          connectStart: 5,
          tcpConnectEnd: 15, // tcp = 10
          requestStart: 20,
          responseStart: 50, // ttfb = 30
          responseEnd: 80, // download = 30; mainThread = 100 - 80 = 20
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
          connectEnd: 18, // tls = 18 - 10 = 8
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
          secureConnectionStart: 0, // 0 means no TLS
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
        payload: { requestStart: 0, responseStart: 8 }, // ttfb = 8
      },
      {
        id: 2,
        startTime: 21,
        fetchStart: 21,
        endTime: 41,
        payload: { requestStart: 21, responseStart: 33 }, // ttfb = 12
      },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.summary.phaseTotals.ttfb).toBe(20); // 8 + 12
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
    // The merged marker sets data.startTime to the START marker's table time (0),
    // so total duration = endTime - startTime = 25 - 0 = 25.
    const { store, threadMap } = setupWithNetworkMarkers([
      { id: 1, startTime: 0, fetchStart: 5, endTime: 25 },
    ]);

    const result = collectThreadNetwork(store, threadMap);

    expect(result.requests[0].duration).toBe(25);
  });
});
