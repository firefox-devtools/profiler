/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getSourcesWithSourceMapURL,
  parseSourceMapFileContents,
  matchSourceMapToSource,
} from '../../profile-logic/source-map-matching';

import type { SourceTable } from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';

// A minimal valid RawSourceMap, with an overridable `file` field.
function makeMap(file: string = ''): RawSourceMap {
  return {
    version: 3,
    file,
    sources: ['original.js'],
    names: [],
    mappings: '',
  };
}

describe('getSourcesWithSourceMapURL', function () {
  it('returns only sources with a non-null sourceMapURL, resolving strings', function () {
    const stringArray = [
      'a.js', // 0
      'https://example.com/a.js.map', // 1
      'b.js', // 2
      'c.js', // 3
      'https://example.com/c.js.map', // 4
    ];
    const sources: SourceTable = {
      length: 3,
      id: [null, null, null],
      filename: [0, 2, 3],
      startLine: [1, 1, 1],
      startColumn: [0, 0, 0],
      sourceMapURL: [1, null, 4],
      content: [null, null, null],
    };

    expect(getSourcesWithSourceMapURL(sources, stringArray)).toEqual([
      { sourceIndex: 0, filename: 'a.js', sourceMapURL: stringArray[1] },
      { sourceIndex: 2, filename: 'c.js', sourceMapURL: stringArray[4] },
    ]);
  });

  it('does not require a UUID id', function () {
    const stringArray = ['a.js', 'a.js.map'];
    const sources: SourceTable = {
      length: 1,
      id: [null],
      filename: [0],
      startLine: [1],
      startColumn: [0],
      sourceMapURL: [1],
      content: [null],
    };
    expect(getSourcesWithSourceMapURL(sources, stringArray)).toHaveLength(1);
  });
});

describe('parseSourceMapFileContents', function () {
  it('parses a valid source map', function () {
    const map = makeMap('bundle.js');
    const parsed = parseSourceMapFileContents(JSON.stringify(map));
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(3);
  });

  it('returns null for invalid JSON', function () {
    expect(parseSourceMapFileContents('{not json')).toBeNull();
  });

  it('returns null for JSON that is not a source map', function () {
    expect(parseSourceMapFileContents('{"foo": "bar"}')).toBeNull();
    expect(parseSourceMapFileContents('[]')).toBeNull();
    expect(parseSourceMapFileContents('"a string"')).toBeNull();
    expect(parseSourceMapFileContents('null')).toBeNull();
  });

  it('rejects index maps (with a sections field)', function () {
    const indexMap = JSON.stringify({ version: 3, sections: [] });
    expect(parseSourceMapFileContents(indexMap)).toBeNull();
  });
});

describe('matchSourceMapToSource', function () {
  it('returns no-eligible-sources when there are none', function () {
    expect(matchSourceMapToSource(makeMap(), 'x.map', [])).toEqual({
      type: 'no-eligible-sources',
    });
  });

  it('matches the single eligible source', function () {
    const eligible = [
      { sourceIndex: 3, filename: 'bundle.js', sourceMapURL: 'whatever.map' },
    ];
    expect(
      matchSourceMapToSource(makeMap(), 'unrelated.map', eligible)
    ).toEqual({ type: 'match', sourceIndex: 3 });
  });

  it('matches by uploaded file name vs basename(sourceMapURL)', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://example.com/dist/a.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'https://example.com/dist/b.js.map',
      },
    ];
    expect(matchSourceMapToSource(makeMap(), 'a.js.map', eligible)).toEqual({
      type: 'match',
      sourceIndex: 0,
    });
  });

  it('strips ?query when comparing basenames', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://example.com/a.js.map?v=123',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'https://example.com/b.js.map?v=456',
      },
    ];
    expect(matchSourceMapToSource(makeMap(), 'a.js.map', eligible)).toEqual({
      type: 'match',
      sourceIndex: 0,
    });
  });

  it('matches case-insensitively when there is no exact hit', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://example.com/A.JS.MAP',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'https://example.com/b.js.map',
      },
    ];
    expect(matchSourceMapToSource(makeMap(), 'a.js.map', eligible)).toEqual({
      type: 'match',
      sourceIndex: 0,
    });
  });

  it('is ambiguous when the uploaded name matches multiple sourceMapURLs', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://cdn1.example.com/bundle.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'https://cdn2.example.com/bundle.js.map',
      },
      {
        sourceIndex: 2,
        filename: 'c.js',
        sourceMapURL: 'https://example.com/other.js.map',
      },
    ];
    const result = matchSourceMapToSource(makeMap(), 'bundle.js.map', eligible);
    expect(result).toEqual({
      type: 'ambiguous',
      candidates: [eligible[0], eligible[1]],
    });
  });

  it('strips a trailing .map from the uploaded name to match the source filename', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'bundle.js',
        sourceMapURL: 'https://example.com/xyz.map',
      },
      {
        sourceIndex: 1,
        filename: 'other.js',
        sourceMapURL: 'https://example.com/abc.map',
      },
    ];
    // Uploaded "bundle.js.map" -> "bundle.js" matches source filename bundle.js.
    expect(
      matchSourceMapToSource(makeMap(), 'bundle.js.map', eligible)
    ).toEqual({ type: 'match', sourceIndex: 0 });
  });

  it('strips a browser-appended .json suffix to match the sourceMapURL', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'https://example.com/assets/index-XVVABR7J.js',
        sourceMapURL: 'https://example.com/assets/index-XVVABR7J.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'https://example.com/assets/vendor-ABCDEFGH.js',
        sourceMapURL: 'https://example.com/assets/vendor-ABCDEFGH.js.map',
      },
    ];
    // The browser saved "index-XVVABR7J.js.map" (served as application/json) as
    // "index-XVVABR7J.js.map.json".
    expect(
      matchSourceMapToSource(makeMap(), 'index-XVVABR7J.js.map.json', eligible)
    ).toEqual({ type: 'match', sourceIndex: 0 });
  });

  it('handles Windows-style backslash paths in basenames', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://example.com/dist/a.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'C:\\builds\\dist\\b.js.map',
      },
    ];
    expect(matchSourceMapToSource(makeMap(), 'b.js.map', eligible)).toEqual({
      type: 'match',
      sourceIndex: 1,
    });
  });

  it('matches by map.file vs basename(source.filename) when name misses', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'app.js',
        sourceMapURL: 'https://example.com/app.min.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'vendor.js',
        sourceMapURL: 'https://example.com/vendor.min.js.map',
      },
    ];
    // Uploaded name matches no sourceMapURL basename; map.file points at app.js.
    const result = matchSourceMapToSource(
      makeMap('app.js'),
      'downloaded.map',
      eligible
    );
    expect(result).toEqual({ type: 'match', sourceIndex: 0 });
  });

  it('is ambiguous when map.file matches multiple filenames', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'index.js',
        sourceMapURL: 'https://cdn1.example.com/a.map',
      },
      {
        sourceIndex: 1,
        filename: 'index.js',
        sourceMapURL: 'https://cdn2.example.com/b.map',
      },
    ];
    const result = matchSourceMapToSource(
      makeMap('index.js'),
      'nomatch.map',
      eligible
    );
    expect(result).toEqual({
      type: 'ambiguous',
      candidates: [eligible[0], eligible[1]],
    });
  });

  it('falls through to ambiguous with all eligible sources on zero hits', function () {
    const eligible = [
      {
        sourceIndex: 0,
        filename: 'a.js',
        sourceMapURL: 'https://example.com/a.js.map',
      },
      {
        sourceIndex: 1,
        filename: 'b.js',
        sourceMapURL: 'https://example.com/b.js.map',
      },
    ];
    const result = matchSourceMapToSource(
      makeMap('nope.js'),
      'totally-unrelated.map',
      eligible
    );
    expect(result).toEqual({ type: 'ambiguous', candidates: eligible });
  });
});
