/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare module 'pako' {
  declare type pako$InflateOptions = {|
    +windowBits?: number,
    +raw?: boolean,
    +chunkSize?: number,
    +dictionary?: string | ArrayBuffer | Uint8Array,
  |};
  declare function inflate(
    buffer: Uint8Array | number[] | string,
    options?: pako$InflateOptions
  ): Uint8Array;
  declare function inflate(
    buffer: Uint8Array | number[] | string,
    options: {| ...pako$InflateOptions, +to: 'string' |}
  ): string;
  declare module.exports: { inflate: typeof inflate };
}
