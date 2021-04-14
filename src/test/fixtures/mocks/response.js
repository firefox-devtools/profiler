/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
//
import { STATUS_CODES } from 'http';
import type { MixedObject } from 'firefox-profiler/types';

// This is a partial implementation of the Fetch API's Response object,
// implementing just what we need for these tests.
export class Response {
  status: number;
  statusText: string;
  ok: boolean;
  _body: string | null;

  constructor(
    body: string | null,
    options: {|
      status: number,
      statusText?: string,
      headers?: MixedObject,
    |}
  ) {
    this.status = options.status || 200;
    this.statusText = options.statusText || STATUS_CODES[this.status];
    this.ok = this.status >= 200 && this.status < 300;
    this._body = body;
  }

  async json() {
    if (this._body) {
      return JSON.parse(this._body);
    }
    throw new Error('The body is missing.');
  }

  async text() {
    return this._body;
  }
}
