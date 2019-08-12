/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

import { convertInstrumentsProfile } from '../../profile-logic/import/instruments';
import { _fileReader } from '../../actions/receive-profile';

class MockFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  zip: typeof JSZip;
  zipDir: any | null;
  zipFile: JSZip.JSZipObject | null;

  constructor(zip: typeof JSZip, fullPath: string) {
    this.fullPath = fullPath;
    this.zipFile = zip.file(fullPath);
    this.isFile = !!this.zipFile;
    this.zip = zip;

    if (this.isFile) {
      this.zipDir = null;
      this.isDirectory = false;
    } else {
      this.zipDir = zip.folder(fullPath);
      this.isDirectory = true;
    }

    this.name = path.basename(this.fullPath);
  }

  file(cb: (file: File) => void, errCb: (error: Error) => void) {
    if (!this.zipFile) return errCb(new Error('Failed to extract file'));
    this.zipFile
      .async('blob')
      .then(
        blob => {
          (blob: any).name = this.name;
          cb(blob);
        },
        err => {
          errCb(err);
        }
      )
      .catch(errCb);

    return undefined;
  }

  createReader() {
    return {
      readEntries: (
        cb: (entries: []) => void,
        errCb: (error: Error) => void
      ) => {
        if (!this.zipDir)
          return errCb(new Error('Failed to read folder entries'));
        const ret = [];
        this.zipDir.forEach((relativePath: string, file: { name: string }) => {
          if (
            relativePath.split('/').length ===
            (relativePath.endsWith('/') ? 2 : 1)
          ) {
            ret.push(new MockFileSystemEntry(this.zip, file.name));
          }
        });
        return cb(ret);
      },
    };
  }
}

describe('convertInstrumentsProfile function', () => {
  async function importFromTrace(tracePath: string) {
    const zip = await new Promise<any>((resolve, reject) => {
      return fs.readFile(tracePath, (err, data) => {
        if (err) {
          return reject(err);
        }
        return JSZip.loadAsync(data).then(resolve);
      });
    });

    const root = new MockFileSystemEntry(zip, 'instruments_sample.trace');
    const profile = await convertInstrumentsProfile(root, _fileReader);

    return profile;
  }

  test('Can import Instruments sample profile', async () => {
    await importFromTrace(
      'src/test/fixtures/upgrades/instruments_sample.trace.zip'
    );
  });
});
