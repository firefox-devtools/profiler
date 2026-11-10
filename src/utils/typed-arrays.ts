/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function toInt32Array(
  arr: Array<number> | Int32Array<ArrayBuffer>
): Int32Array<ArrayBuffer> {
  return arr instanceof Int32Array ? arr : new Int32Array(arr);
}

export function toUint32Array(
  arr: Array<number> | Uint32Array<ArrayBuffer>
): Uint32Array<ArrayBuffer> {
  return arr instanceof Uint32Array ? arr : new Uint32Array(arr);
}

export function toUint8Array(
  arr: Array<number> | Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  return arr instanceof Uint8Array ? arr : new Uint8Array(arr);
}

/**
 * Convert a column of small non-negative integers into a Uint8Array or a
 * Uint16Array. `needsSixteenBits` says whether 8 bits are enough to hold every
 * value the column can legitimately contain; the caller knows this from the
 * profile's category list.
 *
 * If the column is already a Uint8Array or a Uint16Array it is returned as-is,
 * because both satisfy the return type and neither can hold a value that
 * doesn't fit. This avoids a copy for profiles loaded from JsonSlabs files.
 */
export function toUint8OrUint16Array(
  arr:
    | Array<number>
    | Uint8Array<ArrayBuffer>
    | Uint16Array<ArrayBuffer>
    | Int32Array<ArrayBuffer>,
  needsSixteenBits: boolean
): Uint8Array<ArrayBuffer> | Uint16Array<ArrayBuffer> {
  if (arr instanceof Uint8Array || arr instanceof Uint16Array) {
    return arr;
  }
  return needsSixteenBits ? new Uint16Array(arr) : new Uint8Array(arr);
}

/**
 * Whether every value in this column fits into 8 bits. Use this to pick a width
 * in places which don't have access to the profile's category list, and can
 * therefore not compute the bound from the data model.
 */
export function valuesFitInUint8(arr: ArrayLike<number>): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > 255) {
      return false;
    }
  }
  return true;
}

export function toFloat64Array(
  arr: Array<number> | Float64Array<ArrayBuffer>
): Float64Array<ArrayBuffer> {
  return arr instanceof Float64Array ? arr : new Float64Array(arr);
}

export function toFloat64ArraySetNullToZero(
  arr: Array<number | null> | Float64Array<ArrayBuffer>
): Float64Array<ArrayBuffer> {
  // @ts-expect-error "Type '(number | null)[]' is not assignable to type 'ArrayLike<number>'."
  // I'd say the types for the Float64Array constructor are too strict; in
  // practice, passing arrays with null elements has the exact behavior we
  // want here: Those elements become zeros, because "ToNumber(null)" is
  // defined to be zero.
  // https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-typedarraysetelement
  // https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber
  return arr instanceof Float64Array ? arr : new Float64Array(arr);
}
