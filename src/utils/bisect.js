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
'use strict';

/**
 * Calculates the index of the Array where item X should be placed, assuming the Array is sorted.
 *
 * @param {Array} array The array containing the items.
 * @param {Number} x The item that needs to be added to the array.
 * @param {Number} low Inital Index that is used to start searching, optional.
 * @param {Number} high The maximum Index that is used to stop searching, optional.
 * @returns {Number} the index where item X should be placed
 */
function bisection(array, x, low, high){
  // The low and high bounds the inital slice of the array that needs to be searched
  // this is optional
  low = low || 0;
  high = high || array.length;

  var mid;

  while (low < high) {
    mid = (low + high) >> 1;

    if (x < array[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/**
 * A right bisection is default, so just reference the same function
 */
bisection.right = bisection;

/**
 * Calculates the index of the Array where item X should be placed, assuming the Array is sorted.
 * @param {Array} array The array containing the items.
 * @param {number} x The item that needs to be added to the array.
 * @param {number} low Inital Index that is used to start searching, optional.
 * @param {number} high The maximum Index that is used to stop searching, optional.
 * @return {number} the index where item X should be placed
 */
bisection.left = function left( array, x, low , high ){
  // The low and high bounds the inital slice of the array that needs to be searched
  // this is optional
  low = low || 0;
  high = high || array.length;

  var mid;

  while (low < high) {
    mid = (low + high) >> 1;

    if (x < array[mid]) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

/**
 * Library version
 */
bisection.version = '0.0.3';

module.exports = bisection;
