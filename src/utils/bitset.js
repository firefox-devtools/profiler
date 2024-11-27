/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// A packed alternative to Array<boolean>.
// Created with makeBitSet.
// All 32 bits in each array element are utilized, though of course the last
// element is only partially used if the "bit length" is not a multiple of 32.
// The original "bit length" is not remembered.
export type BitSet = Int32Array;

// 2^5 == 32.

export function makeBitSet(length: number): BitSet {
  const lastIndex = length - 1;
  const lastSlot = lastIndex >> 5;
  const slotCount = lastSlot + 1;
  return new Int32Array(slotCount);
}

export function setBit(bitSet: BitSet, bitIndex: number) {
  const q = bitIndex >> 5;
  const r = bitIndex & 0b11111;
  bitSet[q] |= 1 << r;
}

export function clearBit(bitSet: BitSet, bitIndex: number) {
  const q = bitIndex >> 5;
  const r = bitIndex & 0b11111;
  bitSet[q] &= ~(1 << r);
}

export function checkBit(bitSet: BitSet, bitIndex: number): boolean {
  const q = bitIndex >> 5;
  const r = bitIndex & 0b11111;
  return (bitSet[q] & (1 << r)) !== 0;
}
