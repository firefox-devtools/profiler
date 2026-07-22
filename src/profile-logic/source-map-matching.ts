/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { IndexIntoSourceTable, SourceTable } from 'firefox-profiler/types';
import type { RawSourceMap } from 'source-map';

/**
 * A source row that already carries a sourceMapURL, and is therefore eligible
 * to have a user-supplied `.map` file applied to it.
 */
export type EligibleSource = {
  sourceIndex: IndexIntoSourceTable;
  filename: string;
  sourceMapURL: string;
};

/**
 * The outcome of trying to auto-match an uploaded source map file to a bundle
 * source in the profile.
 */
export type SourceMapMatchResult =
  | { type: 'match'; sourceIndex: IndexIntoSourceTable }
  | { type: 'ambiguous'; candidates: EligibleSource[] }
  | { type: 'no-eligible-sources' };

/**
 * Return every source row that has a non-null sourceMapURL. Unlike the
 * WebChannel fetch path, a UUID `id` is NOT required here: the user supplies
 * the map file contents directly, so there is nothing to fetch.
 */
export function getSourcesWithSourceMapURL(
  sources: SourceTable,
  stringArray: string[]
): EligibleSource[] {
  const eligible: EligibleSource[] = [];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const sourceMapURLIndex = sources.sourceMapURL[sourceIndex];
    if (sourceMapURLIndex === null) {
      continue;
    }
    eligible.push({
      sourceIndex,
      filename: stringArray[sources.filename[sourceIndex]],
      sourceMapURL: stringArray[sourceMapURLIndex],
    });
  }
  return eligible;
}

/**
 * Parse the text contents of a `.map` file into a RawSourceMap. Returns null
 * for invalid JSON, for JSON that isn't a source map (missing version /
 * mappings / sources), and for index maps (which carry a `sections` field and
 * are not supported here).
 */
export function parseSourceMapFileContents(text: string): RawSourceMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }

  const map = parsed as Record<string, unknown>;

  // Index maps use `sections` instead of top-level `mappings`. Reject them.
  if ('sections' in map) {
    return null;
  }

  if (
    typeof map.version !== 'number' ||
    typeof map.mappings !== 'string' ||
    !Array.isArray(map.sources)
  ) {
    return null;
  }

  return parsed as RawSourceMap;
}

/**
 * Strip a `?query` and `#hash` from a URL-ish string, then take the last path
 * segment. Handles both `/` (URLs, POSIX) and `\` (Windows) separators.
 */
export function basename(urlOrPath: string): string {
  let s = urlOrPath;
  const queryIndex = s.search(/[?#]/);
  if (queryIndex !== -1) {
    s = s.slice(0, queryIndex);
  }
  const lastSlash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return lastSlash === -1 ? s : s.slice(lastSlash + 1);
}

// Remove `suffix` from the end of `s` if present.
function stripSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;
}

/**
 * Find the eligible sources whose given field basename matches `target`. Prefer
 * an exact (case-sensitive) match; if there are none, fall back to a
 * case-insensitive match.
 */
function matchByBasename(
  target: string,
  eligible: EligibleSource[],
  getField: (source: EligibleSource) => string
): EligibleSource[] {
  const exact = eligible.filter(
    (source) => basename(getField(source)) === target
  );
  if (exact.length > 0) {
    return exact;
  }
  const targetLower = target.toLowerCase();
  return eligible.filter(
    (source) => basename(getField(source)).toLowerCase() === targetLower
  );
}

/**
 * Given an uploaded `.map` file, decide which eligible bundle source it belongs
 * to.
 *
 * All we have to go on is the uploaded file's name and its parsed contents, so
 * matching is heuristic: we compare basenames across a series of increasingly
 * lenient criteria (see `criteria` below) and take the first that lands on a
 * single source. More than one hit is `ambiguous` (the caller asks the user to
 * pick); no hit under any criterion falls through to `ambiguous` over all
 * eligible sources.
 *
 * The two trivial cases short-circuit first: zero eligible sources, or exactly
 * one, which we match unconditionally regardless of name.
 */
export function matchSourceMapToSource(
  map: RawSourceMap,
  uploadedFileName: string,
  eligible: EligibleSource[]
): SourceMapMatchResult {
  if (eligible.length === 0) {
    return { type: 'no-eligible-sources' };
  }

  if (eligible.length === 1) {
    return { type: 'match', sourceIndex: eligible[0].sourceIndex };
  }

  const uploadedBasename = basename(uploadedFileName);
  // Browsers append ".json" when saving a map served as application/json, e.g.
  // "index.js.map" -> "index.js.map.json"; strip it back off.
  const uploadedBasenameNoJson = stripSuffix(uploadedBasename, '.json');
  // Also drop the ".map" to compare against the bundle's own filename, e.g.
  // "bundle.js.map" -> "bundle.js".
  const uploadedBasenameNoMap = stripSuffix(uploadedBasenameNoJson, '.map');

  // Ordered [target basename, field extractor] pairs, most to least reliable.
  // The first pair yielding exactly one hit wins.
  const criteria: Array<[string, (source: EligibleSource) => string]> = [
    [uploadedBasename, (source) => source.sourceMapURL],
    [uploadedBasenameNoJson, (source) => source.sourceMapURL],
    [uploadedBasenameNoMap, (source) => source.filename],
  ];

  // Last resort: the map's own `file` field vs the bundle filename.
  if (typeof map.file === 'string' && map.file !== '') {
    criteria.push([basename(map.file), (source) => source.filename]);
  }

  for (const [target, getField] of criteria) {
    const hits = matchByBasename(target, eligible, getField);
    if (hits.length === 1) {
      return { type: 'match', sourceIndex: hits[0].sourceIndex };
    }
    if (hits.length > 1) {
      return { type: 'ambiguous', candidates: hits };
    }
  }

  return { type: 'ambiguous', candidates: eligible };
}
