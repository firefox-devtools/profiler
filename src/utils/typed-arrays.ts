/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function toInt32Array(
  arr: Array<number> | Int32Array<ArrayBuffer>
): Int32Array<ArrayBuffer> {
  return arr instanceof Int32Array ? arr : new Int32Array(arr);
}

export function toUint8Array(
  arr: Array<number> | Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  return arr instanceof Uint8Array ? arr : new Uint8Array(arr);
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
