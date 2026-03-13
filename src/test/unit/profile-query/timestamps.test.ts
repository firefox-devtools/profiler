/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { TimestampManager } from 'firefox-profiler/profile-query/timestamps';

/**
 * Unit tests for TimestampManager class.
 */

describe('TimestampManager', function () {
  describe('in-range timestamps', function () {
    it('assigns short hierarchical names', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      expect(m.nameForTimestamp(1000)).toBe('ts-0');
      expect(m.nameForTimestamp(2000)).toBe('ts-Z');
      expect(m.nameForTimestamp(1500)).toBe('ts-K');
      expect(m.nameForTimestamp(1002)).toBe('ts-1');
      expect(m.nameForTimestamp(1000.1)).toBe('ts-04');
      expect(m.nameForTimestamp(1001)).toBe('ts-0K');
      expect(m.nameForTimestamp(1006)).toBe('ts-2');
    });
  });

  describe('before-range timestamps', function () {
    it('uses ts< prefix with exponential buckets', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      // Range length = 1000
      // ts<0 covers [0, 1000] (1×length before start)
      // ts<1 covers [-1000, 0] (2×length before start)
      // ts<2 covers [-3000, -1000] (4×length before start)

      // Timestamps in bucket 0
      expect(m.nameForTimestamp(500)).toMatch(/^ts<0/);
      expect(m.nameForTimestamp(999)).toMatch(/^ts<0/);

      // Timestamps in bucket 1
      expect(m.nameForTimestamp(-500)).toMatch(/^ts<1/);
      expect(m.nameForTimestamp(-999)).toMatch(/^ts<1/);

      // Timestamps in bucket 2
      expect(m.nameForTimestamp(-1500)).toMatch(/^ts<2/);
      expect(m.nameForTimestamp(-2999)).toMatch(/^ts<2/);
    });

    it('creates hierarchical names within buckets', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      // Request two timestamps and verify they get valid bucket-0 names
      const name1 = m.nameForTimestamp(500);
      const name2 = m.nameForTimestamp(250);

      expect(name1).toMatch(/^ts<0[0-9a-zA-Z]+$/);
      expect(name2).toMatch(/^ts<0[0-9a-zA-Z]+$/);

      // They should be different names
      expect(name1).not.toBe(name2);
    });
  });

  describe('after-range timestamps', function () {
    it('uses ts> prefix with exponential buckets', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      // Range length = 1000
      // ts>0 covers [2000, 3000] (1×length after end)
      // ts>1 covers [3000, 4000] (2×length after end)
      // ts>2 covers [4000, 6000] (4×length after end)

      // Timestamps in bucket 0
      expect(m.nameForTimestamp(2500)).toMatch(/^ts>0/);
      expect(m.nameForTimestamp(2999)).toMatch(/^ts>0/);

      // Timestamps in bucket 1
      expect(m.nameForTimestamp(3500)).toMatch(/^ts>1/);
      expect(m.nameForTimestamp(3999)).toMatch(/^ts>1/);

      // Timestamps in bucket 2
      expect(m.nameForTimestamp(5000)).toMatch(/^ts>2/);
      expect(m.nameForTimestamp(5999)).toMatch(/^ts>2/);
    });

    it('creates hierarchical names within buckets', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      // Request two timestamps and verify they get valid bucket-0 names
      const name1 = m.nameForTimestamp(2500);
      const name2 = m.nameForTimestamp(2750);

      expect(name1).toMatch(/^ts>0[0-9a-zA-Z]+$/);
      expect(name2).toMatch(/^ts>0[0-9a-zA-Z]+$/);

      // They should be different names
      expect(name1).not.toBe(name2);
    });
  });

  describe('reverse lookup', function () {
    it('returns timestamps for names that were previously minted', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });

      // Mint some names
      const name1 = m.nameForTimestamp(1000);
      const name2 = m.nameForTimestamp(1500);
      const name3 = m.nameForTimestamp(500);
      const name4 = m.nameForTimestamp(2500);

      // Reverse lookup should work
      expect(m.timestampForName(name1)).toBe(1000);
      expect(m.timestampForName(name2)).toBe(1500);
      expect(m.timestampForName(name3)).toBe(500);
      expect(m.timestampForName(name4)).toBe(2500);
    });

    it('returns null for unknown names', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });
      expect(m.timestampForName('ts-X')).toBe(null);
      expect(m.timestampForName('ts<0Y')).toBe(null);
      expect(m.timestampForName('unknown')).toBe(null);
    });

    it('handles repeated requests for the same timestamp', function () {
      const m = new TimestampManager({ start: 1000, end: 2000 });

      // Request same timestamp twice
      const name1 = m.nameForTimestamp(1500);
      const name2 = m.nameForTimestamp(1500);

      // Should get the same name
      expect(name1).toBe(name2);

      // Reverse lookup should work
      expect(m.timestampForName(name1)).toBe(1500);
    });
  });
});
