/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Node.js implementation using zlib
// For browser builds, this file is replaced with gz.browser.ts via package.json "browser" field

import * as zlib from 'zlib';

// This will transfer `data` if it is an array buffer.
export function compress(
  data: string | Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    zlib.gzip(data, (errorOrNull, result) => {
      if (errorOrNull) {
        reject(errorOrNull);
      } else {
        resolve(result);
      }
    });
  });
}

export function decompress(
  data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(data, (errorOrNull, result) => {
      if (errorOrNull) {
        reject(errorOrNull);
      } else {
        resolve(result);
      }
    });
  });
}

export function isGzip(data: Uint8Array): boolean {
  // Detect the gzip magic bytes 1f 8b 08.
  return (
    data.byteLength >= 3 &&
    data[0] === 0x1f &&
    data[1] === 0x8b &&
    data[2] === 0x08
  );
}
