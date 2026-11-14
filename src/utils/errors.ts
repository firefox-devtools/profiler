/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type Attempt = {
  count: number;
  total: number;
};

export class TemporaryError extends Error {
  attempt: Attempt | null;

  constructor(message: string, attempt: Attempt | null = null) {
    super(message);
    // Workaround for a babel issue when extending Errors
    (this as any).__proto__ = TemporaryError.prototype;
    this.name = 'TemporaryError';
    this.attempt = attempt;
  }
}

/**
 * Stops an upload when some of the source files picked for sharing could not
 * be downloaded.
 */
export class SourceCodeFetchError extends Error {
  failedCount: number;

  constructor(failedCount: number) {
    super(`${failedCount} of the picked source files could not be downloaded.`);
    // Workaround for a babel issue when extending Errors
    (this as any).__proto__ = SourceCodeFetchError.prototype;
    this.name = 'SourceCodeFetchError';
    this.failedCount = failedCount;
  }
}
