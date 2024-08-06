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

// @flow

export function bisectionRight(
  array: number[] | $TypedArray,
  x: number,
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

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
  toKey: (T) => number,
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

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
  toKey: (T) => string,
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

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
  array: number[] | $TypedArray,
  x: number,
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

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

/*
 * TEMPORARY: The functions below implement bisectEqualRange(). The implementation
 * is copied from https://searchfox.org/mozilla-central/rev/8b0666aff1197e1dd8017de366343de9c21ee437/mfbt/BinarySearch.h#132-243
 * The only code calling bisectEqualRange will be removed by the end of this
 * commit stack, so all the code added here will be removed again, too.
 *
 * bisectLowerBound(), bisectUpperBound(), and bisectEqualRange() are equivalent to
 * std::lower_bound(), std::upper_bound(), and std::equal_range() respectively.
 *
 * bisectLowerBound() returns an index pointing to the first element in the range
 * in which each element is considered *not less than* the given value passed
 * via |aCompare|, or the length of |aContainer| if no such element is found.
 *
 * bisectUpperBound() returns an index pointing to the first element in the range
 * in which each element is considered *greater than* the given value passed
 * via |aCompare|, or the length of |aContainer| if no such element is found.
 *
 * bisectEqualRange() returns a range [first, second) containing all elements are
 * considered equivalent to the given value via |aCompare|.  If you need
 * either the first or last index of the range, bisectLowerBound() or bisectUpperBound(),
 * which is slightly faster than bisectEqualRange(), should suffice.
 *
 * Example (another example is given in TestBinarySearch.cpp):
 *
 *   Vector<const char*> sortedStrings = ...
 *
 *   struct Comparator {
 *     const nsACString& mStr;
 *     explicit Comparator(const nsACString& aStr) : mStr(aStr) {}
 *     int32_t operator()(const char* aVal) const {
 *       return Compare(mStr, nsDependentCString(aVal));
 *     }
 *   };
 *
 *   auto bounds = bisectEqualRange(sortedStrings, 0, sortedStrings.length(),
 *                            Comparator("needle I'm looking for"_ns));
 *   printf("Found the range [%zd %zd)\n", bounds.first(), bounds.second());
 *
 */
export function bisectLowerBound(
  array: number[] | $TypedArray,
  f: (number) => number, // < 0 if arg is before needle, > 0 if after, === 0 if same
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (high !== low) {
    const middle = (low + high) >> 1;
    const result = f(array[middle]);

    // The range returning from bisectLowerBound does include elements
    // equivalent to the given value i.e. f(element) == 0
    if (result >= 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

export function bisectUpperBound(
  array: number[] | $TypedArray,
  f: (number) => number, // < 0 if arg is before needle, > 0 if after, === 0 if same
  low?: number,
  high?: number
): number {
  low = low || 0;
  high = high || array.length;

  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (high !== low) {
    const middle = (low + high) >> 1;
    const result = f(array[middle]);

    // The range returning from bisectUpperBound does NOT include elements
    // equivalent to the given value i.e. f(element) == 0
    if (result > 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return high;
}

export function bisectEqualRange(
  array: number[] | $TypedArray,
  f: (number) => number, // < 0 if arg is before needle, > 0 if after, === 0 if same
  low?: number,
  high?: number
): [number, number] {
  low = low || 0;
  high = high || array.length;

  if (low < 0 || low > array.length || high < 0 || high > array.length) {
    throw new TypeError("low and high must lie within the array's range");
  }

  while (high !== low) {
    const middle = (low + high) >> 1;
    const result = f(array[middle]);

    if (result > 0) {
      high = middle;
    } else if (result < 0) {
      low = middle + 1;
    } else {
      return [
        bisectLowerBound(array, f, low, middle),
        bisectUpperBound(array, f, middle + 1, high),
      ];
    }
  }

  return [low, high];
}
