/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

type Interpolator<T> = (t: number) => T;

declare module 'd3-interpolate' {
  declare function interpolateRgb(a: string, b: string): Interpolator<string>;
}
