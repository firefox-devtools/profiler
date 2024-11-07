/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { formatNumber } from 'firefox-profiler/utils/format-numbers.js';

describe('formatNumber', () => {
  it('return 0 without digits when called with 0', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('does not fail when called with NaN', () => {
    expect(formatNumber(NaN)).toBe('<invalid>');
  });
});
