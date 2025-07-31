/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Encode the ArrayBuffer{,View} bytes into a base64 data url.
 */
export async function bytesToBase64DataUrl(
  bytes: $ArrayBufferView | ArrayBuffer,
  type: string = 'application/octet-stream'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve((reader.result: any)),
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
  if (base64.length % 4 !== 0) {
    throw new Error('Base64 string must be padded.');
  }

  const bits = base64.length * 6;
  let bytes = bits / 8;
  if (base64[base64.length - 2] === '=') {
    bytes -= 2;
  } else if (base64[base64.length - 1] === '=') {
    bytes -= 1;
  }

  const result = new Uint8Array(bytes);
  const charMap = [];
  for (let i = 0; i < 256; i++) {
    charMap.push(0);
  }
  const codeUpperA = 'A'.charCodeAt(0);
  const codeLowerA = 'a'.charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    charMap[codeUpperA + i] = i;
    charMap[codeLowerA + i] = i + 26;
  }
  const code0 = '0'.charCodeAt(0);
  for (let i = 0; i < 10; i++) {
    charMap[code0 + i] = i + 52;
  }
  charMap['+'.charCodeAt(0)] = 62;
  charMap['/'.charCodeAt(0)] = 63;

  const tail = base64.length / 4 - 1;
  const hextetsPerChunk = 4;
  const octetsPerChunk = 3;

  // Do the tail as one standalone iteration to avoid having to do the checks
  // every time for long inputs
  for (let i = 0; i < tail; i++) {
    const hextet0 = charMap[base64.charCodeAt(i * hextetsPerChunk + 0)];
    const hextet1 = charMap[base64.charCodeAt(i * hextetsPerChunk + 1)];
    const hextet2 = charMap[base64.charCodeAt(i * hextetsPerChunk + 2)];
    const hextet3 = charMap[base64.charCodeAt(i * hextetsPerChunk + 3)];
    const octet0 = (hextet0 << 2) | (hextet1 >> 4);
    const octet1 = ((hextet1 & 0b1111) << 4) | (hextet2 >> 2);
    const octet2 = ((hextet2 & 0b11) << 6) | hextet3;

    result[i * octetsPerChunk + 0] = octet0;
    result[i * octetsPerChunk + 1] = octet1;
    result[i * octetsPerChunk + 2] = octet2;
  }

  {
    const hextet0 = charMap[base64.charCodeAt(tail * hextetsPerChunk + 0)];
    const hextet1 = charMap[base64.charCodeAt(tail * hextetsPerChunk + 1)];
    const hextet2 = charMap[base64.charCodeAt(tail * hextetsPerChunk + 2)];
    const hextet3 = charMap[base64.charCodeAt(tail * hextetsPerChunk + 3)];
    const octet0 = (hextet0 << 2) | (hextet1 >> 4);
    const octet1 = ((hextet1 & 0b1111) << 4) | (hextet2 >> 2);
    const octet2 = ((hextet2 & 0b11) << 6) | hextet3;

    result[tail * octetsPerChunk + 0] = octet0;
    if (tail * octetsPerChunk + 1 < result.length) {
      result[tail * octetsPerChunk + 1] = octet1;
    }
    if (tail * octetsPerChunk + 2 < result.length) {
      result[tail * octetsPerChunk + 2] = octet2;
    }
  }

  return result.buffer;
}

export function base64StringToBytes(base64: string): ArrayBuffer {
  if ('fromBase64' in Uint8Array) {
    // $FlowExpectError - flow doesn't know about this API yet
    return Uint8Array.fromBase64(base64).buffer;
  }

  return base64StringToBytesFallback(base64);
}
