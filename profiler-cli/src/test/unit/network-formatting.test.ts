/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatThreadNetworkResult } from '../../formatters';
import type {
  ThreadNetworkResult,
  NetworkRequestEntry,
  NetworkPhaseTimings,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';

function createContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'GeckoMain' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 1000 },
  };
}

function makeRequest(
  overrides: Partial<NetworkRequestEntry> = {}
): NetworkRequestEntry {
  return {
    url: 'https://example.com/resource',
    startTime: 0,
    duration: 100,
    phases: {},
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<ThreadNetworkResult> = {}
): WithContext<ThreadNetworkResult> {
  return {
    context: createContext(),
    type: 'thread-network',
    threadHandle: 't-0',
    friendlyThreadName: 'GeckoMain',
    totalRequestCount: 1,
    filteredRequestCount: 1,
    summary: {
      cacheHit: 0,
      cacheMiss: 0,
      cacheUnknown: 1,
      phaseTotals: {},
    },
    requests: [makeRequest()],
    ...overrides,
  };
}

describe('formatThreadNetworkResult', function () {
  it('shows thread handle and request count', function () {
    const result = makeResult({
      filteredRequestCount: 3,
      totalRequestCount: 3,
    });
    result.requests = [
      makeRequest({ url: 'https://a.com' }),
      makeRequest({ url: 'https://b.com' }),
      makeRequest({ url: 'https://c.com' }),
    ];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('t-0');
    expect(output).toContain('3 requests');
  });

  it('shows "(filtered from N)" suffix when filter reduces count', function () {
    const result = makeResult({
      totalRequestCount: 10,
      filteredRequestCount: 3,
      filters: { searchString: 'api' },
    });
    result.requests = [makeRequest()];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('(filtered from 10)');
  });

  it('shows "X of Y requests" in header when limit truncates results', function () {
    const result = makeResult({
      filteredRequestCount: 50,
      totalRequestCount: 50,
    });
    result.requests = [makeRequest(), makeRequest()]; // only 2 shown of 50

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('2 of 50 requests');
  });

  it('shows --limit 0 hint in footer when results are truncated', function () {
    const result = makeResult({
      filteredRequestCount: 50,
      totalRequestCount: 50,
    });
    result.requests = [makeRequest()];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('--limit 0');
  });

  it('shows normal filter hint in footer when results are not truncated', function () {
    const result = makeResult({
      filteredRequestCount: 1,
      totalRequestCount: 1,
    });
    result.requests = [makeRequest()];

    const output = formatThreadNetworkResult(result);

    expect(output).not.toContain('--limit 0');
    expect(output).toContain('--search');
  });

  it('does not show filtered suffix when counts are equal', function () {
    const result = makeResult({
      totalRequestCount: 2,
      filteredRequestCount: 2,
      filters: { minDuration: 50 },
    });
    result.requests = [makeRequest(), makeRequest()];

    const output = formatThreadNetworkResult(result);

    expect(output).not.toContain('filtered from');
  });

  it('shows cache summary counts', function () {
    const result = makeResult({
      summary: {
        cacheHit: 4,
        cacheMiss: 2,
        cacheUnknown: 1,
        phaseTotals: {},
      },
    });

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('4 hit');
    expect(output).toContain('2 miss');
    expect(output).toContain('1 unknown');
  });

  it('shows phase totals section when any phase total is present', function () {
    const phaseTotals: NetworkPhaseTimings = { ttfb: 50, download: 30 };
    const result = makeResult({
      summary: { cacheHit: 0, cacheMiss: 1, cacheUnknown: 0, phaseTotals },
    });

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('Phase totals');
    expect(output).toContain('TTFB');
    expect(output).toContain('Download');
  });

  it('omits phase totals section when no phases are present', function () {
    const result = makeResult({
      summary: { cacheHit: 1, cacheMiss: 0, cacheUnknown: 0, phaseTotals: {} },
    });

    const output = formatThreadNetworkResult(result);

    expect(output).not.toContain('Phase totals');
  });

  it('shows each request URL', function () {
    const result = makeResult({
      filteredRequestCount: 2,
      totalRequestCount: 2,
    });
    result.requests = [
      makeRequest({ url: 'https://api.example.com/data' }),
      makeRequest({ url: 'https://static.example.com/img.png' }),
    ];
    result.summary.cacheUnknown = 2;

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('https://api.example.com/data');
    expect(output).toContain('https://static.example.com/img.png');
  });

  it('truncates URLs longer than 100 characters', function () {
    const longUrl = 'https://example.com/' + 'a'.repeat(90);
    const result = makeResult();
    result.requests = [makeRequest({ url: longUrl })];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('...');
    expect(output).not.toContain(longUrl);
  });

  it('shows per-request phases when present', function () {
    const phases: NetworkPhaseTimings = { dns: 5, ttfb: 30 };
    const result = makeResult();
    result.requests = [makeRequest({ phases })];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('Phases:');
    expect(output).toContain('DNS=');
    expect(output).toContain('TTFB=');
  });

  it('omits phases line when request has no timing data', function () {
    const result = makeResult();
    result.requests = [makeRequest({ phases: {} })];

    const output = formatThreadNetworkResult(result);

    expect(output).not.toContain('Phases:');
  });

  it('shows HTTP status and version when present', function () {
    const result = makeResult();
    result.requests = [makeRequest({ httpStatus: 200, httpVersion: 'h2' })];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('200');
    expect(output).toContain('h2');
  });

  it('shows ??? for missing HTTP status', function () {
    const result = makeResult();
    result.requests = [makeRequest()]; // no httpStatus

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('???');
  });

  it('shows "No network requests" message when requests list is empty', function () {
    const result = makeResult({
      totalRequestCount: 5,
      filteredRequestCount: 0,
      filters: { searchString: 'no-match' },
    });
    result.requests = [];

    const output = formatThreadNetworkResult(result);

    expect(output).toContain('No network requests');
  });
});
