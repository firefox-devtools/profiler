/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { makeBitSet, setBit, clearBit, checkBit } from '../../utils/bitset';

describe('BitSet', function () {
  it('uses an empty typed array when empty', function () {
    expect(makeBitSet(0).length).toBe(0);
  });

  it('allocates the right amount of slots', function () {
    expect(makeBitSet(31).length).toBe(1);
    expect(makeBitSet(32).length).toBe(1);
    expect(makeBitSet(33).length).toBe(2);
    expect(makeBitSet(63).length).toBe(2);
    expect(makeBitSet(64).length).toBe(2);
    expect(makeBitSet(65).length).toBe(3);
  });

  it('works in simple cases', function () {
    const bitset = makeBitSet(7);
    setBit(bitset, 3);
    expect(checkBit(bitset, 0)).toBeFalse();
    expect(checkBit(bitset, 3)).toBeTrue();
    expect(checkBit(bitset, 4)).toBeFalse();
    setBit(bitset, 5);
    expect(checkBit(bitset, 3)).toBeTrue();
    expect(checkBit(bitset, 5)).toBeTrue();
    setBit(bitset, 3);
    expect(checkBit(bitset, 3)).toBeTrue();
    expect(checkBit(bitset, 5)).toBeTrue();
    clearBit(bitset, 5);
    expect(checkBit(bitset, 3)).toBeTrue();
    expect(checkBit(bitset, 5)).toBeFalse();
    clearBit(bitset, 3);
    expect(checkBit(bitset, 3)).toBeFalse();
    expect(checkBit(bitset, 5)).toBeFalse();
  });

  it('works when it has to touch the sign bit', function () {
    const bitset = makeBitSet(65);
    setBit(bitset, 30);
    expect(checkBit(bitset, 30)).toBeTrue();
    expect(checkBit(bitset, 31)).toBeFalse();
    setBit(bitset, 31);
    expect(checkBit(bitset, 30)).toBeTrue();
    expect(checkBit(bitset, 31)).toBeTrue();
    expect(checkBit(bitset, 32)).toBeFalse();
    setBit(bitset, 32);
    setBit(bitset, 63);
    expect(checkBit(bitset, 32)).toBeTrue();
    expect(checkBit(bitset, 62)).toBeFalse();
    expect(checkBit(bitset, 63)).toBeTrue();
    expect(checkBit(bitset, 64)).toBeFalse();
    clearBit(bitset, 31);
    expect(checkBit(bitset, 30)).toBeTrue();
    expect(checkBit(bitset, 31)).toBeFalse();
    expect(checkBit(bitset, 32)).toBeTrue();
    expect(checkBit(bitset, 63)).toBeTrue();
  });
});
