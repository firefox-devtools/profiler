/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests don't have access to the requestionAnimationFrame API, so this file
 * provides a mock for it.
 * Please have a look at the extended comment below for more information about
 * how to use this mock.
 */

import { stripIndent } from 'common-tags';
import { act } from 'firefox-profiler/test/fixtures/testing-library';

function stripThisFileFromErrorStack(error: Error): string[] {
  const stacks = error.stack!.split('\n');
  const filteredStacks = stacks.filter(
    (stack) => !stack.includes('/request-animation-frame.js')
  );
  filteredStacks.shift();
  return filteredStacks;
}

/**
 * Node logging mechanism only log error.stack, not error.message. Therefore we
 * need to replace it in error.stack to see it logged as well.
 * This function will build an error out of a message and the stacks filtered
 * using stripThisFileFromErrorStack.
 */
function buildErrorWithMessageAndStacks(
  message: string,
  stacks: ReadonlyArray<string>
): Error {
  const error = new Error();
  error.message = message;
  error.stack = [`Error: ${message}`].concat(stacks).join('\n');
  return error;
}

export type FlushRafCalls = (options?: {
  timestamps: number[];
  once?: boolean;
}) => void;

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

export function mockRaf(): FlushRafCalls {
  let requests: { func: FrameRequestCallback; stacks: string[] }[] = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    requests.push({
      func: fn,
      stacks: stripThisFileFromErrorStack(new Error()),
    });
    return 0;
  });

  return function flushRafCalls(
    { timestamps, once }: { timestamps: number[]; once?: boolean } = {
      timestamps: [],
      once: false,
    }
  ) {
    let maxLoops = once ? 1 : 5;
    while (requests.length && maxLoops-- > 0) {
      const oldrequests = requests;
      requests = [];

      while (oldrequests.length) {
        const request = oldrequests.shift()!;
        const arg = timestamps.shift()!;
        act(() => {
          request.func.call(null, arg);
        });
      }
    }

    if (maxLoops <= 0 && !once) {
      if (requests.length === 1) {
        throw buildErrorWithMessageAndStacks(
          stripIndent`
            We found a possible infinite loop using requestAnimationFrame.
            If this is expected, you can pass "{once: true}" to "flushRafCalls" to avoid this throw.
            This error's stack is where the last AnimationFrame was requested.
          `,
          requests[0].stacks
        );
      }

      // More than 1 request.

      const lastRequest = requests.pop()!;
      const remainingRequestFirstStacks = requests.map(({ stacks }, i) => {
        const firstLineFromProject = stacks.find((line) =>
          line.includes('/src/')
        );
        const reportedFirstLine = firstLineFromProject || stacks[0];

        // Remove the first characteres so that jest's stack handling doesn't
        // merge this in the other stack.
        return reportedFirstLine.replace(/^\s*at/, `${i + 1} `);
      });

      throw buildErrorWithMessageAndStacks(
        stripIndent`
          We found a possible infinite loop using requestAnimationFrame.
          If this is expected, you can pass "{once: true}" to "flushRafCalls".
          This error's stack is where the last AnimationFrame was requested, but there ${
            requests.length > 1 ? 'are' : 'is'
          } ${requests.length} more:
          ${remainingRequestFirstStacks.join('\n')}
        `,
        lastRequest.stacks
      );
    }
  };
}
