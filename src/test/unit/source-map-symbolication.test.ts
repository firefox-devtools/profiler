/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { symbolicateWithSourceMaps } from '../../profile-logic/source-maps/symbolication';
import { SourceMapStore } from '../../profile-logic/source-maps/store';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { FuncFlag } from 'firefox-profiler/types';

import type { RawSourceMap } from 'source-map';

// Generated with `esbuild input.ts --minify --sourcemap --format=esm` from:
//
//   export function main() {
//     class SlowThingy {
//       constructor(n: number) {
//         console.log(n);
//       }
//     }
//     const Anon = class {
//       constructor(n: number) {
//         console.log(n);
//       }
//     };
//     return [new SlowThingy(1), new Anon(2)];
//   }
const CLASSES_BUNDLE =
  'function s(){class o{constructor(r){console.log(r)}}const c=class{constructor(n){console.log(n)}};return[new o(1),new c(2)]}export{s as main};\n';
const CLASSES_SOURCE_MAP: RawSourceMap = {
  version: 3,
  file: 'out.js',
  sources: ['input.ts'],
  sourcesContent: [
    'export function main() {\n  class SlowThingy {\n    constructor(n: number) {\n      console.log(n);\n    }\n  }\n  const Anon = class {\n    constructor(n: number) {\n      console.log(n);\n    }\n  };\n  return [new SlowThingy(1), new Anon(2)];\n}\n',
  ],
  mappings:
    'AAAO,SAASA,GAAO,CACrB,MAAMC,CAAW,CACf,YAAYC,EAAW,CACrB,QAAQ,IAAIA,CAAC,CACf,CACF,CACA,MAAMC,EAAO,KAAM,CACjB,YAAY,EAAW,CACrB,QAAQ,IAAI,CAAC,CACf,CACF,EACA,MAAO,CAAC,IAAIF,EAAW,CAAC,EAAG,IAAIE,EAAK,CAAC,CAAC,CACxC',
  names: ['main', 'SlowThingy', 'n', 'Anon'],
};

// Generated with terser 5 (`module: true, compress: false`) from the JS
// version of the same source. Unlike esbuild, terser names the mapping at the
// constructor's `(` with `constructor`.
const TERSER_CLASSES_BUNDLE =
  'export function main(){class o{constructor(o){console.log(o)}}const n=class{constructor(o){console.log(o)}};return[new o(1),new n(2)]}';
const TERSER_CLASSES_SOURCE_MAP: RawSourceMap = {
  version: 3,
  file: 'out.js',
  sources: ['input.js'],
  sourcesContent: [
    'export function main() {\n  class SlowThingy {\n    constructor(n) {\n      console.log(n);\n    }\n  }\n  const Anon = class {\n    constructor(n) {\n      console.log(n);\n    }\n  };\n  return [new SlowThingy(1), new Anon(2)];\n}\n',
  ],
  mappings:
    'OAAO,SAASA,OACd,MAAMC,EACJ,WAAAC,CAAYC,GACVC,QAAQC,IAAIF,EACd,EAEF,MAAMG,EAAO,MACX,WAAAJ,CAAYC,GACVC,QAAQC,IAAIF,EACd,GAEF,MAAO,CAAC,IAAIF,EAAW,GAAI,IAAIK,EAAK,GACtC',
  names: ['main', 'SlowThingy', 'constructor', 'n', 'console', 'log', 'Anon'],
};

describe('symbolicateWithSourceMaps', function () {
  beforeEach(function () {
    // The `source-map` library logs a harmless `console.debug` when it
    // initializes under Node.
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  // Symbolicate one JS func per entry of `funcColumns`, each positioned at the
  // given 1-based column on line 1 of the bundle, and return the resolved
  // names. A null `compiledSource` simulates a profile captured without the
  // compiled bundle text.
  async function resolveNames(
    funcColumns: number[],
    sourceMap: RawSourceMap,
    compiledSource: string | null
  ): Promise<Array<string | null | undefined>> {
    const funcNames = funcColumns.map((_, i) => `f${i}js[file:out.js]`);
    const { profile } = getProfileFromTextSamples(funcNames.join('\n'));
    const { funcTable, sources, stringArray } = profile.shared;
    const sourceIndex = 0;
    sources.sourceMapURL[sourceIndex] = stringArray.length;
    stringArray.push('out.js.map');
    funcColumns.forEach((column, funcIndex) => {
      funcTable.lineNumber[funcIndex] = 1;
      funcTable.columnNumber[funcIndex] = column;
      funcTable.flags[funcIndex] |= FuncFlag.HasLine | FuncFlag.HasColumn;
    });

    const store = await SourceMapStore.create(
      new Map([[sourceIndex, sourceMap]]),
      'ignored-in-node'
    );
    try {
      const response = symbolicateWithSourceMaps(
        profile.shared,
        store,
        compiledSource === null
          ? new Map()
          : new Map([[sourceIndex, compiledSource]])
      );
      return funcColumns.map(
        (_, funcIndex) => response?.funcResults.get(funcIndex)?.name
      );
    } finally {
      store.destroy();
    }
  }

  // SpiderMonkey reports a class constructor at its parameter list `(`.
  function constructorColumns(bundle: string): number[] {
    const columns = [];
    for (
      let index = bundle.indexOf('constructor(');
      index !== -1;
      index = bundle.indexOf('constructor(', index + 1)
    ) {
      columns.push(index + 'constructor'.length + 1);
    }
    return columns;
  }

  describe.each([
    ['esbuild', CLASSES_BUNDLE, CLASSES_SOURCE_MAP],
    ['terser', TERSER_CLASSES_BUNDLE, TERSER_CLASSES_SOURCE_MAP],
  ])('with a %s bundle', function (_, bundle, sourceMap) {
    const columns = constructorColumns(bundle);

    it('names class constructors after their class using sourcesContent', async function () {
      expect(await resolveNames(columns, sourceMap, bundle)).toEqual([
        'SlowThingy',
        'Anon',
      ]);
    });

    it('names class constructors after their class without sourcesContent', async function () {
      const { sourcesContent: _, ...sourceMapWithoutContent } = sourceMap;
      expect(
        await resolveNames(columns, sourceMapWithoutContent, bundle)
      ).toEqual(['SlowThingy', 'Anon']);
    });

    it('names class constructors after their class without the compiled source', async function () {
      expect(await resolveNames(columns, sourceMap, null)).toEqual([
        'SlowThingy',
        'Anon',
      ]);
    });
  });
});
