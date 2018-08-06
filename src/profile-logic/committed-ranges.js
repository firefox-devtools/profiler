/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { StartEndRange } from '../types/units';

/**
 * Users can make preview range selections on the profile, and then can commit these
 * to drill down into a profile. This file contains functions for working with these
 * committed ranges.
 */

/**
 * Parse URL encoded committed ranges with the form: "start-end~start-end", where
 * `start` and `end` are positive or negative float numbers.
 */
export function parseCommittedRanges(
  stringValue: string = ''
): StartEndRange[] {
  if (!stringValue) {
    return [];
  }
  return stringValue.split('~').map(s => {
    const m = s.match(/(-?[0-9.]+)_(-?[0-9.]+)/);
    if (!m) {
      return { start: 0, end: 1000 };
    }
    return { start: Number(m[1]) * 1000, end: Number(m[2]) * 1000 };
  });
}

/**
 * Stringify committed ranges into the following form: "start-end~start-end", where
 * `start` and `end` are float numbers.
 */
export function stringifyCommittedRanges(
  arrayValue: StartEndRange[] = []
): string {
  return arrayValue
    .map(({ start, end }) => {
      const startStr = (start / 1000).toFixed(4);
      const endStr = (end / 1000).toFixed(4);
      return `${startStr}_${endStr}`;
    })
    .join('~');
}

export function getFormattedTimeLength(length: number): string {
  if (length >= 10000) {
    return `${(length / 1000).toFixed(0)} sec`;
  }
  if (length >= 1000) {
    return `${(length / 1000).toFixed(1)} sec`;
  }
  return `${length.toFixed(0)} ms`;
}

export function getCommittedRangeLabels(
  commitedRanges: StartEndRange[]
): string[] {
  const labels = commitedRanges.map(range =>
    getFormattedTimeLength(range.end - range.start)
  );
  labels.unshift('Full Range');
  return labels;
}
