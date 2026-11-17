/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UntarFileStream } from 'firefox-profiler/utils/untar';

type HeaderSpec = {
  name: string;
  type?: string;
  // 'ustar' is POSIX UStar / pax, 'gnu' is the old GNU format used by cargo,
  // 'v7' has no magic.
  format?: 'ustar' | 'gnu' | 'v7';
  prefix?: string;
  uid?: string;
  // Overrides the size field, which defaults to the content length.
  size?: number;
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
  } else if (spec.format !== 'v7') {
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
  entry.set(makeHeader(spec, spec.size ?? data.length), 0);
  entry.set(data, 512);
  return entry;
}

function concatBytes(
  parts: Array<string | Uint8Array>
): Uint8Array<ArrayBuffer> {
  const arrays = parts.map(toBytes);
  const result = new Uint8Array(arrays.reduce((a, b) => a + b.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

// Build the payload of a pax header from [keyword, value] pairs.
function paxRecords(records: Array<[string, string | Uint8Array]>): Uint8Array {
  return concatBytes(
    records.map(([keyword, value]) => {
      const rest = concatBytes([' ' + keyword + '=', value, '\n']);
      // The length prefix counts its own digits.
      let length = rest.length + String(rest.length).length;
      length = rest.length + String(length).length;
      return concatBytes([String(length), rest]);
    })
  );
}

function makeArchive(
  entries: Uint8Array[],
  { trailer = true }: { trailer?: boolean } = {}
): ArrayBuffer {
  if (trailer) {
    entries = [...entries, new Uint8Array(1024)];
  }
  return concatBytes(entries).buffer;
}

function listEntries(archive: ArrayBuffer) {
  const decoder = new TextDecoder();
  const stream = new UntarFileStream(archive);
  const result = [];
  for (let entry = stream.next(); entry !== null; entry = stream.next()) {
    const { name, type, buffer } = entry;
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

    for (let entry = stream.next(); entry !== null; entry = stream.next()) {
      const { name, buffer, size } = entry;
      fileEntries.push({
        name,
        size,
        offset: buffer ? buffer.byteOffset : null,
      });
    }

    expect(fileEntries).toMatchInlineSnapshot(`
      Array [
        Object {
          "name": "addr2line-0.17.0/.cargo_vcs_info.json",
          "offset": 512,
          "size": 74,
        },
        Object {
          "name": "addr2line-0.17.0/.gitignore",
          "offset": 1536,
          "size": 33,
        },
        Object {
          "name": "addr2line-0.17.0/CHANGELOG.md",
          "offset": 2560,
          "size": 7347,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.lock",
          "offset": 10752,
          "size": 11506,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.toml",
          "offset": 23040,
          "size": 2792,
        },
        Object {
          "name": "addr2line-0.17.0/Cargo.toml.orig",
          "offset": 26624,
          "size": 2334,
        },
        Object {
          "name": "addr2line-0.17.0/LICENSE-APACHE",
          "offset": 29696,
          "size": 10847,
        },
        Object {
          "name": "addr2line-0.17.0/LICENSE-MIT",
          "offset": 41472,
          "size": 1069,
        },
        Object {
          "name": "addr2line-0.17.0/README.md",
          "offset": 43520,
          "size": 2550,
        },
        Object {
          "name": "addr2line-0.17.0/bench.plot.r",
          "offset": 46592,
          "size": 1000,
        },
        Object {
          "name": "addr2line-0.17.0/benchmark.sh",
          "offset": 48128,
          "size": 3084,
        },
        Object {
          "name": "addr2line-0.17.0/coverage.sh",
          "offset": 52224,
          "size": 177,
        },
        Object {
          "name": "addr2line-0.17.0/examples/addr2line.rs",
          "offset": 53248,
          "size": 9447,
        },
        Object {
          "name": "addr2line-0.17.0/rustfmt.toml",
          "offset": 63488,
          "size": 1,
        },
        Object {
          "name": "addr2line-0.17.0/src/function.rs",
          "offset": 64512,
          "size": 19078,
        },
        Object {
          "name": "addr2line-0.17.0/src/lazy.rs",
          "offset": 84480,
          "size": 919,
        },
        Object {
          "name": "addr2line-0.17.0/src/lib.rs",
          "offset": 86016,
          "size": 41209,
        },
        Object {
          "name": "addr2line-0.17.0/tests/correctness.rs",
          "offset": 128000,
          "size": 2756,
        },
        Object {
          "name": "addr2line-0.17.0/tests/output_equivalence.rs",
          "offset": 131584,
          "size": 3905,
        },
        Object {
          "name": "addr2line-0.17.0/tests/parse.rs",
          "offset": 136192,
          "size": 3035,
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

  it('accepts an empty optional numeric field', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', uid: '\0'.repeat(8) }, 'a'),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual(['a']);
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

  it('applies pax path and linkpath records', function () {
    const longName = 'dir/'.repeat(40) + 'é\nfile.rs';
    const archive = makeArchive([
      makeEntry(
        { name: 'PaxHeaders/x', type: 'x' },
        paxRecords([
          ['path', longName],
          ['linkpath', 'target'],
        ])
      ),
      makeEntry({ name: 'truncated', prefix: 'ignored', type: '2' }),
      makeEntry({ name: 'next' }, 'n'),
    ]);
    const stream = new UntarFileStream(archive);
    expect(stream.next()).toMatchObject({
      name: longName,
      linkname: 'target',
    });
    // The pax header only applies to one member.
    expect(stream.next()).toMatchObject({ name: 'next', linkname: '' });
  });

  it('keeps all-digit pax paths as strings', function () {
    const archive = makeArchive([
      makeEntry({ name: 'x', type: 'x' }, paxRecords([['path', '1234']])),
      makeEntry({ name: 'a' }, 'a'),
    ]);
    expect(listEntries(archive)[0].name).toBe('1234');
  });

  it('uses the pax size for framing', function () {
    const archive = makeArchive([
      makeEntry({ name: 'x', type: 'x' }, paxRecords([['size', '600']])),
      makeEntry({ name: 'a', size: 0 }, 'a'.repeat(600)),
      makeEntry({ name: 'b' }, 'b'),
    ]);
    expect(listEntries(archive)).toEqual([
      { name: 'a', type: '0', content: 'a'.repeat(600) },
      { name: 'b', type: '0', content: 'b' },
    ]);
  });

  it('ignores unknown pax records', function () {
    const archive = makeArchive([
      makeEntry(
        { name: 'x', type: 'x' },
        paxRecords([
          ['buffer', '1'],
          ['type', '5'],
          ['SCHILY.xattr.user.foo', new Uint8Array([0xff, 0x00, 0x0a])],
          ['mtime', '1234.5'],
        ])
      ),
      makeEntry({ name: 'a' }, 'a'),
    ]);
    expect(listEntries(archive)).toEqual([
      { name: 'a', type: '0', content: 'a' },
    ]);
  });

  it('ignores global pax headers without recognized records', function () {
    const archive = makeArchive([
      makeEntry({ name: 'g', type: 'g' }, paxRecords([['comment', 'hi']])),
      makeEntry({ name: 'a' }, 'a'),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual(['a']);
  });

  it('rejects invalid pax header sequences', function () {
    const a = makeEntry({ name: 'a' }, 'a');
    const x = (records: Array<[string, string]>) =>
      makeEntry({ name: 'x', type: 'x' }, paxRecords(records));
    const g = (records: Array<[string, string]>) =>
      makeEntry({ name: 'g', type: 'g' }, paxRecords(records));
    const cases: Array<[Uint8Array[], string]> = [
      [[x([['path', 'b']]), x([['path', 'c']]), a], 'Multiple pax headers'],
      [[x([['path', '']]), a], 'empty name'],
      [[x([['size', '']]), a], 'Invalid pax size'],
      [[x([['size', '-1']]), a], 'Invalid pax size'],
      [[x([['size', '1e3']]), a], 'Invalid pax size'],
      [[g([['size', '1']]), a], 'global pax header'],
      [[g([['path', 'b']]), a], 'global pax header'],
      [[x([['path', 'b']])], 'end of the tar archive'],
      [
        [
          x([
            ['path', 'b'],
            ['path', 'c'],
          ]),
          a,
        ],
        'Duplicate pax record',
      ],
      [[makeEntry({ name: 'x', type: 'x' }, '99 path=a\n'), a], 'pax'],
      [[makeEntry({ name: 'x', type: 'x' }, '3 path=a\n'), a], 'pax'],
      [[makeEntry({ name: 'x', type: 'x' }, '07 a=b\n'), a], 'pax'],
      [[makeEntry({ name: 'x', type: 'x' }, '5 =b\n'), a], 'pax'],
    ];
    for (const [entries, message] of cases) {
      expect(() => listEntries(makeArchive(entries))).toThrow(message);
    }
  });

  it('does not read a name prefix from GNU headers', function () {
    // In GNU headers, the UStar prefix bytes contain atime and ctime.
    const archive = makeArchive([
      makeEntry(
        {
          name: 'crate/a.rs',
          format: 'gnu',
          patches: [{ offset: 345, bytes: '14751573214\x0014751573214\x00' }],
        },
        'a'
      ),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual(['crate/a.rs']);
  });

  it('reads v7 archives', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', format: 'v7', prefix: 'ignored' }, 'a'),
    ]);
    expect(listEntries(archive).map((e) => e.name)).toEqual(['a']);
  });

  it('rejects unknown header formats', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', patches: [{ offset: 263, bytes: '01' }] }, 'a'),
    ]);
    expect(() => listEntries(archive)).toThrow('Unknown tar header format');
  });

  it('rejects mixed header formats', function () {
    const archive = makeArchive([
      makeEntry({ name: 'a', format: 'gnu' }, 'a'),
      makeEntry({ name: 'b', format: 'ustar' }, 'b'),
    ]);
    expect(() => listEntries(archive)).toThrow('Mixed header formats');
  });

  it('rejects pax headers in GNU archives', function () {
    const archive = makeArchive([
      makeEntry(
        { name: 'x', type: 'x', format: 'gnu' },
        paxRecords([['path', 'b']])
      ),
      makeEntry({ name: 'a', format: 'gnu' }, 'a'),
    ]);
    expect(() => listEntries(archive)).toThrow('Pax header in a gnu');
  });

  // These fixtures were generated with Python's tarfile module, as an
  // independent implementation. The GNU one matches the output of cargo.
  // Each contains a member with a long name, a member with a non-ASCII name,
  // a symlink with a long target, and a member with a short name.
  for (const format of ['gnu', 'pax']) {
    it(`reads a ${format} archive generated by Python`, function () {
      const fs = require('fs');
      const zlib = require('zlib');
      const buffer = zlib.gunzipSync(
        fs.readFileSync(`src/test/fixtures/synthetic-${format}.tar.gz`)
      );
      const longName =
        'mycrate-1.0.0/src/' + 'a_very_long_directory_name/'.repeat(4);
      const stream = new UntarFileStream(buffer.buffer);
      const entries = [];
      for (let entry = stream.next(); entry !== null; entry = stream.next()) {
        const { name, type, buffer, linkname } = entry;
        entries.push({
          name,
          type,
          linkname,
          content: buffer === null ? null : new TextDecoder().decode(buffer),
        });
      }
      expect(entries).toEqual([
        {
          name: longName + 'file.rs',
          type: '0',
          linkname: '',
          content: 'long name',
        },
        {
          name: 'mycrate-1.0.0/é.rs',
          type: '0',
          linkname: '',
          content: 'non-ascii',
        },
        {
          name: 'mycrate-1.0.0/link',
          type: '2',
          linkname: longName + 'file.rs',
          content: null,
        },
        {
          name: 'mycrate-1.0.0/short.rs',
          type: '0',
          linkname: '',
          content: 'short',
        },
      ]);
    });
  }

  it('rejects invalid GNU long name sequences', function () {
    const a = makeEntry({ name: 'a', format: 'gnu' }, 'a');
    const longEntry = (type: string, format: 'gnu' | 'ustar' = 'gnu') =>
      makeEntry({ name: '././@LongLink', type, format }, 'b\0');
    const cases: Array<[Uint8Array[], string]> = [
      [[longEntry('L'), longEntry('L'), a], 'Multiple GNU long names'],
      [[longEntry('K'), longEntry('K'), a], 'Multiple GNU long link names'],
      [[longEntry('L')], 'end of the tar archive'],
      [
        [
          longEntry('L'),
          makeEntry(
            { name: 'x', type: 'x', format: 'gnu' },
            paxRecords([['path', 'c']])
          ),
          a,
        ],
        'Pax header in a gnu',
      ],
      [
        [longEntry('L', 'ustar'), makeEntry({ name: 'a' }, 'a')],
        'GNU long name header in a ustar',
      ],
      [
        [makeEntry({ name: '././@LongLink', type: 'L', format: 'gnu' }), a],
        'empty name',
      ],
    ];
    for (const [entries, message] of cases) {
      expect(() => listEntries(makeArchive(entries))).toThrow(message);
    }
  });
});
