/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// Importing this here makes it work everywhere.
import '@testing-library/jest-dom';

jest.mock('../utils/worker-factory');
import * as WorkerFactory from '../utils/worker-factory';

afterEach(function() {
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
