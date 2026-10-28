/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A tar parser which works in place on an ArrayBuffer. Tar is an uncompressed
// format, so the contained files are returned as views into that same buffer,
// without copies.
//
// The parser is deliberately strict: it rejects malformed headers and unusual
// combinations of extension headers rather than guessing, so that it is less
// likely to disagree with other tar implementations about the contents of an
// archive. See https://astral.sh/blog/tar-codec for background.
//
// References:
// https://pubs.opengroup.org/onlinepubs/9699919799/utilities/pax.html
// https://www.gnu.org/software/tar/manual/html_node/Standard.html

const BLOCK_SIZE = 512;

// Byte ranges of the header fields we use, as [offset, length].
type Field = [number, number];
const NAME: Field = [0, 100];
const SIZE: Field = [124, 12];
const CHECKSUM: Field = [148, 8];
const TYPEFLAG: Field = [156, 1];
const LINKNAME: Field = [157, 100];
// The magic and version fields together.
const MAGIC: Field = [257, 8];
const PREFIX: Field = [345, 155];

// Names in tar headers are raw bytes; in practice they are UTF-8. Bytes that
// aren't valid UTF-8 become U+FFFD, so such names can't match any real path.
const textDecoder = new TextDecoder('utf-8');

function _field(header: Uint8Array, [offset, length]: Field): Uint8Array {
  return header.subarray(offset, offset + length);
}

// Decode a NUL-terminated (or NUL-padded) string.
function _parseString(bytes: Uint8Array): string {
  const nulPos = bytes.indexOf(0);
  return textDecoder.decode(nulPos === -1 ? bytes : bytes.subarray(0, nulPos));
}

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
  const [checksumOffset, checksumLength] = CHECKSUM;
  const expected = _parseOctal(_field(header, CHECKSUM));
  let sum = 0x20 * checksumLength;
  for (let i = 0; i < header.length; i++) {
    if (i < checksumOffset || i >= checksumOffset + checksumLength) {
      sum += header[i];
    }
  }
  if (expected !== sum) {
    throw new Error('Tar header checksum mismatch');
  }
}

// The pax keywords we use. Records with other keywords are ignored.
const PAX_KEYWORDS = new Set(['path', 'linkpath', 'size']);

/**
 * Parse the records of a pax extended header. Each record has the form
 * "%d %s=%s\n" (<length>, <keyword>, <value>), where <length> is the decimal
 * length of the whole record in bytes, including the trailing newline.
 * An empty value means that the field is deleted.
 */
function _parsePaxRecords(data: Uint8Array): Map<string, string> {
  const records = new Map();
  let pos = 0;
  while (pos < data.length) {
    const spacePos = data.indexOf(0x20, pos);
    const lengthString =
      spacePos === -1 ? '' : textDecoder.decode(data.subarray(pos, spacePos));
    if (!/^[1-9][0-9]*$/.test(lengthString)) {
      throw new Error('Invalid pax record length');
    }
    const end = pos + Number(lengthString);
    const equalsPos = data.indexOf(0x3d, spacePos + 1);
    if (
      end > data.length ||
      data[end - 1] !== 0x0a ||
      equalsPos === -1 ||
      equalsPos >= end ||
      equalsPos === spacePos + 1
    ) {
      throw new Error('Invalid pax record');
    }
    const keyword = textDecoder.decode(data.subarray(spacePos + 1, equalsPos));
    if (PAX_KEYWORDS.has(keyword)) {
      if (records.has(keyword)) {
        throw new Error(`Duplicate pax record: ${keyword}`);
      }
      records.set(
        keyword,
        textDecoder.decode(data.subarray(equalsPos + 1, end - 1))
      );
    }
    pos = end;
  }
  return records;
}

// Archives use one of these header formats:
//  - 'ustar': POSIX UStar, possibly with pax extended headers ('x' and 'g').
//  - 'gnu': The old GNU format, which cargo uses. It has no name prefix field;
//    those bytes contain other fields. Long names are stored in separate 'L'
//    and 'K' entries.
//  - 'v7': The original tar format, without any extensions.
type TarFormat = 'ustar' | 'gnu' | 'v7';

function _getFormat(header: Uint8Array): TarFormat {
  const magic = String.fromCharCode(..._field(header, MAGIC));
  switch (magic) {
    case 'ustar\x0000':
      return 'ustar';
    case 'ustar  \x00':
      return 'gnu';
    case '\x00'.repeat(8):
      return 'v7';
    default:
      throw new Error('Unknown tar header format');
  }
}

function _parsePaxSize(value: string): number {
  const size = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(size)) {
    throw new Error('Invalid pax size');
  }
  return size;
}

export type TarFileEntry = {
  name: string;
  // The typeflag, e.g. '0' for a regular file or '5' for a directory. Old
  // archives use '' for regular files.
  type: string;
  size: number;
  // The contents of a regular file, as a view into the archive buffer.
  // null for all other entry types.
  buffer: Uint8Array | null;
  linkname: string;
};

export class UntarFileStream {
  _bytes: Uint8Array;
  _position = 0;
  // Mixing header formats in one archive is not allowed. This is the format
  // of the first header.
  _format: TarFormat | null = null;

  constructor(arrayBuffer: ArrayBufferLike) {
    this._bytes = new Uint8Array(arrayBuffer);
  }

  /**
   * Return the next member of the archive, or null at the end of the archive.
   * Throws if the archive is malformed.
   */
  next(): TarFileEntry | null {
    // Extension headers which apply to the next member: the records of a pax
    // 'x' header, and the GNU long name ('L') and long link name ('K').
    let localPax: Map<string, string> | null = null;
    let longName: string | null = null;
    let longLinkname: string | null = null;

    while (true) {
      const header = this._readHeader();
      if (header === null) {
        if (localPax !== null || longName !== null || longLinkname !== null) {
          throw new Error('Extension header at the end of the tar archive');
        }
        return null;
      }

      const type = _parseString(_field(header, TYPEFLAG));
      const headerSize = _parseOctal(_field(header, SIZE));
      if (headerSize === null) {
        throw new Error('Missing size in tar header');
      }

      const format = _getFormat(header);
      if (this._format === null) {
        this._format = format;
      } else if (format !== this._format) {
        throw new Error('Mixed header formats in tar archive');
      }

      if ((type === 'g' || type === 'x') && format !== 'ustar') {
        throw new Error(`Pax header in a ${format} tar archive`);
      }

      if ((type === 'L' || type === 'K') && format !== 'gnu') {
        throw new Error(`GNU long name header in a ${format} tar archive`);
      }

      if (type === 'L') {
        if (longName !== null) {
          throw new Error('Multiple GNU long names for one tar member');
        }
        longName = _parseString(this._readData(headerSize));
        continue;
      }

      if (type === 'K') {
        if (longLinkname !== null) {
          throw new Error('Multiple GNU long link names for one tar member');
        }
        longLinkname = _parseString(this._readData(headerSize));
        continue;
      }

      if (type === 'g') {
        // Global pax header. Its records apply to all following members. We
        // reject all the keywords we'd otherwise use: overriding the path or
        // size of every member isn't meaningful. So there's nothing to keep.
        const records = _parsePaxRecords(this._readData(headerSize));
        if (records.size !== 0) {
          throw new Error('Unsupported record in global pax header');
        }
        continue;
      }

      if (type === 'x') {
        if (localPax !== null) {
          throw new Error('Multiple pax headers for one tar member');
        }
        localPax = _parsePaxRecords(this._readData(headerSize));
        continue;
      }

      // This is a real member. Resolve its fields, with extension headers
      // taking precedence over the header. A pax record with an empty value
      // deletes the field. Only one kind of extension header can be present,
      // because the format check above ties pax to UStar and L/K to GNU.
      let headerName = _parseString(_field(header, NAME));
      if (format === 'ustar') {
        const prefix = _parseString(_field(header, PREFIX));
        if (prefix !== '') {
          headerName = prefix + '/' + headerName;
        }
      }
      const name = localPax?.get('path') ?? longName ?? headerName;
      const linkname =
        localPax?.get('linkpath') ??
        longLinkname ??
        _parseString(_field(header, LINKNAME));
      const paxSize = localPax?.get('size');
      const size = paxSize === undefined ? headerSize : _parsePaxSize(paxSize);
      if (name === '') {
        throw new Error('Tar member with an empty name');
      }

      const data = this._readData(size);

      // Regular files have the type '0', or '' in old archives. Type '7'
      // (contiguous file) is usually treated like a regular file.
      const isNormalFile = type === '0' || type === '' || type === '7';

      return {
        name,
        type,
        size,
        buffer: isNormalFile ? data : null,
        linkname,
      };
    }
  }

  // Read a header block, or return null at the end of the archive. A tar
  // archive ends with two all-zero blocks. We stop at the first one, and also
  // accept an archive that ends right after its last member.
  _readHeader(): Uint8Array | null {
    if (this._position >= this._bytes.length) {
      return null;
    }
    const header = this._read(BLOCK_SIZE);
    if (_isZeroBlock(header)) {
      return null;
    }
    _verifyChecksum(header);
    return header;
  }

  // Read the data that follows a header, and skip its padding.
  _readData(size: number): Uint8Array {
    const data = this._read(size);
    this._position += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE - size;
    return data;
  }

  _read(byteCount: number): Uint8Array {
    const end = this._position + byteCount;
    if (end > this._bytes.length) {
      throw new Error('Unexpected end of tar archive');
    }
    const bytes = this._bytes.subarray(this._position, end);
    this._position = end;
    return bytes;
  }
}
