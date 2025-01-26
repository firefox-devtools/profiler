/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

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

export type CompactedProfileWithTranslationMaps = {|
  profile: Profile,
  sharedDataTranslationMaps: SharedDataTranslationMaps,
  threadDataTranslationMapsByThread: ThreadTranslationMaps[],
|};

type CompactedThreadWithTranslationMaps = {
  compactedThread: RawThread,
  translationMaps: ThreadTranslationMaps,
};

type ReferencedProfileData = {|
  referencedSharedData: ReferencedSharedData,
  referencedThreadDataPerThread: ReferencedThreadData[],
|};

type ReferencedSharedData = {|
  referencedStrings: Uint8Array,
|};

type ReferencedThreadData = {|
  referencedStrings: Uint8Array,
|};

type SharedDataTranslationMaps = {|
  oldStringToNewStringPlusOne: Int32Array,
|};

type ThreadTranslationMaps = {|
  oldStringToNewStringPlusOne: Int32Array,
|};

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
  const referencedData = _gatherReferencesInProfile(
    profile,
    stringIndexMarkerFieldsByDataType
  );

  // Step 2: Adjust all tables to use new string indexes.
  return _createProfileWithTranslatedStringIndexes(
    profile,
    referencedData,
    stringIndexMarkerFieldsByDataType
  );
}

function _gatherReferencesInProfile(
  profile: Profile,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): ReferencedProfileData {
  const referencedSharedData: ReferencedSharedData = {
    referencedStrings: new Uint8Array(profile.shared.stringArray.length),
  };

  const referencedThreadDataPerThread = profile.threads.map((thread) =>
    _gatherReferencesInThread(
      thread,
      referencedSharedData,
      stringIndexMarkerFieldsByDataType
    )
  );

  return { referencedSharedData, referencedThreadDataPerThread };
}

function _createProfileWithTranslatedStringIndexes(
  profile: Profile,
  referencedData: ReferencedProfileData,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedProfileWithTranslationMaps {
  const { shared } = profile;
  const sharedDataTranslationMaps: SharedDataTranslationMaps = {
    oldStringToNewStringPlusOne: new Int32Array(shared.stringArray.length),
  };

  const newStringArray = _createCompactedStringArray(
    profile.shared.stringArray,
    referencedData.referencedSharedData,
    sharedDataTranslationMaps
  );

  const threadDataTranslationMapsByThread = [];
  const newThreads = profile.threads.map((thread, threadIndex): RawThread => {
    const { compactedThread, translationMaps } =
      _createThreadWithTranslatedStringIndexes(
        thread,
        referencedData.referencedThreadDataPerThread[threadIndex],
        sharedDataTranslationMaps,
        stringIndexMarkerFieldsByDataType
      );
    threadDataTranslationMapsByThread[threadIndex] = translationMaps;
    return compactedThread;
  });

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
    sharedDataTranslationMaps,
    threadDataTranslationMapsByThread,
  };
}

function _gatherReferencesInThread(
  thread: RawThread,
  referencedSharedData: ReferencedSharedData,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): ReferencedThreadData {
  const referencedThreadData: ReferencedThreadData = {
    ...referencedSharedData,
  };
  _gatherReferencesInMarkers(
    thread.markers,
    stringIndexMarkerFieldsByDataType,
    referencedThreadData
  );

  _gatherReferencesInFuncTable(thread.funcTable, referencedThreadData);
  _gatherReferencesInResourceTable(thread.resourceTable, referencedThreadData);
  _gatherReferencesInNativeSymbols(thread.nativeSymbols, referencedThreadData);
  return referencedThreadData;
}

function _createThreadWithTranslatedStringIndexes(
  thread: RawThread,
  references: ReferencedThreadData,
  sharedDataTranslationMaps: SharedDataTranslationMaps,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedThreadWithTranslationMaps {
  const translationMaps = {
    ...sharedDataTranslationMaps,
  };
  const newNativeSymbols = _createNativeSymbolsWithTranslatedStringIndexes(
    thread.nativeSymbols,
    references,
    translationMaps
  );
  const newResourceTable = _createResourceTableWithTranslatedStringIndexes(
    thread.resourceTable,
    references,
    translationMaps
  );
  const newFuncTable = _createFuncTableWithTranslatedStringIndexes(
    thread.funcTable,
    references,
    translationMaps
  );
  const newMarkers = _createMarkersWithTranslatedStringIndexes(
    thread.markers,
    translationMaps,
    stringIndexMarkerFieldsByDataType
  );
  const newThread: RawThread = {
    ...thread,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    funcTable: newFuncTable,
    markers: newMarkers,
  };

  return { compactedThread: newThread, translationMaps };
}

function _gatherReferencesInMarkers(
  markers: RawMarkerTable,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  references: ReferencedThreadData
) {
  const { referencedStrings } = references;
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
          const stringIndex = data[fieldKey];
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
  translationMaps: ThreadTranslationMaps,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawMarkerTable {
  const { oldStringToNewStringPlusOne } = translationMaps;
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
          const stringIndex = data[fieldKey];
          if (typeof stringIndex === 'number') {
            newData = {
              ...newData,
              [fieldKey]: oldStringToNewStringPlusOne[stringIndex] - 1,
            };
          }
        }
      }
    }

    newDataCol[i] = (newData: any);
  }

  return {
    ...markers,
    name: newNameCol,
    data: newDataCol,
  };
}

function _gatherReferencesInFuncTable(
  funcTable: FuncTable,
  references: ReferencedThreadData
) {
  const { referencedStrings } = references;
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
  _referencedThreadData: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): FuncTable {
  const { oldStringToNewStringPlusOne } = translationMaps;
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
  references: ReferencedThreadData
) {
  const { referencedStrings } = references;
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
  _referencedThreadData: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): ResourceTable {
  const { oldStringToNewStringPlusOne } = translationMaps;
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
  references: ReferencedThreadData
) {
  const { referencedStrings } = references;
  for (let i = 0; i < nativeSymbols.length; i++) {
    referencedStrings[nativeSymbols.name[i]] = 1;
  }
}

function _createNativeSymbolsWithTranslatedStringIndexes(
  nativeSymbols: NativeSymbolTable,
  _referencedThreadData: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): NativeSymbolTable {
  const { oldStringToNewStringPlusOne } = translationMaps;
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
  { referencedStrings }: ReferencedSharedData,
  translationMaps: SharedDataTranslationMaps
): string[] {
  const { oldStringToNewStringPlusOne } = translationMaps;
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

  return newStringArray;
}
