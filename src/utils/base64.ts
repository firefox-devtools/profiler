/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Encode the ArrayBuffer bytes into a base64 data url.
 */
export async function bytesToBase64DataUrl(
  bytes: ArrayBuffer,
  type: string = 'application/octet-stream'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result as string),
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

function base64StringToBytesFallback(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64StringToBytes(base64: string): ArrayBuffer {
  if ('fromBase64' in Uint8Array) {
    // @ts-expect-error Uint8Array.fromBase64 is a relatively new API
    return Uint8Array.fromBase64(base64).buffer;
  }

  return base64StringToBytesFallback(base64);
}
