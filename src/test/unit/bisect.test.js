/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { bisectionLeft, bisectionRight } from '../../utils/bisect';

describe('bisectionRight', function() {
  const array = [0, 1, 2, 3, 3, 3, 3, 3, 5, 6, 7, 8, 9];

  // The new element to be inserted into this array is referred to as x
  it('returns index of the first number greater than x', function() {
    expect(bisectionRight(array, 4)).toBe(8);
    expect(bisectionRight(array, 3)).toBe(8);
  });

  it('returns index of the first number greater than x, occuring after low', function() {
    expect(bisectionRight(array, 4, 8)).toBe(8);
    expect(bisectionRight(array, 3, 9)).toBe(9);
  });

  it('returns index of the first number greater than x, between low and high', function() {
    expect(bisectionRight(array, 4, 1, 7)).toBe(7);
    expect(bisectionRight(array, 3, 4, 6)).toBe(6);
  });

  it('returns 0 if all elements are greater than x', function() {
    expect(bisectionRight(array, -5)).toBe(0);
  });

  it('returns array length if x is greater than all elements', function() {
    expect(bisectionRight(array, 15)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function() {
    expect(() => bisectionRight(array, 15, -2)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 100)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 2, -10)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 2, 100)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, -20, -10)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 100, 200)).toThrow(TypeError);
  });
});

describe('bisectionLeft', function() {
  const array = [0, 1, 2, 3, 3, 3, 3, 3, 5, 6, 7, 8, 9];

  it('returns index of the first number greater than x, if x does not exist in the array', function() {
    expect(bisectionLeft(array, 4)).toBe(8);
  });

  it('returns index of first occurence of x, if x exists in the array', function() {
    expect(bisectionLeft(array, 3)).toBe(3);
  });

  it('returns index of the first number greater than x or the first occurence of x, occuring after low', function() {
    expect(bisectionLeft(array, 2, 1)).toBe(2);
    expect(bisectionLeft(array, 3, 6)).toBe(6);
  });

  it('returns index of the first number greater than x or the first occurence of x, between low and high', function() {
    expect(bisectionLeft(array, 2, 5, 8)).toBe(5);
    expect(bisectionLeft(array, 3, 4, 6)).toBe(4);
  });

  it('returns 0 if all elements are greater than x', function() {
    expect(bisectionLeft(array, -2)).toBe(0);
  });

  it('returns array length if x is greater than all elements', function() {
    expect(bisectionLeft(array, 15)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function() {
    expect(() => bisectionLeft(array, 15, -2)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 100)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 2, -10)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 2, 100)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, -20, -10)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 100, 200)).toThrow(TypeError);
  });
});
