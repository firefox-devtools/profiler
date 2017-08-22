/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * Format a positive float into a string.
 *
 * Try to format the value to 2 significant digits as much as possible but
 * without using scientific notation.  The number of decimal places depends
 * on the value: the closer to zero the value is, the more decimal places
 * are used in the resulting string.
 *
 * For example:
 *
 * formatNumber(123,   ) = "123"
 * formatNumber(12.3,  ) =  "12"
 * formatNumber(1.23,  ) =   "1.2"
 * formatNumber(0.01234) =   "0.012"
 */
export function formatNumber(value: number): string {
  let result: string;
  if (value >= 10) {
    result = value.toFixed(0);
  } else if (value >= 1) {
    result = value.toFixed(1);
  } else if (value >= 0.1) {
    result = value.toFixed(2);
  } else {
    result = value.toFixed(3);
  }

  return result;
}

export function formatPercent(value: number): string {
  return formatNumber(value * 100) + '%';
}
