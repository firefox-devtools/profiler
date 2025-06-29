/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import {
  formatNumber,
  formatGigaBytes,
  formatMegaBytes,
  formatKiloBytes,
  formatBytes,
  findRoundBytesValueGreaterOrEqualTo,
  findRoundMillisecondsValueGreaterOrEqualTo,
} from 'firefox-profiler/utils/format-numbers.js';

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
    expect(formatGigaBytes(0)).toBe('0GiB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatGigaBytes(1234567890123)).toBe('1,150GiB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatGigaBytes(1234567890)).toBe('1.15GiB');
  });

  it('can return values with byte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1)).toBe(
      '1GiB 153MiB 384KiB 722B'
    );
  });

  it('can return values with kilobyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1024)).toBe('1GiB 153MiB 385KiB');
  });

  it('can return values with megabyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1024 ** 2)).toBe('1GiB 153MiB');
  });

  it('can return values with gigabyte precision', () => {
    expect(formatGigaBytes(1234567890, 3, 2, 1024 ** 3)).toBe('1GiB');
  });
});

describe('formatMegaBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatMegaBytes(0)).toBe('0MiB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatMegaBytes(1234567890)).toBe('1,177MiB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatMegaBytes(1234567)).toBe('1.18MiB');
  });

  it('can return values with byte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1)).toBe('1MiB 181KiB 647B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1024)).toBe('1MiB 182KiB');
  });

  it('can return values with megabyte precision', () => {
    expect(formatMegaBytes(1234567, 3, 2, 1024 ** 2)).toBe('1MiB');
  });
});

describe('formatKiloBytes', () => {
  it('returns 0 without fractional digits when called with 0', () => {
    expect(formatKiloBytes(0)).toBe('0KiB');
  });

  it('returns large values without fractional digits by default', () => {
    expect(formatKiloBytes(1234567)).toBe('1,206KiB');
  });

  it('returns values with 2 fractional digits by default', () => {
    expect(formatKiloBytes(1234)).toBe('1.21KiB');
  });

  it('can return values with byte precision', () => {
    expect(formatKiloBytes(1234, 3, 2, 1)).toBe('1KiB 210B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatKiloBytes(1234, 3, 2, 1024)).toBe('1KiB');
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
    expect(formatBytes(12345)).toBe('12.1KiB');
  });

  it('can return values with the megabyte unit', () => {
    expect(formatBytes(1234567)).toBe('1.18MiB');
  });

  it('can return values with the gigabyte unit', () => {
    expect(formatBytes(1234567890)).toBe('1.15GiB');
  });

  it('can return values with byte precision', () => {
    expect(formatBytes(12345, 3, 2, 1)).toBe('12KiB 57B');
  });

  it('can return values with kilobyte precision', () => {
    expect(formatBytes(12345, 3, 2, 1024)).toBe('12KiB');
  });
});

describe('findRoundBytesValueGreaterOrEqualTo', () => {
  const expectedValues = [0, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

  it('rounds small bytes values using base 10 round value', () => {
    for (let i = 0; i < expectedValues.length; ++i) {
      expect(findRoundBytesValueGreaterOrEqualTo(2 ** i - 1)).toBe(
        expectedValues[i]
      );
    }
  });

  it('rounds large bytes values using base 2 round value', () => {
    for (let i = expectedValues.length; i < 40; ++i) {
      expect(findRoundBytesValueGreaterOrEqualTo(2 ** i - 1)).toBe(2 ** i);
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
