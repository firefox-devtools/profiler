/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  formatCounterListResult,
  formatCounterInfoResult,
} from '../../formatters';
import type {
  CounterSummary,
  CounterListResult,
  CounterInfoResult,
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

function makeCounter(overrides: Partial<CounterSummary> = {}): CounterSummary {
  return {
    counterHandle: 'c-0',
    counterIndex: 0,
    name: 'malloc',
    label: 'Memory',
    category: 'Memory',
    unit: 'bytes',
    graphType: 'line-accumulated',
    color: 'orange',
    pid: '123',
    processIndex: 0,
    processName: 'Parent Process',
    mainThreadIndex: 0,
    mainThreadHandle: 't-0',
    mainThreadName: 'GeckoMain',
    rangeSampleCount: 7,
    stats: [
      {
        source: 'count-range',
        label: 'memory range in graph',
        value: 27,
        formattedValue: '27B',
      },
    ],
    graph: [],
    ...overrides,
  };
}

describe('formatCounterListResult', function () {
  it('renders one line per counter with its stats', function () {
    const result: WithContext<CounterListResult> = {
      context: createContext(),
      type: 'counter-list',
      counters: [
        makeCounter(),
        makeCounter({
          counterHandle: 'c-1',
          name: 'eth0',
          label: 'Bandwidth',
          category: 'Bandwidth',
          graphType: 'line-rate',
          processIndex: 3,
          processName: 'Isolated Web Content',
          etld1: 'example.com',
          pid: '456',
          stats: [
            {
              source: 'count-range',
              label: 'Data transferred in the visible range',
              value: 2048,
              formattedValue: '2KB',
            },
          ],
        }),
      ],
    };

    const output = formatCounterListResult(result);
    expect(output).toContain('Counters (2):');
    expect(output).toContain(
      'c-0: Memory (Memory) [p-0 Parent Process, pid 123]'
    );
    expect(output).toContain('memory range in graph: 27B');
    expect(output).toContain('[7 samples]');
    expect(output).toContain(
      'c-1: Bandwidth (Bandwidth) [p-3 Isolated Web Content (example.com), pid 456]'
    );
    expect(output).toContain('Data transferred in the visible range: 2KB');
  });

  it('reports when there are no counters', function () {
    const result: WithContext<CounterListResult> = {
      context: createContext(),
      type: 'counter-list',
      counters: [],
    };

    expect(formatCounterListResult(result)).toContain(
      'No counters in this profile.'
    );
  });

  it('renders a sparkline next to each counter', function () {
    const result: WithContext<CounterListResult> = {
      context: createContext(),
      type: 'counter-list',
      counters: [makeCounter({ graph: [1, 5, 9] })],
    };

    const output = formatCounterListResult(result);
    expect(output).toContain('c-0: Memory (Memory)');
    // Memory is relative: it scales between its own min and max.
    expect(output).toContain('▁'); // lowest graph value
    expect(output).toContain('█'); // highest graph value
  });

  function listOf(counter: CounterSummary): WithContext<CounterListResult> {
    return {
      context: createContext(),
      type: 'counter-list',
      counters: [counter],
    };
  }

  it('scales a percent (CPU) sparkline absolutely, 0 to 100%', function () {
    const output = formatCounterListResult(
      listOf(
        makeCounter({
          label: 'Process CPU',
          category: 'CPU',
          graphType: 'line-rate',
          unit: 'percent',
          graph: [0.5, 0.55, 0.6],
        })
      )
    );
    // ~50-60% on a 0-100% scale is mid-height: not the floor (the reviewer's
    // "50% treated as 0" bug) and not the top (60% is not 100%).
    expect(output).not.toContain('▁');
    expect(output).not.toContain('█');
    expect(output).toContain('▅');
  });

  it('anchors a rate (bytes) sparkline at zero, not the series min', function () {
    const output = formatCounterListResult(
      listOf(
        makeCounter({
          label: 'Bandwidth',
          category: 'Bandwidth',
          graphType: 'line-rate',
          unit: 'bytes',
          graph: [10, 20, 30],
        })
      )
    );
    // The smallest slice (10) sits above the zero baseline, so it isn't the floor.
    expect(output).not.toContain('▁');
    expect(output).toContain('█'); // the peak slice
  });
});

describe('formatCounterInfoResult', function () {
  function makeInfo(
    overrides: Partial<CounterInfoResult> = {}
  ): WithContext<CounterInfoResult> {
    return {
      context: createContext(),
      ...makeCounter(),
      type: 'counter-info',
      description: 'Amount of allocated memory',
      sampleCount: 7,
      rangeStart: 0,
      rangeEnd: 10,
      overTime: [],
      ...overrides,
    };
  }

  it('renders the counter detail block', function () {
    const output = formatCounterInfoResult(makeInfo());
    expect(output).toContain('Counter c-0: Memory');
    expect(output).toContain('Name: malloc');
    expect(output).toContain('Category: Memory');
    expect(output).toContain('Unit: bytes');
    expect(output).toContain('Graph type: line-accumulated');
    expect(output).toContain('Process: p-0 Parent Process [pid 123]');
    expect(output).toContain('Main thread: t-0 (GeckoMain)');
    expect(output).toContain('Description: Amount of allocated memory');
    expect(output).toContain('memory range in graph: 27B');
  });

  it('shows a CO2e estimate next to a stat when present', function () {
    const output = formatCounterInfoResult(
      makeInfo({
        label: 'Power',
        category: 'power',
        unit: 'pWh',
        graphType: 'line-rate',
        stats: [
          {
            source: 'committed-range-total',
            label: 'Energy used in the visible range',
            value: 5,
            formattedValue: '5 Wh',
            carbon: '2 g CO₂e',
          },
        ],
      })
    );
    expect(output).toContain(
      'Energy used in the visible range: 5 Wh (2 g CO₂e)'
    );
  });

  it('renders the over-time section with level and delta', function () {
    const output = formatCounterInfoResult(
      makeInfo({
        overTime: [
          {
            startTime: 0,
            startTimeName: 'ts-0',
            startTimeStr: '0s',
            endTime: 5,
            endTimeName: 'ts-K',
            endTimeStr: '5ms',
            value: 2_100_000,
            formattedValue: '2.1 MB',
            delta: 2_100_000,
            formattedDelta: '+2.1 MB',
            percentage: 0.25,
            formattedPercentage: '25%',
          },
          {
            startTime: 5,
            startTimeName: 'ts-K',
            startTimeStr: '5ms',
            endTime: 10,
            endTimeName: 'ts-Z',
            endTimeStr: '10ms',
            value: 8_400_000,
            formattedValue: '8.4 MB',
            delta: 6_300_000,
            formattedDelta: '+6.3 MB',
            percentage: 1,
            formattedPercentage: '100%',
          },
        ],
      })
    );
    expect(output).toContain('Memory over time:');
    // Columns are padded for alignment, so allow variable whitespace between them.
    expect(output).toMatch(
      /\[ts-0 → ts-K\]\s+\(0s - 5ms\)\s+2\.1 MB\s+\(\+2\.1 MB, 25%\)/
    );
    expect(output).toMatch(
      /\[ts-K → ts-Z\]\s+\(5ms - 10ms\)\s+8\.4 MB\s+\(\+6\.3 MB, 100%\)/
    );
  });

  function makeBucket(
    value: number,
    index: number
  ): CounterInfoResult['overTime'][number] {
    return {
      startTime: index,
      startTimeName: `ts-${index}`,
      startTimeStr: `${index}ms`,
      endTime: index + 1,
      endTimeName: `ts-${index + 1}`,
      endTimeStr: `${index + 1}ms`,
      value,
      formattedValue: `${value}B`,
    };
  }

  it('renders a sparkline from the graph values', function () {
    const output = formatCounterInfoResult(
      makeInfo({ overTime: [makeBucket(1, 0)], graph: [1, 5, 9] })
    );
    expect(output).toContain('Memory over time:');
    expect(output).toContain('▁'); // lowest graph value
    expect(output).toContain('█'); // highest graph value
  });

  it('omits the sparkline when the graph is empty', function () {
    const output = formatCounterInfoResult(
      makeInfo({ overTime: [makeBucket(1, 0)], graph: [] })
    );
    expect(output).not.toMatch(/[▁▂▃▄▅▆▇█]/);
  });
});
