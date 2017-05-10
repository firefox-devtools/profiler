/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

export type Attempt = {
  count: number,
  total: number,
};

export class TemporaryError extends Error {
  attempt: Attempt;

  constructor(message: string, attempt: Attempt) {
    super(message);
    this.name = 'TemporaryError';
    this.attempt = attempt;
  }
}
