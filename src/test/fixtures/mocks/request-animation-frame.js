/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * Tests don't have access to the requestionAnimationFrame API, so this function
 * provides a mock for it. It holds on to all queued calls, and the returned function
 * will flush and execute all of the calls in the order they were received.
 *
 * It uses jest.spyOn, which will automatically clear itself after the test is run.
 *
 * Usage:
 *
 *    const flushRafCalls = mockRaf();
 *    requestAnimationFrame(() => {
 *      // Do something
 *    });
 *    flushRafCalls();
 *
 */
export default function mockRaf() {
  const fns = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => {
    fns.push(fn);
  });

  return (timestamps: ?(number[])) => {
    while (fns.length > 0) {
      if (!timestamps) {
        const fn = fns.shift();
        fn();
      } else {
        const timestamp = timestamps.shift();
        if (timestamp === undefined) {
          return;
        }
        const fn = fns.shift();
        fn(timestamp);
      }
    }
  };
}
