/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

async function readableStreamToBuffer(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Calculate total length and combine chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export async function compress(
  data: string | Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  // Encode the data if it's a string
  const arrayData =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;

  // Create a gzip compression stream
  const compressionStream = new CompressionStream('gzip');

  // Write the data to the compression stream
  const writer = compressionStream.writable.getWriter();
  writer.write(arrayData);
  writer.close();

  // Read the compressed data back into a buffer
  return readableStreamToBuffer(compressionStream.readable);
}

export async function decompress(
  data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  // Create a gzip compression stream
  const decompressionStream = new DecompressionStream('gzip');

  // Write the data to the compression stream
  const writer = decompressionStream.writable.getWriter();
  writer.write(data);
  writer.close();

  // Read the compressed data back into a buffer
  return readableStreamToBuffer(decompressionStream.readable);
}

export function isGzip(data: Uint8Array): boolean {
  // Detect the gzip magic bytes 1f 8b 08.
  return (
    data.byteLength >= 3 &&
    data[0] === 0x1f &&
    data[1] === 0x8b &&
    data[2] === 0x08
  );
}
