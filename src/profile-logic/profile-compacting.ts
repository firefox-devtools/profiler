/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';
import { type BitSet, makeBitSet, setBit, checkBit } from '../utils/bitset';

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
} from 'firefox-profiler/types';
import {
  assertExhaustiveCheck,
  ensureExists,
} from 'firefox-profiler/utils/types';

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
      | { type: 'SELF_INDEX_REF_OR_NULL' }
      | { type: 'NO_REF' }
  :
      | { type: 'INDEX_REF'; referencedTable: TableCompactionState }
      | { type: 'INDEX_REF_OR_NEG_ONE'; referencedTable: TableCompactionState }
      | { type: 'NO_REF' };

type TableDescription<T> = {
  [K in keyof T as T[K] extends Array<any> ? K : never]: ColumnDescription<
    T[K]
  >;
};

const ColDesc = {
  indexRef: (referencedTable: TableCompactionState) => ({
    type: 'INDEX_REF' as const,
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
  selfIndexRefOrNull: () => ({ type: 'SELF_INDEX_REF_OR_NULL' as const }),
  noRef: () => ({ type: 'NO_REF' as const }),
};

class TableCompactionState {
  markBuffer: BitSet;
  oldIndexToNewIndexPlusOne: Int32Array;
  newLength: number | null = null;

  constructor(itemCount: number) {
    this.markBuffer = makeBitSet(itemCount);
    this.oldIndexToNewIndexPlusOne = new Int32Array(itemCount);
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
  }
}

type TableCompactionStates = {
  stackTable: TableCompactionState;
  frameTable: TableCompactionState;
  funcTable: TableCompactionState;
  resourceTable: TableCompactionState;
  nativeSymbols: TableCompactionState;
  sources: TableCompactionState;
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
    libs: new TableCompactionState(profile.libs.length),
    stringArray: new TableCompactionState(shared.stringArray.length),
  };

  const stackTableDesc: TableDescription<RawStackTable> = {
    frame: ColDesc.indexRef(tcs.frameTable),
    prefix: ColDesc.selfIndexRefOrNull(),
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
  };
  const funcTableDesc: TableDescription<FuncTable> = {
    name: ColDesc.indexRef(tcs.stringArray),
    isJS: ColDesc.noRef(),
    relevantForJS: ColDesc.noRef(),
    resource: ColDesc.indexRefOrNegOne(tcs.resourceTable),
    source: ColDesc.indexRefOrNull(tcs.sources),
    lineNumber: ColDesc.noRef(),
    columnNumber: ColDesc.noRef(),
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
  };

  // Step 1: Gather all references.
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);
  for (const thread of threads) {
    _gatherReferencesInThread(thread, tcs, stringIndexMarkerFieldsByDataType);
  }

  // The order of the _markTableAndComputeTranslation calls is important!
  // We only want to mark data that is (transitively) used by thread data.
  // So, for example, we have to mark the funcTable before we mark the
  // sources, so that, by the time we look at the sources, we already know
  // which sources are (transitively) referenced.
  _markTableAndComputeTranslation(
    shared.stackTable,
    tcs.stackTable,
    stackTableDesc
  );
  _markTableAndComputeTranslation(
    shared.frameTable,
    tcs.frameTable,
    frameTableDesc
  );
  _markTableAndComputeTranslation(
    shared.funcTable,
    tcs.funcTable,
    funcTableDesc
  );
  _markTableAndComputeTranslation(
    shared.resourceTable,
    tcs.resourceTable,
    resourceTableDesc
  );
  _markTableAndComputeTranslation(
    shared.nativeSymbols,
    tcs.nativeSymbols,
    nativeSymbolsDesc
  );
  _markTableAndComputeTranslation(shared.sources, tcs.sources, sourcesDesc);
  tcs.stringArray.computeIndexTranslation();
  tcs.libs.computeIndexTranslation();

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

function _markTableAndComputeTranslation<T>(
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
    if (desc.type === 'SELF_INDEX_REF_OR_NULL') {
      markSelfColumnWithNullableFields((table as any)[key], markBuffer);
    }
  }

  // Second pass: mark rows in other tables referenced by marked rows.
  for (const key of keys) {
    const desc = tableDesc[key];
    const col = (table as any)[key];
    switch (desc.type) {
      case 'INDEX_REF':
        markColumn(col, markBuffer, desc.referencedTable.markBuffer);
        break;
      case 'INDEX_REF_OR_NULL':
        markColumnWithNullableFields(
          col,
          markBuffer,
          desc.referencedTable.markBuffer
        );
        break;
      case 'SELF_INDEX_REF_OR_NULL':
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

  thisTableCompactionState.computeIndexTranslation();
}

function markColumn(col: Array<number>, shouldMark: BitSet, markBuf: BitSet) {
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
function markSelfColumnWithNullableFields(
  col: Array<number | null>,
  markBuf: BitSet
) {
  for (let i = col.length - 1; i >= 0; i--) {
    if (checkBit(markBuf, i)) {
      const val = col[i];
      if (val !== null) {
        setBit(markBuf, val);
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
      case 'INDEX_REF_OR_NULL':
        result[key] = _compactColIndexOrNull(
          oldCol,
          markBuffer,
          desc.referencedTable.oldIndexToNewIndexPlusOne,
          newLength
        );
        break;
      case 'SELF_INDEX_REF_OR_NULL':
        result[key] = _compactColIndexOrNull(
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
