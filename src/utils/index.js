/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Firefox has issues switching quickly between fill style colors, as the CSS color
 * is fully parsed each time it is set. As a mitigation, provide a class that only
 * switches the color when it's really needed.
 */
export class FastFillStyle {
  _ctx: CanvasRenderingContext2D;
  _previousFillColor: string;

  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
    this._previousFillColor = '';
  }

  set(fillStyle: string) {
    if (fillStyle !== this._previousFillColor) {
      this._ctx.fillStyle = fillStyle;
      this._previousFillColor = fillStyle;
    }
  }
}

/**
 * Perform a simple shallow object equality check.
 */
export function objectShallowEquals(a: Object, b: Object): boolean {
  let aLength = 0;
  let bLength = 0;
  for (const key in a) {
    if (a.hasOwnProperty(key)) {
      aLength++;
      if (a[key] !== b[key]) {
        return false;
      }
    }
  }
  for (const key in b) {
    if (b.hasOwnProperty(key)) {
      bLength++;
    }
  }
  return aLength === bLength;
}
