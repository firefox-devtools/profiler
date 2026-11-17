/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { base64StringToBytes } from 'firefox-profiler/utils/base64';
import { getJpegSize } from 'firefox-profiler/utils/jpeg-size';

// Generated with `magick -size 2x1 xc:gray -colorspace Gray -strip -quality 1`.
const BASELINE_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP//Z';

// The same command as above with `-interlace JPEG`.
const PROGRESSIVE_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oACAEBAAAAEH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';

// Generated with `ffmpeg -f lavfi -i color=gray:s=2x1 -frames:v 1`. ffmpeg writes
// the Huffman tables (DHT) before the frame header, and DHT shares the marker
// range of the frame headers.
const DHT_FIRST_JPEG =
  '/9j/4AAQSkZJRgABAgAAAQABAAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABKAAEAAAAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAAQACAwESAAISAAMSAP/aAAwDAQACEQMRAD8AAA//2Q==';

function decode(base64: string): Uint8Array {
  return new Uint8Array(base64StringToBytes(base64));
}

describe('getJpegSize', function () {
  it('reads the size of baseline and progressive JPEGs', function () {
    expect(getJpegSize(decode(BASELINE_JPEG))).toEqual({ width: 2, height: 1 });
    expect(getJpegSize(decode(PROGRESSIVE_JPEG))).toEqual({
      width: 2,
      height: 1,
    });
  });

  it('skips the Huffman tables before the frame header', function () {
    expect(getJpegSize(decode(DHT_FIRST_JPEG))).toEqual({
      width: 2,
      height: 1,
    });
  });

  it('skips fill bytes before markers', function () {
    const bytes = decode(BASELINE_JPEG);
    const filled = new Uint8Array([
      ...bytes.subarray(0, 2),
      0xff,
      0xff,
      ...bytes.subarray(2),
    ]);
    expect(getJpegSize(filled)).toEqual({ width: 2, height: 1 });
  });

  it('respects the offset of a subarray', function () {
    const bytes = new Uint8Array([1, 2, 3, ...decode(BASELINE_JPEG)]);
    expect(getJpegSize(bytes.subarray(3))).toEqual({ width: 2, height: 1 });
  });

  it('returns null for data that is not a valid JPEG', function () {
    expect(getJpegSize(new Uint8Array())).toBeNull();
    expect(getJpegSize(new TextEncoder().encode('not a jpeg'))).toBeNull();

    const truncated = decode(BASELINE_JPEG).subarray(0, 20);
    expect(getJpegSize(truncated)).toBeNull();

    const corrupt = decode(BASELINE_JPEG);
    corrupt[2] = 0;
    expect(getJpegSize(corrupt)).toBeNull();
  });
});
