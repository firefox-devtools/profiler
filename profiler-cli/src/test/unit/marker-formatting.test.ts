/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  formatProfileMarkersResult,
  formatThreadMarkersResult,
  formatMarkerInfoMultiResult,
} from '../../formatters';
import type {
  ThreadMarkersResult,
  FlatMarkerItem,
  ProfileMarkerItem,
  ProfileMarkersResult,
  MarkerInfoResult,
  MarkerInfoMultiResult,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';

function createContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [
      { threadIndex: 0, name: 'GeckoMain', processName: 'Parent Process' },
    ],
    resultThreadHandle: null,
    resultThreads: [],
    currentViewRange: null,
    rootRange: { start: 0, end: 3000 },
    callTreeSummaryStrategy: 'timing',
  };
}

function makeResult(
  overrides: Partial<WithContext<ThreadMarkersResult>> = {}
): WithContext<ThreadMarkersResult> {
  return {
    context: createContext(),
    type: 'thread-markers',
    threadHandle: 't-0',
    friendlyThreadName: 'GeckoMain',
    totalMarkerCount: 10,
    filteredMarkerCount: 10,
    byType: [],
    byCategory: [],
    ...overrides,
  };
}

function makeFlat(overrides: Partial<FlatMarkerItem> = {}): FlatMarkerItem {
  return {
    handle: 'm-1',
    name: 'DOMEvent',
    label: 'DOMEvent',
    start: 100,
    hasStack: false,
    category: 'DOM',
    ...overrides,
  };
}

describe('formatThreadMarkersResult flat list mode', function () {
  it('renders one line per flat marker', function () {
    const result = makeResult({
      filteredMarkerCount: 2,
      flatMarkers: [
        makeFlat({ handle: 'm-1', name: 'DOMEvent', label: 'DOMEvent' }),
        makeFlat({ handle: 'm-2', name: 'DOMEvent', label: 'DOMEvent' }),
      ],
    });

    const output = formatThreadMarkersResult(result);
    const markerLines = output
      .split('\n')
      .filter((l) => l.includes('m-1') || l.includes('m-2'));
    expect(markerLines).toHaveLength(2);
  });

  it('shows handle and marker name on each line', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat({ handle: 'm-42', name: 'Paint' })],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('m-42');
    expect(output).toContain('Paint');
  });

  it('appends label suffix when label differs from name', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [
        makeFlat({ name: 'DOMEvent', label: 'click', handle: 'm-10' }),
      ],
    });

    const output = formatThreadMarkersResult(result);
    const line = output.split('\n').find((l) => l.includes('m-10'))!;
    expect(line).toContain('click');
  });

  it('does not add label suffix when label equals name', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [
        makeFlat({ name: 'Paint', label: 'Paint', handle: 'm-20' }),
      ],
    });

    const output = formatThreadMarkersResult(result);
    const line = output.split('\n').find((l) => l.includes('m-20'))!;
    // "Paint" appears once (as the name), not twice
    expect(line.indexOf('Paint')).toBe(line.lastIndexOf('Paint'));
  });

  it('shows "instant" for markers without duration', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat({ duration: undefined })],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('instant');
  });

  it('shows formatted duration for interval markers', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat({ duration: 5 })],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('5ms');
    expect(output).not.toContain('instant');
  });

  it('shows stack indicator', function () {
    const result = makeResult({
      filteredMarkerCount: 2,
      flatMarkers: [
        makeFlat({ handle: 'm-1', hasStack: true }),
        makeFlat({ handle: 'm-2', hasStack: false }),
      ],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('✓');
    expect(output).toContain('✗');
  });

  it('says how many markers were omitted and how to get them', function () {
    const result = makeResult({
      totalMarkerCount: 100,
      filteredMarkerCount: 7183,
      flatMarkers: [makeFlat({ handle: 'm-1' }), makeFlat({ handle: 'm-2' })],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('7181 more markers omitted');
    expect(output).toContain('showing the first 2 of 7183');
    expect(output).toContain('--limit 0');
  });

  it('does not claim truncation when the whole list is shown', function () {
    const result = makeResult({
      filteredMarkerCount: 2,
      flatMarkers: [makeFlat({ handle: 'm-1' }), makeFlat({ handle: 'm-2' })],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).not.toContain('omitted');
    expect(output).not.toContain('--limit 0');
  });

  it('does not show aggregated By Name header in flat list mode', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat()],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).not.toContain('By Name');
    expect(output).not.toContain('By Category');
  });

  // `start` is already profile-start-relative, so `t=` must print it verbatim.
  // Needs a non-zero `rootRange.start`: at the 0 used elsewhere in this file, a
  // second subtraction would be invisible.
  it('renders the flat marker start verbatim, without re-subtracting rootRange.start', function () {
    const result = makeResult({
      context: { ...createContext(), rootRange: { start: 9.2, end: 3000 } },
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat({ handle: 'm-1', start: 549.34 })],
    });

    const output = formatThreadMarkersResult(result);
    const line = output.split('\n').find((l) => l.includes('m-1'))!;
    expect(line).toContain('t=549.34ms');
    expect(line).not.toContain('540.14ms'); // 549.34 - 9.2, if subtracted twice
  });
});

describe('formatThreadMarkersResult zoom baseline', function () {
  it('notes the full-range total when zoomed', function () {
    const result = makeResult({
      filteredMarkerCount: 3,
      totalMarkerCount: 3,
      fullRangeMarkerCount: 42,
    });

    const output = formatThreadMarkersResult(result);
    expect(output).toContain('3 markers in view (of 42 in the full range)');
  });

  it('omits the full-range note when not zoomed', function () {
    const result = makeResult({ filteredMarkerCount: 3, totalMarkerCount: 3 });

    const output = formatThreadMarkersResult(result);
    expect(output).not.toContain('in the full range');
    expect(output).toContain('3 markers');
  });
});

function makeProfileMarkersResult(
  overrides: Partial<ProfileMarkersResult> = {}
): WithContext<ProfileMarkersResult> {
  return {
    context: createContext(),
    type: 'profile-markers',
    markers: [],
    totalCount: 0,
    searchedThreadCount: 3,
    matchingThreadCount: 0,
    byThread: [],
    ...overrides,
  };
}

function makeMarkerInfo(
  overrides: Partial<MarkerInfoResult> = {}
): MarkerInfoResult {
  return {
    type: 'marker-info',
    threadHandle: 't-0',
    friendlyThreadName: 'GeckoMain',
    markerHandle: 'm-1',
    markerIndex: 0,
    name: 'DOMEvent',
    markerType: 'DOMEvent',
    category: { index: 0, name: 'DOM' },
    start: 100,
    end: null,
    ...overrides,
  };
}

function makeMultiResult(
  overrides: Partial<WithContext<MarkerInfoMultiResult>> = {}
): WithContext<MarkerInfoMultiResult> {
  return {
    context: createContext(),
    type: 'marker-info-multi',
    requested: ['m-1'],
    markers: [makeMarkerInfo()],
    errors: [],
    ...overrides,
  };
}

function makeProfileMarker(
  overrides: Partial<ProfileMarkerItem> = {}
): ProfileMarkerItem {
  return {
    ...makeFlat(),
    threadHandle: 't-90',
    threadName: 'GPU Process',
    processName: 'gpu',
    pid: '2446',
    ...overrides,
  };
}

describe('formatProfileMarkersResult', function () {
  it('shows the thread column on every row and a per-thread breakdown', function () {
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 3,
        matchingThreadCount: 2,
        markers: [
          makeProfileMarker({ handle: 'm-1', name: 'CompositorScreenshot' }),
          makeProfileMarker({ handle: 'm-2', name: 'CompositorScreenshot' }),
        ],
        byThread: [
          {
            threadHandle: 't-90',
            threadName: 'GPU Process',
            processName: 'gpu',
            pid: '2446',
            count: 2,
          },
          {
            threadHandle: 't-91',
            threadName: 'Compositor',
            processName: 'gpu',
            pid: '2446',
            count: 1,
          },
        ],
        filters: { searchString: 'CompositorScreenshot' },
      })
    );

    expect(output).toContain('3 markers across 2 of 3 threads');
    // The thread handle precedes the marker handle on each row.
    expect(output).toMatch(/t-90\s+m-1\s+CompositorScreenshot/);
    expect(output).toMatch(/t-90\s+m-2\s+CompositorScreenshot/);
    // Rows were capped here (2 of 3), so the counts are flagged as exact.
    expect(output).toContain('Matches by thread (exact counts):');
    expect(output).toContain('GPU Process (gpu, pid 2446)');
  });

  it('reports how many of the total rows are shown when limited', function () {
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2546,
        matchingThreadCount: 1,
        markers: [makeProfileMarker()],
        byThread: [
          {
            threadHandle: 't-90',
            threadName: 'GPU Process',
            processName: 'gpu',
            pid: '2446',
            count: 2546,
          },
        ],
        filters: { searchString: 'CompositorScreenshot', limit: 1 },
      })
    );

    expect(output).toContain('Showing 1 of 2546 markers across 1 of 3 threads');
  });

  it('calls the breakdown a thread inventory when nothing was filtered', function () {
    const byThread = [
      {
        threadHandle: 't-0',
        threadName: 'Parent Process',
        processName: 'Parent Process',
        pid: '2443',
        count: 2000,
      },
      {
        threadHandle: 't-1',
        threadName: 'Compositor',
        processName: 'Parent Process',
        pid: '2443',
        count: 469054,
      },
    ];

    // `--limit` alone truncates rows but selects nothing, so these are not
    // "matches" — there was no query to match against.
    const browsing = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2469054,
        matchingThreadCount: 2,
        markers: [makeProfileMarker()],
        byThread,
        filters: { limit: 10 },
      })
    );
    expect(browsing).toContain('Markers by thread (exact counts):');
    expect(browsing).not.toContain('Matches by thread');

    // A real filter does produce matches, so the heading claims them.
    const filtered = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2469054,
        matchingThreadCount: 2,
        markers: [makeProfileMarker()],
        byThread,
        filters: { searchString: 'Preference Read', limit: 10 },
      })
    );
    expect(filtered).toContain('Matches by thread (exact counts):');
  });

  it('explains that rows were capped at the hard ceiling', function () {
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2469054,
        matchingThreadCount: 3,
        markers: [makeProfileMarker()],
        byThread: [
          {
            threadHandle: 't-0',
            threadName: 'Parent Process',
            processName: 'Parent Process',
            pid: '2443',
            count: 2469054,
          },
        ],
        maxRowsClamped: 100000,
        filters: { limit: 3000000 },
      })
    );

    expect(output).toContain('Rows were capped at 100000');
    expect(output).toContain('the counts above are exact');
  });

  it('caps the per-thread breakdown and points at --json for the rest', function () {
    const byThread = Array.from({ length: 95 }, (_, i) => ({
      threadHandle: `t-${i}`,
      threadName: `Thread ${i}`,
      processName: 'Web Content',
      pid: '2443',
      count: 95 - i,
    }));
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2469054,
        searchedThreadCount: 95,
        matchingThreadCount: 95,
        markers: [makeProfileMarker()],
        byThread,
        filters: { searchString: 'Preference Read', limit: 10 },
      })
    );

    // Only the top 10 threads are listed, in descending count order.
    expect(output).toContain('t-0     Thread 0');
    expect(output).toContain('t-9     Thread 9');
    expect(output).not.toContain('Thread 10 ');
    const breakdown = output
      .slice(output.indexOf('Matches by thread'))
      .split('\n')
      .filter((line) => /^ {2}t-\d+ /.test(line));
    expect(breakdown).toHaveLength(10);
    expect(output).toContain('... and 85 more threads; --json lists them all');
  });

  it('omits the breakdown when a single thread matched', function () {
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2546,
        matchingThreadCount: 1,
        markers: [makeProfileMarker()],
        byThread: [
          {
            threadHandle: 't-90',
            threadName: 'GPU Process',
            processName: 'gpu',
            pid: '2446',
            count: 2546,
          },
        ],
        filters: { searchString: 'CompositorScreenshot', limit: 1 },
      })
    );

    // Every row already carries the thread handle, so the table adds nothing.
    expect(output).not.toContain('Matches by thread');
    expect(output).toMatch(/t-90\s+m-1/);
  });

  it('flags the breakdown counts as exact when the rows were capped', function () {
    const byThread = [
      {
        threadHandle: 't-0',
        threadName: 'Parent Process',
        processName: 'Parent Process',
        pid: '2443',
        count: 900,
      },
      {
        threadHandle: 't-1',
        threadName: 'Compositor',
        processName: 'Parent Process',
        pid: '2443',
        count: 100,
      },
    ];
    const capped = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 1000,
        matchingThreadCount: 2,
        markers: [makeProfileMarker()],
        byThread,
        filters: { searchString: 'Preference Read', limit: 1 },
      })
    );
    expect(capped).toContain('Matches by thread (exact counts):');
    // No truncation line: both threads fit under the cap.
    expect(capped).not.toContain('more threads');

    const complete = formatProfileMarkersResult(
      makeProfileMarkersResult({
        totalCount: 2,
        matchingThreadCount: 2,
        markers: [makeProfileMarker(), makeProfileMarker({ handle: 'm-2' })],
        byThread: [
          { ...byThread[0], count: 1 },
          { ...byThread[1], count: 1 },
        ],
        filters: { searchString: 'Preference Read' },
      })
    );
    expect(complete).toContain('Matches by thread:');
    expect(complete).not.toContain('exact counts');
  });

  it('reports no matches without claiming a thread', function () {
    const output = formatProfileMarkersResult(
      makeProfileMarkersResult({ filters: { searchString: 'nope' } })
    );

    expect(output).toContain(
      'No markers match the specified filters (searched 3 threads).'
    );
    expect(output).not.toContain('Matches by thread:');
  });
});

describe('formatMarkerInfoMultiResult', function () {
  it('prints one record per requested handle, in order', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        requested: ['m-2', 'm-1'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-2', name: 'Paint' }),
          makeMarkerInfo({ markerHandle: 'm-1', name: 'DOMEvent' }),
        ],
      })
    );

    expect(output).toContain('[1/2] Marker m-2: Paint');
    expect(output).toContain('[2/2] Marker m-1: DOMEvent');
    expect(output.indexOf('m-2')).toBeLessThan(output.indexOf('m-1'));
  });

  it('prints the session context header only once', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        requested: ['m-1', 'm-2'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-1' }),
          makeMarkerInfo({ markerHandle: 'm-2' }),
        ],
      })
    );

    const headerLines = output
      .split('\n')
      .filter((line) => line.startsWith('[Thread:'));
    expect(headerLines).toHaveLength(1);
  });

  it('separates records with a rule', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        requested: ['m-1', 'm-2'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-1' }),
          makeMarkerInfo({ markerHandle: 'm-2' }),
        ],
      })
    );

    expect(output).toContain('\n----------\n');
  });

  it('reports an unresolved handle in place and keeps the others', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        requested: ['m-1', 'm-9999', 'm-2'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-1' }),
          makeMarkerInfo({ markerHandle: 'm-2' }),
        ],
        errors: [{ markerHandle: 'm-9999', error: 'Unknown marker m-9999' }],
      })
    );

    expect(output).toContain('[1/3] Marker m-1: DOMEvent');
    expect(output).toContain(
      '[2/3] Marker m-9999: error: Unknown marker m-9999'
    );
    expect(output).toContain('[3/3] Marker m-2: DOMEvent');
    expect(output).toContain('1 of 3 requested markers was not found.');
  });

  it('does not add a not-found footer when every handle resolved', function () {
    const output = formatMarkerInfoMultiResult(makeMultiResult());

    expect(output).not.toContain('not found');
  });

  it('warns when a range strayed into another thread', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        requested: ['m-1', 'm-2'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-1', threadHandle: 't-0' }),
          makeMarkerInfo({ markerHandle: 'm-2', threadHandle: 't-1' }),
        ],
        rangeSpansThreadsWarning: {
          ranges: ['m-1..m-2'],
          threadHandles: ['t-0', 't-1'],
        },
      })
    );

    expect(output).toContain(
      'Warning: the range m-1..m-2 covers markers in more than one thread (t-0, t-1)'
    );
  });

  // Mirrors the single-handle guard: `start` is already profile-start-relative,
  // so each record must print it verbatim. Needs a non-zero `rootRange.start`.
  it('renders record times verbatim, without re-subtracting rootRange.start', function () {
    const output = formatMarkerInfoMultiResult(
      makeMultiResult({
        context: { ...createContext(), rootRange: { start: 9.2, end: 3000 } },
        requested: ['m-1', 'm-2'],
        markers: [
          makeMarkerInfo({ markerHandle: 'm-1', start: 549.34 }),
          makeMarkerInfo({ markerHandle: 'm-2', start: 700, end: 750 }),
        ],
      })
    );

    expect(output).toContain('549.34ms');
    expect(output).not.toContain('540.14ms'); // 549.34 - 9.2, if subtracted twice
    expect(output).toContain('700ms - 750ms');
  });

  it('omits the range warning when the query did not set one', function () {
    const output = formatMarkerInfoMultiResult(makeMultiResult());

    expect(output).not.toContain('Warning:');
  });
});
