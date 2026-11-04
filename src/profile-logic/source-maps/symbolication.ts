/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JS source map symbolication. Maps generated (compiled/bundled) JS positions
 * back to their original source files, lines, columns, and function names
 * using source maps fetched at profile load time.
 *
 * Storage: the source file lives on funcTable.source (frames only carry
 * line/column). The per-row remapping lives in sourceLocationTable. funcTable
 * and frameTable index into sourceLocationTable via their `.originalLocation`
 * column.
 *
 * The shapes the scope tree recognizes (self-named, direct assignment,
 * wrap-pattern, computed-member) are catalogued at the top of
 * `scope-tree.ts`. This file is the resolver: it consumes those
 * scopes and produces final function names.
 *
 * ## Function name resolution
 *
 * Names come from two sources, both optional. The compiled source (the
 * bundle text fetched from the browser) enables the full resolution path
 * including the Nonymous ancestor chain. The original source is read from
 * the source map's `sourcesContent` field, which toolchains may populate
 * fully, partially, or not at all. If the compiled source is missing (e.g.
 * the profile was captured without the JS Sources feature), we fall back
 * to original-source-only resolution without an ancestor chain.
 *
 * 1. Original source (parsed lazily, cached per file). Look up the innermost
 *    function scope at the original position. Use `scope.astName` if set,
 *    else fall back to `scope.lhsText` (the verbatim LHS of an inferred
 *    scope). This recovers names that minifiers stripped and preserves
 *    un-minified member chains:
 *
 *      // bundle: const a = function(){}. Original: function mapToPropsProxy(){}
 *      // -> mapToPropsProxy
 *
 *      Watcher.prototype.run = function() {}    // -> Watcher.prototype.run
 *      this.eventPool_.createObject = ...       // -> this.eventPool_.createObject
 *      obj[key] = fn                            // -> obj[key]
 *
 * 2. Compiled source. Walk the scope's `nameMappingLocations` with exact
 *    source-map probes. On miss, fall back to `scope.astName` (the compiled
 *    identifier). For computed-member assignments, compose
 *    `${receiver}[${key}]` from two probes. Used as a fallback when (1)
 *    didn't yield anything because `sourcesContent` was empty.
 *
 * ## Ancestor chain
 *
 * SpiderMonkey's NameFunctions output prefixes a function's name with its
 * enclosing chain only when the local name doesn't fully express the
 * function's identity on its own. We mirror that:
 *
 * (Here `() => {}` stands in for any anonymous function or arrow function.
 * `wrap(...)` is any call/new expression that the scope-tree
 * treats as a "transparent wrapper". See its docs for the recognized shapes.)
 *
 *   var foo = () => {}           // -> foo             (bare named, no chain)
 *   var foo = wrap(() => {})     // -> outer/foo<      (contributes-to: chain + `<`)
 *   obj[key] = () => {}          // -> outer/obj[key]  (member-style: chain)
 *   function () { ... }          // -> outer/<         (anonymous: chain)
 *
 * When building the chain we keep the immediate parent and any *named*
 * ancestors above it. Intermediate anonymous IIFEs are skipped, so bundled
 * UMD code reads as `outer/local`, not `</</</local`.
 */

import {
  finishRawFrameTableBuilder,
  finishRawFuncTableBuilder,
  getRawFrameTableBuilderWithExistingContents,
  getRawFuncTableBuilderWithExistingContents,
  shallowCloneSourceLocationTable,
} from 'firefox-profiler/profile-logic/data-structures';
import { StringTable } from 'firefox-profiler/utils/string-table';
import {
  parseJsScopeTree,
  findInnermostFunctionScope,
  dialectForFilename,
} from './scope-tree';
import {
  buildLineOffsets,
  offsetToLineCol,
  lineColToOffset,
} from 'firefox-profiler/utils/line-offsets';
import { serializeNonymousName } from 'firefox-profiler/profile-logic/nonymous';
import { SourceMapStore } from './store';
import { SourceMapConsumer as LibSourceMapConsumer } from 'source-map';

import type { NonymousSegment } from 'firefox-profiler/profile-logic/nonymous';
import type { FunctionScope } from './scope-tree';
import type {
  IndexIntoSourceTable,
  IndexIntoFuncTable,
  RawFuncTable,
  IndexIntoFrameTable,
  RawFrameTable,
  RawProfileSharedData,
  SourceLocationTable,
  SourceTable,
} from 'firefox-profiler/types';
import { FrameFlag, FuncFlag } from 'firefox-profiler/types';
import type { NullableMappedPosition } from 'source-map';
import type { SourceMapConsumer } from './store';
import type {
  FrameResolution,
  FuncResolution,
  IndexIntoOriginalSources,
  OriginalSource,
  SourceMapSymbolicationResponse,
  WorkerInput,
  WorkerOutput,
} from './worker-types';

const INT32_MAX = 0x7fffffff;

// NullableMappedPosition with source and line guaranteed non-null (checked
// before any source-map lookup).
type OriginalPosition = NullableMappedPosition & {
  source: string;
  line: number;
};

// Cached parse of a source file (compiled bundle text or an original source
// extracted from the source map's sourcesContent). Reused across funcs and
// frames symbolicated against the same source.
type ParsedSource = {
  tree: FunctionScope[];
  lineOffsets: number[];
};

/**
 * The original sources found during one symbolication run, identified by the
 * bundle whose source map lists them and the URL in that source map. Entry
 * indexes are what FrameResolution.originalSourceIndex refers to, and the
 * list is shipped to the main thread as the response's originalSources.
 */
class OriginalSourceList {
  readonly sources: OriginalSource[] = [];
  // `${generatedSource}:${url}` to entry index. The bundle index can't contain
  // a colon, so the key is unambiguous.
  private _indexByKey = new Map<string, IndexIntoOriginalSources>();
  // Parsed scope trees, by entry index. Parsed lazily, null when the entry
  // has no content.
  private _parsed: Array<ParsedSource | null | undefined> = [];

  indexFor(
    generatedSource: IndexIntoSourceTable,
    consumer: SourceMapConsumer,
    url: string
  ): IndexIntoOriginalSources {
    const key = `${generatedSource}:${url}`;
    let index = this._indexByKey.get(key);
    if (index === undefined) {
      index = this.sources.length;
      this.sources.push({
        generatedSource,
        url,
        // nullOnMissing=true so we get null instead of a throw when not
        // embedded.
        content: consumer.sourceContentFor(url, true),
      });
      this._parsed.push(undefined);
      this._indexByKey.set(key, index);
    }
    return index;
  }

  getParsed(index: IndexIntoOriginalSources): ParsedSource | null {
    let parsed = this._parsed[index];
    if (parsed === undefined) {
      const { url, content } = this.sources[index];
      parsed =
        content === null
          ? null
          : {
              tree: parseJsScopeTree(content, dialectForFilename(url)),
              lineOffsets: buildLineOffsets(content),
            };
      this._parsed[index] = parsed;
    }
    return parsed;
  }
}

// The subset of RawProfileSharedData that symbolicateWithSourceMaps reads.
// Other shared fields (stackTable, resourceTable, nativeSymbols) are not
// touched, so callers (e.g. the worker) can supply just this subset.
//
// The worker only *reads* these fields. All table mutations happen on the
// main thread in applySourceMapSymbolicationResponse, which builds new
// tables from the current shared state at apply time.
export type SourceMapSymbolicationInput = {
  frameTable: RawFrameTable;
  funcTable: RawFuncTable;
  sourceLocationTable: SourceLocationTable;
  sources: SourceTable;
  stringArray: string[];
};

/**
 * Run JS source map symbolication on the profile's shared tables. All threads
 * share the same frameTable/funcTable, so symbolication runs once for the whole
 * profile rather than once per thread.
 *
 * `compiledSources` maps each bundle's IndexIntoSourceTable to its full source
 * text (fetched from the browser). When present, it enables the full
 * scope-tree-based name resolution with ancestor chain. When absent for a
 * given source (e.g. the profile was captured without the JS Sources feature),
 * name resolution falls back to original-source-only lookup via
 * `sourcesContent`.
 *
 * Returns a position-keyed response that the main thread translates into
 * new tables via applySourceMapSymbolicationResponse. Returns null if no
 * funcs or frames produced a resolution.
 */
export function symbolicateWithSourceMaps(
  shared: SourceMapSymbolicationInput,
  sourceMapStore: SourceMapStore,
  compiledSources: Map<IndexIntoSourceTable, string> = new Map()
): SourceMapSymbolicationResponse | null {
  const { funcsToSymbolicate, framesToSymbolicate } = _identifyToSymbolicate(
    shared.frameTable,
    shared.funcTable,
    shared.sources
  );

  if (funcsToSymbolicate.length === 0 && framesToSymbolicate.length === 0) {
    return null;
  }

  return _buildSourceMapSymbolicationResponse(
    shared,
    funcsToSymbolicate,
    framesToSymbolicate,
    sourceMapStore,
    compiledSources
  );
}

/**
 * Walk the frames and funcs to identify which ones need JS symbolication.
 * Each JS func with a sourceMapURL is a candidate. Its frames are also
 * candidates for line/column remapping.
 */
function _identifyToSymbolicate(
  frameTable: RawFrameTable,
  funcTable: RawFuncTable,
  sources: SourceTable
): {
  funcsToSymbolicate: IndexIntoFuncTable[];
  framesToSymbolicate: IndexIntoFrameTable[];
} {
  const funcsToSymbolicate: IndexIntoFuncTable[] = [];
  const framesToSymbolicate: IndexIntoFrameTable[] = [];

  // Frame tables can have >1M entries, with many frames per func. Cache the
  // per-func eligibility so the inner per-frame check is a single array
  // lookup instead of three nullability checks against cold columns.
  // 0 = unknown, 1 = eligible, 2 = ineligible.
  const funcEligibility = new Uint8Array(funcTable.length);

  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    const funcIndex = frameTable.func[frameIndex];

    let eligibility = funcEligibility[funcIndex];
    if (eligibility === 0) {
      eligibility = _isFuncSymbolicable(funcIndex, funcTable, sources) ? 1 : 2;
      funcEligibility[funcIndex] = eligibility;

      if (eligibility === 1) {
        const funcFlags = funcTable.flags[funcIndex];
        if (
          (funcFlags & FuncFlag.HasOriginalLocation) === 0 &&
          (funcFlags & FuncFlag.HasLine) !== 0 &&
          (funcFlags & FuncFlag.HasColumn) !== 0
        ) {
          funcsToSymbolicate.push(funcIndex);
        }
      }
    }

    if (eligibility === 1) {
      const flags = frameTable.flags[frameIndex];
      if (
        (flags & FrameFlag.HasOriginalLocation) === 0 &&
        (flags & FrameFlag.HasLine) !== 0 &&
        (flags & FrameFlag.HasColumn) !== 0
      ) {
        framesToSymbolicate.push(frameIndex);
      }
    }
  }

  return { funcsToSymbolicate, framesToSymbolicate };
}

function _isFuncSymbolicable(
  funcIndex: IndexIntoFuncTable,
  funcTable: RawFuncTable,
  sources: SourceTable
): boolean {
  const flags = funcTable.flags[funcIndex];
  if ((flags & FuncFlag.IsJS) === 0 || (flags & FuncFlag.HasSource) === 0) {
    return false;
  }
  const sourceIndex = funcTable.source[funcIndex];
  return sources.sourceMapURL[sourceIndex] !== null;
}

/**
 * Return true if the source-map has an exact entry at `pos` (0-based col).
 *
 * `source-map`'s `originalPositionFor` does a greatest-lower-bound (GLB)
 * lookup: it returns the largest mapping whose generated position is <= the
 * query, so most queries round down to a preceding mapping rather than
 * requiring an exact match. We approximate "is there an exact entry at pos?"
 * by comparing GLB(pos) with GLB(predecessor of pos): if they differ, `pos`
 * must be the start of a new mapping (i.e. an exact entry).
 *
 * For pos.col > 0 the predecessor is (line, col - 1). For pos.col === 0 the
 * predecessor is the end of the previous line: GLB will clip to the last
 * actual mapping with (line, col) <= (pos.line - 1, anything), so asking with
 * a very large column on the previous line suffices.
 *
 * TODO: This approximation produces false negatives when two consecutive
 * source-map mappings resolve to the same original position (GLB(pos) ==
 * GLB(predecessor) even though pos is an exact entry). If this causes
 * incorrect function names in practice, replace with a direct mapping-entry
 * lookup once the source-map library exposes that API.
 */
function _isExactSourceMapEntry(
  consumer: SourceMapConsumer,
  pos: { line: number; col: number },
  glb: { source: string | null; line: number | null; column: number | null }
): boolean {
  let prev;
  if (pos.col === 0) {
    if (pos.line === 0) {
      // First char of the file. No predecessor exists.
      return true;
    }
    // Probe the end of the previous line.
    prev = consumer.originalPositionFor({
      line: pos.line,
      column: INT32_MAX,
    });
  } else {
    prev = consumer.originalPositionFor({
      line: pos.line + 1,
      column: pos.col - 1,
    });
  }
  return (
    prev.source !== glb.source ||
    prev.line !== glb.line ||
    prev.column !== glb.column
  );
}

/**
 * Walk the funcs/frames to symbolicate, run source-map lookups, and collect
 * the results into a position-keyed response. The worker doesn't allocate
 * source-table or originalLocation indices and doesn't intern strings; that
 * bookkeeping happens main-side in applySourceMapSymbolicationResponse.
 *
 * Returns null if no funcs or frames were resolved (e.g. no consumers were
 * available, or every position fell outside its source map's coverage).
 */
function _buildSourceMapSymbolicationResponse(
  shared: SourceMapSymbolicationInput,
  funcsToSymbolicate: IndexIntoFuncTable[],
  framesToSymbolicate: IndexIntoFrameTable[],
  sourceMapStore: SourceMapStore,
  compiledSources: Map<IndexIntoSourceTable, string>
): SourceMapSymbolicationResponse | null {
  const { frameTable, funcTable } = shared;

  const funcResults = new Map<IndexIntoFuncTable, FuncResolution>();
  const frameResults = new Map<IndexIntoFrameTable, FrameResolution>();

  // Original sources found by remapping. Used both by original-source name
  // resolution (to recover function names stripped during minification) and
  // as the response's originalSources list.
  const originalSources = new OriginalSourceList();

  const compiledSourceCache = new Map<IndexIntoSourceTable, ParsedSource>();

  // Function definitions. These get an original source file.
  for (const funcIndex of funcsToSymbolicate) {
    const funcFlags = funcTable.flags[funcIndex];
    const requiredFlags =
      FuncFlag.HasSource | FuncFlag.HasLine | FuncFlag.HasColumn;
    if ((funcFlags & requiredFlags) !== requiredFlags) {
      continue;
    }
    const sourceIndex = funcTable.source[funcIndex];
    const consumer = sourceMapStore.getConsumer(sourceIndex);
    if (consumer === null) {
      continue;
    }
    const line = funcTable.lineNumber[funcIndex];
    const column = funcTable.columnNumber[funcIndex];

    const compiledText = compiledSources.get(sourceIndex);
    let compiled: ParsedSource | null = null;
    if (compiledText !== undefined) {
      compiled = compiledSourceCache.get(sourceIndex) ?? null;
      if (compiled === null) {
        compiled = {
          tree: parseJsScopeTree(compiledText),
          lineOffsets: buildLineOffsets(compiledText),
        };
        compiledSourceCache.set(sourceIndex, compiled);
      }
    }

    // source-map's originalPositionFor uses 1-based lines, 0-based columns.
    let original = consumer.originalPositionFor({ line, column: column - 1 });
    if (compiled !== null) {
      original = _originalPositionForFunction(
        sourceIndex,
        consumer,
        original,
        line,
        column,
        compiled,
        originalSources
      );
    }
    const remap = _remapOriginalPosition(
      sourceIndex,
      consumer,
      original,
      originalSources
    );
    if (remap === null) {
      continue;
    }

    // Full resolution (compiled + original, with ancestor chain) when the
    // compiled bundle is available. Otherwise (e.g. the profile was captured
    // without the JS Sources feature) fall back to original-source-only
    // resolution, which still recovers names from `sourcesContent`.
    let resolvedName: string | null;
    if (compiled !== null) {
      resolvedName = _resolveFunctionName(
        consumer,
        remap.original,
        remap.originalSourceIndex,
        line,
        column,
        compiled.lineOffsets,
        compiled.tree,
        originalSources
      );
    } else {
      resolvedName = _resolveOriginalName(
        remap.original,
        remap.originalSourceIndex,
        originalSources
      );
    }

    funcResults.set(funcIndex, {
      originalSourceIndex: remap.originalSourceIndex,
      originalLine: remap.originalLine,
      originalColumn: remap.originalColumn,
      name: resolvedName,
    });
  }

  // Frame execution points. Remap line/column and capture the original source
  // file. In most cases this matches the func's original source, but for
  // inlined code it may differ (e.g. a function from utils.ts inlined into
  // app.ts maps frames back to utils.ts).
  for (const frameIndex of framesToSymbolicate) {
    const funcIndex = frameTable.func[frameIndex];
    if ((funcTable.flags[funcIndex] & FuncFlag.HasSource) === 0) {
      continue;
    }
    const sourceIndex = funcTable.source[funcIndex];
    const consumer = sourceMapStore.getConsumer(sourceIndex);
    if (consumer === null) {
      continue;
    }
    const flags = frameTable.flags[frameIndex];
    if (
      (flags & FrameFlag.HasLine) === 0 ||
      (flags & FrameFlag.HasColumn) === 0
    ) {
      continue;
    }
    const line = frameTable.line[frameIndex];
    const column = frameTable.column[frameIndex];
    const remap = _remapPosition(
      sourceIndex,
      consumer,
      line,
      column,
      originalSources
    );
    if (remap === null) {
      continue;
    }
    frameResults.set(frameIndex, {
      originalSourceIndex: remap.originalSourceIndex,
      originalLine: remap.originalLine,
      originalColumn: remap.originalColumn,
    });
  }

  if (funcResults.size === 0 && frameResults.size === 0) {
    return null;
  }

  return {
    funcResults,
    frameResults,
    originalSources: originalSources.sources,
  };
}

/**
 * Remap a single (line, column) in the bundle `generatedSource` through its
 * source map. Returns the original source's index in `originalSources`
 * (adding it the first time it's seen) plus 1-based line/column (Gecko
 * convention), or null when the source map has no mapping at that position.
 *
 * Gecko line/column are 1-based. source-map expects 0-based columns and
 * returns 0-based columns; we convert in both directions here so callers
 * stay in Gecko's convention.
 */
function _remapPosition(
  generatedSource: IndexIntoSourceTable,
  consumer: SourceMapConsumer,
  line: number,
  column: number,
  originalSources: OriginalSourceList
): {
  originalSourceIndex: IndexIntoOriginalSources;
  originalLine: number;
  originalColumn: number;
  original: OriginalPosition;
} | null {
  return _remapOriginalPosition(
    generatedSource,
    consumer,
    consumer.originalPositionFor({ line, column: column - 1 }),
    originalSources
  );
}

/**
 * Like _remapPosition, but for a position that has already been looked up
 * in the source map.
 */
function _remapOriginalPosition(
  generatedSource: IndexIntoSourceTable,
  consumer: SourceMapConsumer,
  original: NullableMappedPosition,
  originalSources: OriginalSourceList
): {
  originalSourceIndex: IndexIntoOriginalSources;
  originalLine: number;
  originalColumn: number;
  original: OriginalPosition;
} | null {
  if (original.source === null || original.line === null) {
    return null;
  }

  return {
    originalSourceIndex: originalSources.indexFor(
      generatedSource,
      consumer,
      original.source
    ),
    originalLine: original.line,
    originalColumn: (original.column ?? 0) + 1,
    original: original as OriginalPosition,
  };
}

function _isSameOriginalPosition(
  a: NullableMappedPosition,
  b: NullableMappedPosition
): boolean {
  return a.source === b.source && a.line === b.line && a.column === b.column;
}

/**
 * Returns the first mapping whose generated position is in [from, to), or
 * null if there's none. Positions are 0-based.
 *
 * The source map library doesn't return the generated position of a
 * mapping, and its lookups don't cross lines. So on each line, a
 * least-upper-bound lookup finds the first mapping at or after the start.
 * On the last line, that mapping is only in the range if a
 * greatest-lower-bound lookup at the end of the range finds a mapping which
 * isn't the one before the start.
 */
function _firstMappingInRange(
  consumer: SourceMapConsumer,
  from: { line: number; col: number },
  to: { line: number; col: number }
): OriginalPosition | null {
  for (let line = from.line; line <= to.line; line++) {
    const col = line === from.line ? from.col : 0;
    if (line === to.line && col >= to.col) {
      return null;
    }
    const first = consumer.originalPositionFor({
      line: line + 1,
      column: col,
      bias: LibSourceMapConsumer.LEAST_UPPER_BOUND,
    });
    if (first.source === null || first.line === null) {
      continue;
    }
    if (line < to.line) {
      return first as OriginalPosition;
    }
    const last = consumer.originalPositionFor({
      line: line + 1,
      column: to.col - 1,
    });
    if (last.source === null) {
      return null;
    }
    if (col > 0) {
      const beforeStart = consumer.originalPositionFor({
        line: line + 1,
        column: col - 1,
      });
      if (_isSameOriginalPosition(last, beforeStart)) {
        return null;
      }
    }
    return first as OriginalPosition;
  }
  return null;
}

// The number of positions that _mostCommonSourceInRange looks up.
const SOURCE_SAMPLE_COUNT = 16;

/**
 * Returns the original file that most of the code in [from, to) maps to,
 * by looking up positions spread over the range. Lookups that return
 * `inherited`, the mapping of the code before the range, are ignored.
 */
function _mostCommonSourceInRange(
  consumer: SourceMapConsumer,
  inherited: NullableMappedPosition,
  from: number,
  to: number,
  lineOffsets: number[]
): string | null {
  const counts = new Map<string, number>();
  let mostCommonSource = null;
  let mostCommonCount = 0;
  const step = Math.max(1, (to - from) / SOURCE_SAMPLE_COUNT);
  for (let offset = from; offset < to; offset += step) {
    const pos = offsetToLineCol(Math.floor(offset), lineOffsets);
    const sample = consumer.originalPositionFor({
      line: pos.line + 1,
      column: pos.col,
    });
    if (sample.source === null || _isSameOriginalPosition(sample, inherited)) {
      continue;
    }
    const count = (counts.get(sample.source) ?? 0) + 1;
    counts.set(sample.source, count);
    if (count > mostCommonCount) {
      mostCommonSource = sample.source;
      mostCommonCount = count;
    }
  }
  return mostCommonSource;
}

/**
 * Returns the original position of a function, given `glb`, the mapping
 * that a lookup at the function's position returned.
 *
 * Most bundlers emit a mapping right at the start of each function. When
 * they don't, the lookup returns the mapping of the code before the
 * function, which can be outside of the function in the original source,
 * or even in a different file. For example, Vue compiles a component's
 * template to a render function that <script setup> returns, and the render
 * function's position maps to the last token of the script. And an arrow
 * function in `computed(() => count.value)` can map to `computed`.
 *
 * In that case, this uses the first mapping in the function's own code,
 * i.e. before any nested function. The original mapping is kept if it's in
 * the original function that contains the first mapping, because then it's
 * probably the start of that function, which is more precise. It's also kept
 * if the first mapping is in a different file, but most of the function's
 * own code is in the file of the original mapping.
 */
function _originalPositionForFunction(
  generatedSource: IndexIntoSourceTable,
  consumer: SourceMapConsumer,
  glb: NullableMappedPosition,
  line: number,
  column: number,
  compiled: ParsedSource,
  originalSources: OriginalSourceList
): NullableMappedPosition {
  // Gecko uses 1-based line/column.
  const pos = { line: line - 1, col: column - 1 };
  if (glb.source !== null && _isExactSourceMapEntry(consumer, pos, glb)) {
    return glb;
  }
  const funcOffset = lineColToOffset(pos.line, pos.col, compiled.lineOffsets);
  const scopePath = findInnermostFunctionScope(compiled.tree, funcOffset);
  if (scopePath === null) {
    return glb;
  }
  const scope = scopePath[0];
  const firstChild = scope.children.find((child) => child.start > funcOffset);
  const ownCodeEnd = firstChild?.start ?? scope.end;
  const first = _firstMappingInRange(
    consumer,
    pos,
    offsetToLineCol(ownCodeEnd, compiled.lineOffsets)
  );
  if (first === null) {
    return glb;
  }
  if (glb.source === null || glb.line === null) {
    return first;
  }
  if (glb.source !== first.source) {
    // The first mapping can be in a different file if a bundler inlined a
    // function call there. So only use it if most of the function's own code
    // isn't in the file of `glb`.
    const mostCommonSource = _mostCommonSourceInRange(
      consumer,
      glb,
      funcOffset,
      ownCodeEnd,
      compiled.lineOffsets
    );
    return mostCommonSource === glb.source ? glb : first;
  }

  const parsed = originalSources.getParsed(
    originalSources.indexFor(generatedSource, consumer, first.source)
  );
  if (parsed === null) {
    // Without the original source, there's no way to tell which position is
    // better, so keep the position of the lookup.
    return glb;
  }
  const firstPath = findInnermostFunctionScope(
    parsed.tree,
    lineColToOffset(first.line - 1, first.column ?? 0, parsed.lineOffsets)
  );
  if (firstPath !== null) {
    const glbOffset = lineColToOffset(
      glb.line - 1,
      glb.column ?? 0,
      parsed.lineOffsets
    );
    const { start, end } = firstPath[0];
    if (start <= glbOffset && glbOffset < end) {
      return glb;
    }
  }
  return first;
}

/**
 * Resolve the original function name.
 *
 * Resolution order:
 *  1. Look the function up in the **original** source (parsed from the
 *     source map's sourcesContent). If the innermost scope at that position
 *     has its own `astName` (i.e. it's a named function declaration / named
 *     function expression / method / property), that name wins. This is what
 *     recovers names that the minifier stripped (e.g. esbuild drops
 *     `function mapToPropsProxy()` to `function()` when the inner name isn't
 *     self-referenced).
 *  2. Otherwise probe the compiled-source scope tree at each
 *     `nameMappingLocation` with an exact source-map lookup, falling back to
 *     the compiled scope's `astName`.
 *
 * The Nonymous-style ancestor chain (`outer/.../local`) is only emitted when
 * the local segment doesn't fully express the function's identity on its
 * own: either the local is anonymous, "contributes to" the target (passed
 * through a wrapping call/`new`, gets `<`), or is a computed-member
 * expression (`receiver[key]`). A simple named direct assignment
 * (`var x = anonFn`) returns just `x`, matching SpiderMonkey's output.
 *
 * For computed-member assignments (`obj[key] = fn`), `scope.computedKeyLoc`
 * triggers a second source-map probe so the resolved name is composed as
 * `${receiver}[${key}]`.
 *
 * Returns null if no name could be determined.
 */
function _resolveFunctionName(
  consumer: SourceMapConsumer,
  original: OriginalPosition,
  originalSourceIndex: IndexIntoOriginalSources,
  line: number,
  column: number,
  lineOffsets: number[],
  scopeTree: FunctionScope[],
  originalSources: OriginalSourceList
): string | null {
  // 1. Original-source name lookup. Prefers the function's own declared
  //    identifier, falling back to the verbatim LHS text of the surrounding
  //    assignment. When it produces a simple (non-member) name, we return
  //    immediately. When it's member-style (`Foo.prototype.bar` / `obj[key]`),
  //    we keep it but drop into the chain branch below so the result carries
  //    the enclosing function, matching SpiderMonkey's output shape (e.g.
  //    `outer/Foo.prototype.bar`).
  const originalName = _resolveOriginalName(
    original,
    originalSourceIndex,
    originalSources
  );
  if (originalName !== null && !_isMemberStyleName(originalName)) {
    return originalName;
  }

  // Gecko uses 1-based line/column. Convert to 0-based for char-offset math.
  const funcOffset = lineColToOffset(line - 1, column - 1, lineOffsets);
  // scopePath[0] = innermost scope, scopePath[1..] = ancestors (nearest first).
  const scopePath = findInnermostFunctionScope(scopeTree, funcOffset);

  if (scopePath === null) {
    return originalName;
  }

  const scope = scopePath[0];
  const ancestors = scopePath.slice(1);

  // Use the original-source name if available. Otherwise fall back to
  // compiled-source resolution. Skipping the compiled path when the original
  // source already named the function avoids reapplying computed-member
  // composition on top of an `lhsText` of `obj[key]` (would double brackets).
  const resolvedName =
    originalName ??
    _resolveCompiledName(scope, funcOffset, consumer, original, lineOffsets);

  // Bare named local. Return it without the ancestor chain. Covers
  // simple named function declarations (`function foo(){}`), named
  // function expressions, and direct variable assignments
  // (`var foo = function() {}` / `var foo = () => {}`). Matches SpiderMonkey's
  // NameFunctions output, which only prefixes the chain when the local
  // segment doesn't fully express the function's identity (anonymous,
  // contributes-to, computed-member, or any other member-style name where
  // the receiver references an outer-scope identifier).
  const needsChain =
    resolvedName === null ||
    scope.contributesTo ||
    scope.computedKeyLoc !== null ||
    _isMemberStyleName(resolvedName);
  if (!needsChain) {
    return resolvedName;
  }

  // Build the ancestor chain. Walk innermost-first and keep:
  //   - the immediate parent (always, even if anonymous: the local being
  //     directly nested inside an IIFE is useful context).
  //   - every named ancestor above it (i.e. anything that resolves to a
  //     real identifier via the source map or AST).
  // Skip non-immediate anonymous wrappers. This matches SpiderMonkey's
  // output for bundled UMD code where the function we care about lives
  // inside a few anonymous IIFEs. Gecko emits e.g. `ewH8/</local`, not
  // `</</</local`. If no named ancestor is found anywhere, drop the chain
  // entirely: a string of leading `<` segments adds noise without info.
  const ancestorSegments: NonymousSegment[] = [];
  let anyNamedAncestor = false;
  for (let i = 0; i < ancestors.length; i++) {
    const segment = _resolveAncestorSegment(
      ancestors[i],
      consumer,
      lineOffsets
    );
    if (segment.kind === 'named') {
      anyNamedAncestor = true;
      ancestorSegments.push(segment);
    } else if (i === 0) {
      // Immediate parent, anonymous. Keep it so the local clearly reads
      // as nested inside something.
      ancestorSegments.push(segment);
    }
    // Otherwise: non-immediate anonymous wrapper, skip.
  }
  if (!anyNamedAncestor) {
    ancestorSegments.length = 0;
  }

  const local: NonymousSegment =
    resolvedName !== null
      ? {
          kind: 'named',
          name: resolvedName,
          contributesTo: scope.contributesTo,
        }
      : { kind: 'anonymous' };

  // Nothing useful to emit: no innermost name and no named ancestor.
  if (
    local.kind === 'anonymous' &&
    !ancestorSegments.some((s) => s.kind === 'named')
  ) {
    return null;
  }

  return serializeNonymousName([...ancestorSegments.reverse(), local]);
}

/**
 * True when the resolved name has property-access structure
 * (`obj.foo`, `Foo.prototype.bar`, `obj[key]`, `arr[0]`, ...). The receiver
 * in those names references an outer-scope identifier, so the result is
 * only fully meaningful with the enclosing scope chain prefixed,
 * matching SpiderMonkey's `outer/Foo.prototype.bar` shape.
 *
 * Plain `foo` / `_foo` / `$foo` stay bare.
 */
function _isMemberStyleName(name: string): boolean {
  return name.includes('.') || name.includes('[');
}

/**
 * Probe a single offset in the compiled source: convert to line/col, look it
 * up through the source map, and return the mapping's `name` only when the
 * mapping is "exact" at that offset. Returns null on any miss.
 */
function _probeExactName(
  consumer: SourceMapConsumer,
  locOffset: number,
  lineOffsets: number[]
): string | null {
  const pos = offsetToLineCol(locOffset, lineOffsets);
  // source-map's originalPositionFor uses 1-based lines, 0-based columns.
  const glb = consumer.originalPositionFor({
    line: pos.line + 1,
    column: pos.col,
  });
  if (
    glb.source === null ||
    glb.name === null ||
    !_isExactSourceMapEntry(consumer, pos, glb)
  ) {
    return null;
  }
  return glb.name;
}

/**
 * Compiled-source name resolution: walk the scope's `nameMappingLocations`
 * with exact source-map probes, fall back to `scope.astName`, and finally
 * compose `${receiver}[${key}]` when the scope came from a computed-member
 * assignment.
 *
 * Probe strategy depends on scope kind:
 *
 * Regular functions (FunctionDeclaration / FunctionExpression / method):
 *   Try `funcOffset` first with a relaxed accept rule (the mapping returned by
 *   the GLB lookup at funcOffset just has to resolve to the same original
 *   position as the function itself). esbuild often emits a wide mapping there
 *   so the stricter "exact entry" check (GLB(pos) != GLB(pos - 1), see
 *   `_isExactSourceMapEntry`) fails even though the mapping IS for this
 *   function. `nameMappingLocations` then use that stricter exact check.
 *
 * Arrow functions:
 *   `funcOffset` sits at the parameter/arrow position, not a function
 *   identifier. For renamed params (`profile` -> `e`), the GLB lookup there
 *   returns the parameter name. Skip funcOffset and probe
 *   `nameMappingLocations` only.
 */
function _resolveCompiledName(
  scope: FunctionScope,
  funcOffset: number,
  consumer: SourceMapConsumer,
  original: OriginalPosition,
  lineOffsets: number[]
): string | null {
  let resolvedName: string | null = null;

  if (scope.kind === 'function') {
    const pos = offsetToLineCol(funcOffset, lineOffsets);
    const glb = consumer.originalPositionFor({
      line: pos.line + 1,
      column: pos.col,
    });
    if (
      glb.name !== null &&
      glb.source === original.source &&
      glb.line === original.line &&
      glb.column !== null &&
      glb.column === original.column
    ) {
      resolvedName = glb.name;
    }
  }

  if (resolvedName === null) {
    for (const locOffset of scope.nameMappingLocations) {
      const name = _probeExactName(consumer, locOffset, lineOffsets);
      if (name !== null) {
        resolvedName = name;
        break;
      }
    }
  }

  // Chrome fallback: if no probe yielded a named entry, use the AST identifier
  // (the compiled name). No-op for renamed functions. Resolves unminified
  // methods that the source map didn't tag with a name.
  if (resolvedName === null) {
    resolvedName = scope.astName;
  }

  // Computed-member assignment (`obj[key] = fn`): compose `${receiver}[${key}]`.
  // Fall back to just the receiver if the key isn't resolvable.
  if (resolvedName !== null && scope.computedKeyLoc !== null) {
    const keyName = _probeExactName(
      consumer,
      scope.computedKeyLoc,
      lineOffsets
    );
    if (keyName !== null) {
      resolvedName = `${resolvedName}[${keyName}]`;
    }
  }

  return resolvedName;
}

/**
 * Look up the function at `original.line` / `original.column` in the original
 * source (parsed lazily and cached) and return a name derived from its scope.
 *
 * Resolution preference, highest to lowest:
 *   1. `astName`: the function's own declared identifier (named function
 *      declaration / named function expression / method / property key).
 *      Recovers names that minifiers strip, e.g. esbuild dropping
 *      `function bar()` to `function()` when `bar` isn't self-referenced.
 *   2. `lhsText`: the verbatim source text of the assignment-target LHS
 *      when the function was inferred from one. The original source is
 *      preserved in the source map's `sourcesContent`, so this carries
 *      the original (un-minified) member chain: `Watcher.prototype.run`,
 *      `this.eventPool_.createObject`, `obj[key]`, etc.
 *
 * Returns null if the original source isn't embedded, the parsed tree has
 * no function containing the position, or the innermost scope has neither
 * an `astName` nor an `lhsText`.
 */
function _resolveOriginalName(
  original: OriginalPosition,
  originalSourceIndex: IndexIntoOriginalSources,
  originalSources: OriginalSourceList
): string | null {
  const entry = originalSources.getParsed(originalSourceIndex);
  if (entry === null) {
    return null;
  }
  // source-map's original.line is 1-based, column is 0-based.
  const offset = lineColToOffset(
    original.line - 1,
    original.column ?? 0,
    entry.lineOffsets
  );
  const path = findInnermostFunctionScope(entry.tree, offset);
  if (path === null) {
    return null;
  }
  const scope = path[0];
  return scope.astName ?? scope.lhsText;
}

/**
 * Resolve a NonymousSegment for an ancestor scope: probe its mapping
 * locations, then fall back to its AST name. Propagates `contributesTo`
 * from the scope itself so wrap-pattern ancestors surface with the `<`
 * suffix (e.g. the outer `i2<` in `i2</fr/<`).
 */
function _resolveAncestorSegment(
  scope: FunctionScope,
  consumer: SourceMapConsumer,
  lineOffsets: number[]
): NonymousSegment {
  for (const locOffset of scope.nameMappingLocations) {
    const name = _probeExactName(consumer, locOffset, lineOffsets);
    if (name !== null) {
      return { kind: 'named', name, contributesTo: scope.contributesTo };
    }
  }
  if (scope.astName !== null) {
    return {
      kind: 'named',
      name: scope.astName,
      contributesTo: scope.contributesTo,
    };
  }
  return { kind: 'anonymous' };
}

/**
 * Append a SourceTable entry for an original source from a worker response.
 */
function _addOriginalSource(
  sources: SourceTable,
  stringTable: StringTable,
  { generatedSource, url, content }: OriginalSource
): IndexIntoSourceTable {
  const index = sources.length;
  sources.id.push(null);
  sources.filename.push(stringTable.indexForString(url));
  // Original source files from source maps don't have start line/column.
  sources.startLine.push(1);
  sources.startColumn.push(1);
  sources.sourceMapURL.push(null);
  sources.content.push(content);
  sources.generatedSource.push(generatedSource);
  sources.length++;
  return index;
}

/**
 * End-to-end source map symbolication runner: build the SourceMapStore, run
 * symbolication, and return a WorkerOutput carrying a position-keyed response.
 *
 * The worker only reads from `input` — no tables or string arrays are mutated.
 * The main thread translates the response into new tables via
 * applySourceMapSymbolicationResponse, against the latest shared state.
 */
export async function runSourceMapSymbolicationCore(
  input: WorkerInput,
  wasmUrl: string
): Promise<WorkerOutput> {
  let sourceMapStore: SourceMapStore | null = null;
  try {
    const {
      resolvedSourceMaps,
      compiledSources,
      funcTable,
      frameTable,
      sourceLocationTable,
      sources,
      stringArray,
    } = input;

    sourceMapStore = await SourceMapStore.create(resolvedSourceMaps, wasmUrl);
    const response = symbolicateWithSourceMaps(
      { frameTable, funcTable, sourceLocationTable, sources, stringArray },
      sourceMapStore,
      compiledSources
    );

    if (response === null) {
      return { type: 'no-op' };
    }

    return { type: 'success', response };
  } catch (err) {
    return {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (sourceMapStore !== null) {
      sourceMapStore.destroy();
    }
  }
}

/**
 * Apply a worker-produced SourceMapSymbolicationResponse against the current
 * shared tables and return new ones. This is the main-thread complement to
 * the worker: it allocates the source-table and sourceLocationTable indices,
 * and interns names into the string table.
 *
 * Reading current state at apply time (rather than reusing the snapshot the
 * worker started from) makes concurrent worker runs compose correctly: a
 * second result landing after a first never undoes the first's writes,
 * because each apply step skips funcs/frames that already have a
 * sourceLocationTable row.
 *
 * Idempotency relies on funcIndex/frameIndex being stable across concurrent
 * runs. JS source-map symbolication only appends to sourceLocationTable,
 * sources, and stringArray — it never adds funcs or frames. If a future
 * change adds funcs/frames during symbolication, this contract needs
 * revisiting.
 *
 * Returns null when nothing applied (every response entry collided with
 * a row that's already populated).
 */
export function applySourceMapSymbolicationResponse(
  shared: RawProfileSharedData,
  response: SourceMapSymbolicationResponse
): {
  newFuncTable: RawFuncTable;
  newFrameTable: RawFrameTable;
  newSourceLocationTable: SourceLocationTable;
  newSources: SourceTable;
  newStringArray: string[];
} | null {
  const { funcTable, frameTable, sourceLocationTable, sources, stringArray } =
    shared;

  const newFuncTable = getRawFuncTableBuilderWithExistingContents(funcTable);
  const newFrameTable = getRawFrameTableBuilderWithExistingContents(frameTable);
  const newSourceLocationTable =
    shallowCloneSourceLocationTable(sourceLocationTable);
  const newSources = _shallowCloneSourceTable(sources);
  const newStringArray = stringArray.slice();
  const stringTable = StringTable.withBackingArray(newStringArray);

  // Source-table index for each of the response's original sources, or null
  // until a func or frame that refers to it is applied. Entries are only
  // added for applied results, so an entry whose results were all applied by
  // an earlier run adds no row. Existing rows are never reused: a bundle's
  // funcs and frames are normally all symbolicated by the same run, so an
  // earlier run doesn't leave rows that this one could share.
  const responseToSourceIndex: Array<IndexIntoSourceTable | null> =
    response.originalSources.map(() => null);
  function sourceIndexFor(
    originalSourceIndex: IndexIntoOriginalSources
  ): IndexIntoSourceTable {
    let sourceIndex = responseToSourceIndex[originalSourceIndex];
    if (sourceIndex === null) {
      sourceIndex = _addOriginalSource(
        newSources,
        stringTable,
        response.originalSources[originalSourceIndex]
      );
      responseToSourceIndex[originalSourceIndex] = sourceIndex;
    }
    return sourceIndex;
  }

  let applied = 0;

  for (const [funcIndex, resolution] of response.funcResults) {
    // A concurrent run got here first. Skip the whole entry: the row and
    // the name go together; writing a name without a sourceLocationTable row
    // would be inconsistent.
    if ((newFuncTable.flags[funcIndex] & FuncFlag.HasOriginalLocation) !== 0) {
      continue;
    }
    const sourceIndex = sourceIndexFor(resolution.originalSourceIndex);
    const rowIndex = newSourceLocationTable.length;
    newSourceLocationTable.source.push(sourceIndex);
    newSourceLocationTable.line.push(resolution.originalLine);
    newSourceLocationTable.column.push(resolution.originalColumn);
    newSourceLocationTable.length++;
    newFuncTable.originalLocation[funcIndex] = rowIndex;
    newFuncTable.flags[funcIndex] |= FuncFlag.HasOriginalLocation;
    if (resolution.name !== null) {
      newFuncTable.name[funcIndex] = stringTable.indexForString(
        resolution.name
      );
    }
    applied++;
  }

  for (const [frameIndex, resolution] of response.frameResults) {
    if (
      (newFrameTable.flags[frameIndex] & FrameFlag.HasOriginalLocation) !==
      0
    ) {
      continue;
    }
    const sourceIndex = sourceIndexFor(resolution.originalSourceIndex);
    const rowIndex = newSourceLocationTable.length;
    newSourceLocationTable.source.push(sourceIndex);
    newSourceLocationTable.line.push(resolution.originalLine);
    newSourceLocationTable.column.push(resolution.originalColumn);
    newSourceLocationTable.length++;
    newFrameTable.originalLocation[frameIndex] = rowIndex;
    newFrameTable.flags[frameIndex] |= FrameFlag.HasOriginalLocation;
    applied++;
  }

  if (applied === 0) {
    return null;
  }

  return {
    newFuncTable: finishRawFuncTableBuilder(newFuncTable),
    newFrameTable: finishRawFrameTableBuilder(newFrameTable),
    newSourceLocationTable,
    newSources,
    newStringArray,
  };
}

function _shallowCloneSourceTable(sources: SourceTable): SourceTable {
  return {
    id: sources.id.slice(),
    filename: sources.filename.slice(),
    startLine: sources.startLine.slice(),
    startColumn: sources.startColumn.slice(),
    sourceMapURL: sources.sourceMapURL.slice(),
    content: sources.content.slice(),
    generatedSource: sources.generatedSource.slice(),
    length: sources.length,
  };
}
