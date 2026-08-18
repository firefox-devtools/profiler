/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatThreadListResult } from '../../formatters';
import type {
  ThreadListItem,
  ThreadListResult,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';

function createContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'GeckoMain' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 3000 },
  };
}

function makeThread(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  return {
    threadHandle: 't-0',
    threadIndex: 0,
    name: 'GeckoMain',
    processName: 'Parent Process',
    pid: '123',
    processIndex: 0,
    tid: 1,
    cpuMs: 1234.5,
    markerCount: 4200,
    selected: true,
    ...overrides,
  };
}

function listOf(
  threads: ThreadListItem[],
  overrides: Partial<ThreadListResult> = {}
): WithContext<ThreadListResult> {
  return {
    context: createContext(),
    type: 'thread-list',
    threads,
    totalThreadCount: threads.length,
    processCount: 1,
    hiddenByLimit: 0,
    sort: 'cpu',
    ...overrides,
  };
}

describe('formatThreadListResult', function () {
  it('renders one aligned row per thread with all six columns', function () {
    const output = formatThreadListResult(
      listOf(
        [
          makeThread(),
          makeThread({
            threadHandle: 't-1',
            threadIndex: 1,
            name: 'Renderer',
            processName: 'Isolated Web Content',
            etld1: 'example.com',
            pid: '456',
            tid: 2,
            cpuMs: 7,
            markerCount: 12,
            selected: false,
          }),
        ],
        { processCount: 2 }
      )
    );

    expect(output).toContain('Threads (2 threads across 2 processes)');
    expect(output).toContain('sorted by cpu');
    expect(output).toContain('HANDLE');
    expect(output).toContain('MARKERS');
    // Marker counts are thousands-separated, CPU keeps profile info's 3 decimals.
    expect(output).toContain('1234.500ms');
    expect(output).toContain('4,200');
    // eTLD+1 is shown next to the process name, as in `counter list`.
    expect(output).toContain('Isolated Web Content (example.com)');
    // The selected thread is flagged, the others are not.
    expect(output).toMatch(/^\* t-0 /m);
    expect(output).toMatch(/^ {2}t-1 /m);
    expect(output).toContain('* = currently selected thread');

    // The header and both data rows end their MARKERS column at the same
    // offset, i.e. the table is aligned rather than space-joined.
    const rows = output
      .split('\n')
      .filter((line) => line.includes('HANDLE') || /^[* ] t-\d/.test(line));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((line) => line.length)).size).toBe(1);
  });

  it('reports how many rows --limit hid', function () {
    const output = formatThreadListResult(
      listOf([makeThread()], { totalThreadCount: 95, hiddenByLimit: 94 })
    );

    expect(output).toContain('Threads (1 of 95 threads across 1 process)');
    expect(output).toContain('+ 94 more threads (use --limit 0 to see all)');
  });

  it('names the search query in the heading', function () {
    const output = formatThreadListResult(
      listOf([makeThread()], {
        totalThreadCount: 95,
        searchQuery: 'GeckoMain',
        sort: 'markers',
      })
    );

    expect(output).toContain('sorted by markers');
    expect(output).toContain("matching 'GeckoMain'");
  });

  it('explains an empty result differently with and without a search', function () {
    expect(formatThreadListResult(listOf([]))).toContain(
      'No threads in this profile.'
    );
    expect(
      formatThreadListResult(
        listOf([], { totalThreadCount: 95, searchQuery: 'nonesuch' })
      )
    ).toContain("No threads match 'nonesuch'");
  });
});
