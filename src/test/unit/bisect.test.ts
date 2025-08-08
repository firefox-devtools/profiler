/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  bisectionLeft,
  bisectionRight,
  bisectionRightByKey,
  bisectionRightByStrKey,
} from '../../utils/bisect';

describe('bisectionRight', function () {
  const array = [0, 1, 2, 3, 3, 3, 3, 3, 5, 6, 7, 8, 9];

  // The new element to be inserted into this array is referred to as x
  it('returns index of the first number greater than x', function () {
    expect(bisectionRight(array, 4)).toBe(8);
    expect(bisectionRight(array, 3)).toBe(8);
  });

  it('returns index of the first number greater than x, occuring after low', function () {
    expect(bisectionRight(array, 4, 8)).toBe(8);
    expect(bisectionRight(array, 3, 9)).toBe(9);
  });

  it('returns index of the first number greater than x, between low and high', function () {
    expect(bisectionRight(array, 4, 1, 7)).toBe(7);
    expect(bisectionRight(array, 3, 4, 6)).toBe(6);
  });

  it('returns 0 if all elements are greater than x', function () {
    expect(bisectionRight(array, -5)).toBe(0);
  });

  it('returns array length if x is greater than all elements', function () {
    expect(bisectionRight(array, 15)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function () {
    expect(() => bisectionRight(array, 15, -2)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 100)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 2, -10)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 2, 100)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, -20, -10)).toThrow(TypeError);
    expect(() => bisectionRight(array, 15, 100, 200)).toThrow(TypeError);
  });
});

describe('bisectionRightByKey', function () {
  // T is string
  // We're going to use a key function which maps a string to its length.
  // This array is sorted by string length.
  const array = [
    '',
    'a',
    'in',
    'cat',
    'dog',
    'moo',
    'bus',
    'fob',
    'camel',
    'stairs',
    'kitchen',
    'profiler',
    'profiling',
  ];

  function strLen(s: string): number {
    return s.length;
  }

  // The new element to be inserted into this array is referred to as x
  it('returns index of the first element whose key is greater than x', function () {
    expect(bisectionRightByKey(array, 4, strLen)).toBe(8);
    expect(bisectionRightByKey(array, 3, strLen)).toBe(8);
  });

  it('returns index of the first element whose key is greater than x, occuring after low', function () {
    expect(bisectionRightByKey(array, 4, strLen, 8)).toBe(8);
    expect(bisectionRightByKey(array, 3, strLen, 9)).toBe(9);
  });

  it('returns index of the first element whose key is greater than x, between low and high', function () {
    expect(bisectionRightByKey(array, 4, strLen, 1, 7)).toBe(7);
    expect(bisectionRightByKey(array, 3, strLen, 4, 6)).toBe(6);
  });

  it('returns 0 if the keys of all elements are greater than x', function () {
    expect(bisectionRightByKey(array, -5, strLen)).toBe(0);
  });

  it('returns array length if x is greater than the key of all elements', function () {
    expect(bisectionRightByKey(array, 15, strLen)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function () {
    expect(() => bisectionRightByKey(array, 15, strLen, -2)).toThrow(TypeError);
    expect(() => bisectionRightByKey(array, 15, strLen, 100)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByKey(array, 15, strLen, 2, -10)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByKey(array, 15, strLen, 2, 100)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByKey(array, 15, strLen, -20, -10)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByKey(array, 15, strLen, 100, 200)).toThrow(
      TypeError
    );
  });
});

describe('bisectionRightByStrKey', function () {
  const array = [
    { name: 'a0' },
    { name: 'a1' },
    { name: 'a2' },
    { name: 'a3' },
    { name: 'a3' },
    { name: 'a3' },
    { name: 'a3' },
    { name: 'a3' },
    { name: 'a5' },
    { name: 'a6' },
    { name: 'a7' },
    { name: 'a8' },
    { name: 'a9' },
  ];

  function getName(x: { name: string }): string {
    return x.name;
  }

  // The new element to be inserted into this array is referred to as x
  it('returns index of the first element whose key is greater than x', function () {
    expect(bisectionRightByStrKey(array, 'a4', getName)).toBe(8);
    expect(bisectionRightByStrKey(array, 'a3', getName)).toBe(8);
  });

  it('returns index of the first element whose key is greater than x, occuring after low', function () {
    expect(bisectionRightByStrKey(array, 'a4', getName, 8)).toBe(8);
    expect(bisectionRightByStrKey(array, 'a3', getName, 9)).toBe(9);
  });

  it('returns index of the first element whose key is greater than x, between low and high', function () {
    expect(bisectionRightByStrKey(array, 'a4', getName, 1, 7)).toBe(7);
    expect(bisectionRightByStrKey(array, 'a3', getName, 4, 6)).toBe(6);
  });

  it('returns 0 if all the keys of elements are greater than x', function () {
    expect(bisectionRightByStrKey(array, '_', getName)).toBe(0);
  });

  it('returns array length if x is greater than keys of all elements', function () {
    expect(bisectionRightByStrKey(array, 'b', getName)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function () {
    expect(() => bisectionRightByStrKey(array, 'b', getName, -2)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByStrKey(array, 'b', getName, 100)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByStrKey(array, 'b', getName, 2, -10)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByStrKey(array, 'b', getName, 2, 100)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByStrKey(array, 'b', getName, -20, -10)).toThrow(
      TypeError
    );
    expect(() => bisectionRightByStrKey(array, 'b', getName, 100, 200)).toThrow(
      TypeError
    );
  });
});

describe('bisectionLeft', function () {
  const array = [0, 1, 2, 3, 3, 3, 3, 3, 5, 6, 7, 8, 9];

  it('returns index of the first number greater than x, if x does not exist in the array', function () {
    expect(bisectionLeft(array, 4)).toBe(8);
  });

  it('returns index of first occurence of x, if x exists in the array', function () {
    expect(bisectionLeft(array, 3)).toBe(3);
  });

  it('returns index of the first number greater than x or the first occurence of x, occuring after low', function () {
    expect(bisectionLeft(array, 2, 1)).toBe(2);
    expect(bisectionLeft(array, 3, 6)).toBe(6);
  });

  it('returns index of the first number greater than x or the first occurence of x, between low and high', function () {
    expect(bisectionLeft(array, 2, 5, 8)).toBe(5);
    expect(bisectionLeft(array, 3, 4, 6)).toBe(4);
  });

  it('returns 0 if all elements are greater than x', function () {
    expect(bisectionLeft(array, -2)).toBe(0);
  });

  it('returns array length if x is greater than all elements', function () {
    expect(bisectionLeft(array, 15)).toBe(13);
  });

  it('throws TypeError if either low or high are outside the range of the array', function () {
    expect(() => bisectionLeft(array, 15, -2)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 100)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 2, -10)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 2, 100)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, -20, -10)).toThrow(TypeError);
    expect(() => bisectionLeft(array, 15, 100, 200)).toThrow(TypeError);
  });
});
