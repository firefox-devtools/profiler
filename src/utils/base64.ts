/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Encode the ArrayBuffer{,View} bytes into a base64 data url.
 */
export async function bytesToBase64DataUrl(
  bytes: ArrayBufferView | ArrayBuffer,
  type: string = 'application/octet-stream'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result as any),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}

/**
 * Decode the encoded base64 data url into bytes array.
 */
export async function dataUrlToBytes(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return res.arrayBuffer();
}
