/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { compress, decompress } from '../../utils/gz';

describe('utils/gz', function () {
  it('compresses and decompresses properly', async () => {
    const clearText = '42';
    const gzipedData = await compress(clearText);
    // We can't use toBeInstanceOf because the Uint8Array type is different in the worker.
    expect(Object.prototype.toString.call(gzipedData)).toContain('Uint8Array');

    const gunzippedDataBuffer = await decompress(gzipedData);
    const decoder = new TextDecoder('utf-8');
    const gunzippedData = decoder.decode(gunzippedDataBuffer);
    expect(gunzippedData).toEqual(clearText);
  });
});
