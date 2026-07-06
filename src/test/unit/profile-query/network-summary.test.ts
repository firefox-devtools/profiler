/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  intervalUnionMs,
  peakConcurrency,
  classifyCache,
} from 'firefox-profiler/profile-query/network-summary';

describe('interval helpers', function () {
  describe('intervalUnionMs', function () {
    it('returns 0 for no intervals', function () {
      expect(intervalUnionMs([])).toBe(0);
    });

    it('sums disjoint intervals', function () {
      expect(
        intervalUnionMs([
          [0, 10],
          [20, 25],
        ])
      ).toBe(15);
    });

    it('merges overlapping intervals', function () {
      expect(
        intervalUnionMs([
          [0, 10],
          [5, 20],
        ])
      ).toBe(20);
    });

    it('absorbs nested intervals', function () {
      expect(
        intervalUnionMs([
          [0, 100],
          [10, 20],
          [30, 40],
        ])
      ).toBe(100);
    });

    it('handles unsorted input', function () {
      expect(
        intervalUnionMs([
          [30, 40],
          [0, 10],
          [5, 12],
        ])
      ).toBe(22);
    });
  });

  describe('peakConcurrency', function () {
    it('returns 0 for no intervals', function () {
      expect(peakConcurrency([])).toBe(0);
    });

    it('counts the maximum overlap', function () {
      expect(
        peakConcurrency([
          [0, 10],
          [2, 8],
          [4, 6],
        ])
      ).toBe(3);
    });

    it('does not double-count touching intervals', function () {
      expect(
        peakConcurrency([
          [0, 10],
          [10, 20],
        ])
      ).toBe(1);
    });

    it('is 1 for a single interval', function () {
      expect(peakConcurrency([[0, 100]])).toBe(1);
    });
  });

  describe('classifyCache', function () {
    it('classifies hits', function () {
      expect(classifyCache('Hit')).toBe('hit');
      expect(classifyCache('HitViaReval')).toBe('hit');
    });

    it('classifies misses', function () {
      expect(classifyCache('Missed')).toBe('miss');
      expect(classifyCache('MissedViaReval')).toBe('miss');
    });

    it('classifies unresolved and everything else as unknown', function () {
      expect(classifyCache('Unresolved')).toBe('unknown');
      expect(classifyCache(undefined)).toBe('unknown');
      expect(classifyCache('Whatever')).toBe('unknown');
    });
  });
});
