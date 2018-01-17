/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

type bisectionFn = (
  array: number[] | $ArrayBufferView,
  x: number,
  low?: number,
  high?: number
) => number;

declare module 'bisection' {
  declare module.exports: {
    right: bisectionFn,
    left: bisectionFn,
    version: string,
  };
}
