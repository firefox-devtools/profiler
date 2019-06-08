/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

class UID {
  constructor(index) {
    this.index = index;
  }
}

class BinaryPlistParser {
  constructor(view) {
    this.view = view;
    this.referenceSize = 0;
    this.offsetTable = [];
  }

  parseRoot(): any {
    const trailer = this.view.byteLength - 32;
    const offsetSize = this.view.getUint8(trailer + 6);
    this.referenceSize = this.view.getUint8(trailer + 7);

    // Just use the last 32-bits of these 64-bit big-endian values
    const objectCount = this.view.getUint32(trailer + 12, false);
    const rootIndex = this.view.getUint32(trailer + 20, false);
    let tableOffset = this.view.getUint32(trailer + 28, false);
    // console.log('objectCount', objectCount);

    // console.log('rootIndex', rootIndex);
    // Parse all offsets before starting to parse objects
    for (let i = 0; i < objectCount; i++) {
      this.offsetTable.push(this.parseInteger(tableOffset, offsetSize));
      tableOffset += offsetSize;
    }

    // console.log(this.parseObject(this.offsetTable[rootIndex]))
    // Parse the root object assuming the graph is a tree
    console.log(
      'output of parseRoot function',
      this.parseObject(this.offsetTable[rootIndex])
    );
    return this.parseObject(this.offsetTable[rootIndex]);
  }

  parseLengthAndOffset(offset: number, extra: number) {
    if (extra !== 0x0f) return { length: extra, offset: 0 };
    const marker = this.view.getUint8(offset++);
    if ((marker & 0xf0) !== 0x10)
      throw new Error('Unexpected non-integer length at offset ' + offset);
    const size = 1 << (marker & 0x0f);
    return { length: this.parseInteger(offset, size), offset: size + 1 };
  }

  parseSingleton(offset: number, extra: number): any {
    if (extra === 0) return null;
    if (extra === 8) return false;
    if (extra === 9) return true;
    throw new Error('Unexpected extra value ' + extra + ' at offset ' + offset);
  }

  parseInteger(offset: number, size: number): number {
    if (size === 1) return this.view.getUint8(offset);
    if (size === 2) return this.view.getUint16(offset, false);
    if (size === 4) return this.view.getUint32(offset, false);

    if (size === 8) {
      return (
        Math.pow(2, 32 * 1) * this.view.getUint32(offset + 0, false) +
        Math.pow(2, 32 * 0) * this.view.getUint32(offset + 4, false)
      );
    }

    if (size === 16) {
      return (
        Math.pow(2, 32 * 3) * this.view.getUint32(offset + 0, false) +
        Math.pow(2, 32 * 2) * this.view.getUint32(offset + 4, false) +
        Math.pow(2, 32 * 1) * this.view.getUint32(offset + 8, false) +
        Math.pow(2, 32 * 0) * this.view.getUint32(offset + 12, false)
      );
    }

    throw new Error(
      'Unexpected integer of size ' + size + ' at offset ' + offset
    );
  }

  parseFloat(offset: number, size: number): number {
    if (size === 4) return this.view.getFloat32(offset, false);
    if (size === 8) return this.view.getFloat64(offset, false);
    throw new Error(
      'Unexpected float of size ' + size + ' at offset ' + offset
    );
  }

  parseDate(offset: number, size: number): Date {
    if (size !== 8)
      throw new Error(
        'Unexpected date of size ' + size + ' at offset ' + offset
      );
    const seconds = this.view.getFloat64(offset, false);
    return new Date(978307200000 + seconds * 1000); // Starts from January 1st, 2001
  }

  parseData(offset: number, extra: number): Uint8Array {
    const both = this.parseLengthAndOffset(offset, extra);
    // console.log(new Uint8Array(this.view.buffer, offset + both.offset, both.length))

    return new Uint8Array(this.view.buffer, offset + both.offset, both.length);
  }

  parseStringASCII(offset: number, extra: number): string {
    const both = this.parseLengthAndOffset(offset, extra);
    let text = '';
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      text += String.fromCharCode(this.view.getUint8(offset++));
    }
    return text;
  }

  parseStringUTF16(offset: number, extra: number): string {
    const both = this.parseLengthAndOffset(offset, extra);
    let text = '';
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      text += String.fromCharCode(this.view.getUint16(offset, false));
      offset += 2;
    }
    return text;
  }

  parseUID(offset: number, size: number): UID {
    return new UID(this.parseInteger(offset, size));
  }

  parseArray(offset: number, extra: number): any[] {
    const both = this.parseLengthAndOffset(offset, extra);
    const array: any[] = [];
    const size = this.referenceSize;
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      array.push(
        this.parseObject(this.offsetTable[this.parseInteger(offset, size)])
      );
      offset += size;
    }
    return array;
  }

  parseDictionary(offset: number, extra: number): Object {
    const both = this.parseLengthAndOffset(offset, extra);
    const dictionary = Object.create(null);
    const size = this.referenceSize;
    let nextKey = offset + both.offset;
    let nextValue = nextKey + both.length * size;
    for (let i = 0; i < both.length; i++) {
      const key = this.parseObject(
        this.offsetTable[this.parseInteger(nextKey, size)]
      );
      const value = this.parseObject(
        this.offsetTable[this.parseInteger(nextValue, size)]
      );
      if (typeof key !== 'string')
        throw new Error('Unexpected non-string key at offset ' + nextKey);
      dictionary[key] = value;
      nextKey += size;
      nextValue += size;
    }
    return dictionary;
  }

  parseObject(offset: number): any {
    const marker = this.view.getUint8(offset++);
    const extra = marker & 0x0f;
    switch (marker >> 4) {
      case 0x0:
        return this.parseSingleton(offset, extra);
      case 0x1:
        return this.parseInteger(offset, 1 << extra);
      case 0x2:
        return this.parseFloat(offset, 1 << extra);
      case 0x3:
        return this.parseDate(offset, 1 << extra);
      case 0x4:
        return this.parseData(offset, extra);
      case 0x5:
        return this.parseStringASCII(offset, extra);
      case 0x6:
        return this.parseStringUTF16(offset, extra);
      case 0x8:
        return this.parseUID(offset, extra + 1);
      case 0xa:
        return this.parseArray(offset, extra);
      case 0xd:
        return this.parseDictionary(offset, extra);
    }
    throw new Error('Unexpected marker ' + marker + ' at offset ' + --offset);
  }
}

export default BinaryPlistParser;
