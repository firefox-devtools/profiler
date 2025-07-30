/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Space-efficient url component compatible encoding for arrays of 32bit
 * unsigned integers. Smaller numbers take up fewer characters, and ranges
 * of consecutive numbers are collapsed into a range syntax.
 */

// Depending on who you ask, there are different sets of allowed (non-reserved)
// characters you can use in a URL component without percent-encoding. The most
// stringent set is defined by RFC 3986, which only allows 66 characters:
// 10 digits + 26 * 2 letters + 4 special characters . _ - ~
// The JavaScript encodeURIComponent function is less strict than RFC 3986 and
// also allows the following five characters, but we do not use them: ! ' ( ) *
//
// This file implements a VLQ-style encoding for arrays of unsigned 32 integers.
//
// The encoding makes use of 64 of the allowed 66 URL component characters:
// 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ._
// It leaves - and ~ available for other uses.
// Individual numbers take up fewer characters ("digits") than in the decimal
// encoding, and there is no need for separator characters. Moreover, sequences
// of consecutive integers (going up by 1 or down by 1) have a compact
// representation using a "range marker" ("w").
// Examples:
//  [0] -> "0", [9, 10] -> "9a", [31, 167, 32, 33, 34, 35] -> "vB7x0wx3"
//
// Here's how it works:
// Each individual number is encoded as a variable-length quantity into a sequence
// of 6-bit digits. Each digit has 1 "continuation bit" and 5 "value bits".
// Each digit is represented as one of the 64 possible characters (2^6 == 64).
// See https://en.wikipedia.org/wiki/Variable-length_quantity for more background,
// but note that our encoding uses sextets (6-bit digits) rather than octets.
// The Wikipedia article mentions redundancy from "leading zero" octets (0x80).
// Those correspond to "leading zero" sextets (0b100000, "w") in this encoding,
// and we exploit this redundancy for the consecutive range syntax: If a number
// starts with a leading zero digit, it means that the uint array should
// include all consecutive numbers starting at the previous decoded number up
// to (or down to) the current decoded number. Otherwise, no leading zero
// digits are emitted, so smaller numbers take up fewer digits.

const ENCODING_DIGITS: string =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ._';

// Prepending this digit to an encoded number does not change the number: It's
// like a leading zero. It has the continuation bit set to 1 but the value bits
// set to zero. The encoding for this digit is "w".
// We use this digit to indicate "consecutive ranges".
const LEADING_ZERO_DIGIT: string = ENCODING_DIGITS[0b100000];

export function encodeUintSetForUrlComponent(numbers: Set<number>): string {
  // A set has no order. Convert it to an array and then sort the array,
  // so that consecutive numbers can be detected by encodeUintArrayForUrlComponent.
  const array = Array.from(numbers);
  array.sort((a, b) => a - b);
  return encodeUintArrayForUrlComponent(array);
}

export function encodeUintArrayForUrlComponent(numbers: number[]): string {
  let result = '';
  for (let i = 0; i < numbers.length; i++) {
    const skipCount = countSkippableConsecutiveNumbersAt(numbers, i);
    if (skipCount === 0) {
      result += encodeUint(numbers[i]);
      continue;
    }

    i += skipCount;

    // We use the "leading zero digit" as the range marker.
    result += LEADING_ZERO_DIGIT;
    result += encodeUint(numbers[i]);
  }
  return result;
}

export function decodeUintArrayFromUrlComponent(s: string): number[] {
  const array = [];
  let i = 0;
  while (i < s.length) {
    const { value, hasLeadingZero, nextI } = decodeUint(s, i);
    if (hasLeadingZero && array.length >= 1) {
      const startValue = array[array.length - 1];
      const endValue = value;
      if (endValue > startValue) {
        for (let x = startValue + 1; x < endValue; x++) {
          array.push(x);
        }
      } else {
        for (let x = startValue - 1; x > endValue; x--) {
          array.push(x);
        }
      }
    }
    array.push(value);
    i = nextI;
  }
  return array;
}

// Returns the number of items at numbers[start..] that can be substituted with a
// "consecutive range" marker. If the return value is non-zero, there is a
// consecutive range which starts at numbers[start - 1] and ends at
// numbers[start + returnValue] (inclusive).
// A consecutive range is a sequence of at least three numbers which either all
// go up by one or down by one.
//
// Example:
//   We want to turn the sequence "1, 3, 4, 5, 6, 5, 4, 3, 2" into the "collapsed"
//   sequence "1, 3, ...6, ...2".
//   We skip "4, 5" and substitute them with a range marker:
//   countSkippableConsecutiveNumbersAt([1, 3, 4, 5, 6, 5, 4, 3, 2], 2) === 2
//                                             ^^^^ can be skipped
//   We also skip "5, 4, 3":
//   countSkippableConsecutiveNumbersAt([1, 3, 4, 5, 6, 5, 4, 3, 2], 5) === 3
//                                                      ^^^^^^^ can be skipped
function countSkippableConsecutiveNumbersAt(
  numbers: number[],
  start: number
): number {
  if (start < 1 || start + 1 >= numbers.length) {
    return 0;
  }
  const previous = numbers[start - 1];
  const current = numbers[start];
  const next = numbers[start + 1];

  let skipCount = 0;
  if (current === previous + 1 && next === current + 1) {
    // Found increasing consecutive range.
    skipCount = 1;
    while (
      start + skipCount + 1 < numbers.length &&
      numbers[start + skipCount + 1] === current + skipCount + 1
    ) {
      skipCount++;
    }
  } else if (current === previous - 1 && next === current - 1) {
    // Found decreasing consecutive range.
    skipCount = 1;
    while (
      start + skipCount + 1 < numbers.length &&
      numbers[start + skipCount + 1] === current - skipCount - 1
    ) {
      skipCount++;
    }
  }
  return skipCount;
}

function encodeUint(value: number): string {
  // Build the string digit by digit, back to front. The last digit has the
  // continuation bit set to 0, the other digits have it set to 1.
  // No "leading zero" digits are emitted, so that smaller numbers use fewer
  // digits, and so that "leading zero" digits can have special meaning.
  let x = value;
  let r = ENCODING_DIGITS[x & 0b11111];
  x >>= 5;
  while (x !== 0) {
    r = ENCODING_DIGITS[0b100000 + (x & 0b11111)] + r;
    x >>= 5;
  }
  return r;
}

function bitsFromEncodingDigit(x: string): number {
  switch (x) {
    // ENCODING_DIGITS.split('').map((c, i) => `    case '${c}': return ${i};`).join('\n')
    case '0':
      return 0;
    case '1':
      return 1;
    case '2':
      return 2;
    case '3':
      return 3;
    case '4':
      return 4;
    case '5':
      return 5;
    case '6':
      return 6;
    case '7':
      return 7;
    case '8':
      return 8;
    case '9':
      return 9;
    case 'a':
      return 10;
    case 'b':
      return 11;
    case 'c':
      return 12;
    case 'd':
      return 13;
    case 'e':
      return 14;
    case 'f':
      return 15;
    case 'g':
      return 16;
    case 'h':
      return 17;
    case 'i':
      return 18;
    case 'j':
      return 19;
    case 'k':
      return 20;
    case 'l':
      return 21;
    case 'm':
      return 22;
    case 'n':
      return 23;
    case 'o':
      return 24;
    case 'p':
      return 25;
    case 'q':
      return 26;
    case 'r':
      return 27;
    case 's':
      return 28;
    case 't':
      return 29;
    case 'u':
      return 30;
    case 'v':
      return 31;
    case 'w':
      return 32;
    case 'x':
      return 33;
    case 'y':
      return 34;
    case 'z':
      return 35;
    case 'A':
      return 36;
    case 'B':
      return 37;
    case 'C':
      return 38;
    case 'D':
      return 39;
    case 'E':
      return 40;
    case 'F':
      return 41;
    case 'G':
      return 42;
    case 'H':
      return 43;
    case 'I':
      return 44;
    case 'J':
      return 45;
    case 'K':
      return 46;
    case 'L':
      return 47;
    case 'M':
      return 48;
    case 'N':
      return 49;
    case 'O':
      return 50;
    case 'P':
      return 51;
    case 'Q':
      return 52;
    case 'R':
      return 53;
    case 'S':
      return 54;
    case 'T':
      return 55;
    case 'U':
      return 56;
    case 'V':
      return 57;
    case 'W':
      return 58;
    case 'X':
      return 59;
    case 'Y':
      return 60;
    case 'Z':
      return 61;
    case '.':
      return 62;
    case '_':
      return 63;
    default:
      return 0;
  }
}

// Decode a single encoded number which begins at s[start].
function decodeUint(
  s: string,
  start: number
): {
  // The decoded number.
  value: number,
  // Whether the encoding of this number started with a "leading zero" digit.
  // Our caller uses this as a "consecutive range" marker.
  hasLeadingZero: boolean,
  // The end of the variable-length encoding; the next number starts at s[nextI].
  nextI: number,
} {
  let i = start;
  let bits = bitsFromEncodingDigit(s[i]);
  let continuationBit = bits & 0b100000;
  let valueBits = bits & 0b011111;
  const hasLeadingZero = continuationBit !== 0 && valueBits === 0;
  let value = valueBits;
  i++;
  while (continuationBit && i < s.length) {
    bits = bitsFromEncodingDigit(s[i]);
    continuationBit = bits & 0b100000;
    valueBits = bits & 0b011111;
    value = (value << 5) | valueBits;
    i++;
  }
  return { value, hasLeadingZero, nextI: i };
}
