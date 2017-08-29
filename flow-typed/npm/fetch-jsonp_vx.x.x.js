/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// adapted from https://github.com/camsong/fetch-jsonp/blob/master/index.d.ts
declare module 'fetch-jsonp' {
  declare module.exports: (url: string, options?: Options) => Promise<Response>;

  declare type Options = {
    timeout?: number,
    jsonpCallback?: string,
    jsonpCallbackFunction?: string,
  };

  declare class Response {
    json<T>(): Promise<T>,
    ok: boolean,
  }
}
