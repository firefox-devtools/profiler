/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatSourceMapSourcesResult } from '../../formatters';
import type {
  SessionContext,
  SourceEntry,
  SourceMapSourcesResult,
  WithContext,
} from 'firefox-profiler/profile-query/types';

function createContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'GeckoMain' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 3000 },
  };
}

function makeEntry(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    sourceHandle: 'src-0',
    sourceIndex: 0,
    filename: 'bundle.js',
    sourceMap: { kind: 'url', url: 'https://example.com/bundle.js.map' },
    ...overrides,
  };
}

describe('formatSourceMapSourcesResult', () => {
  it('lists eligible sources with their handles', () => {
    const result: WithContext<SourceMapSourcesResult> = {
      type: 'sourcemap-sources',
      sources: [
        makeEntry(),
        makeEntry({
          sourceHandle: 'src-3',
          sourceIndex: 3,
          filename: 'vendor.js',
          sourceMap: { kind: 'url', url: 'https://example.com/vendor.js.map' },
        }),
      ],
      context: createContext(),
    };
    const text = formatSourceMapSourcesResult(result);
    expect(text).toContain('Sources with source maps (2):');
    expect(text).toContain('src-0  bundle.js');
    expect(text).toContain('src-3  vendor.js');
    expect(text).toContain('https://example.com/vendor.js.map');
  });

  it('handles an empty list', () => {
    const result: WithContext<SourceMapSourcesResult> = {
      type: 'sourcemap-sources',
      sources: [],
      context: createContext(),
    };
    expect(formatSourceMapSourcesResult(result)).toContain(
      'No sources with a source map URL'
    );
  });

  it('renders an inline map by media type and size', () => {
    const result: WithContext<SourceMapSourcesResult> = {
      type: 'sourcemap-sources',
      sources: [
        makeEntry({
          sourceMap: {
            kind: 'inline',
            mediaType: 'application/json;base64',
            byteLength: 534605,
          },
        }),
      ],
      context: createContext(),
    };
    const text = formatSourceMapSourcesResult(result);
    expect(text).toContain('src-0  bundle.js');
    expect(text).toContain('inline data: URL, application/json;base64, 535KB');
    // The line stays a readable width rather than scaling with the map.
    expect(Math.max(...text.split('\n').map((l) => l.length))).toBeLessThan(
      120
    );
  });
});
