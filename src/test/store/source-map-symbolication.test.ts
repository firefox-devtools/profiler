/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// End-to-end test for the receive-profile -> JS source map symbolication
// pipeline. Drives `loadProfile` with a mocked BrowserConnection that serves
// a real source map and minified bundle, then asserts on:
//   - what was fetched (filtering by id / sourceMapURL / WebChannel version),
//   - the status reducer transitions,
//   - the post-symbolication profile state,
//   - the source view selector reading the original-source content.
//
// Worker plumbing: the production worker is bundled by esbuild and replaced
// in jest.config.js with a no-op stub. For these tests we override
// global.Worker with an in-process variant that calls
// runSourceMapSymbolicationCore directly, so the real
// doSourceMapSymbolication action runs its full Redux flow
// (START_SOURCE_MAP_SYMBOLICATION -> BULK_SOURCE_MAP_SYMBOLICATION /
// SOURCE_MAP_SYMBOLICATION_FAILED) and the worker internals are exercised.

import { SourceMapGenerator } from 'source-map';

import { runSourceMapSymbolicationCore } from '../../profile-logic/source-map-symbolication';
import { loadProfile } from '../../actions/receive-profile';
import {
  getSourceMapSymbolicationStatus,
  getRawProfileSharedData,
} from '../../selectors/profile';
import { getSourceViewCode } from '../../selectors/code';
import { stateFromLocation } from '../../app-logic/url-handling';
import { updateUrlState } from '../../actions/app';
import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { BrowserConnection } from '../../app-logic/browser-connection';
import type { Profile } from 'firefox-profiler/types';
import type {
  WorkerInput,
  WorkerOutput,
} from '../../profile-logic/source-map-worker-types';
import type { RawSourceMap } from 'source-map';

// Original source file. Indentation and blank lines matter: the mappings
// below address specific (line, column) positions.
const ORIGINAL_SOURCE = `function greet(name) {
  return "Hello, " + name;
}
`;

// Minified single-line bundle. `greet` -> `a`, `name` -> `b`.
const BUNDLE_SOURCE = 'function a(b){return"Hello, "+b}';

const ORIGINAL_FILENAME = 'hello.js';

// Build a source map for BUNDLE_SOURCE referencing ORIGINAL_SOURCE. Includes
// sourcesContent so symbolication can populate sources.content for offline
// source viewing.
function buildSourceMap(bundleFilename: string): RawSourceMap {
  const gen = new SourceMapGenerator({ file: bundleFilename });
  gen.setSourceContent(ORIGINAL_FILENAME, ORIGINAL_SOURCE);
  // bundle 1:0 ('function') -> original 1:0
  gen.addMapping({
    source: ORIGINAL_FILENAME,
    original: { line: 1, column: 0 },
    generated: { line: 1, column: 0 },
    name: 'greet',
  });
  // bundle 1:9 ('a' identifier) -> original 1:9 ('greet' identifier)
  gen.addMapping({
    source: ORIGINAL_FILENAME,
    original: { line: 1, column: 9 },
    generated: { line: 1, column: 9 },
    name: 'greet',
  });
  // bundle 1:14 ('return') -> original 2:2 ('return' inside the body)
  gen.addMapping({
    source: ORIGINAL_FILENAME,
    original: { line: 2, column: 2 },
    generated: { line: 1, column: 14 },
  });
  return JSON.parse(gen.toString());
}

type SourceDescriptor = {
  filename: string;
  id: string | null;
  sourceMapURL: string | null;
};

// Build a profile with one JS func per source descriptor. Each func is
// positioned at bundle (line 1, col 10) — the start of the identifier `a` in
// BUNDLE_SOURCE — and each frame at (line 1, col 15) — the start of the
// `return` keyword. That way every eligible source produces a successful
// symbolication when paired with buildSourceMap.
function makeProfileWithJsSources(sources: SourceDescriptor[]): Profile {
  // One thread per source so each source appears as the funcTable.source of a
  // visible thread's stack.
  const textSamples = sources.map((s) => `Ajs[file:${s.filename}]`);
  const { profile } = getProfileFromTextSamples(...textSamples);
  // Skip native symbolication — we only care about JS source map
  // symbolication here.
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
    sourceTable.id[sourceIndex] = desc.id;
    if (desc.sourceMapURL !== null) {
      const urlIdx = stringArray.length;
      stringArray.push(desc.sourceMapURL);
      sourceTable.sourceMapURL[sourceIndex] = urlIdx;
    } else {
      sourceTable.sourceMapURL[sourceIndex] = null;
    }
  }

  // Position every func + frame inside the bundle. funcs and frames are
  // co-indexed with sources in the order they were added.
  for (let i = 0; i < sources.length; i++) {
    funcTable.lineNumber[i] = 1;
    funcTable.columnNumber[i] = 10;
    frameTable.line[i] = 1;
    frameTable.column[i] = 15;
  }

  return profile;
}

type MockBrowserConnection = BrowserConnection & {
  getSourceMap: jest.Mock;
  getJSSource: jest.Mock;
};

// Build a BrowserConnection that serves the given source map and bundle
// fixtures. WebChannel version 7+ enables source-map fetching in
// finalizeProfileView; v6 disables it.
function makeMockBrowserConnection(opts: {
  supportsSourceMapFetching: boolean;
  sourceMapsById?: Map<string, RawSourceMap>;
  jsSourcesById?: Map<string, string>;
}): MockBrowserConnection {
  const sourceMapsById = opts.sourceMapsById ?? new Map();
  const jsSourcesById = opts.jsSourcesById ?? new Map();
  return {
    supportsGetSourceMap: opts.supportsSourceMapFetching,
    getSourceMap: jest.fn(async (id: string) => {
      const map = sourceMapsById.get(id);
      if (!map) {
        throw new Error(`No source map fixture for "${id}"`);
      }
      return map;
    }),
    getJSSource: jest.fn(async (id: string) => {
      const src = jsSourcesById.get(id);
      if (src === undefined) {
        throw new Error(`No JS source fixture for "${id}"`);
      }
      return src;
    }),
    getProfile: jest.fn(),
    getExternalMarkers: jest.fn(),
    getExternalPowerTracks: jest.fn(),
    querySymbolicationApi: jest.fn(),
    getSymbolTable: jest.fn(),
    getPageFavicons: jest.fn(),
    showFunctionInDevtools: jest.fn(),
  } as unknown as MockBrowserConnection;
}

// In-process replacement for global.Worker that runs the source-map worker
// core directly. See file-top comment for context.
class InProcessSourceMapWorker {
  onmessage: ((event: { data: WorkerOutput }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(input: WorkerInput): void {
    runSourceMapSymbolicationCore(input, 'ignored-in-node').then((output) => {
      if (this.onmessage) {
        this.onmessage({ data: output });
      }
    });
  }

  terminate(): void {}
}

describe('receive-profile -> JS source map symbolication', function () {
  let savedWorker: unknown;

  beforeEach(function () {
    savedWorker = (global as any).Worker;
    (global as any).Worker = InProcessSourceMapWorker;

    // The `source-map` library logs a harmless `console.debug` whenever
    // `SourceMapConsumer.initialize` runs under Node (it reads the wasm via
    // `fs`, making initialization a no-op). Silence console.debug here so it
    // doesn't clutter test output.
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(function () {
    (global as any).Worker = savedWorker;
  });

  describe('fetching and filtering', function () {
    it('fetches source maps and bundle sources for every source with a UUID and sourceMapURL', async function () {
      const profile = makeProfileWithJsSources([
        {
          filename: 'bundle-a.js',
          id: 'uuid-a',
          sourceMapURL: 'https://example.com/bundle-a.js.map',
        },
        {
          filename: 'bundle-b.js',
          id: 'uuid-b',
          sourceMapURL: 'https://example.com/bundle-b.js.map',
        },
      ]);

      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: true,
        sourceMapsById: new Map([
          ['uuid-a', buildSourceMap('bundle-a.js')],
          ['uuid-b', buildSourceMap('bundle-b.js')],
        ]),
        jsSourcesById: new Map([
          ['uuid-a', BUNDLE_SOURCE],
          ['uuid-b', BUNDLE_SOURCE],
        ]),
      });

      const { dispatch, getState } = blankStore();
      await dispatch(loadProfile(profile, { browserConnection }));

      expect(
        browserConnection.getSourceMap.mock.calls.map((c) => c[0])
      ).toEqual(expect.arrayContaining(['uuid-a', 'uuid-b']));
      expect(browserConnection.getJSSource.mock.calls.map((c) => c[0])).toEqual(
        expect.arrayContaining(['uuid-a', 'uuid-b'])
      );

      // Symbolication actually ran: both funcs are now named `greet`.
      const { funcTable, stringArray } = getRawProfileSharedData(getState());
      expect(stringArray[funcTable.name[0]]).toBe('greet');
      expect(stringArray[funcTable.name[1]]).toBe('greet');
    });

    it('does not fetch source maps when the browser lacks source-map support', async function () {
      const profile = makeProfileWithJsSources([
        {
          filename: 'bundle.js',
          id: 'uuid-x',
          sourceMapURL: 'https://example.com/bundle.js.map',
        },
      ]);
      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: false,
      });

      const { dispatch, getState } = blankStore();
      await dispatch(loadProfile(profile, { browserConnection }));

      expect(browserConnection.getSourceMap).not.toHaveBeenCalled();
      expect(browserConnection.getJSSource).not.toHaveBeenCalled();

      // No symbolication: the bundled name stays as-is.
      const { funcTable, stringArray } = getRawProfileSharedData(getState());
      expect(stringArray[funcTable.name[0]]).toBe('Ajs');
    });

    it('does not fetch sources without an id or without a sourceMapURL', async function () {
      // - has-id-no-map: id set but no sourceMapURL → skip
      // - has-map-no-id: sourceMapURL set but null id → skip
      // - both: should be fetched
      const profile = makeProfileWithJsSources([
        {
          filename: 'has-id-no-map.js',
          id: 'uuid-1',
          sourceMapURL: null,
        },
        {
          filename: 'has-map-no-id.js',
          id: null,
          sourceMapURL: 'https://example.com/has-map-no-id.js.map',
        },
        {
          filename: 'both.js',
          id: 'uuid-3',
          sourceMapURL: 'https://example.com/both.js.map',
        },
      ]);

      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: true,
        sourceMapsById: new Map([['uuid-3', buildSourceMap('both.js')]]),
        jsSourcesById: new Map([['uuid-3', BUNDLE_SOURCE]]),
      });

      const { dispatch, getState } = blankStore();
      await dispatch(loadProfile(profile, { browserConnection }));

      expect(
        browserConnection.getSourceMap.mock.calls.map((c) => c[0])
      ).toEqual(['uuid-3']);

      // Only the eligible source got symbolicated.
      const { funcTable, stringArray } = getRawProfileSharedData(getState());
      expect(stringArray[funcTable.name[0]]).toBe('Ajs');
      expect(stringArray[funcTable.name[1]]).toBe('Ajs');
      expect(stringArray[funcTable.name[2]]).toBe('greet');
    });

    it('silently continues when getSourceMap or getJSSource fails', async function () {
      const profile = makeProfileWithJsSources([
        {
          filename: 'broken.js',
          id: 'uuid-broken',
          sourceMapURL: 'https://example.com/broken.js.map',
        },
      ]);
      // No fixtures registered: getSourceMap and getJSSource throw, but the
      // catches in doResolveSourceMaps swallow them.
      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: true,
      });

      // Silence the expected warnings.
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { dispatch, getState } = blankStore();
      await dispatch(loadProfile(profile, { browserConnection }));

      expect(browserConnection.getSourceMap).toHaveBeenCalledWith(
        'uuid-broken'
      );
      expect(browserConnection.getJSSource).toHaveBeenCalledWith('uuid-broken');

      // No symbolication applied — the load completes cleanly with the func
      // unchanged.
      const { funcTable, stringArray } = getRawProfileSharedData(getState());
      expect(stringArray[funcTable.name[0]]).toBe('Ajs');
      expect(getSourceMapSymbolicationStatus(getState())).toBe('INACTIVE');
    });
  });

  describe('status transitions', function () {
    it('moves through FETCHING and SYMBOLICATING before settling back to INACTIVE', async function () {
      const profile = makeProfileWithJsSources([
        {
          filename: 'bundle.js',
          id: 'uuid-x',
          sourceMapURL: 'https://example.com/bundle.js.map',
        },
      ]);
      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: true,
        sourceMapsById: new Map([['uuid-x', buildSourceMap('bundle.js')]]),
        jsSourcesById: new Map([['uuid-x', BUNDLE_SOURCE]]),
      });

      const store = blankStore();
      // Record every distinct sourceMapSymbolicationStatus value the store
      // passes through.
      const statuses: string[] = [
        getSourceMapSymbolicationStatus(store.getState()),
      ];
      store.subscribe(() => {
        const current = getSourceMapSymbolicationStatus(store.getState());
        if (statuses[statuses.length - 1] !== current) {
          statuses.push(current);
        }
      });

      await store.dispatch(loadProfile(profile, { browserConnection }));

      // FETCHING is set when fetching starts and reverted to INACTIVE on
      // DONE_SOURCE_MAP_FETCHING; SYMBOLICATING is set when the worker starts
      // and cleared by BULK_SOURCE_MAP_SYMBOLICATION on success.
      expect(statuses).toEqual([
        'INACTIVE',
        'FETCHING',
        'INACTIVE',
        'SYMBOLICATING',
        'INACTIVE',
      ]);
    });
  });

  describe('post-symbolication profile state', function () {
    async function loadAndSymbolicate() {
      const profile = makeProfileWithJsSources([
        {
          filename: 'bundle.js',
          id: 'uuid-x',
          sourceMapURL: 'https://example.com/bundle.js.map',
        },
      ]);
      const browserConnection = makeMockBrowserConnection({
        supportsSourceMapFetching: true,
        sourceMapsById: new Map([['uuid-x', buildSourceMap('bundle.js')]]),
        jsSourcesById: new Map([['uuid-x', BUNDLE_SOURCE]]),
      });
      const { dispatch, getState } = blankStore();
      await dispatch(loadProfile(profile, { browserConnection }));
      return { dispatch, getState };
    }

    it('renames the minified function to its original identifier', async function () {
      const { getState } = await loadAndSymbolicate();
      const { funcTable, stringArray } = getRawProfileSharedData(getState());
      // The bundle defined `function a(b)`. After symbolication, the scope
      // tree on the original source recovers the pre-minified name.
      expect(stringArray[funcTable.name[0]]).toBe('greet');
    });

    it('remaps the frame execution position to the original source', async function () {
      const { getState } = await loadAndSymbolicate();
      const { frameTable, sourceLocationTable, sources, stringArray } =
        getRawProfileSharedData(getState());

      const frameOriginalLocationIdx = frameTable.originalLocation[0];
      expect(frameOriginalLocationIdx).not.toBeNull();
      const originalSourceIdx =
        sourceLocationTable.source[frameOriginalLocationIdx!];
      expect(stringArray[sources.filename[originalSourceIdx]]).toBe(
        ORIGINAL_FILENAME
      );
      // bundle 1:15 ('return') maps to hello.js 2:3 (1-based).
      expect(sourceLocationTable.line[frameOriginalLocationIdx!]).toBe(2);
      expect(sourceLocationTable.column[frameOriginalLocationIdx!]).toBe(3);
    });

    it('returns the original source content via the source view selector', async function () {
      const { dispatch, getState } = await loadAndSymbolicate();

      // The original source was appended to the sources table during
      // symbolication. Find its index by filename.
      const { sources, stringArray } = getRawProfileSharedData(getState());
      const originalSourceIndex = sources.filename.findIndex(
        (idx) => stringArray[idx] === ORIGINAL_FILENAME
      );
      expect(originalSourceIndex).toBeGreaterThanOrEqual(0);

      // Point the source view URL state at the original source.
      dispatch(
        updateUrlState(
          stateFromLocation({
            pathname: '/public/fakehash/',
            search: `?sourceViewIndex=${originalSourceIndex}`,
            hash: '',
          })
        )
      );

      expect(getSourceViewCode(getState())).toEqual({
        type: 'AVAILABLE',
        code: ORIGINAL_SOURCE,
      });
    });
  });
});
