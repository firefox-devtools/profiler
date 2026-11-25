/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests for the original positions and names of functions whose position in
// the compiled code has no mapping of its own.

import { SourceMapGenerator } from 'source-map';

import { symbolicateWithSourceMaps } from '../../profile-logic/source-maps/symbolication';
import { SourceMapStore } from '../../profile-logic/source-maps/store';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { FuncFlag } from 'firefox-profiler/types';

type Mapping = {
  // 0-based column in the compiled code, which has a single line.
  generatedColumn: number;
  source: string;
  // 1-based line and 0-based column in the original source.
  line: number;
  column: number;
  name?: string;
};

/**
 * Symbolicates a single function at `funcColumn` (0-based) in `compiled`,
 * and returns its resolution.
 */
async function symbolicateFunction(
  compiled: string,
  funcColumn: number,
  originalSources: Record<string, string>,
  mappings: Mapping[]
) {
  const generator = new SourceMapGenerator({ file: 'bundle.js' });
  for (const [source, content] of Object.entries(originalSources)) {
    generator.setSourceContent(source, content);
  }
  for (const mapping of mappings) {
    generator.addMapping({
      source: mapping.source,
      original: { line: mapping.line, column: mapping.column },
      generated: { line: 1, column: mapping.generatedColumn },
      name: mapping.name,
    });
  }

  const { profile } = getProfileFromTextSamples('Ajs[file:bundle.js]');
  const { funcTable, sources, stringArray } = profile.shared;
  sources.sourceMapURL[funcTable.source[0]] = stringArray.length;
  stringArray.push('bundle.js.map');
  funcTable.lineNumber[0] = 1;
  funcTable.columnNumber[0] = funcColumn + 1;
  funcTable.flags[0] |= FuncFlag.HasLine | FuncFlag.HasColumn;

  const store = await SourceMapStore.create(
    new Map([[funcTable.source[0], JSON.parse(generator.toString())]]),
    'ignored-in-node'
  );
  try {
    const response = symbolicateWithSourceMaps(
      profile.shared,
      store,
      new Map([[funcTable.source[0], compiled]])
    );
    const result = response?.funcResults.get(0);
    if (response === null || result === undefined) {
      return null;
    }
    const { originalSourceIndex, ...rest } = result;
    return {
      ...rest,
      originalSource: response.originalSources[originalSourceIndex].url,
    };
  } finally {
    store.destroy();
  }
}

describe('the original position of a function', function () {
  it("uses the function's first mapping if the mapping before it is outside of the function", async function () {
    const original = [
      'const one = 1;',
      'const getValue = () => {',
      '  return one;',
      '};',
    ].join('\n');
    // There's no mapping at the arrow function. The mapping before it is
    // for `getValue`, which is outside of the arrow function.
    const compiled = 'var o=1,g=()=>{return o};';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('()'),
      { 'value.js': original },
      [
        { generatedColumn: 0, source: 'value.js', line: 1, column: 0 },
        { generatedColumn: 8, source: 'value.js', line: 2, column: 6 },
        { generatedColumn: 15, source: 'value.js', line: 3, column: 2 },
      ]
    );
    expect(result).toEqual({
      originalSource: 'value.js',
      // The 1-based position of `return`.
      originalLine: 3,
      originalColumn: 3,
      name: 'getValue',
    });
  });

  it('keeps the mapping before the function if it is inside of the original function', async function () {
    const original = 'function outer() {\n  return 1;\n}';
    const compiled = 'function o(){return 1}';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('o('),
      { 'outer.js': original },
      [
        { generatedColumn: 0, source: 'outer.js', line: 1, column: 0 },
        { generatedColumn: 13, source: 'outer.js', line: 2, column: 2 },
      ]
    );
    expect(result).toEqual({
      originalSource: 'outer.js',
      originalLine: 1,
      originalColumn: 1,
      name: 'outer',
    });
  });

  it('uses the first mapping if the mapping before the function is in a different file', async function () {
    // For example, Vue's render function has no mapping, and the code before
    // it is from a different module.
    const compiled = 'var a=1;var f=()=>{return b};';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('()'),
      {
        'a.js': 'export const a = 1;',
        'b.js': 'export const f = () => {\n  return b;\n};',
      },
      [
        { generatedColumn: 0, source: 'a.js', line: 1, column: 7 },
        { generatedColumn: 19, source: 'b.js', line: 2, column: 2 },
        { generatedColumn: 26, source: 'b.js', line: 2, column: 9 },
      ]
    );
    expect(result).toEqual({
      originalSource: 'b.js',
      originalLine: 2,
      originalColumn: 3,
      name: 'f',
    });
  });

  it('keeps the mapping before the function if most of the function is in its file', async function () {
    // The first mapping is in a library function that the bundler inlined,
    // as Svelte's compiler does with its runtime helpers.
    const compiled = 'x;function m(){h();y();z();w()}';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('m('),
      {
        'item.js': 'x;\nfunction m() {\n  y();\n  z();\n  w();\n}',
        'lib.js': 'export function h() {}',
      },
      [
        { generatedColumn: 0, source: 'item.js', line: 1, column: 0 },
        { generatedColumn: 15, source: 'lib.js', line: 1, column: 0 },
        { generatedColumn: 19, source: 'item.js', line: 3, column: 2 },
        { generatedColumn: 23, source: 'item.js', line: 4, column: 2 },
        { generatedColumn: 27, source: 'item.js', line: 5, column: 2 },
      ]
    );
    expect(result).toMatchObject({ originalSource: 'item.js' });
  });

  it("doesn't use a first mapping in a nested function", async function () {
    const original = 'const a = 1;\nconst f = () => () => a;';
    // The only mapping in the outer arrow function is in the inner one.
    const compiled = 'var a=1,f=()=>()=>a;';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('()'),
      { 'f.js': original },
      [
        { generatedColumn: 0, source: 'f.js', line: 1, column: 0 },
        { generatedColumn: 18, source: 'f.js', line: 2, column: 22 },
      ]
    );
    expect(result).toMatchObject({ originalLine: 1, originalColumn: 1 });
  });
});

describe('the name of a function', function () {
  it('uses the names of the enclosing functions in the original source', async function () {
    const original = [
      'function outer() {',
      '  return [1].map((x) => x);',
      '}',
    ].join('\n');
    // The source map has no names, so the compiled source only knows `a`.
    const compiled = 'function a(){return[1].map(b=>b)}';
    const result = await symbolicateFunction(
      compiled,
      compiled.indexOf('b=>'),
      { 'outer.js': original },
      [
        { generatedColumn: 0, source: 'outer.js', line: 1, column: 0 },
        { generatedColumn: 13, source: 'outer.js', line: 2, column: 2 },
        { generatedColumn: 27, source: 'outer.js', line: 2, column: 17 },
      ]
    );
    expect(result).toMatchObject({ name: 'outer/<' });
  });
});
