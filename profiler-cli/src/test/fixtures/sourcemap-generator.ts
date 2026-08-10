/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Generator for the static `sourcemap` integration fixtures.
 *
 * The integration tests spawn the real CLI binary in a Node environment that
 * can't import the DOM-coupled profile builders, so the fixtures are
 * pre-generated into `sourcemap/` and committed. Regenerate them by running
 * the browser-env test `profiler-cli/src/test/unit/sourcemap-fixtures.test.ts`,
 * which calls `generateSourcemapFixtures` below.
 *
 * The setup mirrors src/test/store/source-map-symbolication.test.ts: a minified
 * bundle plus a source map that de-minifies `a` -> `greet`, and a profile whose
 * JS funcs / frames sit at the bundle positions the map covers.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { SourceMapGenerator } from 'source-map';

import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { serializeProfileToJsonString } from 'firefox-profiler/profile-logic/process-profile';

import type { Profile } from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';

const ORIGINAL_SOURCE = `function greet(name) {
  return "Hello, " + name;
}
`;

// The mappings below address positions in the minified single-line bundle
// `function a(b){return"Hello, "+b}` (`greet` -> `a`, `name` -> `b`).

const ORIGINAL_FILENAME = 'hello.js';

/** Build a source map for BUNDLE_SOURCE that resolves `a` back to `greet`. */
function buildSourceMap(bundleFilename: string): RawSourceMap {
  const gen = new SourceMapGenerator({ file: bundleFilename });
  gen.setSourceContent(ORIGINAL_FILENAME, ORIGINAL_SOURCE);
  gen.addMapping({
    source: ORIGINAL_FILENAME,
    original: { line: 1, column: 0 },
    generated: { line: 1, column: 0 },
    name: 'greet',
  });
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
  return JSON.parse(gen.toString()) as RawSourceMap;
}

type SourceDescriptor = {
  filename: string;
  sourceMapURL: string | null;
};

/**
 * Build a profile with one JS func per source descriptor, each positioned in
 * BUNDLE_SOURCE so applying buildSourceMap renames its func to `greet`.
 */
function makeProfileWithJsSources(sources: SourceDescriptor[]): Profile {
  const textSamples = sources.map((s) => `Ajs[file:${s.filename}]`);
  const { profile } = getProfileFromTextSamples(...textSamples);
  // Skip native symbolication — we only exercise JS source map symbolication.
  profile.meta.symbolicated = true;

  const {
    funcTable,
    frameTable,
    sources: sourceTable,
    stringArray,
  } = profile.shared;

  for (const desc of sources) {
    const filenameStrIdx = stringArray.indexOf(desc.filename);
    const sourceIndex = sourceTable.filename.findIndex(
      (f) => f === filenameStrIdx
    );
    if (sourceIndex === -1) {
      throw new Error(`No source row for ${desc.filename}`);
    }
    if (desc.sourceMapURL !== null) {
      const urlIdx = stringArray.length;
      stringArray.push(desc.sourceMapURL);
      sourceTable.sourceMapURL[sourceIndex] = urlIdx;
    } else {
      sourceTable.sourceMapURL[sourceIndex] = null;
    }
  }

  for (let i = 0; i < sources.length; i++) {
    funcTable.lineNumber[i] = 1;
    funcTable.columnNumber[i] = 10;
    frameTable.line[i] = 1;
    frameTable.column[i] = 15;
  }

  return profile;
}

/**
 * Write every static fixture into `outDir` (the committed `sourcemap/`
 * directory). See file header for how to run this.
 */
export function generateSourcemapFixtures(outDir: string): void {
  writeFileSync(
    join(outDir, 'single.json'),
    serializeProfileToJsonString(
      makeProfileWithJsSources([
        {
          filename: 'bundle.js',
          sourceMapURL: 'https://example.com/bundle.js.map',
        },
      ])
    ),
    'utf8'
  );

  writeFileSync(
    join(outDir, 'two.json'),
    serializeProfileToJsonString(
      makeProfileWithJsSources([
        {
          filename: 'bundle-a.js',
          sourceMapURL: 'https://example.com/bundle-a.js.map',
        },
        {
          filename: 'bundle-b.js',
          sourceMapURL: 'https://example.com/bundle-b.js.map',
        },
      ])
    ),
    'utf8'
  );

  writeFileSync(
    join(outDir, 'no-map.json'),
    serializeProfileToJsonString(
      makeProfileWithJsSources([{ filename: 'plain.js', sourceMapURL: null }])
    ),
    'utf8'
  );

  // Matches the single-source bundle by basename.
  writeFileSync(
    join(outDir, 'bundle.js.map'),
    JSON.stringify(buildSourceMap('bundle.js')),
    'utf8'
  );

  // Matches neither eligible source in two.json, forcing the ambiguous path.
  writeFileSync(
    join(outDir, 'mystery.map'),
    JSON.stringify(buildSourceMap('mystery.js')),
    'utf8'
  );

  // Valid JSON that isn't a source map.
  writeFileSync(
    join(outDir, 'garbage.map'),
    JSON.stringify({ thisIsNot: 'a source map' }),
    'utf8'
  );
}
