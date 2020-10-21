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
