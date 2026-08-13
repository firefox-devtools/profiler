/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resolveBenchmarkProfileNames } from '../../components/app/BenchmarkProfileNames';

describe('resolveBenchmarkProfileNames', function () {
  it('falls back to Baseline/New, per side', function () {
    expect(resolveBenchmarkProfileNames(null)).toEqual({
      base: 'Baseline',
      new: 'New',
    });
    // Half-filled and whitespace-only are the same case: the names come from a
    // query parameter anyone can hand-edit, and one empty side must not shift
    // the other one over.
    expect(resolveBenchmarkProfileNames(['Chrome'])).toEqual({
      base: 'Chrome',
      new: 'New',
    });
    expect(resolveBenchmarkProfileNames(['  ', 'Nightly'])).toEqual({
      base: 'Baseline',
      new: 'Nightly',
    });
  });

  it('keeps two identical names apart', function () {
    // Otherwise the whole report reads "Firefox is slower than Firefox", and
    // every sentence in it becomes unparseable.
    expect(resolveBenchmarkProfileNames(['Firefox', 'Firefox'])).toEqual({
      base: 'Firefox',
      new: 'Firefox (2)',
    });
  });
});
