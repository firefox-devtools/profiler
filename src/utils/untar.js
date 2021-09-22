/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This code was taken from https://github.com/InvokIT/js-untar/blob/master/src/untar-worker.js (MIT).
// It was modernized and some Flow types were added.

const textDecoder = new TextDecoder();

type FieldEntry = {|
  name: string,
  value: string | number | null,
|};

class PaxHeader {
  _fields: FieldEntry[];

  static parse(buffer) {
    // https://www.ibm.com/support/knowledgecenter/en/SSLTBW_2.3.0/com.ibm.zos.v2r3.bpxa500/paxex.htm
    // An extended header shall consist of one or more records, each constructed as follows:
    // "%d %s=%s\n", <length>, <keyword>, <value>

    // The extended header records shall be encoded according to the ISO/IEC10646-1:2000 standard (UTF-8).
    // The <length> field, <blank>, equals sign, and <newline> shown shall be limited to the portable character set, as
    // encoded in UTF-8. The <keyword> and <value> fields can be any UTF-8 characters. The <length> field shall be the
    // decimal length of the extended header record in octets, including the trailing <newline>.

    let bytes = new Uint8Array(buffer);
    const fields = [];

    while (bytes.length > 0) {
      // Decode bytes up to the first space character; that is the total field length
      const fieldLength = parseInt(
        textDecoder.decode(bytes.subarray(0, bytes.indexOf(0x20))),
        10
      );
      const fieldText = textDecoder.decode(bytes.subarray(0, fieldLength));
      const fieldMatch = fieldText.match(/^\d+ ([^=]+)=(.*)\n$/);

      if (fieldMatch === null) {
        throw new Error('Invalid PAX header data format.');
      }

      const fieldName = fieldMatch[1];
      let fieldValue = fieldMatch[2];

      if (fieldValue.length === 0) {
        fieldValue = null;
      } else if (fieldValue.match(/^\d+$/) !== null) {
        // If it's a integer field, parse it as int
        fieldValue = parseInt(fieldValue, 10);
      }
      // Don't parse float values since precision is lost

      const field = {
        name: fieldName,
        value: fieldValue,
      };

      fields.push(field);

      bytes = bytes.subarray(fieldLength); // Cut off the parsed field data
    }

    console.log(fields);

    return new PaxHeader(fields);
  }

  constructor(fields: FieldEntry[]) {
    this._fields = fields;
  }

  applyHeader(file) {
    // Apply fields to the file
    // If a field is of value null, it should be deleted from the file
    // https://www.mkssoftware.com/docs/man4/pax.4.asp

    this._fields.forEach(function (field) {
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
        file[fieldName] = (fieldValue: any);
      }
    });
  }
}

class UntarStream {
  _uint8Array: Uint8Array;
  _bufferView: DataView;
  _position = 0;

  constructor(arrayBuffer) {
    this._uint8Array = new Uint8Array(arrayBuffer);
    this._bufferView = new DataView(arrayBuffer);
  }

  readString(byteCount) {
    const bytes = this.readBuffer(byteCount);
    const nulBytePos = bytes.indexOf(0);
    return nulBytePos === -1
      ? textDecoder.decode(bytes)
      : textDecoder.decode(bytes.subarray(0, nulBytePos));
  }

  readBuffer(byteCount) {
    const buf = this._uint8Array.subarray(
      this.position(),
      this.position() + byteCount
    );
    this.seekBy(byteCount);
    return buf;
  }

  seekBy(byteCount) {
    this._position += byteCount;
  }

  seekTo(newpos) {
    this._position = newpos;
  }

  peekUint32() {
    return this._bufferView.getUint32(this.position(), true);
  }

  position() {
    return this._position;
  }

  size() {
    return this._bufferView.byteLength;
  }
}

export type TarFileEntry = {|
  name: string,
  mode: string,
  uid: number,
  gid: number,
  size: number,
  mtime: number,
  checksum: number,
  type: string,
  linkname: number | string,
  ustarFormat: string,

  buffer: Uint8Array,

  version?: string,
  uname?: string,
  gname?: string,
  devmajor?: number,
  devminor?: number,
  namePrefix?: string,
|};

export class UntarFileStream {
  _stream: UntarStream;
  _globalPaxHeader: PaxHeader | null = null;

  constructor(arrayBuffer: ArrayBuffer) {
    this._stream = new UntarStream(arrayBuffer);
  }

  hasNext() {
    // A tar file ends with 4 zero bytes
    return (
      this._stream.position() + 4 < this._stream.size() &&
      this._stream.peekUint32() !== 0
    );
  }

  next(): TarFileEntry {
    return this._readNextFile();
  }

  _readNextFile(): TarFileEntry {
    const stream = this._stream;
    let isHeaderFile = false;
    let paxHeader = null;

    const headerBeginPos = stream.position();
    const dataBeginPos = headerBeginPos + 512;

    // Read header
    let name = stream.readString(100);
    const mode = stream.readString(8);
    const uid = parseInt(stream.readString(8), 10);
    const gid = parseInt(stream.readString(8), 10);
    const size = parseInt(stream.readString(12), 8);
    const mtime = parseInt(stream.readString(12), 8);
    const checksum = parseInt(stream.readString(8), 10);
    const type = stream.readString(1);
    const linkname = stream.readString(100);
    const ustarFormat = stream.readString(6);
    let version, uname, gname, devmajor, devminor, namePrefix;

    if (ustarFormat.indexOf('ustar') > -1) {
      version = stream.readString(2);
      uname = stream.readString(32);
      gname = stream.readString(32);
      devmajor = parseInt(stream.readString(8), 10);
      devminor = parseInt(stream.readString(8), 10);
      namePrefix = stream.readString(155);

      if (namePrefix.length > 0) {
        name = namePrefix + '/' + name;
      }
    }

    stream.seekTo(dataBeginPos);

    let buffer = new Uint8Array([]);

    // Derived from https://www.mkssoftware.com/docs/man4/pax.4.asp
    // and https://www.ibm.com/support/knowledgecenter/en/SSLTBW_2.3.0/com.ibm.zos.v2r3.bpxa500/pxarchfm.htm
    switch (type) {
      case '0': // Normal file is either "0" or "\0".
      case '': // In case of "\0", readString returns an empty string, that is "".
        buffer = stream.readBuffer(size);
        break;
      case '1': // Link to another file already archived
        // TODO Should we do anything with these?
        break;
      case '2': // Symbolic link
        // TODO Should we do anything with these?
        break;
      case '3': // Character special device (what does this mean??)
        break;
      case '4': // Block special device
        break;
      case '5': // Directory
        break;
      case '6': // FIFO special file
        break;
      case '7': // Reserved
        break;
      case 'g': // Global PAX header
        isHeaderFile = true;
        this._globalPaxHeader = PaxHeader.parse(stream.readBuffer(size));
        break;
      case 'x': // PAX header
        isHeaderFile = true;
        paxHeader = PaxHeader.parse(stream.readBuffer(size));
        break;
      default:
        // Unknown file type
        break;
    }

    let dataEndPos = dataBeginPos + size;

    // File data is padded to reach a 512 byte boundary; skip the padded bytes too.
    if (size % 512 !== 0) {
      dataEndPos += 512 - (size % 512);
    }

    stream.seekTo(dataEndPos);

    const file = isHeaderFile
      ? this._readNextFile()
      : {
          buffer,
          name,
          mode,
          uid,
          gid,
          size,
          mtime,
          checksum,
          type,
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

    if (paxHeader !== null) {
      paxHeader.applyHeader(file);
    }

    return file;
  }
}
