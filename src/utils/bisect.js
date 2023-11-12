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

/*
    The two functions here, bisectionLeft and bisectionRight, return the index where a new element
    would be inserted, respectively at the left or at the right of elements with the same value. 
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

export function bisectionLeftBy<T>(
  array: T[],
  f: (T) => number, // < 0 if arg is before needle, > 0 if after, === 0 if same
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

    if (f(array[mid]) >= 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

export function bisectionLeftByKey<T>(
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

    if (x <= toKey(array[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

// This is the same as bisectionLeftByKey but uses string as the key type.
// If you can find a way to make Flow accept a single function that handles
// both string and number keys, please remove this duplication.
export function bisectionLeftByStrKey<T>(
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

    if (x <= toKey(array[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/*
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
