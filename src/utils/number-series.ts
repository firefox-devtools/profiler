/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function numberSeriesFromDeltas(
  deltas: number[] | Float64Array<ArrayBuffer>
): Float64Array<ArrayBuffer> {
  const values = new Float64Array(deltas.length);
  let prev = 0;
  for (let i = 0; i < deltas.length; i++) {
    const current = prev + deltas[i];
    values[i] = current;
    prev = current;
  }
  return values;
}

export function numberSeriesToDeltas(
  values: number[] | Float64Array<ArrayBuffer>
): number[] {
  const deltas = new Array(values.length);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    deltas[i] = current - prev;
    prev = current;
  }
  return deltas;
}
