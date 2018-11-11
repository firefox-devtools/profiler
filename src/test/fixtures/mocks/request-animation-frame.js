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

  /**
   * Execute the queued functions, one at a time.
   *
   * If no argument is passed, flush and execute all functions in the
   * queue.
   *
   * If an array of timestamps is passed, those timestamps will be
   * passed in sequence to each queued function. When the array runs
   * out, the execution loop will stop, even if there are remaining
   * functions to be called.
   */
  return (timestamps: ?(number[])) => {
    while (fns.length > 0) {
      let arg = undefined;
      if (timestamps) {
        arg = timestamps.shift();
        if (arg === undefined) {
          // We've run into the end of the passed array of
          // timestamps. End the loop.
          return;
        }
      }
      const fn = fns.shift();
      fn(arg);
    }
  };
}
