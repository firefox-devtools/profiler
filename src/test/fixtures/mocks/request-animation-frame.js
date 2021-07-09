/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/*
 * Tests don't have access to the requestionAnimationFrame API, so this file
 * provides a mock for it.
 * Please have a look at the extended comment below for more information about
 * how to use this mock.
 */

import { stripIndent } from 'common-tags';

function stripThisFileFromErrorStack(stack: string) {
  const stacks = stack.split('\n');
  const filteredStacks = stacks.filter(
    stack => !stack.includes('/request-animation-frame.js')
  );
  return filteredStacks.join('\n');
}

/**
 * This function provides a mock for requestAnimationFrame. It holds on to all
 * queued calls, and the returned function will flush and execute all of the
 * calls in the order they were received.
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
 * By default this will also repeatedly call requests chained during the
 * callback, but only 5 times at most, and will throw after that. If you want to
 * call the callbacks only once, you can pass { once: true } to flushRafCalls:
 *
 *    flushRafCalls({ once: true })
 *
 * Normally timestamps are passed to the callbacks. By default this mock doesn't
 * do that, but you can pass the timestamps to use with the "timestamps"
 * parameter:
 *
 *    flushRafCalls({ timestamps: [10000, 10100] });
 *
 */

export function mockRaf() {
  let requests = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => {
    requests.push({
      func: fn,
      stack: stripThisFileFromErrorStack(new Error().stack),
    });
  });

  return function flushRafCalls(
    { timestamps, once }: $Shape<{| timestamps: number[], once: boolean |}> = {
      timestamps: [],
      once: false,
    }
  ) {
    let maxLoops = once ? 1 : 5;
    while (requests.length && maxLoops-- > 0) {
      const oldrequests = requests;
      requests = [];

      while (oldrequests.length) {
        const request = oldrequests.shift();
        const arg = timestamps.shift();
        request.func.call(null, arg);
      }
    }

    if (maxLoops <= 0 && !once) {
      if (requests.length === 1) {
        const error = new Error(stripIndent`
          We found a possible infinite loop using requestAnimationFrame.
          If this is expected, you can pass "{once: true}" to "flushRafCalls" to avoid this throw.
          This error's stack is where the last AnimationFrame was requested.
        `);
        error.stack = requests[0].stack;
        throw error;
      }

      // More than 1 request.

      const lastRequest = requests.pop();
      const remainingRequestFirstStacks = requests.map((request, i) => {
        const stackLines = request.stack.split('\n');
        const firstLineFromProject = stackLines.find(line =>
          line.includes('/src/')
        );
        const reportedFirstLine = firstLineFromProject || stackLines[0];

        // Remove the first characteres so that jest's stack handling doesn't
        // merge this in the other stack.
        return reportedFirstLine.replace(/^\s*at/, `${i + 1} `);
      });

      const error = new Error(stripIndent`
        We found a possible infinite loop using requestAnimationFrame.
        If this is expected, you can pass "{once: true}" to "flushRafCalls".
        This error's stack is where the last AnimationFrame was requested, but there ${
          requests.length > 1 ? 'are' : 'is'
        } ${requests.length} more:
        ${remainingRequestFirstStacks.join('\n')}
      `);
      error.stack = lastRequest.stack;
      throw error;
    }
  };
}
