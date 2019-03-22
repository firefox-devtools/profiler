/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { compress, decompress } from '../../utils/gz';

import { TextEncoder, TextDecoder } from 'util';

beforeAll(function() {
  if ((window: any).TextEncoder) {
    throw new Error('A TextEncoder was already on the window object.');
  }
  (window: any).TextEncoder = TextEncoder;
});

afterAll(async function() {
  delete (window: any).TextEncoder;
});

/**
 * Skip this test due to permafailing on node 11. Re-enable it with #1879.
 */
xdescribe('utils/gz', function() {
  it('compresses and decompresses properly', async () => {
    const clearText = '42';
    const gzipedData = await compress(clearText);
    expect(gzipedData).toBeInstanceOf(Uint8Array);

    const gunzippedDataBuffer = await decompress(gzipedData);
    const decoder = new TextDecoder('utf-8');
    const gunzippedData = decoder.decode(gunzippedDataBuffer);
    expect(gunzippedData).toEqual(clearText);
  });
});
