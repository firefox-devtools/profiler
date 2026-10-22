/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Embeds the text of JS sources into a profile after the fact, and applies
// their source maps. This is useful for profiles of pages served by a local
// web server, like CI benchmark runs, where the sources can't be fetched
// anymore by the time the profile is viewed.

import { applySourceMapSymbolicationResponse } from 'firefox-profiler/profile-logic/source-maps/symbolication';
import { parseSourceMapFileContents } from 'firefox-profiler/profile-logic/source-maps/matching';
import { base64StringToBytes } from 'firefox-profiler/utils/base64';
import { StringTable } from 'firefox-profiler/utils/string-table';

import type { SourceMap } from 'firefox-profiler/profile-logic/source-maps/store';
import type { SourceMapRunner } from 'firefox-profiler/profile-logic/source-maps/worker-types';
import { FuncFlag } from 'firefox-profiler/types';
import type {
  IndexIntoSourceTable,
  IndexIntoStringTable,
  Profile,
} from 'firefox-profiler/types';

/**
 * Returns the text of the file at this URL, or null if it can't be read.
 */
export type SourceReader = (url: string) => Promise<string | null>;

function _decodeDataUrl(url: string): string | null {
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }
  const mediaType = url.slice('data:'.length, commaIndex);
  const data = url.slice(commaIndex + 1);
  try {
    return mediaType.endsWith(';base64')
      ? new TextDecoder().decode(base64StringToBytes(data))
      : decodeURIComponent(data);
  } catch {
    return null;
  }
}

// Matches the source map annotation at the end of a compiled file, which may
// only be followed by whitespace.
const SOURCE_MAPPING_URL_COMMENT_REGEXP = /\/\/[#@] sourceMappingURL=(\S+)\s*$/;

/**
 * Gecko doesn't always record the sourceMapURL of a source, so fall back to
 * the annotation in the source text. Only the end of the file is searched,
 * since that's where bundlers put it, and searching megabytes of minified code
 * would be slow.
 */
function _findSourceMappingURLComment(text: string): string | null {
  const match = SOURCE_MAPPING_URL_COMMENT_REGEXP.exec(text.slice(-4096));
  return match === null ? null : match[1];
}

function _resolveSourceMapURL(
  sourceUrl: string,
  sourceMapURL: string
): string | null {
  // Inline source maps can be megabytes long, so don't run them through URL.
  if (sourceMapURL.startsWith('data:')) {
    return sourceMapURL;
  }
  try {
    return new URL(sourceMapURL, sourceUrl).href;
  } catch {
    return null;
  }
}

async function _readSourceMap(
  resolvedSourceMapURL: string,
  readSource: SourceReader
): Promise<SourceMap | null> {
  const isInline = resolvedSourceMapURL.startsWith('data:');
  const sourceMapText = isInline
    ? _decodeDataUrl(resolvedSourceMapURL)
    : await readSource(resolvedSourceMapURL);
  const sourceMap =
    sourceMapText === null ? null : parseSourceMapFileContents(sourceMapText);
  if (sourceMap === null) {
    console.warn(
      isInline
        ? 'Could not read an inline source map'
        : `Could not read the source map ${resolvedSourceMapURL}`
    );
  }
  return sourceMap;
}

function _cacheByKey<T>(
  fn: (key: string) => Promise<T>
): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let promise = cache.get(key);
    if (promise === undefined) {
      promise = fn(key);
      cache.set(key, promise);
    }
    return promise;
  };
}

// Matches "name (url:line:column)", where the URL has a scheme like http://
// or resource://.
const FUNC_NAME_WITH_LOCATION_REGEXP =
  /^(.*) \(([a-z][a-z0-9+.-]*:\/\/.+?):([0-9]+):([0-9]+)\)$/i;

/**
 * Some profiles only have the location of a JS function in its name, like
 * "foo (http://example.com/a.js:12:5)". This is the case for the JS funcs of
 * samply profiles. Move the source, line and column out of the name of these
 * JS funcs, like the processing of Gecko profiles does, so that their sources
 * can be embedded too. The JS funcs that already have a source are left alone.
 */
export function attachSourcesFromFuncNames(profile: Profile): void {
  const { funcTable, sources } = profile.shared;
  const stringArray = profile.shared.stringArray.slice();
  const stringTable = StringTable.withBackingArray(stringArray);
  const flags = funcTable.flags.slice();
  const name = funcTable.name.slice();
  const source = funcTable.source.slice();
  const lineNumber = funcTable.lineNumber.slice();
  const columnNumber = funcTable.columnNumber.slice();
  const newSources = {
    length: sources.length,
    id: sources.id.slice(),
    filename: sources.filename.slice(),
    startLine: sources.startLine.slice(),
    startColumn: sources.startColumn.slice(),
    sourceMapURL: sources.sourceMapURL.slice(),
    content: sources.content.slice(),
  };
  const sourceIndexByFilename = new Map<
    IndexIntoStringTable,
    IndexIntoSourceTable
  >();

  let attachedCount = 0;
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    if (
      (flags[funcIndex] & FuncFlag.IsJS) === 0 ||
      flags[funcIndex] & FuncFlag.HasSource
    ) {
      continue;
    }
    const match = FUNC_NAME_WITH_LOCATION_REGEXP.exec(
      stringArray[funcTable.name[funcIndex]]
    );
    if (match === null) {
      continue;
    }
    const [, funcName, url, line, column] = match;
    const filenameIndex = stringTable.indexForString(url);
    let sourceIndex = sourceIndexByFilename.get(filenameIndex);
    if (sourceIndex === undefined) {
      sourceIndex = newSources.length++;
      newSources.id.push(null);
      newSources.filename.push(filenameIndex);
      newSources.startLine.push(1);
      newSources.startColumn.push(1);
      newSources.sourceMapURL.push(null);
      newSources.content.push(null);
      sourceIndexByFilename.set(filenameIndex, sourceIndex);
    }
    // SpiderMonkey names the functions without a name "*". Name them like
    // Gecko profiles do.
    name[funcIndex] = stringTable.indexForString(
      funcName === '*' ? `(root scope) ${url}` : funcName
    );
    source[funcIndex] = sourceIndex;
    flags[funcIndex] |= FuncFlag.HasSource;
    if ((flags[funcIndex] & FuncFlag.HasLine) === 0) {
      lineNumber[funcIndex] = Number(line);
      flags[funcIndex] |= FuncFlag.HasLine;
    }
    if ((flags[funcIndex] & FuncFlag.HasColumn) === 0) {
      columnNumber[funcIndex] = Number(column);
      flags[funcIndex] |= FuncFlag.HasColumn;
    }
    attachedCount++;
  }

  if (attachedCount === 0) {
    return;
  }
  profile.shared = {
    ...profile.shared,
    funcTable: {
      ...funcTable,
      flags,
      name,
      source,
      lineNumber,
      columnNumber,
    },
    sources: newSources,
    stringArray,
  };
  console.log(
    `Found the sources of ${attachedCount} funcs in their names, in ${newSources.length - sources.length} new sources.`
  );
}

/**
 * Store the text of every JS source that `readSource` can find in the
 * profile's sources table, then apply the source maps of these sources with
 * `runSourceMaps`. The source maps' sourcesContent ends up in the sources
 * table too, so the profile contains all the source code it needs.
 */
export async function embedJsSources(
  profile: Profile,
  readSource: SourceReader,
  runSourceMaps: SourceMapRunner
): Promise<void> {
  const { sources } = profile.shared;
  const content = sources.content.slice();
  const sourceMapURLs = sources.sourceMapURL.slice();
  const stringArray = profile.shared.stringArray.slice();
  const stringTable = StringTable.withBackingArray(stringArray);
  let embeddedCount = 0;
  const compiledSources = new Map<IndexIntoSourceTable, string>();
  const resolvedSourceMaps = new Map<IndexIntoSourceTable, SourceMap>();
  // Gecko keys source rows by their ScriptSource id, so a script that's loaded
  // more than once can have several rows with the same URL.
  const readSourceOnce = _cacheByKey(readSource);
  const readSourceMapOnce = _cacheByKey((url) =>
    _readSourceMap(url, readSource)
  );

  await Promise.all(
    sources.filename.map(async (filenameIndex, sourceIndex) => {
      // Inline scripts start in the middle of their HTML file, and their
      // source text is only the script, not the whole file.
      if (
        sources.startLine[sourceIndex] !== 1 ||
        sources.startColumn[sourceIndex] !== 1
      ) {
        return;
      }
      const url = stringArray[filenameIndex];
      const text = content[sourceIndex] ?? (await readSourceOnce(url));
      if (text === null) {
        return;
      }
      content[sourceIndex] = text;
      embeddedCount++;

      const sourceMapURLIndex = sourceMapURLs[sourceIndex];
      const sourceMapURL =
        sourceMapURLIndex === null
          ? _findSourceMappingURLComment(text)
          : stringArray[sourceMapURLIndex];
      if (sourceMapURL === null) {
        return;
      }
      const resolvedSourceMapURL = _resolveSourceMapURL(url, sourceMapURL);
      if (resolvedSourceMapURL === null) {
        return;
      }
      const sourceMap = await readSourceMapOnce(resolvedSourceMapURL);
      if (sourceMap === null) {
        return;
      }
      // Source map symbolication only looks at sources with a sourceMapURL.
      sourceMapURLs[sourceIndex] = stringTable.indexForString(sourceMapURL);
      resolvedSourceMaps.set(sourceIndex, sourceMap);
      compiledSources.set(sourceIndex, text);
    })
  );

  profile.shared = {
    ...profile.shared,
    sources: { ...sources, content, sourceMapURL: sourceMapURLs },
    stringArray,
  };
  console.log(
    `Embedded ${embeddedCount} of ${sources.length} sources, ${resolvedSourceMaps.size} of which have source maps.`
  );
  if (resolvedSourceMaps.size === 0) {
    return;
  }

  const shared = profile.shared;
  const output = await runSourceMaps({
    resolvedSourceMaps,
    compiledSources,
    funcTable: shared.funcTable,
    frameTable: shared.frameTable,
    sourceLocationTable: shared.sourceLocationTable,
    sources: shared.sources,
    stringArray: shared.stringArray,
  });
  if (output.type === 'error') {
    console.warn(`Source map symbolication failed: ${output.message}`);
    return;
  }
  if (output.type === 'no-op') {
    return;
  }
  const applied = applySourceMapSymbolicationResponse(shared, output.response);
  if (applied === null) {
    return;
  }
  profile.shared = {
    ...shared,
    funcTable: applied.newFuncTable,
    frameTable: applied.newFrameTable,
    sourceLocationTable: applied.newSourceLocationTable,
    sources: applied.newSources,
    stringArray: applied.newStringArray,
  };
}
