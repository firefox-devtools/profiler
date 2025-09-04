/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

async function readableStreamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];

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

onmessage = async (e) => {
  const data = e.data;
  if (data.kind === 'compress') {
    // Create a gzip compression stream
    const compressionStream = new CompressionStream('gzip');

    // Write the data to the compression stream
    const writer = compressionStream.writable.getWriter();
    writer.write(data.arrayData);
    writer.close();

    // Read the compressed data back into a buffer
    const result = await readableStreamToBuffer(compressionStream.readable);
    postMessage(result, [result.buffer]);
  } else if (data.kind === 'decompress') {
    // Create a gzip compression stream
    const decompressionStream = new DecompressionStream('gzip');

    // Write the data to the compression stream
    const writer = decompressionStream.writable.getWriter();
    writer.write(data.arrayData);
    writer.close();

    // Read the compressed data back into a buffer
    const result = await readableStreamToBuffer(decompressionStream.readable);
    postMessage(result, [result.buffer]);
  } else {
    throw new Error('unknown message');
  }
};
