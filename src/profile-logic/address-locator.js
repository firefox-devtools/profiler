/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Find an address in the list of libraries, and convert the address from
// an absolute virtual memory address into a library-relative address.
//
// Note: This file is not covered by Flow because it uses BigInt, which Flow
// does not support yet. https://github.com/facebook/flow/issues/6639
//
// We use BigInt for the absolute addresses because regular JS numbers cannot
// accurately represent large unsigned 64 bit numbers. Specifically, calling
// parseInt for a hex string with a number larger than 2^53 - 1 (0x1fffffffffffff)
// will return an inaccurate JS number, i.e. a number which is "rounded" to some
// multiple of a power of two. Then we will calculate lib-relative addresses
// from those wrong rounded values, and then symbolication will return incorrect
// information for those inaccurate relative addresses.
//
// So we first convert everything into BigInt, do the comparisons during the lookup
// in BigInt, and then do the lookedUpAddress - libBaseAddress subtraction in BigInt,
// and then convert the result to a JS number. The library-relative address can
// always be represented accurately by a JS number, because libraries are always
// small enough.

export class AddressLocator {
  _libs /* : LibMapping[] */;
  _libRanges /* : Array<{ baseAddress: BigInt, start: BigInt, end: BigInt }> */;

  /**
   * Create an AddressLocator for an array of libs.
   * The libs array needs to be sorted in ascending address order, and the address
   * ranges of the libraries need to be non-overlapping.
   * @param {Libs[]} libs The array of libraries, ordered by start address.
   */
  constructor(libs) {
    this._libs = libs;
    this._libRanges = libs.map((lib) => {
      const start = BigInt(lib.start);
      const offset = BigInt(lib.offset);
      const end = BigInt(lib.end);
      return {
        baseAddress: start - offset,
        start: start,
        end: end,
      };
    });
  }

  /**
   * Return the library object that contains the address such that
   * libRange.start <= address < libRange.end, or null if no such lib object exists.
   * This also computes the relative address, without losing precision for large
   * values.
   * @param {string} addressHexString The address, as a hex string, including the leading "0x".
   * @return {Object} The library object (and its index) if found, and the address relative to that library.
   */
  locateAddress(addressHexString) {
    // Diagram of the various offsets and spaces:
    //
    //  process virtual memory
    // |--------------------|======================|--------------------
    //                      |  mapped lib segment  |
    //         |------------|======================|--------|
    //    baseAddress     start             ^     end
    //         |<--offset-->|               |
    //         |<-----relative address----->|
    //                                      |
    //                                  absolute address
    //
    const address = BigInt(addressHexString);
    const libRanges = this._libRanges;
    let left = 0;
    let right = libRanges.length - 1;
    while (left <= right) {
      const mid = ((left + right) / 2) | 0;
      if (address >= libRanges[mid].end) {
        left = mid + 1;
      } else if (address < libRanges[mid].start) {
        right = mid - 1;
      } else {
        // Found a match!
        const index = mid;
        const relativeAddress = address - libRanges[index].baseAddress;
        return {
          lib: this._libs[index],
          relativeAddress: Number(relativeAddress),
        };
      }
    }
    return {
      lib: null,
      relativeAddress: parseInt(addressHexString, 16),
    };
  }
}
