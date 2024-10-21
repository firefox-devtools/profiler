/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Encode the bytes Uint8Array into a base64 data url.
 */
export async function bytesToBase64DataUrl(
  bytes: Uint8Array,
  type: string = 'application/octet-stream'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve((reader.result: any)),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(new File([bytes], '', { type }));
  });
}

/**
 * Decode the encoded base64 data url into bytes array.
 */
export async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}
