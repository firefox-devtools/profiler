/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parseTimeValue } from '../../../profile-query/time-range-parser';
import type { StartEndRange } from 'firefox-profiler/types';

describe('parseTimeValue', () => {
  const rootRange: StartEndRange = {
    start: 1000,
    end: 11000,
  };

  describe('timestamp names', () => {
    it('returns null for timestamp names', () => {
      expect(parseTimeValue('ts-0', rootRange)).toBe(null);
      expect(parseTimeValue('ts-6', rootRange)).toBe(null);
      expect(parseTimeValue('ts-Z', rootRange)).toBe(null);
      expect(parseTimeValue('ts<0', rootRange)).toBe(null);
      expect(parseTimeValue('ts>1', rootRange)).toBe(null);
    });
  });

  describe('seconds (no suffix)', () => {
    it('parses seconds as default format', () => {
      expect(parseTimeValue('0', rootRange)).toBe(1000);
      expect(parseTimeValue('1', rootRange)).toBe(2000);
      expect(parseTimeValue('5', rootRange)).toBe(6000);
      expect(parseTimeValue('10', rootRange)).toBe(11000);
    });

    it('parses decimal seconds', () => {
      expect(parseTimeValue('0.5', rootRange)).toBe(1500);
      expect(parseTimeValue('2.7', rootRange)).toBe(3700);
      expect(parseTimeValue('3.14', rootRange)).toBe(4140);
    });

    it('handles leading zeros', () => {
      expect(parseTimeValue('0.001', rootRange)).toBe(1001);
      expect(parseTimeValue('00.5', rootRange)).toBe(1500);
    });
  });

  describe('seconds with suffix', () => {
    it('parses seconds with "s" suffix', () => {
      expect(parseTimeValue('0s', rootRange)).toBe(1000);
      expect(parseTimeValue('1s', rootRange)).toBe(2000);
      expect(parseTimeValue('5s', rootRange)).toBe(6000);
    });

    it('parses decimal seconds with "s" suffix', () => {
      expect(parseTimeValue('0.5s', rootRange)).toBe(1500);
      expect(parseTimeValue('2.7s', rootRange)).toBe(3700);
    });
  });

  describe('milliseconds', () => {
    it('parses milliseconds', () => {
      expect(parseTimeValue('0ms', rootRange)).toBe(1000);
      expect(parseTimeValue('1000ms', rootRange)).toBe(2000);
      expect(parseTimeValue('2700ms', rootRange)).toBe(3700);
      expect(parseTimeValue('10000ms', rootRange)).toBe(11000);
    });

    it('parses decimal milliseconds', () => {
      expect(parseTimeValue('500ms', rootRange)).toBe(1500);
      expect(parseTimeValue('0.5ms', rootRange)).toBe(1000.5);
    });
  });

  describe('percentages', () => {
    it('parses percentages of profile duration', () => {
      // Profile duration is 10000ms (11000 - 1000)
      expect(parseTimeValue('0%', rootRange)).toBe(1000);
      expect(parseTimeValue('10%', rootRange)).toBe(2000);
      expect(parseTimeValue('50%', rootRange)).toBe(6000);
      expect(parseTimeValue('100%', rootRange)).toBe(11000);
    });

    it('parses decimal percentages', () => {
      expect(parseTimeValue('5%', rootRange)).toBe(1500);
      expect(parseTimeValue('25%', rootRange)).toBe(3500);
      expect(parseTimeValue('17%', rootRange)).toBe(2700);
    });

    it('handles percentages over 100%', () => {
      expect(parseTimeValue('150%', rootRange)).toBe(16000);
    });
  });

  describe('error handling', () => {
    it('throws on invalid seconds', () => {
      expect(() => parseTimeValue('abc', rootRange)).toThrow(
        'Invalid time value'
      );
      expect(() => parseTimeValue('', rootRange)).toThrow('Invalid time value');
    });

    it('throws on invalid milliseconds', () => {
      expect(() => parseTimeValue('abcms', rootRange)).toThrow(
        'Invalid milliseconds'
      );
      expect(() => parseTimeValue('ms', rootRange)).toThrow(
        'Invalid milliseconds'
      );
    });

    it('throws on invalid percentages', () => {
      expect(() => parseTimeValue('abc%', rootRange)).toThrow(
        'Invalid percentage'
      );
      expect(() => parseTimeValue('%', rootRange)).toThrow(
        'Invalid percentage'
      );
    });

    it('throws on invalid seconds with suffix', () => {
      expect(() => parseTimeValue('abcs', rootRange)).toThrow(
        'Invalid seconds'
      );
      expect(() => parseTimeValue('s', rootRange)).toThrow('Invalid seconds');
    });
  });

  describe('edge cases', () => {
    it('handles negative values', () => {
      expect(parseTimeValue('-1', rootRange)).toBe(0);
      expect(parseTimeValue('-1s', rootRange)).toBe(0);
      expect(parseTimeValue('-1000ms', rootRange)).toBe(0);
    });

    it('handles very large values', () => {
      // 1000000 seconds = 1000000000ms, plus rootRange.start (1000ms)
      expect(parseTimeValue('1000000', rootRange)).toBe(1000001000);
      expect(parseTimeValue('1000000s', rootRange)).toBe(1000001000);
    });

    it('handles zero', () => {
      expect(parseTimeValue('0', rootRange)).toBe(1000);
      expect(parseTimeValue('0s', rootRange)).toBe(1000);
      expect(parseTimeValue('0ms', rootRange)).toBe(1000);
      expect(parseTimeValue('0%', rootRange)).toBe(1000);
    });
  });
});
