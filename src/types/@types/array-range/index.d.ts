/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

declare module 'array-range' {
  function range(end: number): number[];
  function range(start: number, end: number): number[];
  export = range;
}
