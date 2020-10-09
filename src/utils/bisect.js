/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

// @flow

/**
 * Calculates the index of the Array where item X should be placed, assuming the Array is sorted.
 *
 * @param {number[] | ArrayBufferView} array The array containing the items.
 * @param {number} x The item that needs to be added to the arrayarn add --dev @babel/core @babel/cli @babel/preset-flowy.
 * @param {number} low Inital Index that is used to start searching, optional.
 * @param {number} high The maximum Index that is used to stop searching, optional.
 * @returns {number} the index where item X should be placed
 */
export function bisectionRight(
  array: number[] | ArrayBufferView,
  x: number,
  low?: number,
  high?: number
): number {
  // The low and high bounds the inital slice of the array that needs to be searched
  // this is optional
  low = low || 0;
  high = high || array.length;

  while (low < high) {
    const mid = (low + high) >> 1;

    if (mid && x < array[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/**
 * Calculates the index of the Array where item X should be placed, assuming the Array is sorted.
 *
 * @param {number[] | ArrayBufferView} array The array containing the items.
 * @param {number} x The item that needs to be added to the array.
 * @param {number} low Inital Index that is used to start searching, optional.
 * @param {number} high The maximum Index that is used to stop searching, optional.
 * @return {number} the index where item X should be placed
 */
export function bisectionLeft(
  array: number[] | ArrayBufferView,
  x: number,
  low?: number,
  high?: number
): number {
  // The low and high bounds the inital slice of the array that needs to be searched
  // this is optional
  low = low || 0;
  high = high || array.length;

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
