/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import fs from 'fs';

import {
  applyWasmSymbolication,
  parseWasmFunctionNames,
} from '../../profile-logic/wasm-symbolication';
import { getEmptyProfile } from '../../profile-logic/data-structures';
import { StringTable } from '../../utils/string-table';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

const FIXTURE_PATH = 'src/test/fixtures/wasm/named.wasm';

function readFixture(): Uint8Array {
  const buf = fs.readFileSync(FIXTURE_PATH);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe('parseWasmFunctionNames', function () {
  it('extracts function names by index, with imports occupying the low indices', function () {
    const names = parseWasmFunctionNames(readFixture());
    expect(names.get(0)).toBe('log');
    expect(names.get(1)).toBe('add');
    expect(names.get(2)).toBe('sub');
    expect(names.size).toBe(3);
  });

  it('throws on a non-wasm input', function () {
    expect(() =>
      parseWasmFunctionNames(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
    ).toThrow(/bad magic/);
  });
});

// Builds a profile with two funcs whose source is the given wasm URL plus a
// third unrelated JS func, then injects `wasm-function[1]` / `wasm-function[2]`
// placeholders over the first two — mimicking what Firefox produces when it
// loads a stripped wasm bundle. The text-samples helper rejects literal
// `wasm-function[N]` names (`[…]` is reserved for modifiers like `[file:…]`),
// so we let it create the funcs under stand-in names and rename them after.
function buildProfileWithWasmPlaceholders(wasmUrl: string) {
  const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(
    `a.js[file:${wasmUrl}]  b.js[file:${wasmUrl}]  c.js`
  );
  const dict = funcNamesDictPerThread[0];
  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);
  profile.shared.funcTable.name[dict['a.js']] =
    stringTable.indexForString('wasm-function[1]');
  profile.shared.funcTable.name[dict['b.js']] =
    stringTable.indexForString('wasm-function[2]');
  return { profile, dict };
}

describe('applyWasmSymbolication', function () {
  it('rewrites wasm-function[N] names in the funcTable using names from the wasm', function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const wasmUrl = 'http://example.com/named.wasm';
    const { profile, dict } = buildProfileWithWasmPlaceholders(wasmUrl);

    applyWasmSymbolication(profile, [
      { bytes: readFixture(), url: wasmUrl, label: 'named.wasm' },
    ]);

    const { stringArray, funcTable } = profile.shared;
    expect(stringArray[funcTable.name[dict['a.js']]]).toBe('add');
    expect(stringArray[funcTable.name[dict['b.js']]]).toBe('sub');
    // The unrelated non-wasm func is untouched.
    expect(stringArray[funcTable.name[dict['c.js']]]).toBe('c.js');
  });

  it('auto-detects the wasm URL when the profile has exactly one wasm source', function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const { profile, dict } = buildProfileWithWasmPlaceholders(
      'http://example.com/only.wasm'
    );

    applyWasmSymbolication(profile, [{ bytes: readFixture() }]);

    expect(
      profile.shared.stringArray[profile.shared.funcTable.name[dict['a.js']]]
    ).toBe('add');
  });

  it('throws when the URL cannot be resolved', function () {
    const profile = getEmptyProfile();
    expect(() =>
      applyWasmSymbolication(profile, [
        { bytes: readFixture(), url: 'http://nope/x.wasm' },
      ])
    ).toThrow(/no source with URL/);
  });
});
