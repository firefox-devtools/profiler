/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copied and adapted from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

function hex(buffer: ArrayBuffer): string {
  const hexCodes = [];
  const view = new DataView(buffer);
  for (let i = 0; i < view.byteLength; i += 4) {
    // Using getUint32 reduces the number of iterations needed (we process 4 bytes each time).
    const value = view.getUint32(i);
    // toString(16) will give the hex representation of the number without padding
    const stringValue = value.toString(16);
    // We use concatenation and slice for padding
    const padding = '00000000';
    const paddedValue = (padding + stringValue).slice(-padding.length);
    hexCodes.push(paddedValue);
  }

  // Join all the hex strings into one.
  return hexCodes.join('');
}

export default function sha1(data: string | Uint8Array): Promise<string> {
  const arrayData =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return window.crypto.subtle.digest('SHA-1', arrayData).then(hex);
}
