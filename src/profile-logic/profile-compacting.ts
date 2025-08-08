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
} from 'firefox-profiler/types';

export type CompactedProfileWithTranslationMaps = {
  profile: Profile;
  oldStringToNewStringPlusOne: Int32Array;
};

/**
 * Returns a new profile with all unreferenced strings removed.
 *
 * Since the string table is shared between all threads, if the user asks for a
 * thread to be removed during sanitization, by default we'd keep the strings
 * from the removed threads in the profile.
 *
 * By calling this function, you can get a profile with an adjusted string table
 * where those unused strings from the removed threads have been removed.
 */
export function computeCompactedProfile(
  profile: Profile
): CompactedProfileWithTranslationMaps {
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);

  // Step 1: Gather all references.
  const referencedStrings = _gatherStringReferencesInProfile(
    profile,
    stringIndexMarkerFieldsByDataType
  );

  // Step 2: Adjust all tables to use new string indexes.
  return _createProfileWithTranslatedStringIndexes(
    profile,
    referencedStrings,
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

  return referencedStrings;
}

function _createProfileWithTranslatedStringIndexes(
  profile: Profile,
  referencedStrings: Uint8Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedProfileWithTranslationMaps {
  const { newStringArray, oldStringToNewStringPlusOne } =
    _createCompactedStringArray(profile.shared.stringArray, referencedStrings);

  const newThreads = profile.threads.map((thread) =>
    _createThreadWithTranslatedStringIndexes(
      thread,
      oldStringToNewStringPlusOne,
      stringIndexMarkerFieldsByDataType
    )
  );

  const newShared: RawProfileSharedData = {
    stringArray: newStringArray,
  };

  const newProfile: Profile = {
    ...profile,
    shared: newShared,
    threads: newThreads,
  };

  return {
    profile: newProfile,
    oldStringToNewStringPlusOne,
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

  _gatherReferencesInFuncTable(thread.funcTable, referencedStrings);
  _gatherReferencesInResourceTable(thread.resourceTable, referencedStrings);
  _gatherReferencesInNativeSymbols(thread.nativeSymbols, referencedStrings);
}

function _createThreadWithTranslatedStringIndexes(
  thread: RawThread,
  oldStringToNewStringPlusOne: Int32Array,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawThread {
  const newNativeSymbols = _createNativeSymbolsWithTranslatedStringIndexes(
    thread.nativeSymbols,
    oldStringToNewStringPlusOne
  );
  const newResourceTable = _createResourceTableWithTranslatedStringIndexes(
    thread.resourceTable,
    oldStringToNewStringPlusOne
  );
  const newFuncTable = _createFuncTableWithTranslatedStringIndexes(
    thread.funcTable,
    oldStringToNewStringPlusOne
  );
  const newMarkers = _createMarkersWithTranslatedStringIndexes(
    thread.markers,
    oldStringToNewStringPlusOne,
    stringIndexMarkerFieldsByDataType
  );
  const newThread: RawThread = {
    ...thread,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    funcTable: newFuncTable,
    markers: newMarkers,
  };

  return newThread;
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
  referencedStrings: Uint8Array
) {
  for (let i = 0; i < funcTable.length; i++) {
    referencedStrings[funcTable.name[i]] = 1;

    const fileNameIndex = funcTable.fileName[i];
    if (fileNameIndex !== null) {
      referencedStrings[fileNameIndex] = 1;
    }
  }
}

function _createFuncTableWithTranslatedStringIndexes(
  funcTable: FuncTable,
  oldStringToNewStringPlusOne: Int32Array
): FuncTable {
  const newFuncTableNameCol = funcTable.name.slice();
  const newFuncTableFileNameCol = funcTable.fileName.slice();
  for (let i = 0; i < funcTable.length; i++) {
    const name = funcTable.name[i];
    newFuncTableNameCol[i] = oldStringToNewStringPlusOne[name] - 1;

    const fileName = funcTable.fileName[i];
    newFuncTableFileNameCol[i] =
      fileName !== null ? oldStringToNewStringPlusOne[fileName] - 1 : null;
  }

  const newFuncTable = {
    ...funcTable,
    name: newFuncTableNameCol,
    fileName: newFuncTableFileNameCol,
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
