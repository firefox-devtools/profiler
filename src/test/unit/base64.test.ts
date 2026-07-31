/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  base64StringToBytes,
  bytesToBase64,
} from 'firefox-profiler/utils/base64';

describe('bytesToBase64', function () {
  // The traced values buffers that go through this function are binary, so the
  // test vector includes bytes that aren't valid text.
  const bytes = new Uint8Array([
    0x02, 0x00, 0x00, 0x00, 0x12, 0xff, 0x80, 0x7f,
  ]);

  it('encodes bytes into base64', function () {
    expect(bytesToBase64(bytes.buffer)).toBe('AgAAABL/gH8=');
  });

  it('encodes an empty buffer', function () {
    expect(bytesToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('round-trips through base64StringToBytes', function () {
    const encoded = bytesToBase64(bytes.buffer);
    expect(new Uint8Array(base64StringToBytes(encoded))).toEqual(bytes);
  });

  // The fallback accumulates the string one character at a time, so exercise it
  // with something larger than the handful of bytes used above.
  it('round-trips a large buffer', function () {
    const large = new Uint8Array(100000);
    for (let i = 0; i < large.length; i++) {
      large[i] = i % 256;
    }
    expect(
      new Uint8Array(base64StringToBytes(bytesToBase64(large.buffer)))
    ).toEqual(large);
  });

  // `toBase64` is an instance method while its `fromBase64` counterpart is a
  // static one, so it is easy to feature detect it on the wrong object and
  // silently never reach it. jsdom doesn't implement it, which is why this
  // installs a stub rather than checking the real thing.
  it('uses the native Uint8Array toBase64 when the engine provides it', function () {
    const prototype = Uint8Array.prototype as any;
    const original = prototype.toBase64;
    const toBase64 = jest.fn(() => 'encoded-natively');
    prototype.toBase64 = toBase64;

    try {
      expect(bytesToBase64(bytes.buffer)).toBe('encoded-natively');
      expect(toBase64).toHaveBeenCalled();
    } finally {
      if (original === undefined) {
        delete prototype.toBase64;
      } else {
        prototype.toBase64 = original;
      }
    }
  });
});
