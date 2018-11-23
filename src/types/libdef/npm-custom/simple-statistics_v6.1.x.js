/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare module 'simple-statistics' {
  // Throws an exception on error.
  declare export function medianSorted(sorted: Array<number>): number;

  declare export function standardDeviation(x: Array<number>): number;

  // Throws an exception on error.
  declare export function quantileSorted(x: Array<number>, p: number): number;

  // Undefined on error.
  declare export function maxSorted(x: Array<number>): ?number;
}
