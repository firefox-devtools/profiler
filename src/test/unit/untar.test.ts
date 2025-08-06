/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UntarFileStream } from 'firefox-profiler/utils/untar';

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
});
