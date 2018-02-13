/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

export interface DOMRectInterface {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type DOMRectLiteral = {
  x: number,
  y: number,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
};

class DOMRectPolyfill implements DOMRectInterface {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  constructor(x: number = 0, y: number = 0, w: number = 0, h: number = 0) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.left = x;
    this.top = y;
    this.right = x + w;
    this.bottom = y + h;
  }
}

export default (window.DOMRect ? window.DOMRect : DOMRectPolyfill);
