/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  formatNumber,
  formatGigaBytes,
  formatMegaBytes,
  formatKiloBytes,
  formatBytes,
  findRoundBytesValueGreaterOrEqualTo,
  findRoundMillisecondsValueGreaterOrEqualTo,
} from 'firefox-profiler/utils/format-numbers';

describe('formatNumber', () => {
  it('return 0 without digits when called with 0', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('does not fail when called with NaN', () => {
    expect(formatNumber(NaN)).toBe('<invalid>');
  });
});

describe('formatGigaBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatGigaBytes(0)).toBe('0GB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatGigaBytes(1234567890123)).toBe('1,235GB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatGigaBytes(1234567890)).toBe('1.23GB');
  });

  it('can return values with byte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1)).toBe('1GB 234MB 567KB 890B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1000)).toBe('1GB 234MB 568KB');
  });

  it('can return values with megabyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1000 ** 2)).toBe('1GB 235MB');
  });

  it('can return values with gigabyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1000 ** 3)).toBe('1GB');
  });
});

describe('formatMegaBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatMegaBytes(0)).toBe('0MB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatMegaBytes(1234567890)).toBe('1,235MB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatMegaBytes(1234567)).toBe('1.23MB');
  });

  it('can return values with byte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1)).toBe('1MB 234KB 567B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1000)).toBe('1MB 235KB');
  });

  it('can return values with megabyte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1000 ** 2)).toBe('1MB');
  });
});

describe('formatKiloBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatKiloBytes(0)).toBe('0KB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatKiloBytes(1234567)).toBe('1,235KB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatKiloBytes(1234)).toBe('1.23KB');
  });

  it('can return values with byte precision', () => {
    expect(formatKiloBytes(1234, 3, 2, 1)).toBe('1KB 234B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatKiloBytes(1234, 3, 2, 1000)).toBe('1KB');
  });
});

describe('formatBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatBytes(0)).toBe('0B');
  });

  it('can return values with the byte unit', () => {
    expect(formatBytes(1023)).toBe('1,023B');
  });

  it('can return values with the kilobyte unit', () => {
    expect(formatBytes(12345)).toBe('12.3KB');
  });

  it('can return values with the megabyte unit', () => {
    expect(formatBytes(1234567)).toBe('1.23MB');
  });

  it('can return values with the gigabyte unit', () => {
    expect(formatBytes(1234567890)).toBe('1.23GB');
  });

  it('can return values with byte precision', () => {
    expect(formatBytes(12345, 3, 2, 1)).toBe('12KB 345B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatBytes(12345, 3, 2, 1000)).toBe('12KB');
  });
});

describe('findRoundBytesValueGreaterOrEqualTo', () => {
  const expectedValues = [
    // minValue, expected
    // minValue <= 1000
    [0, 0],
    [3, 5],
    [63, 100],
    [511, 1000],
    [1000, 2000],

    // 1000 < minValue <= 1000^4
    [2047, 4000],
    [9999, 16000],
    [123456, 128000],
    [999999, 1000000],
    [1_234_567, 2_000_000],
    [1_234_567_891, 2_000_000_000],

    // minValue > 1000^4
    [1_234_567_891_234, 2_000_000_000_000],
    [1_234_567_891_234_567, 2_000_000_000_000_000],
  ];

  it('correctly rounds bytes values using base 10 round value', () => {
    for (let i = 0; i < expectedValues.length; ++i) {
      const [input, expected] = expectedValues[i];
      expect(findRoundBytesValueGreaterOrEqualTo(input)).toBe(expected);
    }
  });
});

describe('findRoundMillisecondsValueGreaterOrEqualTo', () => {
  it('rounds values < 10s using base 10 round value', () => {
    const expectedValues = [
      2, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 5000, 10000,
    ];
    for (let i = 0; i < expectedValues.length; ++i) {
      expect(findRoundMillisecondsValueGreaterOrEqualTo(2 ** i)).toBe(
        expectedValues[i]
      );
    }
  });

  const msPerSec = 1000;
  const msPerMin = 60 * msPerSec;
  const msPerHour = 60 * msPerMin;
  const msPerDay = 24 * msPerHour;

  it('rounds values > 10s using round values in seconds, minutes, hours or days', () => {
    const expectedValues = [
      [12 * msPerSec, 15 * msPerSec],
      [16 * msPerSec, 20 * msPerSec],
      [21 * msPerSec, 30 * msPerSec],
      [40 * msPerSec, 1 * msPerMin],
      [1 * msPerMin + 1 * msPerSec, 2 * msPerMin],
      [3 * msPerMin, 5 * msPerMin],
      [6 * msPerMin, 10 * msPerMin],
      [11 * msPerMin, 15 * msPerMin],
      [16 * msPerMin, 20 * msPerMin],
      [21 * msPerMin, 30 * msPerMin],
      [40 * msPerMin, 1 * msPerHour],
      [1 * msPerHour + 1 * msPerMin, 2 * msPerHour],
      [2 * msPerHour + 1 * msPerMin, 3 * msPerHour],
      [3 * msPerHour + 1 * msPerMin, 4 * msPerHour],
      [4 * msPerHour + 1 * msPerMin, 6 * msPerHour],
      [7 * msPerHour, 8 * msPerHour],
      [10 * msPerHour, 12 * msPerHour],
      [13 * msPerHour, 1 * msPerDay],
      [25 * msPerHour, 2 * msPerDay],
    ];
    for (const [val, expected] of expectedValues) {
      expect(findRoundMillisecondsValueGreaterOrEqualTo(val)).toBe(expected);
    }
  });

  it('rounds values above 2 days using base 10 round value', () => {
    expect(findRoundMillisecondsValueGreaterOrEqualTo(2 * msPerDay + 1)).toBe(
      200000000
    );
  });
});
