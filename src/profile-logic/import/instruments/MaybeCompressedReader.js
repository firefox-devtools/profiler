/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import pako from 'pako';

class MaybeCompressedDataReader {
  uncompressedData: Promise<ArrayBuffer>;
  namePromise: Promise<string>;

  constructor(
    namePromise: Promise<string>,
    maybeCompressedDataPromise: Promise<ArrayBuffer>
  ) {
    this.uncompressedData = maybeCompressedDataPromise.then(
      (fileData: ArrayBuffer) => {
        try {
          const result = pako.inflate(new Uint8Array(fileData)).buffer;
          return result;
        } catch (e) {
          return fileData;
        }
      }
    );
  }

  async name(): Promise<string> {
    return this.namePromise;
  }

  async readAsArrayBuffer(): Promise<ArrayBuffer> {
    return this.uncompressedData;
  }

  async readAsText(): Promise<string> {
    const buffer = await this.readAsArrayBuffer();
    let ret: string = '';

    if (typeof TextDecoder !== 'undefined') {
      const decoder = new TextDecoder();
      return decoder.decode(buffer);
    }
    // JavaScript strings are UTF-16 encoded, but we're reading data
    // from disk that we're going to assume is UTF-8 encoded.
    const array = new Uint8Array(buffer);
    for (let i = 0; i < array.length; i++) {
      ret += String.fromCharCode(array[i]);
    }
    return ret;
  }

  static fromFile(file: File): MaybeCompressedDataReader {
    const maybeCompressedDataPromise: Promise<ArrayBuffer> = new Promise(
      resolve => {
        const reader = new FileReader();
        reader.addEventListener('loadend', () => {
          if (!(reader.result instanceof ArrayBuffer)) {
            throw new Error(
              'Expected reader.result to be an instance of ArrayBuffer'
            );
          }
          resolve(reader.result);
        });
        reader.readAsArrayBuffer(file);
      }
    );

    return new MaybeCompressedDataReader(
      Promise.resolve(file.name),
      maybeCompressedDataPromise
    );
  }
}

export default MaybeCompressedDataReader;
