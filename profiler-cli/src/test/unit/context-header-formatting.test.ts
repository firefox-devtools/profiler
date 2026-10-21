/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the thread identity shown in the `[Thread: ...]` banner and the
 * other places that name the selected thread. A profile has many threads called
 * "GeckoMain", so the thread name on its own does not say which one you are
 * looking at; the process name is what disambiguates it. The banner also has to
 * keep the sticky selection distinct from the thread a single command queried.
 */

import {
  formatContextHeader,
  formatFilterStackResult,
  formatStatusResult,
  formatThreadSelectResult,
} from '../../formatters';
import type {
  SessionContext,
  StatusResult,
  ThreadSelectResult,
  WithContext,
} from '../../protocol';

function createContext(
  overrides: Partial<SessionContext> = {}
): SessionContext {
  return {
    selectedThreadHandle: 't-94',
    selectedThreads: [
      { threadIndex: 94, name: 'GeckoMain', processName: 'WebExtensions' },
    ],
    resultThreadHandle: null,
    resultThreads: [],
    currentViewRange: null,
    rootRange: { start: 0, end: 3000 },
    callTreeSummaryStrategy: 'timing',
    ...overrides,
  };
}

describe('formatContextHeader', function () {
  it('names the process the thread belongs to', function () {
    expect(formatContextHeader(createContext())).toBe(
      '[Thread: t-94 (GeckoMain, WebExtensions) | View: Full profile | Full: 3s]'
    );
  });

  it('omits the process name when it repeats the thread name', function () {
    const context = createContext({
      selectedThreadHandle: 't-5',
      selectedThreads: [
        { threadIndex: 5, name: 'Renderer', processName: 'Renderer' },
      ],
    });
    expect(formatContextHeader(context)).toBe(
      '[Thread: t-5 (Renderer) | View: Full profile | Full: 3s]'
    );
  });

  it('separates several threads so each name/process pair stays readable', function () {
    const context = createContext({
      selectedThreadHandle: 't-0,t-90',
      selectedThreads: [
        { threadIndex: 0, name: 'GeckoMain', processName: 'Parent Process' },
        { threadIndex: 90, name: 'GeckoMain', processName: 'GPU Process' },
      ],
    });
    expect(formatContextHeader(context)).toBe(
      '[Thread: t-0,t-90 (GeckoMain, Parent Process; GeckoMain, GPU Process) | ' +
        'View: Full profile | Full: 3s]'
    );
  });

  it('names both threads when the command queried a different one', function () {
    const context = createContext({
      resultThreadHandle: 't-2',
      resultThreads: [
        { threadIndex: 2, name: 'GeckoMain', processName: 'GPU Process' },
      ],
    });
    expect(formatContextHeader(context)).toBe(
      '[Thread: t-2 (GeckoMain, GPU Process) | Selected: t-94 | ' +
        'View: Full profile | Full: 3s]'
    );
  });

  it('leaves out the selection when the queried thread is the selected one', function () {
    // The querier only fills the result-scoped fields on a divergence, so this
    // is what an explicit `--thread t-94` on the selected thread looks like.
    expect(formatContextHeader(createContext())).not.toContain('Selected:');
  });

  it('still reports when no thread is selected', function () {
    const context = createContext({
      selectedThreadHandle: null,
      selectedThreads: [],
    });
    expect(formatContextHeader(context)).toContain(
      '[Thread: No thread selected'
    );
  });

  it('shows the effective call tree search', function () {
    expect(
      formatContextHeader(createContext({ callTreeSearch: 'testGetValue' }))
    ).toContain('Call tree search: "testGetValue"');
  });
});

describe('formatStatusResult', function () {
  it('names the process of the selected thread', function () {
    const result: StatusResult = {
      type: 'status',
      selectedThreadHandle: 't-94',
      selectedThreads: [
        { threadIndex: 94, name: 'GeckoMain', processName: 'WebExtensions' },
      ],
      viewRanges: [],
      rootRange: { start: 0, end: 3000 },
      filterStacks: [],
      callTreeSummaryStrategy: 'timing',
    };
    expect(formatStatusResult(result)).toContain(
      'Selected thread: t-94 (GeckoMain, WebExtensions)'
    );
  });

  it('shows session search even when there are no thread transforms', function () {
    const result: StatusResult = {
      type: 'status',
      selectedThreadHandle: 't-94',
      selectedThreads: createContext().selectedThreads,
      viewRanges: [],
      rootRange: { start: 0, end: 3000 },
      filterStacks: [],
      callTreeSummaryStrategy: 'timing',
      callTreeSearch: 'testGetValue',
    };
    const output = formatStatusResult(result);
    expect(output).toContain('Call tree search (all threads): "testGetValue"');
    expect(output).not.toContain('Filters: none');
  });
});

describe('formatFilterStackResult', function () {
  it('shows session search even when the thread has no transforms', function () {
    const output = formatFilterStackResult({
      type: 'filter-stack',
      threadHandle: 't-0',
      filters: [],
      callTreeSearch: 'testGetValue',
    });
    expect(output).toBe('Call tree search (all threads): "testGetValue"');
  });

  it('shows session search alongside numbered thread transforms', function () {
    const output = formatFilterStackResult({
      type: 'filter-stack',
      threadHandle: 't-0',
      callTreeSearch: 'testGetValue',
      filters: [
        {
          index: 1,
          transforms: [{ type: 'merge-function', funcIndex: 0 }],
          description: 'merge: f-0',
        },
      ],
    });
    expect(output).toContain('Call tree search (all threads): "testGetValue"');
    expect(output).toContain('1. merge: f-0');
  });
});

describe('formatThreadSelectResult', function () {
  it('names the process of the newly selected thread', function () {
    const result: WithContext<ThreadSelectResult> = {
      type: 'thread-select',
      threadHandle: 't-94',
      threadNames: ['GeckoMain'],
      context: createContext(),
    };
    expect(formatThreadSelectResult(result)).toBe(
      'Selected thread: t-94 (GeckoMain, WebExtensions)'
    );
  });
});
