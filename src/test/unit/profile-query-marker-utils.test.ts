/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeDurationStats,
  computeRateStats,
  formatDuration,
} from '../../profile-query/formatters/marker-info';

import type { Marker } from 'firefox-profiler/types';

describe('marker-info utility functions', function () {
  describe('formatDuration', function () {
    it('formats microseconds correctly', function () {
      expect(formatDuration(0.001)).toBe('1.00μs');
      expect(formatDuration(0.5)).toBe('500.00μs');
      expect(formatDuration(0.999)).toBe('999.00μs');
    });

    it('formats milliseconds correctly', function () {
      expect(formatDuration(1)).toBe('1.00ms');
      expect(formatDuration(10.5)).toBe('10.50ms');
      expect(formatDuration(999)).toBe('999.00ms');
    });

    it('formats seconds correctly', function () {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(5500)).toBe('5.50s');
      expect(formatDuration(60000)).toBe('60.00s');
    });
  });

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
});
