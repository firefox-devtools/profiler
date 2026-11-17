/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// JPEG markers are 2 bytes: 0xFF followed by the marker type.
const JPEG_START_OF_IMAGE = 0xffd8;
const JPEG_START_OF_SCAN = 0xffda;
// The Start Of Frame markers (SOF0 to SOF15) hold the image size. DHT, JPG and
// DAC share that range without being SOF markers.
const JPEG_SOF0 = 0xffc0;
const JPEG_SOF15 = 0xffcf;
const JPEG_NON_SOF_MARKERS = [0xffc4, 0xffc8, 0xffcc];

/**
 * Extract the width and height values from the header of a JPEG image. This
 * doesn't use the DOM Image API so that it also works in Node, e.g. in
 * profiler-cli. Returns null if the data isn't a valid JPEG.
 */
export function getJpegSize(
  bytes: Uint8Array
): null | { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 2 || view.getUint16(0) !== JPEG_START_OF_IMAGE) {
    return null;
  }

  // Each segment is a 2-byte marker, followed by a 2-byte length that doesn't
  // include the marker.
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      // Not a marker, the file is corrupt.
      return null;
    }
    if (view.getUint8(offset + 1) === 0xff) {
      // Markers can be preceded by any number of 0xFF fill bytes.
      offset++;
      continue;
    }
    const marker = view.getUint16(offset);
    if (marker === JPEG_START_OF_SCAN) {
      // The image data starts here, there is no frame header.
      return null;
    }
    const isStartOfFrame =
      marker >= JPEG_SOF0 &&
      marker <= JPEG_SOF15 &&
      !JPEG_NON_SOF_MARKERS.includes(marker);
    if (isStartOfFrame) {
      // After the marker and length come the sample precision (1 byte), then
      // the height (2 bytes) and the width (2 bytes).
      if (offset + 9 > view.byteLength) {
        return null;
      }
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + view.getUint16(offset + 2);
  }

  return null;
}
