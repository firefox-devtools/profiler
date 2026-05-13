/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JS source map symbolication. Maps generated (compiled/bundled) JS positions
 * back to their original source files, lines, and columns using source maps
 * that were fetched at profile load time.
 *
 * Key design: source file comes from funcTable (func → source), frames only
 * carry line/column. The sourceMapInfo table stores the mapping results.
 *
 * Function name resolution uses the scope-tree approach: build a @lezer/javascript
 * parse tree of the compiled source, find the innermost
 * function scope that contains the function's start position, then probe each
 * `nameMappingLocation` with an exact source-map lookup. The first probe that
 * yields a named entry wins. This handles arrow functions and method
 * definitions that the plain `original.name` lookup often misses.
 */

import {
  shallowCloneFuncTable,
  shallowCloneFrameTable,
} from './data-structures';
import { StringTable } from '../utils/string-table';
import {
  parseJsScopeTree,
  findInnermostFunctionScope,
  buildLineOffsets,
  offsetToLineCol,
  lineColToOffset,
} from './source-map-scope-tree';
import { serializeNonymousName } from './nonymous';
import type { NonymousSegment } from './nonymous';
import type { FunctionScope } from './source-map-scope-tree';
import type {
  RawProfileSharedData,
  IndexIntoSourceTable,
  IndexIntoFuncTable,
  IndexIntoFrameTable,
  FuncTable,
  FrameTable,
  SourceMapInfoTable,
  SourceTable,
} from '../types';
import type { NullableMappedPosition } from 'source-map';
import type { SourceMapStore, SourceMapConsumer } from './source-map-store';

// NullableMappedPosition with source and line guaranteed non-null (checked
// before any source-map lookup).
type OriginalPosition = NullableMappedPosition & {
  source: string;
  line: number;
};

export type SourceMapSymbolicationResult = {
  newFuncTable: FuncTable;
  newFrameTable: FrameTable;
  newSourceMapInfo: SourceMapInfoTable;
};

// The subset of RawProfileSharedData that symbolicateWithSourceMaps reads.
// Other shared fields (stackTable, resourceTable, nativeSymbols) are not
// touched, so callers (e.g. the worker) can supply just this subset.
export type SourceMapSymbolicationInput = Pick<
  RawProfileSharedData,
  'frameTable' | 'funcTable' | 'sourceMapInfo' | 'sources' | 'stringArray'
>;

/**
 * Run JS source map symbolication on the profile's shared tables. All threads
 * share the same frameTable/funcTable, so symbolication runs once for the whole
 * profile rather than once per thread.
 *
 * `compiledSources` maps each bundle's IndexIntoSourceTable to its full source
 * text (fetched from the browser). When present, it enables scope-tree-based
 * function name resolution. If absent for a given source, the fallback is the
 * `name` field from the plain GLB source-map lookup.
 *
 * Returns null if no mappings were applied.
 */
export function symbolicateWithSourceMaps(
  shared: SourceMapSymbolicationInput,
  sourceMapStore: SourceMapStore,
  compiledSources: Map<IndexIntoSourceTable, string> = new Map()
): SourceMapSymbolicationResult | null {
  const { funcsToSymbolicate, framesToSymbolicate } = _identifyToSymbolicate(
    shared.frameTable,
    shared.funcTable,
    shared.sources
  );

  if (funcsToSymbolicate.length === 0 && framesToSymbolicate.length === 0) {
    return null;
  }

  return _applySourceMapSymbolication(
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
  frameTable: FrameTable,
  funcTable: FuncTable,
  sources: SourceTable
): {
  funcsToSymbolicate: IndexIntoFuncTable[];
  framesToSymbolicate: IndexIntoFrameTable[];
} {
  const funcsToSymbolicate: IndexIntoFuncTable[] = [];
  const framesToSymbolicate: IndexIntoFrameTable[] = [];
  const processedFuncs = new Set<IndexIntoFuncTable>();

  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    const funcIndex = frameTable.func[frameIndex];

    if (!funcTable.isJS[funcIndex]) {
      continue;
    }

    const sourceIndex = funcTable.source[funcIndex];
    if (sourceIndex === null) {
      continue;
    }

    if (sources.sourceMapURL[sourceIndex] === null) {
      continue;
    }

    // Process the function definition only once.
    if (
      !processedFuncs.has(funcIndex) &&
      funcTable.sourceMapInfo[funcIndex] === null
    ) {
      const funcLine = funcTable.lineNumber[funcIndex];
      const funcCol = funcTable.columnNumber[funcIndex];
      if (funcLine !== null && funcCol !== null) {
        funcsToSymbolicate.push(funcIndex);
        processedFuncs.add(funcIndex);
      }
    }

    // Process the frame's execution point.
    if (
      frameTable.sourceMapInfo[frameIndex] === null &&
      frameTable.line[frameIndex] !== null &&
      frameTable.column[frameIndex] !== null
    ) {
      framesToSymbolicate.push(frameIndex);
    }
  }

  return { funcsToSymbolicate, framesToSymbolicate };
}

/**
 * Return true if the source-map has an exact entry at `pos` (0-based col).
 * Approximated by: GLB(col) resolves differently from GLB(col-1).
 * Always returns true when col === 0 (no predecessor to compare against).
 *
 * TODO: This approximation produces false negatives when two consecutive
 * source-map mappings resolve to the same original position (GLB(col) ==
 * GLB(col-1) even though col is an exact entry). If this causes incorrect
 * function names in practice, replace with a direct mapping-entry lookup
 * once the source-map library exposes that API.
 */
function _isExactSourceMapEntry(
  consumer: SourceMapConsumer,
  pos: { line: number; col: number },
  glb: { source: string | null; line: number | null; column: number | null }
): boolean {
  if (pos.col === 0) {
    return true;
  }
  const prev = consumer.originalPositionFor({
    line: pos.line + 1,
    column: pos.col - 1,
  });
  return (
    prev.source !== glb.source ||
    prev.line !== glb.line ||
    prev.column !== glb.column
  );
}

/**
 * Apply source map lookups to produce new funcTable, frameTable, and
 * sourceMapInfo table. Positions with no mapping in the source map are skipped.
 * Returns null if no mappings were actually applied (e.g. no consumers available).
 */
function _applySourceMapSymbolication(
  shared: SourceMapSymbolicationInput,
  funcsToSymbolicate: IndexIntoFuncTable[],
  framesToSymbolicate: IndexIntoFrameTable[],
  sourceMapStore: SourceMapStore,
  compiledSources: Map<IndexIntoSourceTable, string>
): SourceMapSymbolicationResult | null {
  const { frameTable, funcTable, sourceMapInfo, sources, stringArray } = shared;

  // funcTable, frameTable, and sourceMapInfo are cloned because we overwrite
  // values at existing indices (e.g. funcTable.name[i], frameTable.sourceMapInfo[i]).
  //
  // sources and stringArray are *not* cloned: they're append-only here
  // (_findOrCreateSource pushes new entries; StringTable.withBackingArray pushes
  // newly interned strings). This function only runs inside the source map worker,
  // which received its own structured-cloned copies — so mutating them in place
  // is safe for the main thread, and the worker hands the mutated arrays back
  // through WorkerOutput.
  const newFuncTable = shallowCloneFuncTable(funcTable);
  const newFrameTable = shallowCloneFrameTable(frameTable);
  const newSourceMapInfo: SourceMapInfoTable = {
    originalSource: [...sourceMapInfo.originalSource],
    originalLine: [...sourceMapInfo.originalLine],
    originalColumn: [...sourceMapInfo.originalColumn],
    length: sourceMapInfo.length,
  };

  const stringTable = StringTable.withBackingArray(stringArray);

  // Lookup map for _findOrCreateSource: filename string index to source index,
  // covering all existing null-id (original source) entries. Updated in place
  // as new entries are appended, making each lookup O(1) instead of O(n).
  const sourceByFilename = new Map<number, IndexIntoSourceTable>();
  for (let i = 0; i < sources.length; i++) {
    if (sources.id[i] === null) {
      sourceByFilename.set(sources.filename[i], i);
    }
  }

  // Per-source caches built lazily from compiledSources.
  const scopeTreeCache = new Map<IndexIntoSourceTable, FunctionScope>();
  const lineOffsetsCache = new Map<IndexIntoSourceTable, number[]>();

  // 1. Symbolicate function definitions — these get an original source file.
  for (const funcIndex of funcsToSymbolicate) {
    const sourceIndex = funcTable.source[funcIndex];
    if (sourceIndex === null) {
      continue;
    }
    const consumer = sourceMapStore.getConsumer(sourceIndex);
    if (consumer === null) {
      continue;
    }

    const line = funcTable.lineNumber[funcIndex];
    const column = funcTable.columnNumber[funcIndex];
    if (line === null || column === null) {
      continue;
    }

    // Gecko column numbers are 1-based (oneOriginValue); source-map expects 0-based.
    const original = consumer.originalPositionFor({ line, column: column - 1 });

    if (original.source === null || original.line === null) {
      continue;
    }

    const originalSourceIndex = _findOrCreateSource(
      sources,
      stringTable,
      original.source,
      sourceByFilename
    );

    // Extract original source content from sourcesContent if not yet seen.
    if (sources.content[originalSourceIndex] === null) {
      // nullOnMissing=true: return null instead of throwing if not present.
      const content = consumer.sourceContentFor(original.source, true);
      if (content !== null) {
        sources.content[originalSourceIndex] = content;
      }
    }

    const sourceMapInfoIndex = newSourceMapInfo.length;
    newSourceMapInfo.originalSource.push(originalSourceIndex);
    newSourceMapInfo.originalLine.push(original.line);
    // source-map columns are 0-based; convert to 1-based to match Gecko convention.
    newSourceMapInfo.originalColumn.push((original.column ?? 0) + 1);
    newSourceMapInfo.length++;

    newFuncTable.sourceMapInfo[funcIndex] = sourceMapInfoIndex;

    // Scope-tree name resolution requires the compiled source text. If it's
    // unavailable (e.g. the fetch failed), skip name resolution and keep the
    // Gecko-assigned name; position remapping above already succeeded.
    const compiledText = compiledSources.get(sourceIndex);
    if (compiledText !== undefined) {
      let lineOffsets = lineOffsetsCache.get(sourceIndex);
      if (lineOffsets === undefined) {
        lineOffsets = buildLineOffsets(compiledText);
        lineOffsetsCache.set(sourceIndex, lineOffsets);
      }
      let scopeTree = scopeTreeCache.get(sourceIndex);
      if (scopeTree === undefined) {
        scopeTree = parseJsScopeTree(compiledText);
        scopeTreeCache.set(sourceIndex, scopeTree);
      }

      const resolvedName = _resolveFunctionName(
        consumer,
        original as OriginalPosition,
        line,
        column,
        lineOffsets,
        scopeTree
      );
      if (resolvedName) {
        newFuncTable.name[funcIndex] = stringTable.indexForString(resolvedName);
      }
    }
  }

  // 2. Symbolicate frame execution points — remap line/column and capture the
  //    original source file. In most cases this matches the func's original
  //    source, but for inlined code it may differ (e.g. a function from
  //    utils.ts inlined into app.ts maps frames back to utils.ts).
  for (const frameIndex of framesToSymbolicate) {
    const sourceIndex = funcTable.source[frameTable.func[frameIndex]];
    if (sourceIndex === null) {
      continue;
    }
    const consumer = sourceMapStore.getConsumer(sourceIndex);
    if (consumer === null) {
      continue;
    }

    const line = frameTable.line[frameIndex];
    const column = frameTable.column[frameIndex];
    if (line === null || column === null) {
      continue;
    }

    // Gecko column numbers are 1-based (oneOriginValue); source-map expects 0-based.
    const original = consumer.originalPositionFor({ line, column: column - 1 });

    if (original.source === null || original.line === null) {
      continue;
    }

    const originalSourceIndex = _findOrCreateSource(
      sources,
      stringTable,
      original.source,
      sourceByFilename
    );
    if (sources.content[originalSourceIndex] === null) {
      const content = consumer.sourceContentFor(original.source, true);
      if (content !== null) {
        sources.content[originalSourceIndex] = content;
      }
    }

    const sourceMapInfoIndex = newSourceMapInfo.length;
    newSourceMapInfo.originalSource.push(originalSourceIndex);
    newSourceMapInfo.originalLine.push(original.line);
    // source-map columns are 0-based; convert to 1-based to match Gecko convention.
    newSourceMapInfo.originalColumn.push((original.column ?? 0) + 1);
    newSourceMapInfo.length++;

    newFrameTable.sourceMapInfo[frameIndex] = sourceMapInfoIndex;
  }

  if (newSourceMapInfo.length === sourceMapInfo.length) {
    // No mappings were applied (e.g. no consumers available for these sources).
    return null;
  }

  return { newFuncTable, newFrameTable, newSourceMapInfo };
}

/**
 * Resolve the original function name using the scope tree and source map.
 *
 * Probes each `nameMappingLocation` in the innermost function scope with an
 * exact source-map lookup. If none yields a name, falls back to the AST
 * identifier, then walks ancestor scopes (appending `/<` per anonymous level).
 *
 * Returns null if no name could be determined.
 */
function _resolveFunctionName(
  consumer: SourceMapConsumer,
  original: OriginalPosition,
  line: number,
  column: number,
  lineOffsets: number[],
  scopeTree: FunctionScope
): string | null {
  // Gecko uses 1-based line/column; convert to 0-based for char-offset math.
  const funcOffset = lineColToOffset(line - 1, column - 1, lineOffsets);
  // scopePath[0] = innermost scope, scopePath[1..] = ancestors (nearest first).
  const scopePath = findInnermostFunctionScope(scopeTree, funcOffset);

  if (scopePath === null) {
    return null;
  }

  const scope = scopePath[0];
  const ancestors = scopePath.slice(1);
  let resolvedName: string | null = null;

  // Probe strategy depends on scope kind:
  //
  // Regular functions (FunctionDeclaration / FunctionExpression / method):
  //   Always probe funcOffset first with isForThisFunction: the GLB
  //   mapping covering funcOffset is the function's own mapping. esbuild
  //   often emits a wide mapping there so GLB!=GLB(col-1) fails, but the
  //   mapping IS for this function (same original source/line/col).
  //   nameMappingLocations use the stricter isExact check.
  //
  // Arrow functions:
  //   funcOffset is at the parameter/arrow position, not a function
  //   identifier. For renamed params (e.g. profile → e), GLB there
  //   returns name:"profile" — a parameter name, not a function name.
  //   Only probe nameMappingLocations with isExact to avoid this.
  const isFunctionKind = scope.kind === 'function';
  const probeOffsets = isFunctionKind
    ? [funcOffset, ...scope.nameMappingLocations]
    : scope.nameMappingLocations;

  for (const locOffset of probeOffsets) {
    const pos = offsetToLineCol(locOffset, lineOffsets);
    // source-map's originalPositionFor uses 1-based lines, 0-based columns.
    const glb = consumer.originalPositionFor({
      line: pos.line + 1,
      column: pos.col,
    });

    if (glb.source === null || glb.name === null) {
      continue;
    }

    let accept: boolean;
    if (isFunctionKind && locOffset === funcOffset) {
      // funcOffset for regular functions: accept if the GLB mapping at
      // funcOffset resolves to the same original position as the function.
      accept =
        glb.source === original.source &&
        glb.line === original.line &&
        glb.column === original.column;
    } else {
      // nameMappingLocations (and all arrow probes): require an exact
      // source map entry — approximated by GLB(col) != GLB(col-1).
      accept = _isExactSourceMapEntry(consumer, pos, glb);
    }
    if (accept) {
      resolvedName = glb.name;
      break;
    }
  }
  // Chrome fallback: name ?? node.name — if no probe yielded a named
  // entry, use the AST identifier (the compiled name). For renamed
  // functions this is a no-op; for unminified methods it gives the name.
  if (resolvedName === null && scope.astName !== null) {
    resolvedName = scope.astName;
  }

  // Ancestor walk: if the innermost scope has no name, symbolicate each
  // ancestor independently and compose a full Nonymous name. This handles
  // cases like `a/b/<` where both `a` and `b` have original names, not just
  // the nearest named ancestor.
  if (resolvedName === null) {
    // ancestors is [parent, grandparent, …] — innermost first.
    const ancestorSegments: NonymousSegment[] = ancestors.map((ancestor) => {
      for (const locOffset of ancestor.nameMappingLocations) {
        const pos = offsetToLineCol(locOffset, lineOffsets);
        const glb = consumer.originalPositionFor({
          line: pos.line + 1,
          column: pos.col,
        });
        if (
          glb.source !== null &&
          glb.name !== null &&
          _isExactSourceMapEntry(consumer, pos, glb)
        ) {
          return { kind: 'named', name: glb.name, contributesTo: false };
        }
      }
      if (ancestor.astName !== null) {
        return { kind: 'named', name: ancestor.astName, contributesTo: false };
      }
      return { kind: 'anonymous' };
    });

    if (ancestorSegments.some((s) => s.kind === 'named')) {
      // Reverse to get outermost-first, then append the anonymous local.
      resolvedName = serializeNonymousName({
        scopes: [...ancestorSegments].reverse(),
        local: { kind: 'anonymous' },
      });
    }
  }

  return resolvedName;
}

/**
 * Find an existing SourceTable entry with the given filename, or create a new
 * one. Used to add original source files discovered during symbolication.
 * `sourceByFilename` is a caller-maintained map (filename string index to
 * source index, for null-id entries) that is updated when a new entry is added.
 */
function _findOrCreateSource(
  sources: SourceTable,
  stringTable: StringTable,
  filename: string,
  sourceByFilename: Map<number, IndexIntoSourceTable>
): IndexIntoSourceTable {
  const filenameStrIndex = stringTable.indexForString(filename);

  const existing = sourceByFilename.get(filenameStrIndex);
  if (existing !== undefined) {
    return existing;
  }

  const index = sources.length;
  sources.id.push(null);
  sources.filename.push(filenameStrIndex);
  // Original source files from source maps don't have start line/column.
  sources.startLine.push(1);
  sources.startColumn.push(1);
  sources.sourceMapURL.push(null);
  sources.content.push(null);
  sources.length++;

  sourceByFilename.set(filenameStrIndex, index);
  return index;
}
