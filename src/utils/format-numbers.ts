/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import memoize from 'memoize-immutable';
import NamedTupleMap from 'namedtuplemap';

import type {
  Microseconds,
  Milliseconds,
  Nanoseconds,
  WeightType,
} from '../types';
import { assertExhaustiveCheck } from './types';

// Calling `toLocalestring` repeatedly in a tight loop can be a performance
// problem. It's much better to reuse an instance of `Intl.NumberFormat`.
// This function simply returns an instance of this class, and then we use a
// memoization tool to store an instance for each set of arguments.
// It's probably OK to keep all instances because their number is finite.
function _getNumberFormat({
  places,
  style,
}: {
  places: number;
  style: 'decimal' | 'percent';
}): Intl.NumberFormat {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
    style: style,
  });
}

const _memoizedGetNumberFormat = memoize(_getNumberFormat, {
  cache: new NamedTupleMap(),
});

/**
 * Format a positive float into a string.
 *
 * Try to format the value to with `significantDigits` significant digits as
 * much as possible but without using scientific notation.  The number of
 * decimal places depends on the value: the closer to zero the value is, the
 * more decimal places are used in the resulting string.  No more than
 * `maxFractionalDigits` decimal places will be used.
 *
 * For example, using significantDigits = 2 (the default):
 *
 * formatNumber(0      ) =   "0"
 * formatNumber(123    ) = "123"
 * formatNumber(12.3   ) =  "12"
 * formatNumber(1.23   ) =   "1.2"
 * formatNumber(0.01234) =   "0.012"
 */
export function formatNumber(
  value: number,
  significantDigits: number = 2,
  maxFractionalDigits: number = 3,
  style: 'decimal' | 'percent' = 'decimal'
): string {
  if (value === 0) {
    const numberFormat = _memoizedGetNumberFormat({ places: 0, style });
    return numberFormat.format(value);
  }
  if (isNaN(value)) {
    return '<invalid>';
  }

  /*
   * Note that numDigitsOnLeft can be negative when the first non-zero digit
   * is on the right of the decimal point.  0.01 = -1
   */
  let numDigitsOnLeft = Math.floor(Math.log10(Math.abs(value))) + 1;
  if (style === 'percent') {
    // We receive percent values as `0.4` but display them as `40`, so we
    // should add `2` here to account for this difference.
    numDigitsOnLeft += 2;
  }
  let places = significantDigits - numDigitsOnLeft;
  if (places < 0) {
    places = 0;
  } else if (places > maxFractionalDigits) {
    places = maxFractionalDigits;
  }

  const numberFormat = _memoizedGetNumberFormat({ places, style });
  return numberFormat.format(value);
}

/**
 * Format call node numbers consistently.
 */
export function formatCallNodeNumber(
  weightType: WeightType,
  isHighPrecision: boolean,
  number: number
): string {
  // If the interval is an integer, display the number as an integer.
  let precision;
  switch (weightType) {
    case 'tracing-ms':
      precision = 1;
      break;
    case 'samples':
    case 'bytes':
      precision = 0;
      break;
    default:
      throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
  }

  if (isHighPrecision) {
    // Sometimes the number should be high precision, such as on a JS tracer thread
    // which has timing to the microsecond.
    precision = 3;
  }
  return formatNumber(number, 3, precision);
}

/**
 * Format call node numbers consistently.
 */
export function formatCallNodeNumberWithUnit(
  weightType: WeightType,
  isHighPrecision: boolean,
  number: number
): string {
  switch (weightType) {
    case 'tracing-ms': {
      // Sometimes the number should be high precision, such as on a JS tracer thread
      // which has timing to the microsecond.
      const precision = isHighPrecision ? 3 : 1;
      return formatNumber(number, 3, precision) + 'ms';
    }
    case 'samples': {
      // TODO - L10n properly
      const unit = number === 1 ? ' sample' : ' samples';
      return formatNumber(number, 3, 0) + unit;
    }
    case 'bytes': {
      // TODO - L10n properly
      const unit = number === 1 ? ' byte' : ' bytes';
      return formatNumber(number, 3, 0) + unit;
    }
    default:
      throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
  }
}

/**
 * Format a localized percentage. This takes a number valued between 0-1.
 */
export function formatPercent(ratio: number): string {
  return formatNumber(
    ratio,
    /* significantDigits */ 2,
    /* maxFractionalDigits */ 1,
    'percent'
  );
}

/**
 * Turn a number ranged 0 to 1 into a valid CSS percentage string. Use this over
 * formatPercent, as the latter is localized and may not be a valid percentage
 * for CSS.
 *
 * e.g.
 * 0.1       => "10.0000%"
 * 0.5333333 => "53.3333%"
 * 1.0       => "100.0000%"
 */
export function ratioToCssPercent(ratio: number): string {
  return (ratio * 100).toFixed(4) + '%';
}

export function formatGigaBytes(
  bytes: number,
  significantDigits: number = 3,
  maxFractionalDigits: number = 2,
  precision: number = Infinity
): string {
  const bytesPerGigabyte = 1000 ** 3;
  if (precision === Infinity) {
    return (
      formatNumber(
        bytes / bytesPerGigabyte,
        significantDigits,
        maxFractionalDigits
      ) + 'GB'
    );
  }

  if (precision >= bytesPerGigabyte) {
    bytes = Math.round(bytes / bytesPerGigabyte) * bytesPerGigabyte;
  }
  const megabytes = bytes % bytesPerGigabyte;
  return (
    formatNumber((bytes - megabytes) / bytesPerGigabyte, significantDigits, 0) +
    'GB' +
    ((megabytes > 0 && maxFractionalDigits > 0) || precision < bytesPerGigabyte
      ? ' ' + formatMegaBytes(megabytes, significantDigits, 0, precision)
      : '')
  );
}

export function formatMegaBytes(
  bytes: number,
  significantDigits: number = 3,
  maxFractionalDigits: number = 2,
  precision: number = Infinity
): string {
  const bytesPerMegabyte = 1000 ** 2;
  if (precision === Infinity) {
    return (
      formatNumber(
        bytes / bytesPerMegabyte,
        significantDigits,
        maxFractionalDigits
      ) + 'MB'
    );
  }

  if (precision >= bytesPerMegabyte) {
    bytes = Math.round(bytes / bytesPerMegabyte) * bytesPerMegabyte;
  }
  const kilobytes = bytes % bytesPerMegabyte;
  return (
    formatNumber((bytes - kilobytes) / bytesPerMegabyte, significantDigits, 0) +
    'MB' +
    ((kilobytes > 0 && maxFractionalDigits > 0) || precision < bytesPerMegabyte
      ? ' ' + formatKiloBytes(kilobytes, significantDigits, 0, precision)
      : '')
  );
}

export function formatKiloBytes(
  bytes: number,
  significantDigits: number = 3,
  maxFractionalDigits: number = 2,
  precision: number = Infinity
): string {
  const bytesPerKilobyte = 1000;
  if (precision === Infinity) {
    return (
      formatNumber(
        bytes / bytesPerKilobyte,
        significantDigits,
        maxFractionalDigits
      ) + 'KB'
    );
  }

  if (precision >= bytesPerKilobyte) {
    bytes = Math.round(bytes / bytesPerKilobyte) * bytesPerKilobyte;
  }
  const bytesOnly = bytes % bytesPerKilobyte;
  return (
    formatNumber((bytes - bytesOnly) / bytesPerKilobyte, significantDigits, 0) +
    'KB' +
    ((bytesOnly > 0 && maxFractionalDigits > 0) || precision < bytesPerKilobyte
      ? ' ' + formatBytes(bytesOnly, significantDigits, 0, precision)
      : '')
  );
}

export function formatBytes(
  bytes: number,
  significantDigits: number = 3,
  maxFractionalDigits: number = 2,
  precision: number = Infinity
): string {
  if (bytes < 10000) {
    // Use singles up to 10,000.  I think 9,360B looks nicer than 9.36KB.
    // We use "0" for significantDigits because bytes will always be integers.
    return formatNumber(bytes, 0) + 'B';
  } else if (bytes < 1000 ** 2) {
    return formatKiloBytes(
      bytes,
      significantDigits,
      maxFractionalDigits,
      precision
    );
  } else if (bytes < 1000 ** 3) {
    return formatMegaBytes(
      bytes,
      significantDigits,
      maxFractionalDigits,
      precision
    );
  }
  return formatGigaBytes(
    bytes,
    significantDigits,
    maxFractionalDigits,
    precision
  );
}

export function formatSI(num: number): string {
  if (num < 10000) {
    // Use singles up to 10,000.  I think 9,360 looks nicer than 9.36K.
    return formatNumber(num);
  } else if (num < 1000 * 1000) {
    return formatNumber(num / 1000, 3, 2) + 'K';
  } else if (num < 1000 * 1000 * 1000) {
    return formatNumber(num / (1000 * 1000), 3, 2) + 'M';
  }
  return formatNumber(num / (1000 * 1000 * 1000), 3, 2) + 'G';
}

export function formatNanoseconds(
  time: Nanoseconds,
  significantDigits: number = 3,
  maxFractionalDigits: number = 4
) {
  return formatNumber(time, significantDigits, maxFractionalDigits) + 'ns';
}

export function formatMicroseconds(
  time: Microseconds,
  significantDigits: number = 2,
  maxFractionalDigits: number = 3
) {
  return formatNumber(time, significantDigits, maxFractionalDigits) + 'μs';
}

export function formatMilliseconds(
  time: Milliseconds,
  significantDigits: number = 2,
  maxFractionalDigits: number = 3
) {
  return formatNumber(time, significantDigits, maxFractionalDigits) + 'ms';
}

export function formatSeconds(
  time: Milliseconds,
  significantDigits: number = 5,
  maxFractionalDigits: number = 3,
  precision: Milliseconds = Infinity
) {
  const msPerSecond = 1000;
  const timeInSeconds = time / msPerSecond;
  let result = '';
  if (precision < msPerSecond) {
    const exponent = Math.floor(Math.log10(precision / msPerSecond));
    const digits = Math.max(0, -exponent);
    result = timeInSeconds.toFixed(digits);
  } else {
    result = formatNumber(
      timeInSeconds,
      significantDigits,
      maxFractionalDigits
    );
  }
  return result + 's';
}

export function formatMinutes(
  time: Milliseconds,
  significantDigits: number = 5,
  maxFractionalDigits: number = 2,
  precision: Milliseconds = Infinity
) {
  const msPerSecond = 1000;
  const msPerMinute = 60 * msPerSecond;
  if (precision >= msPerSecond) {
    time = Math.round(time / msPerSecond) * msPerSecond;
  }
  const seconds = time % msPerMinute;
  return (
    formatNumber((time - seconds) / msPerMinute, significantDigits, 0) +
    'm' +
    ((seconds > 0 && maxFractionalDigits > 0) || precision < msPerMinute
      ? formatSeconds(seconds, significantDigits, 0, precision)
      : '')
  );
}

export function formatHours(
  time: Milliseconds,
  significantDigits: number = 5,
  maxFractionalDigits: number = 1,
  precision: Milliseconds = Infinity
) {
  const msPerMinute = 60 * 1000;
  if (precision >= msPerMinute) {
    time = Math.round(time / msPerMinute) * msPerMinute;
  }
  const msPerHour = 60 * msPerMinute;
  const minutes = time % msPerHour;
  return (
    formatNumber((time - minutes) / msPerHour, significantDigits, 0) +
    'h' +
    ((minutes > 0 && maxFractionalDigits > 0) || precision < msPerHour
      ? formatMinutes(minutes, significantDigits, 0, precision)
      : '')
  );
}

export function formatDays(
  time: Milliseconds,
  significantDigits: number = 5,
  maxFractionalDigits: number = 1,
  precision: Milliseconds = Infinity
) {
  const msPerHour = 60 * 60 * 1000;
  if (precision >= msPerHour) {
    time = Math.round(time / msPerHour) * msPerHour;
  }
  const msPerDay = 24 * msPerHour;
  const hours = time % msPerDay;
  return (
    formatNumber((time - hours) / msPerDay, significantDigits, 0) +
    'd' +
    ((hours > 0 && maxFractionalDigits > 0) || precision < msPerDay
      ? formatHours(hours, significantDigits, 0, precision)
      : '')
  );
}

export function formatTimestamp(
  time: Milliseconds,
  significantDigits: number = 5,
  maxFractionalDigits: number = 3,
  // precision is the minimum required precision.
  precision: Milliseconds = Infinity
) {
  if (precision !== Infinity) {
    // Round the values to display nicer numbers when the extra precision
    // isn't useful. (eg. show 3h52min10s instead of 3h52min14s)
    // Only do this for values < 10s as after that we use time units that are
    // not decimal.
    if (precision < 10000) {
      precision = 10 ** Math.floor(Math.log10(precision));
    }
    if (time > precision) {
      time = Math.round(time / precision) * precision;
    }
  }
  // Format in the closest base (days, hours, minutes, seconds, milliseconds,
  // microseconds, or nanoseconds), to avoid cases where times are displayed
  // with too many leading zeroes to be useful.
  // 59.5s is the smallest value rounded to 1min.
  if (time >= 60 * 1000 - (precision === Infinity ? 500 : 0)) {
    // The if blocks are nested to avoid repeated tests for the most
    // common case where the value will be less than 1 minute.
    // 59min59.5s is the smallest value rounded to 1h
    if (time >= 60 * 60 * 1000 - (precision === Infinity ? 500 : 0)) {
      // 23h59min30s is the smallest value rounded to 1d.
      if (
        time >=
        24 * 60 * 60 * 1000 - (precision === Infinity ? 30 * 1000 : 0)
      ) {
        return formatDays(
          time,
          significantDigits,
          maxFractionalDigits,
          precision
        );
      }
      return formatHours(
        time,
        significantDigits,
        maxFractionalDigits,
        precision
      );
    }
    return formatMinutes(
      time,
      significantDigits,
      maxFractionalDigits,
      precision
    );
  }
  if (time >= 1000) {
    return formatSeconds(
      time,
      significantDigits,
      Number.isInteger(time / 1000) ? 0 : maxFractionalDigits,
      precision
    );
  }
  if (time >= 1) {
    return formatMilliseconds(
      time,
      significantDigits,
      Number.isInteger(time) ? 0 : maxFractionalDigits
    );
  }
  if (time * 1000 >= 1) {
    return formatMicroseconds(
      time * 1000,
      significantDigits,
      Number.isInteger(time * 1000) ? 0 : maxFractionalDigits
    );
  }
  if (time === 0) {
    return '0s';
  }
  return formatNanoseconds(
    time * 1000 * 1000,
    significantDigits,
    Number.isInteger(time * 1000 * 1000) ? 0 : maxFractionalDigits
  );
}

/*
 * Format a value and a total to the form "v/t (p%)".  For example this can
 * be used to print "7MB/10MB (70%)"  fornatNum is a function to format the
 * individual numbers and includePercent may be set to false if you do not
 * wish to print the percentage.
 */
export function formatValueTotal(
  a: number,
  b: number,
  formatNum: (num: number) => string = String,
  includePercent: boolean = true
) {
  const value_total = formatNum(a) + ' / ' + formatNum(b);
  let percent = '';
  if (includePercent) {
    percent = ' (' + formatPercent(a / b) + ')';
  }

  return value_total + percent;
}

function _findRoundValueGreaterOrEqualTo(minValue: number): number {
  // Write minValue as a * 10^b, with 1 <= a < 10.
  // Return the lowest of 2 * 10^b, 5 * 10^b, 10 * 10^b that is greater or
  // equal to minValue.
  const b = Math.floor(Math.log10(minValue));
  if (minValue <= 2 * Math.pow(10, b)) {
    return 2 * Math.pow(10, b);
  }
  if (minValue <= 5 * Math.pow(10, b)) {
    return 5 * Math.pow(10, b);
  }
  return Math.pow(10, b + 1);
}

export function findRoundBytesValueGreaterOrEqualTo(minValue: number): number {
  // Special case KB, MB, GB.
  if (minValue > 1000 && minValue <= 1000 ** 4) {
    for (const power of [1, 2, 3]) {
      for (const value of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]) {
        const number = value * 1000 ** power;
        if (minValue <= number) {
          return number;
        }
      }
    }
  }

  return _findRoundValueGreaterOrEqualTo(minValue);
}

export function findRoundMillisecondsValueGreaterOrEqualTo(
  minValue: Milliseconds
): number {
  if (minValue > 10000 && minValue <= 48 * 3600 * 1000) {
    for (const seconds of [15, 20, 30]) {
      const number = seconds * 1000;
      if (minValue <= number) {
        return number;
      }
    }
    for (const minutes of [1, 2, 5, 10, 15, 20, 30]) {
      const number = minutes * 60 * 1000;
      if (minValue <= number) {
        return number;
      }
    }
    for (const hours of [1, 2, 3, 4, 6, 8, 12, 24, 48]) {
      const number = hours * 3600 * 1000;
      if (minValue <= number) {
        return number;
      }
    }
  }

  return _findRoundValueGreaterOrEqualTo(minValue);
}
