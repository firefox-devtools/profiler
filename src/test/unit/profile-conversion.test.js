/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { unserializeProfileOfArbitraryFormat } from '../../profile-logic/process-profile';
import { CURRENT_VERSION as CURRENT_GECKO_VERSION } from '../../profile-logic/gecko-profile-versioning';

describe('converting Linux perf profile', function() {
  it('should import a perf profile', async function() {
    let version = -1;
    try {
      const fs = require('fs');
      const zlib = require('zlib');
      const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.perf.gz');
      const decompressedArrayBuffer = zlib.gunzipSync(buffer);
      const text = decompressedArrayBuffer.toString('utf8');
      const profile = await unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      version = profile.meta.version;
      expect(profile).toMatchSnapshot();
    } catch (e) {
      console.log(e);
      // probably file not found
    }
    expect(version).toEqual(CURRENT_GECKO_VERSION);
  });
});

describe('converting Google Chrome profile', function() {
  it('successfully imports', async function() {
    // Mock out image loading behavior as the screenshots rely on the Image loading
    // behavior.
    jest
      .spyOn(Image.prototype, 'addEventListener')
      .mockImplementation((name: string, callback: Function) => {
        if (name === 'load') {
          callback();
        }
      });

    const fs = require('fs');
    const zlib = require('zlib');
    const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.chrome.gz');
    const decompressedArrayBuffer = zlib.gunzipSync(buffer);
    const text = decompressedArrayBuffer.toString('utf8');
    const profile = await unserializeProfileOfArbitraryFormat(text);
    if (profile === undefined) {
      throw new Error('Unable to parse the profile.');
    }
    expect(profile).toMatchSnapshot();
  });
});
