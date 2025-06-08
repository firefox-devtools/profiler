/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';

import type {
  Profile,
  RawThread,
  RawProfileSharedData,
  RawMarkerTable,
  FuncTable,
  ResourceTable,
  NativeSymbolTable,
  SourceTable,
} from 'firefox-profiler/types';

export type CompactedProfileWithTranslationMaps = {
  profile: Profile;
  oldStringToNewStringPlusOne: Int32Array;
  oldSourceToNewSourcePlusOne: Int32Array;
};

/**
 * Returns a new profile with all unreferenced strings and sources removed.
 *
 * Since the string table and source table are shared between all threads, if
 * the user asks for a thread to be removed during sanitization, by default
 * we'd keep the strings and sources from the removed threads in the profile.
 *
 * By calling this function, you can get a profile with adjusted string and
 * source tables where those unused strings and sources from the removed
 * threads have been removed.
 */
export function computeCompactedProfile(
  profile: Profile
): CompactedProfileWithTranslationMaps {
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);

  // Step 1: Gather all references of strings.
  const referencedStrings = _gatherStringReferencesInProfile(
    profile,
    stringIndexMarkerFieldsByDataType
  );

  // Step 2: Gather all references of sources.
  const referencedSources = _gatherSourceReferencesInProfile(profile);

  // Step 3: Adjust all tables to use new string and source indexes.
  return _createProfileWithTranslatedIndexes(
    profile,
    referencedStrings,
    referencedSources,
    stringIndexMarkerFieldsByDataType
  );
}

function _gatherStringReferencesInProfile(
  profile: Profile,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): Uint8Array {
  const referencedStrings = new Uint8Array(profile.shared.stringArray.length);

  for (const thread of profile.threads) {
    _gatherStringReferencesInThread(
      thread,
      referencedStrings,
      stringIndexMarkerFieldsByDataType
    );
  }

  _gatherReferencesInFuncTable(
    profile.shared.funcTable,
    referencedStrings,
    profile.shared.sources ?? null
  );
  _gatherReferencesInResourceTable(
    profile.shared.resourceTable,
    referencedStrings
  );
  _gatherReferencesInNativeSymbols(
    profile.shared.nativeSymbols,
    referencedStrings
  );

  return referencedStrings;
}

function _gatherSourceReferencesInProfile(profile: Profile): Uint8Array {
  const referencedSources = new Uint8Array(profile.shared.sources.length);

  for (let i = 0; i < profile.shared.funcTable.length; i++) {
    const sourceIndex = profile.shared.funcTable.source[i];
    if (sourceIndex !== null) {
      referencedSources[sourceIndex] = 1;
    }
  }

  return referencedSources;
}

function _createProfileWithTranslatedIndexes(
  profile: Profile,
  referencedStrings: Uint8Array,
  referencedSources: Uint8Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedProfileWithTranslationMaps {
  const { newStringArray, oldStringToNewStringPlusOne } =
    _createCompactedStringArray(profile.shared.stringArray, referencedStrings);

  const { newSources, oldSourceToNewSourcePlusOne } =
    _createCompactedSourceTable(
      profile.shared.sources,
      referencedSources,
      oldStringToNewStringPlusOne
    );

  const newShared: RawProfileSharedData =
    _createdSharedDataWithTranslatedIndexes(
      profile.shared,
      newStringArray,
      newSources,
      oldStringToNewStringPlusOne,
      oldSourceToNewSourcePlusOne
    );

  const newThreads = profile.threads.map((thread) =>
    _createThreadWithTranslatedIndexes(
      thread,
      oldStringToNewStringPlusOne,
      stringIndexMarkerFieldsByDataType
    )
  );

  const newProfile: Profile = {
    ...profile,
    shared: newShared,
    threads: newThreads,
  };

  return {
    profile: newProfile,
    oldStringToNewStringPlusOne,
    oldSourceToNewSourcePlusOne,
  };
}

function _gatherStringReferencesInThread(
  thread: RawThread,
  referencedStrings: Uint8Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
) {
  _gatherReferencesInMarkers(
    thread.markers,
    referencedStrings,
    stringIndexMarkerFieldsByDataType
  );
}

function _createThreadWithTranslatedIndexes(
  thread: RawThread,
  oldStringToNewStringPlusOne: Int32Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawThread {
  const newMarkers = _createMarkersWithTranslatedStringIndexes(
    thread.markers,
    oldStringToNewStringPlusOne,
    stringIndexMarkerFieldsByDataType
  );
  const newThread: RawThread = {
    ...thread,
    markers: newMarkers,
  };

  return newThread;
}

function _createdSharedDataWithTranslatedIndexes(
  oldShared: RawProfileSharedData,
  newStringArray: string[],
  newSources: SourceTable,
  oldStringToNewStringPlusOne: Int32Array,
  oldSourceToNewSourcePlusOne: Int32Array
): RawProfileSharedData {
  const newNativeSymbols = _createNativeSymbolsWithTranslatedStringIndexes(
    oldShared.nativeSymbols,
    oldStringToNewStringPlusOne
  );
  const newResourceTable = _createResourceTableWithTranslatedStringIndexes(
    oldShared.resourceTable,
    oldStringToNewStringPlusOne
  );
  const newFuncTable = _createFuncTableWithTranslatedIndexes(
    oldShared.funcTable,
    oldStringToNewStringPlusOne,
    oldSourceToNewSourcePlusOne
  );
  const newShared: RawProfileSharedData = {
    stringArray: newStringArray,
    sources: newSources,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    funcTable: newFuncTable,
    frameTable: oldShared.frameTable,
    stackTable: oldShared.stackTable,
  };
  return newShared;
}

function _gatherReferencesInMarkers(
  markers: RawMarkerTable,
  referencedStrings: Uint8Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
) {
  for (let i = 0; i < markers.length; i++) {
    referencedStrings[markers.name[i]] = 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    if (data.type) {
      const stringIndexMarkerFields = stringIndexMarkerFieldsByDataType.get(
        data.type
      );
      if (stringIndexMarkerFields !== undefined) {
        for (const fieldKey of stringIndexMarkerFields) {
          const stringIndex = (data as any)[fieldKey];
          if (typeof stringIndex === 'number') {
            referencedStrings[stringIndex] = 1;
          }
        }
      }
    }
  }
}

function _createMarkersWithTranslatedStringIndexes(
  markers: RawMarkerTable,
  oldStringToNewStringPlusOne: Int32Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawMarkerTable {
  const newDataCol = markers.data.slice();
  const newNameCol = markers.name.slice();
  for (let i = 0; i < markers.length; i++) {
    newNameCol[i] = oldStringToNewStringPlusOne[markers.name[i]] - 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    let newData = data;
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
              [fieldKey]: oldStringToNewStringPlusOne[stringIndex] - 1,
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

function _gatherReferencesInFuncTable(
  funcTable: FuncTable,
  referencedStrings: Uint8Array,
  sources: SourceTable
) {
  for (let i = 0; i < funcTable.length; i++) {
    referencedStrings[funcTable.name[i]] = 1;

    const sourceIndex = funcTable.source[i];
    if (sourceIndex !== null) {
      const urlIndex = sources.filename[sourceIndex];
      referencedStrings[urlIndex] = 1;
    }
  }
}

function _createFuncTableWithTranslatedIndexes(
  funcTable: FuncTable,
  oldStringToNewStringPlusOne: Int32Array,
  oldSourceToNewSourcePlusOne: Int32Array
): FuncTable {
  const newFuncTableNameCol = funcTable.name.slice();
  const newFuncTableSourceCol = funcTable.source.slice();
  for (let i = 0; i < funcTable.length; i++) {
    const name = funcTable.name[i];
    newFuncTableNameCol[i] = oldStringToNewStringPlusOne[name] - 1;

    // Translate source indexes to new compacted source table.
    const sourceIndex = funcTable.source[i];
    if (sourceIndex !== null) {
      const newSourceIndexPlusOne = oldSourceToNewSourcePlusOne[sourceIndex];
      newFuncTableSourceCol[i] = newSourceIndexPlusOne - 1;
    }
  }

  const newFuncTable = {
    ...funcTable,
    name: newFuncTableNameCol,
    source: newFuncTableSourceCol,
  };
  return newFuncTable;
}

function _gatherReferencesInResourceTable(
  resourceTable: ResourceTable,
  referencedStrings: Uint8Array
) {
  for (let i = 0; i < resourceTable.length; i++) {
    referencedStrings[resourceTable.name[i]] = 1;

    const host = resourceTable.host[i];
    if (host !== null) {
      referencedStrings[host] = 1;
    }
  }
}

function _createResourceTableWithTranslatedStringIndexes(
  resourceTable: ResourceTable,
  oldStringToNewStringPlusOne: Int32Array
): ResourceTable {
  const newResourceTableNameCol = resourceTable.name.slice();
  const newResourceTableHostCol = resourceTable.host.slice();
  for (let i = 0; i < resourceTable.length; i++) {
    const name = newResourceTableNameCol[i];
    newResourceTableNameCol[i] = oldStringToNewStringPlusOne[name] - 1;

    const host = newResourceTableHostCol[i];
    newResourceTableHostCol[i] =
      host !== null ? oldStringToNewStringPlusOne[host] - 1 : null;
  }

  const newResourceTable = {
    ...resourceTable,
    name: newResourceTableNameCol,
    host: newResourceTableHostCol,
  };
  return newResourceTable;
}

function _gatherReferencesInNativeSymbols(
  nativeSymbols: NativeSymbolTable,
  referencedStrings: Uint8Array
) {
  for (let i = 0; i < nativeSymbols.length; i++) {
    referencedStrings[nativeSymbols.name[i]] = 1;
  }
}

function _createNativeSymbolsWithTranslatedStringIndexes(
  nativeSymbols: NativeSymbolTable,
  oldStringToNewStringPlusOne: Int32Array
): NativeSymbolTable {
  const newNativeSymbolsNameCol = nativeSymbols.name.slice();
  for (let i = 0; i < nativeSymbols.length; i++) {
    newNativeSymbolsNameCol[i] =
      oldStringToNewStringPlusOne[newNativeSymbolsNameCol[i]] - 1;
  }

  const newNativeSymbols = {
    ...nativeSymbols,
    name: newNativeSymbolsNameCol,
  };
  return newNativeSymbols;
}

function _createCompactedStringArray(
  stringArray: string[],
  referencedStrings: Uint8Array
): { newStringArray: string[]; oldStringToNewStringPlusOne: Int32Array } {
  const oldStringToNewStringPlusOne = new Int32Array(stringArray.length);
  let nextIndex = 0;
  const newStringArray = [];
  for (let i = 0; i < stringArray.length; i++) {
    if (referencedStrings[i] === 0) {
      continue;
    }

    const newIndex = nextIndex++;
    newStringArray[newIndex] = stringArray[i];
    oldStringToNewStringPlusOne[i] = newIndex + 1;
  }

  return { newStringArray, oldStringToNewStringPlusOne };
}

function _createCompactedSourceTable(
  sourceTable: SourceTable,
  referencedSources: Uint8Array,
  oldStringToNewStringPlusOne: Int32Array
): { newSources: SourceTable; oldSourceToNewSourcePlusOne: Int32Array } {
  const oldSourceToNewSourcePlusOne = new Int32Array(sourceTable.length);
  let nextIndex = 0;
  const newUuid = [];
  const newFilename = [];

  for (let i = 0; i < sourceTable.length; i++) {
    if (referencedSources[i] === 0) {
      continue;
    }

    const newIndex = nextIndex++;
    newUuid[newIndex] = sourceTable.uuid[i];

    // Translate the filename string index
    const oldFilenameIndex = sourceTable.filename[i];
    const newFilenameIndexPlusOne =
      oldStringToNewStringPlusOne[oldFilenameIndex];
    if (newFilenameIndexPlusOne === 0) {
      throw new Error(
        `String index ${oldFilenameIndex} was not found in the translation map`
      );
    }
    newFilename[newIndex] = newFilenameIndexPlusOne - 1;

    oldSourceToNewSourcePlusOne[i] = newIndex + 1;
  }

  const newSources: SourceTable = {
    length: nextIndex,
    uuid: newUuid,
    filename: newFilename,
  };

  return { newSources, oldSourceToNewSourcePlusOne };
}
