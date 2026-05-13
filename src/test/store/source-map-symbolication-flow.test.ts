/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Integration test for the receive-profile → JS source map symbolication
// flow. Verifies that finalizeProfileView correctly threads through:
//   1. visible thread / source UUID / sourceMapURL filtering,
//   2. fetching source maps and compiled source via BrowserConnection,
//   3. dispatching doSourceMapSymbolication only when fetches succeeded and
//      the browser supports source map fetching (WebChannel v7+).
//
// The Worker spawn inside doSourceMapSymbolication is bypassed by mocking
// the action module — we verify the call shape, not the worker internals.

import { doSourceMapSymbolication } from '../../actions/source-map-symbolication';
import { loadProfile } from '../../actions/receive-profile';
import { blankStore } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { BrowserConnection } from '../../app-logic/browser-connection';
import type { Profile, IndexIntoSourceTable } from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';

jest.mock('../../actions/source-map-symbolication', () => {
  return {
    doSourceMapSymbolication: jest.fn(),
  };
});

type MockBrowserConnection = BrowserConnection & {
  getSourceMap: jest.Mock;
  getJSSource: jest.Mock;
  supportsSourceMapFetching: jest.Mock;
};

// Build a minimal BrowserConnection that exposes the source-map-fetching
// surface used by finalizeProfileView, with all other methods stubbed.
function makeMockBrowserConnection(opts: {
  supportsSourceMapFetching: boolean;
  sourceMapsById?: Map<string, RawSourceMap>;
  jsSourcesById?: Map<string, string>;
}): MockBrowserConnection {
  const sourceMapsById = opts.sourceMapsById ?? new Map();
  const jsSourcesById = opts.jsSourcesById ?? new Map();
  return {
    supportsSourceMapFetching: jest
      .fn()
      .mockReturnValue(opts.supportsSourceMapFetching),
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
  };
}

// Build a profile with the given JS source descriptors. Each descriptor
// becomes a source-table entry referenced by one thread's only frame.
function makeProfileWithJsSources(
  sources: Array<{
    filename: string;
    id: string | null;
    sourceMapURL: string | null;
  }>
): Profile {
  // One thread per source so each source appears as the funcTable.source of
  // a visible thread's stack.
  const textSamples = sources.map((s) => `A[file:${s.filename}]`);
  const { profile } = getProfileFromTextSamples(...textSamples);
  profile.meta.symbolicated = true; // Skip native symbolication.

  const { sources: sourceTable, stringArray } = profile.shared;
  for (const desc of sources) {
    // Find the source index by filename.
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
  return profile;
}

// Minimal valid RawSourceMap fixture. The worker is mocked, so the content
// doesn't need to be parsed — only its identity round-trips into the action.
function fakeSourceMap(filename: string): RawSourceMap {
  return {
    version: 3,
    file: filename,
    sources: [filename.replace(/\.js$/, '.ts')],
    names: [],
    mappings: '',
  };
}

describe('receive-profile → source map symbolication flow', function () {
  const mockedDoSourceMapSymbolication = doSourceMapSymbolication as jest.Mock;

  beforeEach(function () {
    // The global afterEach in src/test/setup.ts calls jest.resetAllMocks(),
    // which also strips the implementation we attach here — so install the
    // no-op thunk fresh on every test.
    mockedDoSourceMapSymbolication.mockImplementation(
      (
        _resolvedSourceMaps: Map<IndexIntoSourceTable, RawSourceMap>,
        _compiledSources: Map<IndexIntoSourceTable, string>
      ) =>
        async () => {
          // No-op thunk — the real implementation spawns a Worker, which we
          // don't want to run in this integration test.
        }
    );
  });

  it('fetches source maps and dispatches symbolication for sources with a UUID and sourceMapURL', async function () {
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

    const sourceMapsById = new Map<string, RawSourceMap>([
      ['uuid-a', fakeSourceMap('bundle-a.js')],
      ['uuid-b', fakeSourceMap('bundle-b.js')],
    ]);
    const jsSourcesById = new Map<string, string>([
      ['uuid-a', 'function a(){}\n'],
      ['uuid-b', 'function b(){}\n'],
    ]);
    const browserConnection = makeMockBrowserConnection({
      supportsSourceMapFetching: true,
      sourceMapsById,
      jsSourcesById,
    });

    const { dispatch } = blankStore();
    await dispatch(loadProfile(profile, { browserConnection }));

    expect(browserConnection.supportsSourceMapFetching).toHaveBeenCalled();
    expect(
      browserConnection.getSourceMap.mock.calls.map((c: any[]) => c[0])
    ).toEqual(expect.arrayContaining(['uuid-a', 'uuid-b']));
    expect(
      browserConnection.getJSSource.mock.calls.map((c: any[]) => c[0])
    ).toEqual(expect.arrayContaining(['uuid-a', 'uuid-b']));

    expect(mockedDoSourceMapSymbolication).toHaveBeenCalledTimes(1);
    const [resolvedSourceMaps, compiledSources] =
      mockedDoSourceMapSymbolication.mock.calls[0];
    // Maps are keyed by IndexIntoSourceTable; both fetched UUIDs should be
    // present.
    expect(resolvedSourceMaps.size).toBe(2);
    expect(compiledSources.size).toBe(2);
    expect(Array.from(compiledSources.values())).toEqual(
      expect.arrayContaining(['function a(){}\n', 'function b(){}\n'])
    );
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

    const { dispatch } = blankStore();
    await dispatch(loadProfile(profile, { browserConnection }));

    expect(browserConnection.getSourceMap).not.toHaveBeenCalled();
    expect(browserConnection.getJSSource).not.toHaveBeenCalled();
    expect(mockedDoSourceMapSymbolication).not.toHaveBeenCalled();
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
      sourceMapsById: new Map([['uuid-3', fakeSourceMap('both.js')]]),
      jsSourcesById: new Map([['uuid-3', 'function c(){}\n']]),
    });

    const { dispatch } = blankStore();
    await dispatch(loadProfile(profile, { browserConnection }));

    const fetchedIds = browserConnection.getSourceMap.mock.calls.map(
      (c) => c[0]
    );
    expect(fetchedIds).toEqual(['uuid-3']);
    expect(mockedDoSourceMapSymbolication).toHaveBeenCalledTimes(1);
    const [resolvedSourceMaps] = mockedDoSourceMapSymbolication.mock.calls[0];
    expect(resolvedSourceMaps.size).toBe(1);
  });

  it('silently continues when getSourceMap or getJSSource fails', async function () {
    const profile = makeProfileWithJsSources([
      {
        filename: 'broken.js',
        id: 'uuid-broken',
        sourceMapURL: 'https://example.com/broken.js.map',
      },
    ]);
    const browserConnection = makeMockBrowserConnection({
      supportsSourceMapFetching: true,
      // Both maps left empty → getSourceMap and getJSSource throw, but the
      // catches in doResolveSourceMaps swallow them.
    });

    // Silence the expected warnings.
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { dispatch } = blankStore();
    await dispatch(loadProfile(profile, { browserConnection }));

    expect(browserConnection.getSourceMap).toHaveBeenCalledWith('uuid-broken');
    expect(browserConnection.getJSSource).toHaveBeenCalledWith('uuid-broken');
    // doSourceMapSymbolication is still dispatched (the early-return guard
    // lives inside the action itself), but with empty Maps — so the real
    // implementation would not spawn a worker.
    expect(mockedDoSourceMapSymbolication).toHaveBeenCalledTimes(1);
    const [resolvedSourceMaps, compiledSources] =
      mockedDoSourceMapSymbolication.mock.calls[0];
    expect(resolvedSourceMaps.size).toBe(0);
    expect(compiledSources.size).toBe(0);
  });
});
