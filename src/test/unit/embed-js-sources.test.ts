/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { SourceMapGenerator } from 'source-map';

import {
  attachSourcesFromFuncNames,
  embedJsSources,
} from '../../profile-logic/embed-js-sources';
import type { SourceReader } from '../../profile-logic/embed-js-sources';
import { runSourceMapSymbolicationNode } from '../../profile-query/source-map';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { FrameFlag, FuncFlag } from 'firefox-profiler/types';
import type { Profile } from 'firefox-profiler/types';

describe('embedJsSources', function () {
  const BUNDLE_URL = 'http://127.0.0.1:62763/dist/bundle.js';
  const ORIGINAL_FILENAME = '../src/hello.js';
  const ORIGINAL_SOURCE =
    'function greet(name) {\n  return "Hello, " + name;\n}\n';
  const BUNDLE_SOURCE = 'function a(b){return"Hello, "+b}';

  function buildSourceMap(): string {
    const gen = new SourceMapGenerator({ file: 'bundle.js' });
    gen.setSourceContent(ORIGINAL_FILENAME, ORIGINAL_SOURCE);
    gen.addMapping({
      source: ORIGINAL_FILENAME,
      original: { line: 1, column: 9 },
      generated: { line: 1, column: 9 },
      name: 'greet',
    });
    gen.addMapping({
      source: ORIGINAL_FILENAME,
      original: { line: 2, column: 2 },
      generated: { line: 1, column: 14 },
    });
    return gen.toString();
  }

  // A profile with a single JS function that's located in the bundle.
  function makeProfile(
    url: string,
    {
      sourceMapURL = null,
      startLine = 1,
    }: { sourceMapURL?: string | null; startLine?: number } = {}
  ): Profile {
    const { profile } = getProfileFromTextSamples(`Ajs[file:${url}]`);
    const { funcTable, frameTable, sources, stringArray } = profile.shared;
    funcTable.lineNumber[0] = 1;
    funcTable.columnNumber[0] = 10;
    funcTable.flags[0] |= FuncFlag.HasLine | FuncFlag.HasColumn;
    frameTable.line[0] = 1;
    frameTable.column[0] = 15;
    frameTable.flags[0] |= FrameFlag.HasLine | FrameFlag.HasColumn;
    sources.startLine[0] = startLine;
    if (sourceMapURL !== null) {
      sources.sourceMapURL[0] = stringArray.length;
      stringArray.push(sourceMapURL);
    }
    return profile;
  }

  function makeReader(files: { [url: string]: string }): SourceReader {
    return async (url) => files[url] ?? null;
  }

  function getOriginalLocationOfFunc(profile: Profile) {
    const { funcTable, sourceLocationTable, sources, stringArray } =
      profile.shared;
    if ((funcTable.flags[0] & FuncFlag.HasOriginalLocation) === 0) {
      return null;
    }
    const row = funcTable.originalLocation[0];
    const sourceIndex = sourceLocationTable.source[row];
    return {
      name: stringArray[funcTable.name[0]],
      filename: stringArray[sources.filename[sourceIndex]],
      line: sourceLocationTable.line[row],
      content: sources.content[sourceIndex],
    };
  }

  beforeEach(function () {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('embeds sources without a source map', async function () {
    const profile = makeProfile(BUNDLE_URL);
    await embedJsSources(
      profile,
      makeReader({ [BUNDLE_URL]: BUNDLE_SOURCE }),
      runSourceMapSymbolicationNode
    );
    expect(profile.shared.sources.content[0]).toBe(BUNDLE_SOURCE);
    expect(getOriginalLocationOfFunc(profile)).toBe(null);
  });

  it('applies the source map from the sourceMapURL', async function () {
    const profile = makeProfile(BUNDLE_URL, { sourceMapURL: 'maps/b.map' });
    await embedJsSources(
      profile,
      makeReader({
        [BUNDLE_URL]: BUNDLE_SOURCE,
        'http://127.0.0.1:62763/dist/maps/b.map': buildSourceMap(),
      }),
      runSourceMapSymbolicationNode
    );
    expect(profile.shared.sources.content[0]).toBe(BUNDLE_SOURCE);
    expect(getOriginalLocationOfFunc(profile)).toEqual({
      name: 'greet',
      filename: ORIGINAL_FILENAME,
      line: 1,
      content: ORIGINAL_SOURCE,
    });
  });

  it('applies an inline source map', async function () {
    const dataUrl =
      'data:application/json;base64,' +
      Buffer.from(buildSourceMap()).toString('base64');
    const profile = makeProfile(BUNDLE_URL, { sourceMapURL: dataUrl });
    await embedJsSources(
      profile,
      makeReader({ [BUNDLE_URL]: BUNDLE_SOURCE }),
      runSourceMapSymbolicationNode
    );
    expect(getOriginalLocationOfFunc(profile)).toMatchObject({
      name: 'greet',
      content: ORIGINAL_SOURCE,
    });
  });

  it('applies an index source map', async function () {
    // The bundle is a concatenation of two chunks, and the function is in the
    // second one, on the bundle's second line.
    const firstChunk = 'var c=1;';
    const firstChunkMap = new SourceMapGenerator({ file: 'first.js' });
    firstChunkMap.addMapping({
      source: '../src/first.js',
      original: { line: 1, column: 0 },
      generated: { line: 1, column: 0 },
    });
    const indexMap = JSON.stringify({
      version: 3,
      file: 'bundle.js',
      sections: [
        { offset: { line: 0, column: 0 }, map: firstChunkMap.toJSON() },
        { offset: { line: 1, column: 0 }, map: JSON.parse(buildSourceMap()) },
      ],
    });
    const profile = makeProfile(BUNDLE_URL, { sourceMapURL: 'bundle.js.map' });
    profile.shared.funcTable.lineNumber[0] = 2;
    profile.shared.frameTable.line[0] = 2;
    await embedJsSources(
      profile,
      makeReader({
        [BUNDLE_URL]: firstChunk + '\n' + BUNDLE_SOURCE,
        [BUNDLE_URL + '.map']: indexMap,
      }),
      runSourceMapSymbolicationNode
    );
    expect(getOriginalLocationOfFunc(profile)).toEqual({
      name: 'greet',
      filename: ORIGINAL_FILENAME,
      line: 1,
      content: ORIGINAL_SOURCE,
    });
  });

  it('falls back to the sourceMappingURL comment', async function () {
    const profile = makeProfile(BUNDLE_URL);
    const bundleWithComment =
      BUNDLE_SOURCE + '\n//# sourceMappingURL=bundle.js.map\n';
    await embedJsSources(
      profile,
      makeReader({
        [BUNDLE_URL]: bundleWithComment,
        [BUNDLE_URL + '.map']: buildSourceMap(),
      }),
      runSourceMapSymbolicationNode
    );
    const { sources, stringArray } = profile.shared;
    const sourceMapURLIndex = sources.sourceMapURL[0];
    expect(
      sourceMapURLIndex === null ? null : stringArray[sourceMapURLIndex]
    ).toBe('bundle.js.map');
    expect(getOriginalLocationOfFunc(profile)).toMatchObject({
      name: 'greet',
      content: ORIGINAL_SOURCE,
    });
  });

  it('skips inline scripts', async function () {
    const htmlUrl = 'http://127.0.0.1:62763/index.html';
    const profile = makeProfile(htmlUrl, { startLine: 5 });
    await embedJsSources(
      profile,
      makeReader({ [htmlUrl]: '<html><script>a()</script></html>' }),
      runSourceMapSymbolicationNode
    );
    expect(profile.shared.sources.content[0]).toBe(null);
  });

  it('finds the sources of JS funcs in their names', async function () {
    const { profile } = getProfileFromTextSamples('Ajs');
    const { funcTable, stringArray } = profile.shared;
    funcTable.flags[0] &= ~FuncFlag.HasSource;
    stringArray[funcTable.name[0]] = `a (${BUNDLE_URL}:1:10)`;
    attachSourcesFromFuncNames(profile);
    await embedJsSources(
      profile,
      makeReader({ [BUNDLE_URL]: BUNDLE_SOURCE }),
      runSourceMapSymbolicationNode
    );
    const { sources } = profile.shared;
    const newFuncTable = profile.shared.funcTable;
    expect(newFuncTable.flags[0] & FuncFlag.HasSource).toBeTruthy();
    expect(profile.shared.stringArray[newFuncTable.name[0]]).toBe('a');
    expect(newFuncTable.lineNumber[0]).toBe(1);
    expect(newFuncTable.columnNumber[0]).toBe(10);
    const sourceIndex = newFuncTable.source[0];
    expect(profile.shared.stringArray[sources.filename[sourceIndex]]).toBe(
      BUNDLE_URL
    );
    expect(sources.content[sourceIndex]).toBe(BUNDLE_SOURCE);
  });

  it('uses one source for the funcs with the same URL', function () {
    const { profile } = getProfileFromTextSamples(`
      Ajs
      Bjs
    `);
    const { funcTable, stringArray } = profile.shared;
    funcTable.flags[0] &= ~FuncFlag.HasSource;
    funcTable.flags[1] &= ~FuncFlag.HasSource;
    stringArray[funcTable.name[0]] = `a (${BUNDLE_URL}:1:10)`;
    stringArray[funcTable.name[1]] = `b (${BUNDLE_URL}:1:20)`;
    attachSourcesFromFuncNames(profile);
    const newFuncTable = profile.shared.funcTable;
    expect(newFuncTable.flags[1] & FuncFlag.HasSource).toBeTruthy();
    expect(newFuncTable.source[1]).toBe(newFuncTable.source[0]);
  });

  it('names the functions without a name after their file', function () {
    const { profile } = getProfileFromTextSamples('Ajs');
    const { funcTable, stringArray } = profile.shared;
    funcTable.flags[0] &= ~FuncFlag.HasSource;
    stringArray[funcTable.name[0]] = `* (${BUNDLE_URL}:1:1)`;
    attachSourcesFromFuncNames(profile);
    const newFuncTable = profile.shared.funcTable;
    expect(profile.shared.stringArray[newFuncTable.name[0]]).toBe(
      `(root scope) ${BUNDLE_URL}`
    );
  });

  it('leaves the JS funcs that already have a source alone', function () {
    const { profile } = getProfileFromTextSamples(`Ajs[file:${BUNDLE_URL}]`);
    const { funcTable, stringArray } = profile.shared;
    const name = 'a (http://127.0.0.1:62763/other.js:1:10)';
    stringArray[funcTable.name[0]] = name;
    const sourceIndex = funcTable.source[0];
    attachSourcesFromFuncNames(profile);
    const newFuncTable = profile.shared.funcTable;
    expect(profile.shared.stringArray[newFuncTable.name[0]]).toBe(name);
    expect(newFuncTable.source[0]).toBe(sourceIndex);
  });

  it('ignores the names of non-JS funcs', function () {
    const { profile } = getProfileFromTextSamples('A');
    const { funcTable, stringArray } = profile.shared;
    stringArray[funcTable.name[0]] = `Interpreter: a (${BUNDLE_URL}:1:10)`;
    attachSourcesFromFuncNames(profile);
    expect(profile.shared.funcTable.flags[0] & FuncFlag.HasSource).toBe(0);
    expect(profile.shared.sources.length).toBe(0);
  });
});
