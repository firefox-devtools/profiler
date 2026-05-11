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
 * `source-map-scope-tree.ts`. This file is the resolver: it consumes those
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
 * `wrap(...)` is any call/new expression that the source-map-scope-tree
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
  shallowCloneFuncTable,
  shallowCloneFrameTable,
  shallowCloneSourceLocationTable,
} from './data-structures';
import { StringTable } from '../utils/string-table';
import {
  parseJsScopeTree,
  findInnermostFunctionScope,
  dialectForFilename,
} from './source-map-scope-tree';
import {
  buildLineOffsets,
  offsetToLineCol,
  lineColToOffset,
} from '../utils/line-offsets';
import { serializeNonymousName } from './nonymous';
import { SourceMapStore } from './source-map-store';

import type { NonymousSegment } from './nonymous';
import type { FunctionScope } from './source-map-scope-tree';
import type {
  IndexIntoSourceTable,
  IndexIntoFuncTable,
  IndexIntoFrameTable,
  FuncTable,
  FrameTable,
  SourceLocationTable,
  SourceTable,
} from '../types';
import type { NullableMappedPosition } from 'source-map';
import type { SourceMapConsumer } from './source-map-store';
import type { WorkerInput, WorkerOutput } from './source-map-worker-types';

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

export type SourceMapSymbolicationResult = {
  newFuncTable: FuncTable;
  newFrameTable: FrameTable;
  newOriginalLocation: SourceLocationTable;
};

// The subset of RawProfileSharedData that symbolicateWithSourceMaps reads.
// Other shared fields (stackTable, resourceTable, nativeSymbols) are not
// touched, so callers (e.g. the worker) can supply just this subset.
export type SourceMapSymbolicationInput = {
  frameTable: FrameTable;
  funcTable: FuncTable;
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

      if (eligibility === 1 && funcTable.originalLocation[funcIndex] === null) {
        const funcLine = funcTable.lineNumber[funcIndex];
        const funcCol = funcTable.columnNumber[funcIndex];
        if (funcLine !== null && funcCol !== null) {
          funcsToSymbolicate.push(funcIndex);
        }
      }
    }

    if (
      eligibility === 1 &&
      frameTable.originalLocation[frameIndex] === null &&
      frameTable.line[frameIndex] !== null &&
      frameTable.column[frameIndex] !== null
    ) {
      framesToSymbolicate.push(frameIndex);
    }
  }

  return { funcsToSymbolicate, framesToSymbolicate };
}

function _isFuncSymbolicable(
  funcIndex: IndexIntoFuncTable,
  funcTable: FuncTable,
  sources: SourceTable
): boolean {
  if (!funcTable.isJS[funcIndex]) {
    return false;
  }
  const sourceIndex = funcTable.source[funcIndex];
  if (sourceIndex === null) {
    return false;
  }
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
 * Apply source map lookups to produce new funcTable, frameTable, and
 * originalLocation table. Positions with no mapping in the source map are skipped.
 * Returns null if no mappings were actually applied (e.g. no consumers available).
 */
function _applySourceMapSymbolication(
  shared: SourceMapSymbolicationInput,
  funcsToSymbolicate: IndexIntoFuncTable[],
  framesToSymbolicate: IndexIntoFrameTable[],
  sourceMapStore: SourceMapStore,
  compiledSources: Map<IndexIntoSourceTable, string>
): SourceMapSymbolicationResult | null {
  const { frameTable, funcTable, sourceLocationTable, sources, stringArray } =
    shared;

  // funcTable, frameTable, and sourceLocationTable are cloned because we overwrite
  // values at existing indices (e.g. funcTable.name[i], frameTable.originalLocation[i]).
  //
  // sources and stringArray are *not* cloned: they're append-only here
  // (_findOrCreateSource pushes new entries, StringTable.withBackingArray pushes
  // newly interned strings). This function only runs inside the source map worker,
  // which received its own structured-cloned copies, so mutating them in place
  // is safe for the main thread, and the worker hands the mutated arrays back
  // through WorkerOutput.
  const newFuncTable = shallowCloneFuncTable(funcTable);
  const newFrameTable = shallowCloneFrameTable(frameTable);
  const newOriginalLocation =
    shallowCloneSourceLocationTable(sourceLocationTable);

  const stringTable = StringTable.withBackingArray(stringArray);

  // filename string index to source index, covering all existing null-id
  // (original source) entries. Updated in place as new entries are appended.
  const sourceByFilename = new Map<number, IndexIntoSourceTable>();
  for (let i = 0; i < sources.length; i++) {
    if (sources.id[i] === null) {
      sourceByFilename.set(sources.filename[i], i);
    }
  }

  const compiledSourceCache = new Map<IndexIntoSourceTable, ParsedSource>();

  // Parsed scope tree + line offsets of original sources we've seen. Used to
  // recover function names stripped during minification (esbuild drops
  // named-function-expression identifiers when the inner name isn't referenced
  // from inside the function body, so `function mapToPropsProxy()` becomes
  // `function()`. Only the original source still knows the name). Map value
  // `null` is cached when no content was available so we don't keep retrying.
  const originalSourceCache = new Map<
    IndexIntoSourceTable,
    ParsedSource | null
  >();

  // Function definitions. These get an original source file.
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
    const remap = _remapPosition(
      consumer,
      line,
      column,
      sources,
      stringTable,
      sourceByFilename,
      newOriginalLocation
    );
    if (remap === null) {
      continue;
    }
    newFuncTable.originalLocation[funcIndex] = remap.originalLocationIndex;

    // Full resolution (compiled + original, with ancestor chain) when the
    // compiled bundle is available. Otherwise (e.g. the profile was captured
    // without the JS Sources feature) fall back to original-source-only
    // resolution, which still recovers names from `sourcesContent`.
    const compiledText = compiledSources.get(sourceIndex);
    let resolvedName: string | null;
    if (compiledText !== undefined) {
      let compiled = compiledSourceCache.get(sourceIndex);
      if (compiled === undefined) {
        compiled = {
          tree: parseJsScopeTree(compiledText),
          lineOffsets: buildLineOffsets(compiledText),
        };
        compiledSourceCache.set(sourceIndex, compiled);
      }

      resolvedName = _resolveFunctionName(
        consumer,
        remap.original,
        line,
        column,
        compiled.lineOffsets,
        compiled.tree,
        sources,
        remap.originalSourceIndex,
        originalSourceCache
      );
    } else {
      resolvedName = _resolveOriginalName(
        sources,
        remap.originalSourceIndex,
        remap.original,
        originalSourceCache
      );
    }
    if (resolvedName) {
      newFuncTable.name[funcIndex] = stringTable.indexForString(resolvedName);
    }
  }

  // Frame execution points. Remap line/column and capture the original source
  // file. In most cases this matches the func's original source, but for
  // inlined code it may differ (e.g. a function from utils.ts inlined into
  // app.ts maps frames back to utils.ts).
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
    const remap = _remapPosition(
      consumer,
      line,
      column,
      sources,
      stringTable,
      sourceByFilename,
      newOriginalLocation
    );
    if (remap === null) {
      continue;
    }
    newFrameTable.originalLocation[frameIndex] = remap.originalLocationIndex;
  }

  if (newOriginalLocation.length === sourceLocationTable.length) {
    return null;
  }

  return { newFuncTable, newFrameTable, newOriginalLocation };
}

/**
 * Remap a single (line, column) through the source map and append a new row
 * to newOriginalLocation. Returns the new row index plus the resolved original
 * position. Returns null when the source map has no mapping at that position.
 *
 * Gecko line/column are 1-based. source-map expects 0-based columns and
 * returns 0-based columns; we convert in both directions here so callers
 * stay in Gecko's convention.
 */
function _remapPosition(
  consumer: SourceMapConsumer,
  line: number,
  column: number,
  sources: SourceTable,
  stringTable: StringTable,
  sourceByFilename: Map<number, IndexIntoSourceTable>,
  newOriginalLocation: SourceLocationTable
): {
  originalLocationIndex: number;
  originalSourceIndex: IndexIntoSourceTable;
  original: OriginalPosition;
} | null {
  const original = consumer.originalPositionFor({ line, column: column - 1 });
  if (original.source === null || original.line === null) {
    return null;
  }
  const originalSourceIndex = _findOrCreateSource(
    sources,
    stringTable,
    original.source,
    sourceByFilename
  );

  // Extract original source content from sourcesContent if not yet seen.
  // nullOnMissing=true so we get null instead of a throw when not embedded.
  if (sources.content[originalSourceIndex] === null) {
    const content = consumer.sourceContentFor(original.source, true);
    if (content !== null) {
      sources.content[originalSourceIndex] = content;
    }
  }

  const originalLocationIndex = newOriginalLocation.length;
  newOriginalLocation.source.push(originalSourceIndex);
  newOriginalLocation.line.push(original.line);
  newOriginalLocation.column.push((original.column ?? 0) + 1);
  newOriginalLocation.length++;

  return {
    originalLocationIndex,
    originalSourceIndex,
    original: original as OriginalPosition,
  };
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
  line: number,
  column: number,
  lineOffsets: number[],
  scopeTree: FunctionScope[],
  sources: SourceTable,
  originalSourceIndex: IndexIntoSourceTable,
  originalSourceCache: Map<IndexIntoSourceTable, ParsedSource | null>
): string | null {
  // 1. Original-source name lookup. Prefers the function's own declared
  //    identifier, falling back to the verbatim LHS text of the surrounding
  //    assignment. When it produces a simple (non-member) name, we return
  //    immediately. When it's member-style (`Foo.prototype.bar` / `obj[key]`),
  //    we keep it but drop into the chain branch below so the result carries
  //    the enclosing function, matching SpiderMonkey's output shape (e.g.
  //    `outer/Foo.prototype.bar`).
  const originalName = _resolveOriginalName(
    sources,
    originalSourceIndex,
    original,
    originalSourceCache
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
  sources: SourceTable,
  originalSourceIndex: IndexIntoSourceTable,
  original: OriginalPosition,
  cache: Map<IndexIntoSourceTable, ParsedSource | null>
): string | null {
  // A cached `null` means we saw no content the last time we looked, but a
  // later _remapPosition from a different consumer may have populated it
  // since. Re-check `sources.content` on every cached miss so the upgrade
  // doesn't depend on iteration order across consumers.
  let entry = cache.get(originalSourceIndex);
  if (entry === undefined || entry === null) {
    const sourceContent = sources.content[originalSourceIndex];
    if (sourceContent === null) {
      cache.set(originalSourceIndex, null);
      return null;
    }
    entry = {
      tree: parseJsScopeTree(
        sourceContent,
        dialectForFilename(original.source)
      ),
      lineOffsets: buildLineOffsets(sourceContent),
    };
    cache.set(originalSourceIndex, entry);
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

/**
 * End-to-end source map symbolication runner: build the SourceMapStore, run
 * symbolication, and return a WorkerOutput.
 *
 * Mutates `input.sources` and `input.stringArray` in place
 * (`_findOrCreateSource` appends new sources, `StringTable.withBackingArray`
 * appends interned strings). Callers must pass copies if the originals must
 * stay untouched. The worker is safe because structured clone already copies
 * them at the thread boundary.
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
    const result = symbolicateWithSourceMaps(
      { frameTable, funcTable, sourceLocationTable, sources, stringArray },
      sourceMapStore,
      compiledSources
    );

    if (result === null) {
      return { type: 'no-op' };
    }

    return {
      type: 'success',
      newFuncTable: result.newFuncTable,
      newFrameTable: result.newFrameTable,
      newSourceLocationTable: result.newOriginalLocation,
      newSources: sources,
      newStringArray: stringArray,
    };
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
