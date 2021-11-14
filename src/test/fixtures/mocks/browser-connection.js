/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';

export function createMockBrowserConnection(): BrowserConnection {
  return {
    getProfile: jest.fn().mockImplementation(async () => {
      throw new Error('getProfile unimplemented on mock browserConnection');
    }),
    getSymbolTable: jest.fn().mockImplementation(async () => {
      throw new Error('getProfile unimplemented on mock browserConnection');
    }),
    establishConnectionViaFrameScriptIfNeeded: jest
      .fn()
      .mockImplementation(async () => {
        // Do nothing
      }),
  };
}
