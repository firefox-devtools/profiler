/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { canonicalizeRangeSet } from '../../utils/range-set';

describe('canonicalizeRangeSet', function () {
  it('sorts unsorted ranges', function () {
    expect(
      canonicalizeRangeSet([
        { start: 5, end: 6 },
        { start: 1, end: 2 },
      ])
    ).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 6 },
    ]);
  });

  it('absorbs nested ranges', function () {
    expect(
      canonicalizeRangeSet([
        { start: 1, end: 6 },
        { start: 3, end: 6 },
      ])
    ).toEqual([{ start: 1, end: 6 }]);
  });

  it('unifies overlapping ranges', function () {
    expect(
      canonicalizeRangeSet([
        { start: 1, end: 4 },
        { start: 3, end: 6 },
      ])
    ).toEqual([{ start: 1, end: 6 }]);
  });

  it('unifies adjacent ranges', function () {
    expect(
      canonicalizeRangeSet([
        { start: 1, end: 3 },
        { start: 3, end: 6 },
      ])
    ).toEqual([{ start: 1, end: 6 }]);
  });

  it('removes empty ranges', function () {
    expect(
      canonicalizeRangeSet([
        { start: 1, end: 3 },
        { start: 6, end: 6 },
      ])
    ).toEqual([{ start: 1, end: 3 }]);
  });

  it('handles this complicated example', function () {
    expect(
      canonicalizeRangeSet([
        { start: 1, end: 2.5 },
        { start: 1.5, end: 2 },
        { start: 1, end: 2 },
        { start: 1.7, end: 2.6 },
        { start: -4, end: -4 },
        { start: -4, end: -3.8 },
        { start: -3.5, end: 2.5 },
        { start: -3.5, end: -3 },
        { start: -6, end: -4 },
      ])
    ).toEqual([
      { start: -6, end: -3.8 },
      { start: -3.5, end: 2.6 },
    ]);
  });
});
