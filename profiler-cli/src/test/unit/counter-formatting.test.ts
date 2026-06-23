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
    expect(output).toContain('c-0: Memory (Memory)');
    expect(output).toContain('memory range in graph: 27B');
    expect(output).toContain('[7 samples]');
    expect(output).toContain('c-1: Bandwidth (Bandwidth)');
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
});
