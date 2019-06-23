/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

class BinReader {
  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytePos = 0;
  }
  seek(pos: number) {
    this.bytePos = pos;
  }
  skip(byteCount: number) {
    this.bytePos += byteCount;
  }
  hasMore() {
    return this.bytePos < this.view.byteLength;
  }
  bytesLeft() {
    return this.view.byteLength - this.bytePos;
  }
  readUint8() {
    this.bytePos++;
    if (this.bytePos > this.view.byteLength) return 0;
    return this.view.getUint8(this.bytePos - 1);
  }

  // Note: we intentionally use Math.pow here rather than bit shifts
  // because JavaScript doesn't have true 64 bit integers.
  readUint32() {
    this.bytePos += 4;
    if (this.bytePos > this.view.byteLength) return 0;
    return this.view.getUint32(this.bytePos - 4, true);
  }
  readUint48() {
    this.bytePos += 6;
    if (this.bytePos > this.view.byteLength) return 0;

    return (
      this.view.getUint32(this.bytePos - 6, true) +
      this.view.getUint16(this.bytePos - 2, true) * Math.pow(2, 32)
    );
  }
  readUint64() {
    this.bytePos += 8;
    if (this.bytePos > this.view.byteLength) return 0;
    return (
      this.view.getUint32(this.bytePos - 8, true) +
      this.view.getUint32(this.bytePos - 4, true) * Math.pow(2, 32)
    );
  }
}

export default BinReader;
