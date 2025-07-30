/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * This definition was built from a combination of:
 * - https://stuk.github.io/jszip/documentation
 * - The source code
 * - And observing the console.
 *
 * It is not meant to be exhaustive, but just enough to be useful for how the unzipping
 * functionality is used.
 */

declare module 'jszip' {
  declare type JSZipFile = {
    async: (key: 'string') => Promise<string>,
    name: string, // The absolute path of the file.
    dir: boolean, // true if this is a directory.
    date: any, // The last modification date.
    comment: any, // The comment for this file.
    unixPermissions: number, // bits number - The UNIX permissions of the file, if any.
    dosPermissions: number, // bits number - The DOS permissions of the file, if any.
    // The options of the file. The available options are:
    options: {
      compression: string,
      compressionOptions: any,
    },
  };

  declare class JSZip {
    constructor(): JSZip;
    files: { [fileName: string]: JSZipFile };
    file: (fileName: string, contents: string) => void;
    generateAsync({ type: 'uint8array' }): Promise<Uint8Array>;
    static loadAsync: (data: ArrayBuffer | $TypedArray) => Promise<JSZip>;
  }

  declare module.exports: typeof JSZip;
}
