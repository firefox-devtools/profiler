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
