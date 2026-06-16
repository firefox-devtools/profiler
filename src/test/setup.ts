/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Importing this here makes it work everywhere.
import '@testing-library/jest-dom';

// Importing this inside a setup.ts file makes the types available everywhere.
import 'jest-extended';

// This installs jest matchers as a side effect as well.
import fetchMock from 'fetch-mock';
import crypto from 'crypto';

import { NodeWorker, __shutdownWorkers } from './fixtures/node-worker';
import { autoMockResizeObserver } from './fixtures/mocks/resize-observer';

autoMockResizeObserver();

if (process.env.TZ !== 'UTC') {
  throw new Error('Jest must be run from `yarn test`');
}

fetchMock.mockGlobal();
(global as any).fetchMock = fetchMock;

// Mock the effects of the file-loader which our Webpack config defines
// for files ending in .worker.js: The "default export" is the path to the file.
jest.mock('../utils/gz.worker.js', () => 'src/utils/gz.worker.js');

// The source-map worker is normally bundled as an IIFE by esbuild because its
// dependencies (lezer, source-map) can't run as ES modules in a Web Worker
// context. In tests there is no bundle: SOURCE_MAP_WORKER_PATH is defined as
// a global in jest.config.js to point at a stub that immediately responds with
// { type: 'no-op' }. Tests that actually need to exercise the worker logic must
// mock the 'actions/source-map-symbolication' module directly.

// Install a Worker class which is similar to the DOM Worker class.
(global as any).Worker = NodeWorker;

afterEach(function () {
  // All node workers must be shut down at the end of the test run,
  // otherwise Jest won't exit.
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
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
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

Object.defineProperty(global.self, 'crypto', {
  value: {
    subtle: crypto.webcrypto.subtle,
  },
});
