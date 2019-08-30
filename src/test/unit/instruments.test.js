/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

import { convertInstrumentsProfile } from '../../profile-logic/import/instruments';

// This class is a mocked version of native FileSystemEntry class
// Reference: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry
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
    if (!this.zipFile) {
      return errCb(new Error('Failed to extract file'));
    }
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
        if (!this.zipDir) {
          return errCb(new Error('Failed to read folder entries'));
        }
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
  async function importFromTrace(tracePath: string, fileName: string) {
    const zip = await new Promise((resolve, reject) => {
      return fs.readFile(tracePath, (err, data) => {
        if (err) {
          return reject(err);
        }
        return JSZip.loadAsync(data).then(resolve);
      });
    });

    const root = new MockFileSystemEntry(zip, fileName);
    const profile = await convertInstrumentsProfile(root);

    return profile;
  }

  test('Can import Instruments 8.3.3 profile', async () => {
    await importFromTrace(
      'src/test/fixtures/upgrades/simple-time-profile-8_3_3.trace.zip',
      'simple-time-profile.trace'
    );
  });

  test('Can import Instruments 9.3.1 profile', async () => {
    await importFromTrace(
      'src/test/fixtures/upgrades/simple-time-profile-9_3_1.trace.zip',
      'simple-time-profile.trace'
    );
  });

  test('Can import Instruments 10.0.0 profile', async () => {
    await importFromTrace(
      'src/test/fixtures/upgrades/simple-time-profile-10_0_0.trace.zip',
      'simple-time-profile.trace'
    );
  });

  test('Can import Instruments 10.1.0 profile', async () => {
    await importFromTrace(
      'src/test/fixtures/upgrades/simple-time-profile-10_1_0.trace.zip',
      'simple-time-profile.trace'
    );
  });
});
