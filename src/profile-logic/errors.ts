/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { RequestedLib } from 'firefox-profiler/types';

// Used during the symbolication process to express that we couldn't find
// symbols for a specific library
export class SymbolsNotFoundError extends Error {
  library: RequestedLib;
  errors: Error[];

  constructor(message: string, library: RequestedLib, ...errors: Error[]) {
    super(
      [message, ...errors.map((e) => ` - ${e.name}: ${e.message}`)].join('\n')
    );
    // Workaround for a babel issue when extending Errors
    (this as any).__proto__ = SymbolsNotFoundError.prototype;
    this.name = 'SymbolsNotFoundError';
    this.library = library;
    this.errors = errors;
  }
}
