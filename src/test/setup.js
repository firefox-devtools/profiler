/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// Importing this here makes it work everywhere.
import '@testing-library/jest-dom';

// This installs jest matchers as a side effect as well.
import fetchMock from 'fetch-mock-jest';
import { Headers, Request, Response } from 'node-fetch';
import { TextDecoder, TextEncoder } from 'util';

jest.mock('../utils/worker-factory');
import * as WorkerFactory from '../utils/worker-factory';
import { autoMockResizeObserver } from './fixtures/mocks/resize-observer';

autoMockResizeObserver();

// Register TextDecoder and TextEncoder with the global scope.
// These are now available globally in nodejs, but not when running with jsdom
// in jest apparently.
// Still let's double check that they're from the global scope as expected, so
// that this can be removed once it's implemented.
if ('TextDecoder' in global) {
  throw new Error(
    'TextDecoder is already present in the global scope, please update setup.js.'
  );
}

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

beforeEach(function () {
  // Install fetch and fetch-related objects globally.
  // Using the sandbox ensures that parallel tests run properly.
  global.fetch = fetchMock.sandbox();
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
});

afterEach(function () {
  // This `__shutdownWorkers` function only exists in the mocked test environment,
  // do not use flow typing on it.
  const { __shutdownWorkers } = (WorkerFactory: any);
  __shutdownWorkers();
});

afterEach(() => {
  // The configuration to restore and reset all of the mocks in tests does not seem
  // to be working correctly. Manually trigger this call here to ensure we
  // don't get intermittents from one test's mocks affecting another test's mocks.
  //
  // See https://github.com/facebook/jest/issues/7654
  jest.resetAllMocks();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();

  // Do the same with fetch mocks
  fetchMock.mockReset();
});

expect.extend({
  toHaveClass(received, className) {
    if (!(received instanceof Element)) {
      throw new Error(
        `expected value ${received} to be an instance of Element.`
      );
    }
    const pass = received.classList.contains(className);
    if (pass) {
      return {
        message: () => `expected element to not have class ${className}`,
        pass: true,
      };
    }
    return {
      message: () =>
        `expected element to have class ${className}, current classes are ${received.className}`,
      pass: false,
    };
  },
});
