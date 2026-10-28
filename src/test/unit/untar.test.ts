/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UntarFileStream } from 'firefox-profiler/utils/untar';

type HeaderSpec = {
  name: string;
  type?: string;
  // 'ustar' is POSIX UStar / pax, 'gnu' is the old GNU format used by cargo.
  format?: 'ustar' | 'gnu';
  prefix?: string;
  uid?: string;
  // Raw bytes written at the given offset before the checksum is computed.
  patches?: Array<{ offset: number; bytes: string | Uint8Array }>;
  // Corrupt the checksum after it is computed.
  badChecksum?: boolean;
};

const encoder = new TextEncoder();

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? encoder.encode(data) : data;
}

function makeHeader(spec: HeaderSpec, size: number): Uint8Array {
  const header = new Uint8Array(512);
  const write = (offset: number, data: string | Uint8Array) =>
    header.set(toBytes(data), offset);
  write(0, spec.name);
  write(100, '0000644\0');
  write(108, spec.uid ?? '0000000\0');
  write(116, '0000000\0');
  write(124, size.toString(8).padStart(11, '0') + '\0');
  write(136, '00000000000\0');
  write(156, spec.type ?? '0');
  if (spec.format === 'gnu') {
    write(257, 'ustar  \0');
  } else {
    write(257, 'ustar\x0000');
  }
  if (spec.prefix !== undefined) {
    write(345, spec.prefix);
  }
  for (const { offset, bytes } of spec.patches ?? []) {
    write(offset, bytes);
  }
  write(148, '        ');
  let checksum = header.reduce((a, b) => a + b, 0);
  if (spec.badChecksum) {
    checksum++;
  }
  write(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  return header;
}

function makeEntry(spec: HeaderSpec, content: string | Uint8Array = '') {
  const data = toBytes(content);
  const paddedSize = Math.ceil(data.length / 512) * 512;
  const entry = new Uint8Array(512 + paddedSize);
  entry.set(makeHeader(spec, data.length), 0);
  entry.set(data, 512);
  return entry;
}

function makeArchive(
  entries: Uint8Array[],
  { trailer = true }: { trailer?: boolean } = {}
): ArrayBuffer {
  if (trailer) {
    entries = [...entries, new Uint8Array(1024)];
  }
  const totalLength = entries.reduce((a, e) => a + e.length, 0);
  const archive = new Uint8Array(totalLength);
  let offset = 0;
  for (const entry of entries) {
    archive.set(entry, offset);
    offset += entry.length;
  }
  return archive.buffer;
}

function listEntries(archive: ArrayBuffer) {
  const decoder = new TextDecoder();
  const stream = new UntarFileStream(archive);
  const result = [];
  while (stream.hasNext()) {
    const { name, type, buffer } = stream.next();
    result.push({
      name,
      type,
      content: buffer === null ? null : decoder.decode(buffer),
    });
  }
  return result;
}

describe('untar', function () {
  it('lists all files in example tar', function () {
    const fs = require('fs');
    const zlib = require('zlib');
    const gzBuffer = fs.readFileSync(
      'src/test/fixtures/addr2line-0.17.0.crate.tar.gz'
    );
    const buffer = zlib.gunzipSync(gzBuffer);
    const stream = new UntarFileStream(buffer.buffer);

    const fileEntries = [];

    while (stream.hasNext()) {
      const { name, buffer, size, uid } = stream.next();
      fileEntries.push({
        name,
        size,
        uid,
        offset: buffer ? buffer.byteOffset : null,
      });
    }

    expect(fileEntries).toMatchInlineSnapshot(`
      Array [
        Object {
          "name": "addr2line-0.17.0/.cargo_vcs_info.json",
          "offset": 512,
          "size": 74,
          "uid": null,
        },
        Object {
          "name": "addr2line-0.17.0/.gitignore",
          "offset": 1536,
          "size": 33,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/CHANGELOG.md",
          "offset": 2560,
          "size": 7347,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.lock",
          "offset": 10752,
          "size": 11506,
          "uid": null,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.toml",
          "offset": 23040,
          "size": 2792,
          "uid": null,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.toml.orig",
          "offset": 26624,
          "size": 2334,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/LICENSE-APACHE",
          "offset": 29696,
          "size": 10847,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/LICENSE-MIT",
          "offset": 41472,
          "size": 1069,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/README.md",
          "offset": 43520,
          "size": 2550,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/bench.plot.r",
          "offset": 46592,
          "size": 1000,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/benchmark.sh",
          "offset": 48128,
          "size": 3084,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/coverage.sh",
          "offset": 52224,
          "size": 177,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/examples/addr2line.rs",
          "offset": 53248,
          "size": 9447,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/rustfmt.toml",
          "offset": 63488,
          "size": 1,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/src/function.rs",
          "offset": 64512,
          "size": 19078,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/src/lazy.rs",
          "offset": 84480,
          "size": 919,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/src/lib.rs",
          "offset": 86016,
          "size": 41209,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/tests/correctness.rs",
          "offset": 128000,
          "size": 2756,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/tests/output_equivalence.rs",
          "offset": 131584,
          "size": 3905,
          "uid": 0,
        },
        Object {
          "name": "addr2line-0.17.0/tests/parse.rs",
          "offset": 136192,
          "size": 3035,
          "uid": 0,
        },
      ]
    `);
  });

  it('reads a simple UStar archive', function () {
    const archive = makeArchive([
      makeEntry({ name: 'dir', type: '5' }),
      makeEntry({ name: 'file.txt' }, 'hello'),
      makeEntry({ name: 'big.txt' }, 'x'.repeat(1000)),
    ]);
    expect(listEntries(archive)).toEqual([
      { name: 'dir', type: '5', content: null },
      { name: 'file.txt', type: '0', content: 'hello' },
      { name: 'big.txt', type: '0', content: 'x'.repeat(1000) },
    ]);
  });

  it('accepts an archive without the trailing zero blocks', function () {
    const archive = makeArchive([makeEntry({ name: 'a' }, 'a')], {
      trailer: false,
    });
    expect(listEntries(archive)).toEqual([
      { name: 'a', type: '0', content: 'a' },
    ]);
  });

  it('stops at the first zero block', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a' }, 'a'),
      new Uint8Array(512),
      makeEntry({ name: 'b' }, 'b'),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual(['a']);
  });

  it('rejects a header with a bad checksum', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', badChecksum: true }, 'a'),
    ]);
    expect(() => listEntries(archive)).toThrow('checksum');
  });

  it('rejects data that is not a tar archive', function () {
    const archive = encoder.encode('not a tar file'.repeat(100)).buffer;
    expect(() => listEntries(archive)).toThrow();
  });

  it('rejects malformed numeric fields', function () {
    for (const size of [
      '-0000000001\0',
      '00000000012x',
      '\x80' + '\0'.repeat(11),
    ]) {
      const archive = makeArchive([
        makeEntry({ name: 'a', patches: [{ offset: 124, bytes: size }] }),
      ]);
      expect(() => listEntries(archive)).toThrow('Invalid numeric field');
    }
  });

  it('treats an empty numeric field as missing', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', uid: '\0'.repeat(8) }, 'a'),
    ]);
    const stream = new UntarFileStream(archive);
    expect(stream.next().uid).toBe(null);
  });

  it('rejects a truncated archive', function () {
    const archive = makeArchive([makeEntry({ name: 'a' }, 'x'.repeat(600))], {
      trailer: false,
    });
    expect(() => listEntries(archive.slice(0, 1000))).toThrow('Unexpected end');
    expect(() => listEntries(archive.slice(0, 300))).toThrow('Unexpected end');
  });

  it('decodes names as UTF-8', function () {
    const archive = makeArchive([
      makeEntry({ name: 'mycrate-1.0.0/é.rs', prefix: 'prefix-ü' }, 'a'),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual([
      'prefix-ü/mycrate-1.0.0/é.rs',
    ]);
  });
});
