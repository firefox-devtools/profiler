// This file originally comes from https://github.com/3rd-Eden/node-bisection/, but has been
// imported and changed to fix some bugs.

/*
    Copyright (c) 2010/2011 Arnout Kazemier,3rd-Eden
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE. 
*/

/**
 * These functions are used on sorted arrays.
 *
 * You commonly use them in one of two cases:
 *
 *  1. When you want to insert a new element into a sorted array, at a position
 *     such that the array remains in sorted order. Or
 *  2. When you have a sorted array of interval start positions, and you want
 *     to find out which interval includes a certain number.
 *
 * For case 1, you can use either bisectionRight or bisectionLeft. The difference
 * only matters if you care about the positioning of two equal elements. For
 * example:
 *   bisectionRight([1, 2, 3], 2) === 2
 *   bisectionLeft([1, 2, 3], 2) === 1
 * i.e. the returned index is either to the right or to the left of the equal
 * element. If no exactly matching element is present in the array, both functions
 * return the same value, i.e. the index of the first element that's larger than
 * the passed in element (which is the index at which that element would need to
 * be inserted).
 *
 * ```js
 * const insertionIndexR = bisectionRight(array, x);
 * assert(array[insertionIndexR] > x);
 * assert(array[insertionIndexR - 1] <= x);
 *
 * const insertionIndexL = bisectionLeft(array, x);
 * assert(array[insertionIndexL] >= x);
 * assert(array[insertionIndexL - 1] < x);
 * ```
 *
 * For case 2, you'll have to use bisectionRight, and subtract 1 from the return
 * value. For example, if you have the half-open intervals 2..4, 4..7, 7..Infinity,
 * then your start position array will be [2, 4, 7] and bisectionRight() - 1 will
 * be the index of the last interval whose start position is <= the checked element.
 *   bisectionRight([2, 4, 7], 1) - 1 === -1
 *   bisectionRight([2, 4, 7], 2) - 1 === 0
 *   bisectionRight([2, 4, 7], 3) - 1 === 0
 *   bisectionRight([2, 4, 7], 4) - 1 === 1
 *   bisectionRight([2, 4, 7], 5) - 1 === 1
 *   bisectionRight([2, 4, 7], 6) - 1 === 1
 *   bisectionRight([2, 4, 7], 7) - 1 === 2
 *   bisectionRight([2, 4, 7], 20) - 1 === 2
 *
 * Example code:
 *
 * ```js
 * const intervalStarts = [2, 4, 7];
 * const insertionIndex = bisectionRight(intervalStarts, x);
 * if (insertionIndex === 0) {
 *   // x is before the first interval.
 *   return null;
 * }
 *
 * const intervalIndex = insertionIndex - 1;
 * assert(x >= intervalStarts[intervalIndex]);
 *
 * // If there can be gaps between your intervals, you also need to check the
 * // interval end:
 * if (x >= intervalEnds[intervalIndex]) {
 *   // x isn't actually inside this interval! It's in the gap between
 *   // intervalIndex and intervalIndex+1.
 *   return null;
 * }
 *
 * // Now we know that x is inside the interval.
 * assert(x >= intervalStarts[intervalIndex] && x < intervalEnds[intervalIndex]);
 * return intervalIndex;
 * ```
 */

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export function bisectionRight(
  array: number[] | TypedArray,
  x: number,
  low: number = 0,
  high: number = array.length
): number {
  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (low < high) {
    const mid = (low + high) >> 1;

    if (x < array[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/**
 * Like bisectionRight, but accepts a "key" function which maps an element of
 * the array to a number "key". The array must be sorted by that key.
 * The looked-up element `x` will be compared to the keys.
 */
export function bisectionRightByKey<T>(
  array: T[],
  x: number,
  toKey: (arg: T) => number,
  low: number = 0,
  high: number = array.length
): number {
  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (low < high) {
    const mid = (low + high) >> 1;

    if (x < toKey(array[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/**
 * This is the same as bisectionRightByKey but uses string as the key type.
 * If you can find a way to make Flow accept a single function that handles
 * both string and number keys, please remove this duplication.
 */
export function bisectionRightByStrKey<T>(
  array: T[],
  x: string,
  toKey: (arg: T) => string,
  low: number = 0,
  high: number = array.length
): number {
  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (low < high) {
    const mid = (low + high) >> 1;

    if (x < toKey(array[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

export function bisectionLeft(
  array: number[] | TypedArray,
  x: number,
  low: number = 0,
  high: number = array.length
): number {
  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (low < high) {
    const mid = (low + high) >> 1;

    if (x <= array[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}
