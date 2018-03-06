/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Library } from './symbol-store';

// Used during the symbolication process to express that we couldn't find
// symbols for a specific library
export class SymbolsNotFoundError extends Error {
  library: Library;
  error: ?Error;

  constructor(message: string, library: Library, error?: Error) {
    super(message);
    this.name = 'SymbolsNotFoundError';
    this.library = library;
    this.error = error;
  }
}
