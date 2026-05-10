/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';
import { makeBitSet, setBit, clearBit, checkBit } from '../utils/bitset';

import type {
  Profile,
  RawThread,
  RawProfileSharedData,
  RawMarkerTable,
  IndexIntoStackTable,
  RawStackTable,
  FrameTable,
  FuncTable,
  ResourceTable,
  NativeSymbolTable,
  Lib,
  SourceTable,
  SourceLocationTable,
  IndexIntoFrameTable,
} from 'firefox-profiler/types';
import {
  assertExhaustiveCheck,
  ensureExists,
} from 'firefox-profiler/utils/types';
import type { BitSet } from '../utils/bitset';

export type TranslationMaps = {
  oldStackToNewStackPlusOne: Int32Array;
  oldFrameToNewFramePlusOne: Int32Array;
  oldFuncToNewFuncPlusOne: Int32Array;
  oldResourceToNewResourcePlusOne: Int32Array;
  oldNativeSymbolToNewNativeSymbolPlusOne: Int32Array;
  oldSourceToNewSourcePlusOne: Int32Array;
  oldStringToNewStringPlusOne: Int32Array;
  oldLibToNewLibPlusOne: Int32Array;
};

export type CompactedProfileWithTranslationMaps = {
  profile: Profile;
  translationMaps: TranslationMaps;
};

type ColumnDescription<TCol> = null extends (
  TCol extends Array<infer E> ? E : never
)
  ?
      | { type: 'INDEX_REF_OR_NULL'; referencedTable: TableCompactionState }
      | { type: 'NO_REF' }
  : Int32Array<ArrayBuffer> extends TCol
    ?
        | { type: 'INDEX_REF_INT32'; referencedTable: TableCompactionState }
        | { type: 'SELF_RELATIVE_PARENT' }
        | { type: 'NO_REF' }
    :
        | { type: 'INDEX_REF'; referencedTable: TableCompactionState }
        | {
            type: 'INDEX_REF_OR_NEG_ONE';
            referencedTable: TableCompactionState;
          }
        | { type: 'NO_REF' };

type TableDescription<T> = {
  [K in keyof T as T[K] extends Array<any> | Int32Array<ArrayBuffer>
    ? K
    : never]: ColumnDescription<T[K]>;
};

const ColDesc = {
  indexRef: (referencedTable: TableCompactionState) => ({
    type: 'INDEX_REF' as const,
    referencedTable,
  }),
  indexRefInt32: (referencedTable: TableCompactionState) => ({
    type: 'INDEX_REF_INT32' as const,
    referencedTable,
  }),
  indexRefOrNull: (referencedTable: TableCompactionState) => ({
    type: 'INDEX_REF_OR_NULL' as const,
    referencedTable,
  }),
  indexRefOrNegOne: (referencedTable: TableCompactionState) => ({
    type: 'INDEX_REF_OR_NEG_ONE' as const,
    referencedTable,
  }),
  selfPrefixOffset: () => ({ type: 'SELF_RELATIVE_PARENT' as const }),
  noRef: () => ({ type: 'NO_REF' as const }),
};

class TableCompactionState {
  markBuffer: BitSet;
  oldIndexToNewIndexPlusOne: Int32Array;

  // If the element is a duplicate of an earlier element, this maps it
  // to the first same element (i.e. to the canonical element).
  oldIndexToCanonicalOldIndexPlusOne: Int32Array;

  // Whether oldIndexToCanonicalOldIndexPlusOne has any non-zero values
  hasCanonicalRedirects: boolean = false;

  newLength: number | null = null;

  constructor(itemCount: number) {
    this.markBuffer = makeBitSet(itemCount);
    this.oldIndexToCanonicalOldIndexPlusOne = new Int32Array(itemCount);
    this.oldIndexToNewIndexPlusOne = new Int32Array(itemCount);
  }

  redirectOldIndexToCanonicalOldIndex(
    redirected: number,
    canonical: number
  ): void {
    clearBit(this.markBuffer, redirected);
    this.oldIndexToCanonicalOldIndexPlusOne[redirected] = canonical + 1;
    this.hasCanonicalRedirects = true;
  }

  computeIndexTranslation(): void {
    let newLength = 0;
    for (let i = 0; i < this.oldIndexToNewIndexPlusOne.length; i++) {
      if (checkBit(this.markBuffer, i)) {
        this.oldIndexToNewIndexPlusOne[i] = newLength + 1;
        newLength++;
      }
    }
    this.newLength = newLength;

    if (this.hasCanonicalRedirects) {
      // Patch redirected (deduped-away) rows so any reference to them
      // resolves to their canonical row's new index. For tables that didn't
      // dedup, oldIndexToCanonicalOldIndexPlusOne is all zeros and this loop is a no-op.
      for (let i = 0; i < this.oldIndexToCanonicalOldIndexPlusOne.length; i++) {
        const canonicalOldIndex =
          this.oldIndexToCanonicalOldIndexPlusOne[i] - 1;
        if (canonicalOldIndex !== -1) {
          this.oldIndexToNewIndexPlusOne[i] =
            this.oldIndexToNewIndexPlusOne[canonicalOldIndex];
        }
      }
    }
  }
}

type TableCompactionStates = {
  stackTable: TableCompactionState;
  frameTable: TableCompactionState;
  funcTable: TableCompactionState;
  resourceTable: TableCompactionState;
  nativeSymbols: TableCompactionState;
  sources: TableCompactionState;
  sourceLocationTable: TableCompactionState;
  stringArray: TableCompactionState;
  libs: TableCompactionState;
};

/**
 * Returns a new profile with all unreferenced data removed.
 *
 * The markers and samples in the profile are the "GC roots". All other data
 * tables exist only to make the marker and sample data meaningful.
 * (Here, sample data includes allocation samples from thread.jsAllocations and
 * thread.nativeAllocations.)
 *
 * When a profile is uploaded, we allow removing parts of the uploaded data,
 * for example by restricting to a time range (which removes samples and markers
 * outside of the time range) or by removing entire threads.
 *
 * computeCompactedProfile makes it so that, once those threads / samples / markers
 * are removed, we don't keep around any stacks / frames / strings / etc. which
 * were only used by the removed threads / samples / markers.
 */
export function computeCompactedProfile(
  profile: Profile
): CompactedProfileWithTranslationMaps {
  const { shared, threads } = profile;
  const tcs: TableCompactionStates = {
    stackTable: new TableCompactionState(shared.stackTable.length),
    frameTable: new TableCompactionState(shared.frameTable.length),
    funcTable: new TableCompactionState(shared.funcTable.length),
    resourceTable: new TableCompactionState(shared.resourceTable.length),
    nativeSymbols: new TableCompactionState(shared.nativeSymbols.length),
    sources: new TableCompactionState(shared.sources.length),
    sourceLocationTable: new TableCompactionState(
      shared.sourceLocationTable.length
    ),
    libs: new TableCompactionState(profile.libs.length),
    stringArray: new TableCompactionState(shared.stringArray.length),
  };

  const stackTableDesc: TableDescription<RawStackTable> = {
    frame: ColDesc.indexRefInt32(tcs.frameTable),
    prefixOffset: ColDesc.selfPrefixOffset(),
  };
  const frameTableDesc: TableDescription<FrameTable> = {
    address: ColDesc.noRef(),
    inlineDepth: ColDesc.noRef(),
    category: ColDesc.noRef(),
    subcategory: ColDesc.noRef(),
    func: ColDesc.indexRef(tcs.funcTable),
    nativeSymbol: ColDesc.indexRefOrNull(tcs.nativeSymbols),
    innerWindowID: ColDesc.noRef(),
    line: ColDesc.noRef(),
    column: ColDesc.noRef(),
    originalLocation: ColDesc.indexRefOrNull(tcs.sourceLocationTable),
  };
  const funcTableDesc: TableDescription<FuncTable> = {
    name: ColDesc.indexRef(tcs.stringArray),
    isJS: ColDesc.noRef(),
    relevantForJS: ColDesc.noRef(),
    resource: ColDesc.indexRefOrNegOne(tcs.resourceTable),
    source: ColDesc.indexRefOrNull(tcs.sources),
    lineNumber: ColDesc.noRef(),
    columnNumber: ColDesc.noRef(),
    originalLocation: ColDesc.indexRefOrNull(tcs.sourceLocationTable),
  };
  const sourceLocationTableDesc: TableDescription<SourceLocationTable> = {
    source: ColDesc.indexRef(tcs.sources),
    line: ColDesc.noRef(),
    column: ColDesc.noRef(),
  };
  const resourceTableDesc: TableDescription<ResourceTable> = {
    name: ColDesc.indexRef(tcs.stringArray),
    host: ColDesc.indexRefOrNull(tcs.stringArray),
    lib: ColDesc.indexRefOrNull(tcs.libs),
    type: ColDesc.noRef(),
  };
  const nativeSymbolsDesc: TableDescription<NativeSymbolTable> = {
    libIndex: ColDesc.indexRef(tcs.libs),
    address: ColDesc.noRef(),
    name: ColDesc.indexRef(tcs.stringArray),
    functionSize: ColDesc.noRef(),
  };
  const sourcesDesc: TableDescription<SourceTable> = {
    id: ColDesc.noRef(),
    filename: ColDesc.indexRef(tcs.stringArray),
    startLine: ColDesc.noRef(),
    startColumn: ColDesc.noRef(),
    sourceMapURL: ColDesc.indexRefOrNull(tcs.stringArray),
    content: ColDesc.noRef(),
  };

  // Step 1: Gather all references.
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);
  for (const thread of threads) {
    _gatherReferencesInThread(thread, tcs, stringIndexMarkerFieldsByDataType);
  }

  // The order of the _markTable calls is important!
  // We only want to mark data that is (transitively) used by thread data.
  // So, for example, we have to mark the funcTable before we mark the
  // sources, so that, by the time we look at the sources, we already know
  // which sources are (transitively) referenced.
  _markTable(shared.stackTable, tcs.stackTable, stackTableDesc);
  _markTable(shared.frameTable, tcs.frameTable, frameTableDesc);
  _markTable(shared.funcTable, tcs.funcTable, funcTableDesc);
  _markTable(shared.resourceTable, tcs.resourceTable, resourceTableDesc);
  _markTable(
    shared.sourceLocationTable,
    tcs.sourceLocationTable,
    sourceLocationTableDesc
  );
  _markTable(shared.nativeSymbols, tcs.nativeSymbols, nativeSymbolsDesc);
  _markTable(shared.sources, tcs.sources, sourcesDesc);

  tcs.libs.computeIndexTranslation();
  tcs.stringArray.computeIndexTranslation();
  tcs.sources.computeIndexTranslation();
  tcs.nativeSymbols.computeIndexTranslation();
  tcs.sourceLocationTable.computeIndexTranslation();
  tcs.resourceTable.computeIndexTranslation();
  tcs.funcTable.computeIndexTranslation();
  _dedupFrameTable(shared.frameTable, tcs.frameTable);
  tcs.frameTable.computeIndexTranslation();
  _dedupStackTable(
    shared.stackTable,
    tcs.stackTable,
    tcs.frameTable.oldIndexToNewIndexPlusOne
  );
  tcs.stackTable.computeIndexTranslation();

  // Step 2: Create new tables for everything, skipping unreferenced entries.
  // The order of calls to _compactTable doesn't matter - we've already computed
  // all the index mappings.
  const newShared: RawProfileSharedData = {
    stackTable: _compactTable(
      shared.stackTable,
      tcs.stackTable,
      stackTableDesc
    ),
    frameTable: _compactTable(
      shared.frameTable,
      tcs.frameTable,
      frameTableDesc
    ),
    funcTable: _compactTable(shared.funcTable, tcs.funcTable, funcTableDesc),
    resourceTable: _compactTable(
      shared.resourceTable,
      tcs.resourceTable,
      resourceTableDesc
    ),
    nativeSymbols: _compactTable(
      shared.nativeSymbols,
      tcs.nativeSymbols,
      nativeSymbolsDesc
    ),
    sources: _compactTable(shared.sources, tcs.sources, sourcesDesc),
    sourceLocationTable: _compactTable(
      shared.sourceLocationTable,
      tcs.sourceLocationTable,
      sourceLocationTableDesc
    ),
    stringArray: _createCompactedStringArray(shared.stringArray, tcs),
  };

  const newProfile: Profile = {
    ...profile,
    libs: _createCompactedLibs(profile.libs, tcs),
    shared: newShared,
    threads: profile.threads.map((thread) =>
      _createCompactedThread(thread, tcs, stringIndexMarkerFieldsByDataType)
    ),
  };

  const translationMaps: TranslationMaps = {
    oldStackToNewStackPlusOne: tcs.stackTable.oldIndexToNewIndexPlusOne,
    oldFrameToNewFramePlusOne: tcs.frameTable.oldIndexToNewIndexPlusOne,
    oldFuncToNewFuncPlusOne: tcs.funcTable.oldIndexToNewIndexPlusOne,
    oldResourceToNewResourcePlusOne:
      tcs.resourceTable.oldIndexToNewIndexPlusOne,
    oldNativeSymbolToNewNativeSymbolPlusOne:
      tcs.nativeSymbols.oldIndexToNewIndexPlusOne,
    oldSourceToNewSourcePlusOne: tcs.sources.oldIndexToNewIndexPlusOne,
    oldStringToNewStringPlusOne: tcs.stringArray.oldIndexToNewIndexPlusOne,
    oldLibToNewLibPlusOne: tcs.libs.oldIndexToNewIndexPlusOne,
  };
  return { profile: newProfile, translationMaps };
}

// --- Step 1: Marking ---

function _markTable<T>(
  table: T,
  thisTableCompactionState: TableCompactionState,
  tableDesc: TableDescription<T>
) {
  const { markBuffer } = thisTableCompactionState;
  const keys = Object.keys(tableDesc) as Array<keyof typeof tableDesc>;

  // First pass: propagate self-references. This must happen before the
  // cross-table marking pass, so that ancestor rows are fully marked before
  // we look up which rows of other tables they reference.
  for (const key of keys) {
    const desc = tableDesc[key];
    if (desc.type === 'SELF_RELATIVE_PARENT') {
      markSelfColumnPrefixOffset((table as any)[key], markBuffer);
    }
  }

  // Second pass: mark rows in other tables referenced by marked rows.
  for (const key of keys) {
    const desc = tableDesc[key];
    const col = (table as any)[key];
    switch (desc.type) {
      case 'INDEX_REF':
      case 'INDEX_REF_INT32':
        markColumn(col, markBuffer, desc.referencedTable.markBuffer);
        break;
      case 'INDEX_REF_OR_NULL':
        markColumnWithNullableFields(
          col,
          markBuffer,
          desc.referencedTable.markBuffer
        );
        break;
      case 'SELF_RELATIVE_PARENT':
        break; // already handled in the first pass
      case 'INDEX_REF_OR_NEG_ONE':
        markColumnWithNegOneableFields(
          col,
          markBuffer,
          desc.referencedTable.markBuffer
        );
        break;
      case 'NO_REF':
        break;
      default:
        throw assertExhaustiveCheck(desc);
    }
  }
}

function markColumn(
  col: Array<number> | Int32Array<ArrayBuffer>,
  shouldMark: BitSet,
  markBuf: BitSet
) {
  // Polymorphic: indexing works the same on Int32Array as on number[], so the
  // INDEX_REF and INDEX_REF_INT32 cases share this function.
  for (let i = 0; i < col.length; i++) {
    if (checkBit(shouldMark, i)) {
      const val = col[i];
      setBit(markBuf, val);
    }
  }
}

function markColumnWithNullableFields(
  col: Array<number | null>,
  shouldMark: BitSet,
  markBuf: BitSet
) {
  for (let i = 0; i < col.length; i++) {
    if (checkBit(shouldMark, i)) {
      const val = col[i];
      if (val !== null) {
        setBit(markBuf, val);
      }
    }
  }
}

// Self-referential columns must be iterated in reverse so that marking a
// prefix propagates transitively: since prefix[i] < i is guaranteed, iterating
// high-to-low means a newly marked row will still be visited.
function markSelfColumnPrefixOffset(
  col: Int32Array<ArrayBuffer>,
  markBuf: BitSet
) {
  for (let i = col.length - 1; i >= 0; i--) {
    if (checkBit(markBuf, i)) {
      const offset = col[i];
      if (offset !== 0) {
        setBit(markBuf, i - offset);
      }
    }
  }
}

function markColumnWithNegOneableFields(
  col: Array<number | -1>,
  shouldMark: BitSet,
  markBuf: BitSet
) {
  for (let i = 0; i < col.length; i++) {
    if (checkBit(shouldMark, i)) {
      const val = col[i];
      if (val !== -1) {
        setBit(markBuf, val);
      }
    }
  }
}

// Collapse identical rows in the frame table. Two rows are identical if every
// column has the same value. Duplicates often arise during profile processing
// because Firefox's gecko profile has a per-thread frame table, and
// process-profile.ts merges those into a single frame table without
// deduplicating (so that profile loading stays fast). Compacting runs in
// contexts where small profile size matters more than latency, so we dedupe
// here.
//
// We sort an array of marked frame indices using a comparator that walks the
// frame columns directly (no per-frame object is constructed). After sorting,
// duplicates are adjacent and a single linear pass picks one canonical frame
// per group, redirects the others to it, and clears their bits in markBuffer
// so they get skipped during the compact phase.
function _dedupFrameTable(
  frameTable: FrameTable,
  state: TableCompactionState
): void {
  const markedFrames = new Array<IndexIntoFrameTable>();
  const { markBuffer } = state;
  for (let i = 0; i < frameTable.length; i++) {
    if (checkBit(markBuffer, i)) {
      markedFrames.push(i);
    }
  }

  if (markedFrames.length === 0) {
    return;
  }

  // Sort, so that we can deduplicate without creating hash strings.
  markedFrames.sort((a, b) => _compareFrames(frameTable, a, b));

  // Walk the sorted list. If we find matching subsequent frames,
  // redirect the later frames to the first matching frame.
  let prevFrame = markedFrames[0];
  for (let i = 1; i < markedFrames.length; i++) {
    const frameIndex = markedFrames[i];
    if (_compareFrames(frameTable, frameIndex, prevFrame) === 0) {
      state.redirectOldIndexToCanonicalOldIndex(frameIndex, prevFrame);
      continue;
    }
    prevFrame = frameIndex;
  }
}

function _compareFrames(frameTable: FrameTable, a: number, b: number): number {
  let d;
  const funcCol = frameTable.func;
  d = funcCol[a] - funcCol[b];
  if (d !== 0) {
    return d;
  }
  const addressCol = frameTable.address;
  d = addressCol[a] - addressCol[b];
  if (d !== 0) {
    return d;
  }
  const inlineDepthCol = frameTable.inlineDepth;
  d = inlineDepthCol[a] - inlineDepthCol[b];
  if (d !== 0) {
    return d;
  }
  const categoryCol = frameTable.category;
  d = _compareNullableNumber(categoryCol[a], categoryCol[b]);
  if (d !== 0) {
    return d;
  }
  const subcategoryCol = frameTable.subcategory;
  d = _compareNullableNumber(subcategoryCol[a], subcategoryCol[b]);
  if (d !== 0) {
    return d;
  }
  const nativeSymbolCol = frameTable.nativeSymbol;
  d = _compareNullableNumber(nativeSymbolCol[a], nativeSymbolCol[b]);
  if (d !== 0) {
    return d;
  }
  const innerWindowIDCol = frameTable.innerWindowID;
  d = _compareNullableNumber(innerWindowIDCol[a], innerWindowIDCol[b]);
  if (d !== 0) {
    return d;
  }
  const lineCol = frameTable.line;
  d = _compareNullableNumber(lineCol[a], lineCol[b]);
  if (d !== 0) {
    return d;
  }
  const columnCol = frameTable.column;
  d = _compareNullableNumber(columnCol[a], columnCol[b]);
  if (d !== 0) {
    return d;
  }
  return 0;
}

function _compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null) {
    return b === null ? 0 : -1;
  }
  if (b === null) {
    return 1;
  }
  return a - b;
}

// Collapse stack tree nodes that have the same (prefix, frame) into a single
// canonical node. Walks the table in topological order (prefix < i is
// guaranteed) so the canonical version of each stack's prefix is already
// known by the time we process the stack.
//
// To find an existing canonical child of a given parent with a given frame
// without hashing, we maintain a per-parent intrusive linked list of
// canonical children, kept sorted by canonical frame index, plus a
// `lastUsed` pointer per parent. This is the same trick as in
// _computeCallNodeTableHierarchy (introduced in #5964) and tames the
// degenerate fan-out case:
//   - Repeated lookups for the same (parent, frame) hit the lastUsed cache
//     in O(1).
//   - When the new frame is greater than lastUsed's frame, the sorted-list
//     invariant lets us start the scan at lastUsed's successor rather than
//     the head; ascending-order inserts therefore append in amortized O(1).
//   - Mismatched scans early-exit as soon as they pass the target frame, so
//     even arbitrary insertion orders pay ~K/2 per lookup instead of K.
function _dedupStackTable(
  stackTable: RawStackTable,
  state: TableCompactionState,
  frameMap: Int32Array
): void {
  const { markBuffer, oldIndexToCanonicalOldIndexPlusOne } = state;
  const N = stackTable.length;

  // Per-canonical-parent intrusive linked list of canonical children, sorted
  // by canonical frame. Both arrays store value+1 so 0 acts as null.
  // firstChildPlusOne is indexed by canonical parent, nextSiblingPlusOne by
  // canonical child. The null-prefix root has its own scalar.
  const firstChildPlusOne = new Int32Array(N);
  const nextSiblingPlusOne = new Int32Array(N);
  let rootFirstChild = -1;

  // The most recently matched-or-inserted canonical child per parent.
  const lastUsedChildPlusOne = new Int32Array(N);
  let rootLastUsed = -1;

  for (let i = 0; i < N; i++) {
    if (!checkBit(markBuffer, i)) {
      continue;
    }

    // Resolve canonical prefix in old-index space. The marking pass
    // guarantees that any non-root prefix of a marked stack is itself
    // marked, so it has already been processed in a previous iteration.
    const offset = stackTable.prefixOffset[i];
    let canonicalPrefix;
    if (offset === 0) {
      canonicalPrefix = -1;
    } else {
      const oldPrefix = i - offset;
      if (oldIndexToCanonicalOldIndexPlusOne[oldPrefix] !== 0) {
        canonicalPrefix = oldIndexToCanonicalOldIndexPlusOne[oldPrefix] - 1;
      } else {
        canonicalPrefix = oldPrefix;
      }
    }
    // Frame index in canonical (post-frame-dedup) frame-table space.
    const canonicalFrame = frameMap[stackTable.frame[i]] - 1;

    const firstChildOfParent =
      canonicalPrefix === -1
        ? rootFirstChild
        : firstChildPlusOne[canonicalPrefix] - 1;
    const lastUsed =
      canonicalPrefix === -1
        ? rootLastUsed
        : lastUsedChildPlusOne[canonicalPrefix] - 1;

    // Locate (canonicalPrefix, canonicalFrame) in the sorted sibling list.
    // foundCanonical is the existing canonical child if a match exists;
    // otherwise prevSibling is where the new node should be linked after
    // (-1 means "at the head").
    let foundCanonical = -1;
    let prevSibling = -1;
    let scanStart = firstChildOfParent;

    if (lastUsed !== -1) {
      const lastUsedFrame = frameMap[stackTable.frame[lastUsed]] - 1;
      if (lastUsedFrame === canonicalFrame) {
        foundCanonical = lastUsed;
      } else if (lastUsedFrame < canonicalFrame) {
        // Sorted-list invariant: everything up to and including lastUsed has
        // a smaller frame and can be skipped.
        prevSibling = lastUsed;
        scanStart = nextSiblingPlusOne[lastUsed] - 1;
      }
    }

    if (foundCanonical === -1) {
      let child = scanStart;
      while (child !== -1) {
        const childFrame = frameMap[stackTable.frame[child]] - 1;
        if (childFrame === canonicalFrame) {
          foundCanonical = child;
          break;
        }
        if (childFrame > canonicalFrame) {
          // Sorted-by-frame: nothing further can match.
          break;
        }
        prevSibling = child;
        child = nextSiblingPlusOne[child] - 1;
      }
    }

    let lastUsedAfter;
    if (foundCanonical !== -1) {
      state.redirectOldIndexToCanonicalOldIndex(i, foundCanonical);
      lastUsedAfter = foundCanonical;
    } else {
      // Splice i (canonical) into the sorted sibling list.
      if (prevSibling === -1) {
        nextSiblingPlusOne[i] = firstChildOfParent + 1;
        if (canonicalPrefix === -1) {
          rootFirstChild = i;
        } else {
          firstChildPlusOne[canonicalPrefix] = i + 1;
        }
      } else {
        nextSiblingPlusOne[i] = nextSiblingPlusOne[prevSibling];
        nextSiblingPlusOne[prevSibling] = i + 1;
      }
      lastUsedAfter = i;
    }

    if (canonicalPrefix === -1) {
      rootLastUsed = lastUsedAfter;
    } else {
      lastUsedChildPlusOne[canonicalPrefix] = lastUsedAfter + 1;
    }
  }
}

function _gatherReferencesInThread(
  thread: RawThread,
  tcs: TableCompactionStates,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
) {
  _gatherReferencesInStackCol(thread.samples.stack, tcs);
  if (thread.jsAllocations) {
    _gatherReferencesInStackCol(thread.jsAllocations.stack, tcs);
  }
  if (thread.nativeAllocations) {
    _gatherReferencesInStackCol(thread.nativeAllocations.stack, tcs);
  }
  _gatherReferencesInMarkers(
    thread.markers,
    tcs,
    stringIndexMarkerFieldsByDataType
  );
}

function _gatherReferencesInStackCol(
  stackCol: Array<IndexIntoStackTable | null>,
  tcs: TableCompactionStates
) {
  for (let i = 0; i < stackCol.length; i++) {
    const stack = stackCol[i];
    if (stack !== null) {
      setBit(tcs.stackTable.markBuffer, stack);
    }
  }
}

function _gatherReferencesInMarkers(
  markers: RawMarkerTable,
  tcs: TableCompactionStates,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
) {
  const stacks = tcs.stackTable.markBuffer;
  const strings = tcs.stringArray.markBuffer;
  for (let i = 0; i < markers.length; i++) {
    setBit(strings, markers.name[i]);

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    if ('cause' in data && data.cause && data.cause.stack !== null) {
      setBit(stacks, data.cause.stack);
    }

    if (data.type) {
      const stringIndexMarkerFields = stringIndexMarkerFieldsByDataType.get(
        data.type
      );
      if (stringIndexMarkerFields !== undefined) {
        for (const fieldKey of stringIndexMarkerFields) {
          const stringIndex = (data as any)[fieldKey];
          if (typeof stringIndex === 'number') {
            setBit(strings, stringIndex);
          }
        }
      }
    }
  }
}

// --- Step 2: Compacting ---

// Compact a single table with the help of a table description.
function _compactTable<T extends { length: number }>(
  oldTable: T,
  thisTableCompactionState: TableCompactionState,
  tableDesc: TableDescription<T>
): T {
  const { markBuffer } = thisTableCompactionState;
  const newLength = ensureExists(thisTableCompactionState.newLength);
  const result: any = { length: newLength };
  for (const key of Object.keys(tableDesc) as Array<keyof typeof tableDesc>) {
    const desc = tableDesc[key];
    const oldCol = (oldTable as any)[key];
    switch (desc.type) {
      case 'INDEX_REF':
        result[key] = _compactColIndex(
          oldCol,
          markBuffer,
          desc.referencedTable.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'INDEX_REF_INT32':
        result[key] = _compactColIndexInt32(
          oldCol,
          markBuffer,
          desc.referencedTable.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'INDEX_REF_OR_NULL':
        result[key] = _compactColIndexOrNull(
          oldCol,
          markBuffer,
          desc.referencedTable.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'SELF_RELATIVE_PARENT':
        result[key] = _compactColSelfPrefixOffset(
          oldCol,
          markBuffer,
          thisTableCompactionState.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'INDEX_REF_OR_NEG_ONE':
        result[key] = _compactColIndexOrNegOne(
          oldCol,
          markBuffer,
          desc.referencedTable.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'NO_REF':
        result[key] = _compactColCopy(oldCol, markBuffer, newLength);
        break;
      default:
        throw assertExhaustiveCheck(desc);
    }
  }
  return result;
}

function _compactColCopy<E>(
  oldCol: E[],
  markBuffer: BitSet,
  newLength: number
): E[] {
  const newCol: E[] = new Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      newCol[newIndex++] = oldCol[i];
    }
  }
  return newCol;
}

function _compactColIndex(
  oldCol: number[],
  markBuffer: BitSet,
  oldIndexToNewIndexPlusOne: Int32Array,
  newLength: number
): number[] {
  const newCol: number[] = new Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      newCol[newIndex++] = oldIndexToNewIndexPlusOne[oldCol[i]] - 1;
    }
  }
  return newCol;
}

function _compactColIndexInt32(
  oldCol: Int32Array<ArrayBuffer>,
  markBuffer: BitSet,
  oldIndexToNewIndexPlusOne: Int32Array,
  newLength: number
): Int32Array<ArrayBuffer> {
  const newCol = new Int32Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      newCol[newIndex++] = oldIndexToNewIndexPlusOne[oldCol[i]] - 1;
    }
  }
  return newCol;
}

function _compactColIndexOrNull(
  oldCol: (number | null)[],
  markBuffer: BitSet,
  oldIndexToNewIndexPlusOne: Int32Array,
  newLength: number
): (number | null)[] {
  const newCol: (number | null)[] = new Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      const val = oldCol[i];
      newCol[newIndex++] =
        val !== null ? oldIndexToNewIndexPlusOne[val] - 1 : null;
    }
  }
  return newCol;
}

function _compactColIndexOrNegOne(
  oldCol: (number | -1)[],
  markBuffer: BitSet,
  oldIndexToNewIndexPlusOne: Int32Array,
  newLength: number
): (number | -1)[] {
  const newCol: (number | -1)[] = new Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      const val = oldCol[i];
      newCol[newIndex++] = val !== -1 ? oldIndexToNewIndexPlusOne[val] - 1 : -1;
    }
  }
  return newCol;
}

function _compactColSelfPrefixOffset(
  oldCol: Int32Array<ArrayBuffer>,
  markBuffer: BitSet,
  oldIndexToNewIndexPlusOne: Int32Array,
  newLength: number
): Int32Array<ArrayBuffer> {
  const newCol = new Int32Array(newLength);
  let newIndex = 0;
  for (let i = 0; i < oldCol.length; i++) {
    if (checkBit(markBuffer, i)) {
      const offset = oldCol[i];
      if (offset === 0) {
        newCol[newIndex] = 0;
      } else {
        const newParent = oldIndexToNewIndexPlusOne[i - offset] - 1;
        newCol[newIndex] = newIndex - newParent;
      }
      newIndex++;
    }
  }
  return newCol;
}

function _createCompactedThread(
  thread: RawThread,
  tcs: TableCompactionStates,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawThread {
  return {
    ...thread,
    samples: {
      ...thread.samples,
      stack: _translateStackCol(thread.samples.stack, tcs),
    },
    jsAllocations: thread.jsAllocations
      ? {
          ...thread.jsAllocations,
          stack: _translateStackCol(thread.jsAllocations.stack, tcs),
        }
      : undefined,
    nativeAllocations: thread.nativeAllocations
      ? {
          ...thread.nativeAllocations,
          stack: _translateStackCol(thread.nativeAllocations.stack, tcs),
        }
      : undefined,
    markers: _createCompactedMarkers(
      thread.markers,
      tcs,
      stringIndexMarkerFieldsByDataType
    ),
  };
}

function _translateStackCol(
  stackCol: Array<IndexIntoStackTable | null>,
  tcs: TableCompactionStates
): Array<IndexIntoStackTable | null> {
  const { oldIndexToNewIndexPlusOne } = tcs.stackTable;
  const newStackCol = stackCol.slice();
  for (let i = 0; i < stackCol.length; i++) {
    const stack = stackCol[i];
    newStackCol[i] =
      stack !== null ? oldIndexToNewIndexPlusOne[stack] - 1 : null;
  }
  return newStackCol;
}

function _createCompactedMarkers(
  markers: RawMarkerTable,
  tcs: TableCompactionStates,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawMarkerTable {
  const stacks = tcs.stackTable.oldIndexToNewIndexPlusOne;
  const strings = tcs.stringArray.oldIndexToNewIndexPlusOne;
  const newDataCol = markers.data.slice();
  const newNameCol = markers.name.slice();
  for (let i = 0; i < markers.length; i++) {
    newNameCol[i] = strings[markers.name[i]] - 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    let newData = data;
    if ('cause' in newData && newData.cause) {
      const stack = newData.cause.stack;
      if (stack !== null) {
        newData = {
          ...newData,
          cause: {
            ...newData.cause,
            stack: stacks[stack] - 1,
          },
        };
      }
    }

    if (data.type) {
      const stringIndexMarkerFields = stringIndexMarkerFieldsByDataType.get(
        data.type
      );
      if (stringIndexMarkerFields !== undefined) {
        for (const fieldKey of stringIndexMarkerFields) {
          const stringIndex = (data as any)[fieldKey];
          if (typeof stringIndex === 'number') {
            newData = {
              ...newData,
              [fieldKey]: strings[stringIndex] - 1,
            };
          }
        }
      }
    }

    newDataCol[i] = newData as any;
  }

  return {
    ...markers,
    name: newNameCol,
    data: newDataCol,
  };
}

function _createCompactedStringArray(
  stringArray: string[],
  tcs: TableCompactionStates
): string[] {
  return _compactColCopy(
    stringArray,
    tcs.stringArray.markBuffer,
    ensureExists(tcs.stringArray.newLength)
  );
}

function _createCompactedLibs(libs: Lib[], tcs: TableCompactionStates): Lib[] {
  return _compactColCopy(
    libs,
    tcs.libs.markBuffer,
    ensureExists(tcs.libs.newLength)
  );
}
