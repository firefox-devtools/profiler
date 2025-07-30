/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { StartEndRange } from 'firefox-profiler/types';

/**
 * Canonicalize the list of ranges, by OR'ing nested and overlapping ranges
 * together so that the resulting list of ranges is a flat list of ranges which
 * covers the same time values. The resulting list has the following properties:
 *
 *  - Sorted by range.start
 *  - No empty ranges
 *  - No overlap
 *  - Adjacent ranges are collapsed into one
 */
export function canonicalizeRangeSet(ranges: StartEndRange[]): StartEndRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sortedRanges = ranges.slice().sort((a, b) => a.start - b.start);
  let lastCanonRange = { ...sortedRanges[0] };
  const canonRanges = [lastCanonRange];

  for (let i = 1; i < sortedRanges.length; i++) {
    const range = sortedRanges[i];
    if (range.start >= range.end) {
      // Empty or invalid range, skip.
      continue;
    }

    if (range.end <= lastCanonRange.end) {
      // lastCanonRange already covers this range completely.
      continue;
    }

    if (range.start <= lastCanonRange.end) {
      // range's beginning overlaps lastCanonRange's end. Merge the two ranges.
      lastCanonRange.end = range.end;
      continue;
    }

    lastCanonRange = { ...range };
    canonRanges.push(lastCanonRange);
  }

  return canonRanges;
}
