/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This can be removed when JSDOM gets a DOMRect implementation.
// See https://github.com/jsdom/jsdom/pull/2926

const originalDOMRect = global.DOMRect;

class DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get top() {
    return this.y + Math.min(this.height, 0);
  }

  get bottom() {
    return this.y + Math.max(this.height, 0);
  }

  get left() {
    return this.x + Math.min(this.width, 0);
  }

  get right() {
    return this.x + Math.max(this.width, 0);
  }
}

export function autoMockDomRect() {
  beforeEach(() => {
    global.DOMRect = DOMRect as any;
  });

  afterEach(() => {
    if (originalDOMRect) {
      global.DOMRect = originalDOMRect;
    } else {
      delete (global as any).DOMRect;
    }
  });
}
