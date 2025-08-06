/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  decodeUintArrayFromUrlComponent,
  encodeUintArrayForUrlComponent,
} from '../../utils/uintarray-encoding';

describe('UintArray encoding', function () {
  const checks: Array<[number[], string]> = [
    // [array, encoding]
    [[0], '0'],
    [[9, 10], '9a'],
    [[31, 167, 32, 33, 34], 'vB7x0wx2'],
    [[6, 219, 218, 217, 216, 9, 10, 11, 12], '6CrwCo9wc'],
    [[6, 4, 5, 6, 7, 6, 5, 4, 3, 2, 3, 4, 5], '64w7w2w5'],
    [[366, 21, 21, 24, 31576, 27, 21, 13], 'Hello.World'],
  ];

  it('encodes correctly', function () {
    for (const [arr, enc] of checks) {
      expect(encodeUintArrayForUrlComponent(arr)).toBe(enc);
    }
  });

  it('decodes correctly', function () {
    for (const [arr, enc] of checks) {
      expect(decodeUintArrayFromUrlComponent(enc)).toEqual(arr);
    }
  });

  function roundTripEncoded(s: string) {
    return encodeUintArrayForUrlComponent(decodeUintArrayFromUrlComponent(s));
  }

  it('removes redundant leading zeros', function () {
    expect(roundTripEncoded('wa')).toEqual('a');
    expect(roundTripEncoded('wawb')).toEqual('ab');
    expect(roundTripEncoded('wawwwb')).toEqual('ab');
    expect(roundTripEncoded('wawwwc')).toEqual('awc');
  });

  it('simplifies consecutive ranges', function () {
    expect(roundTripEncoded('012345')).toEqual('0w5');
    expect(roundTripEncoded('abcd012345432')).toEqual('awd0w5w2');
  });
});
