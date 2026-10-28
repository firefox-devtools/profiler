/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This code was originally from https://github.com/InvokIT/js-untar/blob/master/src/untar-worker.js (MIT).
// It was modernized, the Worker requirement was removed, and some Flow types were added.
// Tar is an uncompressed format. If you have the tar bytes in a buffer, you can
// access the contained files simply by creating a new view around that same buffer,
// with the correct offsets. The parsing of the tar header is fast; the slow part
// would be the copy of the contained bytes to and from the worker. So having
// everything on the main thread is both simpler and faster, because it skips the copy.

// TODO: Consider unifying this ByteReader with the one in art-trace.js
class ByteReader {
  _uint8Array: Uint8Array;
  _bufferView: DataView;
  _position = 0;
  // Names in tar headers are raw bytes; in practice they are UTF-8. Bytes that
  // aren't valid UTF-8 become U+FFFD, so such names can't match any real path.
  _textDecoder = new TextDecoder('utf-8');

  constructor(arrayBuffer: ArrayBufferLike) {
    this._uint8Array = new Uint8Array(arrayBuffer);
    this._bufferView = new DataView(arrayBuffer);
  }

  readString(byteCount: number): string {
    const bytes = this.readBuffer(byteCount);
    const nulBytePos = bytes.indexOf(0);
    return nulBytePos === -1
      ? this._textDecoder.decode(bytes)
      : this._textDecoder.decode(bytes.subarray(0, nulBytePos));
  }

  readOctal(byteCount: number): number | null {
    return _parseOctal(this.readBuffer(byteCount));
  }

  readBuffer(byteCount: number): Uint8Array {
    if (this.position() + byteCount > this.size()) {
      throw new Error('Unexpected end of tar archive');
    }
    const buf = this._uint8Array.subarray(
      this.position(),
      this.position() + byteCount
    );
    this.seekBy(byteCount);
    return buf;
  }

  seekBy(byteCount: number): void {
    this._position += byteCount;
  }

  seekTo(newpos: number): void {
    this._position = newpos;
  }

  peekBuffer(byteCount: number): Uint8Array {
    return this._uint8Array.subarray(
      this.position(),
      this.position() + byteCount
    );
  }

  position(): number {
    return this._position;
  }

  size(): number {
    return this._bufferView.byteLength;
  }
}

type FieldEntry = {
  name: string;
  value: string | number | null;
};

const BLOCK_SIZE = 512;

// The checksum field covers bytes 148..156 of the header.
const CHECKSUM_OFFSET = 148;
const CHECKSUM_LENGTH = 8;

/**
 * Parse a numeric header field. These fields contain octal digits, optionally
 * preceded by spaces or NULs and followed by spaces or NULs. Anything else,
 * including GNU base-256 numbers, is rejected. Returns null if the field
 * contains no digits at all.
 */
function _parseOctal(bytes: Uint8Array): number | null {
  const isPadding = (b: number) => b === 0x00 || b === 0x20;
  let i = 0;
  while (i < bytes.length && isPadding(bytes[i])) {
    i++;
  }
  let value = 0;
  let digitCount = 0;
  for (; i < bytes.length && bytes[i] >= 0x30 && bytes[i] <= 0x37; i++) {
    value = value * 8 + (bytes[i] - 0x30);
    digitCount++;
  }
  for (; i < bytes.length; i++) {
    if (!isPadding(bytes[i])) {
      throw new Error('Invalid numeric field in tar header');
    }
  }
  return digitCount === 0 ? null : value;
}

function _isZeroBlock(block: Uint8Array): boolean {
  return block.every((b) => b === 0);
}

/**
 * Check the header checksum: the unsigned sum of all header bytes, with the
 * checksum field itself counted as if it contained spaces.
 */
function _verifyChecksum(header: Uint8Array): void {
  const expected = _parseOctal(
    header.subarray(CHECKSUM_OFFSET, CHECKSUM_OFFSET + CHECKSUM_LENGTH)
  );
  let sum = 0x20 * CHECKSUM_LENGTH;
  for (let i = 0; i < header.length; i++) {
    if (i < CHECKSUM_OFFSET || i >= CHECKSUM_OFFSET + CHECKSUM_LENGTH) {
      sum += header[i];
    }
  }
  if (expected !== sum) {
    throw new Error('Tar header checksum mismatch');
  }
}

function _parseIntStrict(s: string, base: number): number {
  const val = parseInt(s, base);
  if (isNaN(val)) {
    throw new Error('Parsing number failed');
  }
  return val;
}

/**
 * A PaxHeader is a set of fields with names and values. The fields get applied
 * to a file entry.
 * When reading file entries, the header is read first, then the file, and then
 * the header is applied to the file.
 */
class PaxHeader {
  _fields: FieldEntry[];

  static parse(buffer: Uint8Array): PaxHeader {
    // https://pubs.opengroup.org/onlinepubs/9699919799/utilities/pax.html#tag_20_92_13_03
    // An extended header shall consist of one or more records, each constructed as follows:
    // "%d %s=%s\n", <length>, <keyword>, <value>

    // The extended header records shall be encoded according to the ISO/IEC10646-1:2000 standard (UTF-8).
    // The <length> field, <blank>, equals sign, and <newline> shown shall be limited to the portable character set, as
    // encoded in UTF-8. The <keyword> and <value> fields can be any UTF-8 characters. The <length> field shall be the
    // decimal length of the extended header record in octets, including the trailing <newline>.

    let bytes = new Uint8Array(buffer);
    const fields = [];

    const textDecoder = new TextDecoder('utf-8', { fatal: true });

    while (bytes.length > 0) {
      // Decode bytes up to the first space character; that is the total field length
      const spacePos = bytes.indexOf(0x20);
      if (spacePos === -1) {
        throw new Error('Expected space character');
      }
      const fieldLength = _parseIntStrict(
        textDecoder.decode(bytes.subarray(0, spacePos)),
        10
      );
      const fieldText = textDecoder.decode(bytes.subarray(0, fieldLength));
      const fieldMatch = fieldText.match(/^\d+ ([^=]+)=(.*)\n$/);

      if (fieldMatch === null) {
        throw new Error('Invalid PAX header data format.');
      }

      const fieldName = fieldMatch[1];
      let fieldValue: string | number | null = fieldMatch[2];

      if (typeof fieldValue === 'string' && fieldValue.length === 0) {
        fieldValue = null;
      } else if (typeof fieldValue === 'string' && /^\d+$/.test(fieldValue)) {
        // If it's an integer field, parse it as int
        fieldValue = _parseIntStrict(fieldValue, 10);
      }
      // Don't parse float values since precision is lost

      const field = {
        name: fieldName,
        value: fieldValue,
      };

      fields.push(field);

      bytes = bytes.subarray(fieldLength); // Cut off the parsed field data
    }

    return new PaxHeader(fields);
  }

  constructor(fields: FieldEntry[]) {
    this._fields = fields;
  }

  applyHeader(file: any): void {
    // Apply fields to the file
    // If a field is of value null, it should be deleted from the file
    // https://pubs.opengroup.org/onlinepubs/9699919799/utilities/pax.html#tag_20_92_13_03

    for (const field of this._fields) {
      let fieldName = field.name;
      const fieldValue = field.value;

      if (fieldName === 'path') {
        // This overrides the name and prefix fields in the following header block.
        fieldName = 'name';

        if (file.namePrefix !== undefined) {
          delete file.namePrefix;
        }
      } else if (fieldName === 'linkpath') {
        // This overrides the linkname field in the following header block.
        fieldName = 'linkname';
      }

      if (fieldValue === null) {
        delete file[fieldName];
      } else {
        file[fieldName] = fieldValue;
      }
    }
  }
}

export type TarFileEntry = {
  name: string;
  type: string;
  size: number;
  buffer: Uint8Array | null;
  mode: string;
  uid: number | null;
  gid: number | null;
  mtime: number | null;
  linkname: string;
  ustarFormat: string;
  version: string | null;
  uname: string | null;
  gname: string | null;
  devmajor: number | null;
  devminor: number | null;
  namePrefix: string | null;
};

export class UntarFileStream {
  _reader: ByteReader;
  _globalPaxHeader: PaxHeader | null = null;

  constructor(arrayBuffer: ArrayBufferLike) {
    this._reader = new ByteReader(arrayBuffer);
  }

  hasNext(): boolean {
    // A tar archive ends with two all-zero blocks. We stop at the first one,
    // and also accept an archive that ends right after its last member.
    const reader = this._reader;
    return (
      reader.position() < reader.size() &&
      !_isZeroBlock(reader.peekBuffer(BLOCK_SIZE))
    );
  }

  next(): TarFileEntry {
    return this._readNextFile();
  }

  _readNextFile(): TarFileEntry {
    const stream = this._reader;

    const headerBeginPos = stream.position();
    if (headerBeginPos + BLOCK_SIZE > stream.size()) {
      throw new Error('Unexpected end of tar archive');
    }
    _verifyChecksum(stream.peekBuffer(BLOCK_SIZE));

    // Read header
    let name = stream.readString(100);
    const mode = stream.readString(8);
    const uid = stream.readOctal(8);
    const gid = stream.readOctal(8);
    const size = stream.readOctal(12);
    if (size === null) {
      throw new Error('Missing size in tar header');
    }
    const mtime = stream.readOctal(12);
    stream.seekBy(CHECKSUM_LENGTH);
    const type = stream.readString(1);
    const linkname = stream.readString(100);
    const ustarFormat = stream.readString(6);
    let version = null;
    let uname = null;
    let gname = null;
    let devmajor = null;
    let devminor = null;
    let namePrefix = null;

    if (ustarFormat.indexOf('ustar') > -1) {
      version = stream.readString(2);
      uname = stream.readString(32);
      gname = stream.readString(32);
      devmajor = stream.readOctal(8);
      devminor = stream.readOctal(8);
      namePrefix = stream.readString(155);

      if (namePrefix.length > 0) {
        name = namePrefix + '/' + name;
      }
    }

    // The size is padded to be aligned with 512 bytes.
    const alignedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    const dataBeginPos = headerBeginPos + BLOCK_SIZE;
    const dataEndPos = dataBeginPos + alignedSize;

    stream.seekTo(dataBeginPos);

    // Handle the various file types.

    // Derived from https://www.mkssoftware.com/docs/man4/pax.4.asp
    // and https://www.ibm.com/support/knowledgecenter/en/SSLTBW_2.3.0/com.ibm.zos.v2r3.bpxa500/pxarchfm.htm
    // Also see https://en.wikipedia.org/wiki/Tar_(computing)#File_format

    if (type === 'g') {
      // Global PAX header
      this._globalPaxHeader = PaxHeader.parse(stream.readBuffer(size));
      stream.seekTo(dataEndPos);

      // Read the next entry. It will apply the global PAX header to itself.
      return this._readNextFile();
    }

    if (type === 'x') {
      // PAX header
      const paxHeader = PaxHeader.parse(stream.readBuffer(size));
      stream.seekTo(dataEndPos);

      // Read the next entry, and then apply this PAX header to it.
      const file = this._readNextFile();
      paxHeader.applyHeader(file);
      return file;
    }

    // Normal file is either "0" or "\0".
    // In case of "\0", readString returns an empty string, that is "".
    // In addition, according to wikipedia, type 7 is usually handled like type 0.
    const isNormalFile = type === '0' || type === '' || type === '7';

    const buffer = isNormalFile ? stream.readBuffer(size) : null;

    stream.seekTo(dataEndPos);

    const file = {
      name,
      type,
      buffer,
      mode,
      uid,
      gid,
      size,
      mtime,
      linkname,
      ustarFormat,
      version,
      uname,
      gname,
      devmajor,
      devminor,
      namePrefix,
    };

    if (this._globalPaxHeader !== null) {
      this._globalPaxHeader.applyHeader(file);
    }

    return file;
  }
}
