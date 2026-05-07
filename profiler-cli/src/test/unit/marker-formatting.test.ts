/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatThreadMarkersResult } from '../../formatters';
import type {
  ThreadMarkersResult,
  FlatMarkerItem,
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

function makeResult(
  overrides: Partial<ThreadMarkersResult> = {}
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

  it('does not show aggregated By Name header in flat list mode', function () {
    const result = makeResult({
      filteredMarkerCount: 1,
      flatMarkers: [makeFlat()],
    });

    const output = formatThreadMarkersResult(result);
    expect(output).not.toContain('By Name');
    expect(output).not.toContain('By Category');
  });
});
