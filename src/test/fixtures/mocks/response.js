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
  _body: string | ArrayBuffer | null;

  constructor(
    body: string | ArrayBuffer | null,
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
    return JSON.parse(await this.text());
  }

  async text(): Promise<string> {
    if (this._body === null) {
      throw new Error('The body is missing.');
    }
    if (this._body instanceof ArrayBuffer) {
      throw new Error('The body is an array buffer');
    }
    return this._body;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this._body === null) {
      throw new Error('The body is missing.');
    }
    if (!(this._body instanceof ArrayBuffer)) {
      throw new Error('The body is not an array buffer');
    }
    return this._body;
  }
}
