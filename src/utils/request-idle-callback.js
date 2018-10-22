/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
let requestIdleCallbackPolyfill: (
  callback: () => void,
  _opts?: { timeout: number }
) => mixed;

if (typeof window === 'object' && window.requestIdleCallback) {
  requestIdleCallbackPolyfill = window.requestIdleCallback;
} else if (typeof process === 'object' && process.nextTick) {
  // Node environment
  requestIdleCallbackPolyfill = process.nextTick;
} else {
  requestIdleCallbackPolyfill = callback => setTimeout(callback, 0);
}

export { requestIdleCallbackPolyfill };
