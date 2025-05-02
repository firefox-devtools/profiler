/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import {
  getEmptyRawStackTable,
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyResourceTable,
  getEmptyNativeSymbolTable,
} from './data-structures';
import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';

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
  RawSamplesTable,
  NativeAllocationsTable,
  JsAllocationsTable,
  Lib,
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
  referencedLibs: Uint8Array,
|};

type ReferencedThreadData = {|
  referencedStacks: Uint8Array,
  referencedFrames: Uint8Array,
  referencedFuncs: Uint8Array,
  referencedResources: Uint8Array,
  referencedNativeSymbols: Uint8Array,
  referencedStrings: Uint8Array,
  referencedLibs: Uint8Array,
|};

type SharedDataTranslationMaps = {|
  oldStringToNewStringPlusOne: Int32Array,
  oldLibToNewLibPlusOne: Int32Array,
|};

type ThreadTranslationMaps = {|
  oldStackToNewStackPlusOne: Int32Array,
  oldFrameToNewFramePlusOne: Int32Array,
  oldFuncToNewFuncPlusOne: Int32Array,
  oldResourceToNewResourcePlusOne: Int32Array,
  oldNativeSymbolToNewNativeSymbolPlusOne: Int32Array,
  oldStringToNewStringPlusOne: Int32Array,
  oldLibToNewLibPlusOne: Int32Array,
|};

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
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(profile.meta.markerSchema);

  // Step 1: Gather all references.
  const referencedData = _gatherReferencesInProfile(
    profile,
    stringIndexMarkerFieldsByDataType
  );

  // Step 2: Create new tables for everything, skipping unreferenced entries.
  return _createCompactedProfile(
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
    referencedLibs: new Uint8Array(profile.libs.length),
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

function _createCompactedProfile(
  profile: Profile,
  referencedData: ReferencedProfileData,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedProfileWithTranslationMaps {
  const { shared } = profile;
  const sharedDataTranslationMaps: SharedDataTranslationMaps = {
    oldStringToNewStringPlusOne: new Int32Array(shared.stringArray.length),
    oldLibToNewLibPlusOne: new Int32Array(profile.libs.length),
  };

  const newStringArray = _createCompactedStringArray(
    profile.shared.stringArray,
    referencedData.referencedSharedData,
    sharedDataTranslationMaps
  );
  const newLibs = _createCompactedLibs(
    profile.libs,
    referencedData.referencedSharedData,
    sharedDataTranslationMaps
  );

  const threadDataTranslationMapsByThread = [];
  const newThreads = profile.threads.map((thread, threadIndex): RawThread => {
    const { compactedThread, translationMaps } = _createCompactedThread(
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
    libs: newLibs,
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
    referencedStacks: new Uint8Array(thread.stackTable.length),
    referencedFrames: new Uint8Array(thread.frameTable.length),
    referencedFuncs: new Uint8Array(thread.funcTable.length),
    referencedResources: new Uint8Array(thread.resourceTable.length),
    referencedNativeSymbols: new Uint8Array(thread.nativeSymbols.length),
    ...referencedSharedData,
  };
  _gatherReferencesInSamples(thread.samples, referencedThreadData);
  if (thread.jsAllocations) {
    _gatherReferencesInJsAllocations(
      thread.jsAllocations,
      referencedThreadData
    );
  }
  if (thread.nativeAllocations) {
    _gatherReferencesInNativeAllocations(
      thread.nativeAllocations,
      referencedThreadData
    );
  }
  _gatherReferencesInMarkers(
    thread.markers,
    stringIndexMarkerFieldsByDataType,
    referencedThreadData
  );

  _gatherReferencesInStackTable(thread.stackTable, referencedThreadData);
  _gatherReferencesInFrameTable(thread.frameTable, referencedThreadData);
  _gatherReferencesInFuncTable(thread.funcTable, referencedThreadData);
  _gatherReferencesInResourceTable(thread.resourceTable, referencedThreadData);
  _gatherReferencesInNativeSymbols(thread.nativeSymbols, referencedThreadData);
  return referencedThreadData;
}

function _createCompactedThread(
  thread: RawThread,
  references: ReferencedThreadData,
  sharedDataTranslationMaps: SharedDataTranslationMaps,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedThreadWithTranslationMaps {
  const translationMaps = {
    oldStackToNewStackPlusOne: new Int32Array(thread.stackTable.length),
    oldFrameToNewFramePlusOne: new Int32Array(thread.frameTable.length),
    oldFuncToNewFuncPlusOne: new Int32Array(thread.funcTable.length),
    oldResourceToNewResourcePlusOne: new Int32Array(
      thread.resourceTable.length
    ),
    oldNativeSymbolToNewNativeSymbolPlusOne: new Int32Array(
      thread.nativeSymbols.length
    ),
    ...sharedDataTranslationMaps,
  };
  const newNativeSymbols = _createCompactedNativeSymbols(
    thread.nativeSymbols,
    references,
    translationMaps
  );
  const newResourceTable = _createCompactedResourceTable(
    thread.resourceTable,
    references,
    translationMaps
  );
  const newFuncTable = _createCompactedFuncTable(
    thread.funcTable,
    references,
    translationMaps
  );
  const newFrameTable = _createCompactedFrameTable(
    thread.frameTable,
    references,
    translationMaps
  );
  const newStackTable = _createCompactedStackTable(
    thread.stackTable,
    references,
    translationMaps
  );
  const newSamples = _createCompactedSamples(thread.samples, translationMaps);
  const newJsAllocations = thread.jsAllocations
    ? _createCompactedJsAllocations(thread.jsAllocations, translationMaps)
    : undefined;
  const newNativeAllocations = thread.nativeAllocations
    ? _createCompactedNativeAllocations(
        thread.nativeAllocations,
        translationMaps
      )
    : undefined;
  const newMarkers = _createCompactedMarkers(
    thread.markers,
    translationMaps,
    stringIndexMarkerFieldsByDataType
  );
  const newThread: RawThread = {
    ...thread,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    funcTable: newFuncTable,
    frameTable: newFrameTable,
    stackTable: newStackTable,
    samples: newSamples,
    jsAllocations: newJsAllocations,
    nativeAllocations: newNativeAllocations,
    markers: newMarkers,
  };

  return { compactedThread: newThread, translationMaps };
}

function _gatherReferencesInSamples(
  samples: RawSamplesTable,
  references: ReferencedThreadData
) {
  _gatherReferencesInStackCol(samples.stack, references);
}

function _createCompactedSamples(
  samples: RawSamplesTable,
  translationMaps: ThreadTranslationMaps
): RawSamplesTable {
  return {
    ...samples,
    stack: _translateStackCol(samples.stack, translationMaps),
  };
}

function _gatherReferencesInJsAllocations(
  jsAllocations: JsAllocationsTable,
  references: ReferencedThreadData
) {
  _gatherReferencesInStackCol(jsAllocations.stack, references);
}

function _createCompactedJsAllocations(
  jsAllocations: JsAllocationsTable,
  translationMaps: ThreadTranslationMaps
): JsAllocationsTable {
  return {
    ...jsAllocations,
    stack: _translateStackCol(jsAllocations.stack, translationMaps),
  };
}

function _gatherReferencesInNativeAllocations(
  nativeAllocations: NativeAllocationsTable,
  references: ReferencedThreadData
) {
  _gatherReferencesInStackCol(nativeAllocations.stack, references);
}

function _createCompactedNativeAllocations(
  nativeAllocations: NativeAllocationsTable,
  translationMaps: ThreadTranslationMaps
): NativeAllocationsTable {
  return {
    ...nativeAllocations,
    stack: _translateStackCol(nativeAllocations.stack, translationMaps),
  };
}

function _gatherReferencesInStackCol(
  stackCol: Array<IndexIntoStackTable | null>,
  references: ReferencedThreadData
) {
  const { referencedStacks } = references;
  for (let i = 0; i < stackCol.length; i++) {
    const stack = stackCol[i];
    if (stack !== null) {
      referencedStacks[stack] = 1;
    }
  }
}

function _translateStackCol(
  stackCol: Array<IndexIntoStackTable | null>,
  translationMaps: ThreadTranslationMaps
): Array<IndexIntoStackTable | null> {
  const { oldStackToNewStackPlusOne } = translationMaps;
  const newStackCol = stackCol.slice();

  for (let i = 0; i < stackCol.length; i++) {
    const stack = stackCol[i];
    newStackCol[i] =
      stack !== null ? oldStackToNewStackPlusOne[stack] - 1 : null;
  }

  return newStackCol;
}

function _gatherReferencesInMarkers(
  markers: RawMarkerTable,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  references: ReferencedThreadData
) {
  const { referencedStacks, referencedStrings } = references;
  for (let i = 0; i < markers.length; i++) {
    referencedStrings[markers.name[i]] = 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    if (data.cause) {
      const stack = data.cause.stack;
      if (stack !== null) {
        referencedStacks[stack] = 1;
      }
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

function _createCompactedMarkers(
  markers: RawMarkerTable,
  translationMaps: ThreadTranslationMaps,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawMarkerTable {
  const { oldStackToNewStackPlusOne, oldStringToNewStringPlusOne } =
    translationMaps;
  const newDataCol = markers.data.slice();
  const newNameCol = markers.name.slice();
  for (let i = 0; i < markers.length; i++) {
    newNameCol[i] = oldStringToNewStringPlusOne[markers.name[i]] - 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    let newData = data;
    if (newData.cause) {
      const stack = newData.cause.stack;
      if (stack !== null) {
        newData = {
          ...newData,
          cause: {
            ...newData.cause,
            stack: oldStackToNewStackPlusOne[stack] - 1,
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

function _gatherReferencesInStackTable(
  stackTable: RawStackTable,
  references: ReferencedThreadData
) {
  const { referencedStacks, referencedFrames } = references;
  for (let i = stackTable.length - 1; i >= 0; i--) {
    if (referencedStacks[i] === 0) {
      continue;
    }

    const prefix = stackTable.prefix[i];
    if (prefix !== null) {
      referencedStacks[prefix] = 1;
    }
    referencedFrames[stackTable.frame[i]] = 1;
  }
}

function _createCompactedStackTable(
  stackTable: RawStackTable,
  { referencedStacks }: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): RawStackTable {
  const { oldStackToNewStackPlusOne, oldFrameToNewFramePlusOne } =
    translationMaps;
  const newStackTable = getEmptyRawStackTable();
  for (let i = 0; i < stackTable.length; i++) {
    if (referencedStacks[i] === 0) {
      continue;
    }

    const prefix = stackTable.prefix[i];

    const newIndex = newStackTable.length++;
    newStackTable.prefix[newIndex] =
      prefix !== null ? oldStackToNewStackPlusOne[prefix] - 1 : null;
    newStackTable.frame[newIndex] =
      oldFrameToNewFramePlusOne[stackTable.frame[i]] - 1;

    oldStackToNewStackPlusOne[i] = newIndex + 1;
  }

  return newStackTable;
}

function _gatherReferencesInFrameTable(
  frameTable: FrameTable,
  references: ReferencedThreadData
) {
  const { referencedFrames, referencedFuncs, referencedNativeSymbols } =
    references;
  for (let i = 0; i < frameTable.length; i++) {
    if (referencedFrames[i] === 0) {
      continue;
    }

    referencedFuncs[frameTable.func[i]] = 1;

    const nativeSymbol = frameTable.nativeSymbol[i];
    if (nativeSymbol !== null) {
      referencedNativeSymbols[nativeSymbol] = 1;
    }
  }
}

function _createCompactedFrameTable(
  frameTable: FrameTable,
  { referencedFrames }: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): FrameTable {
  const {
    oldFrameToNewFramePlusOne,
    oldFuncToNewFuncPlusOne,
    oldNativeSymbolToNewNativeSymbolPlusOne,
  } = translationMaps;
  const newFrameTable = getEmptyFrameTable();
  for (let i = 0; i < frameTable.length; i++) {
    if (referencedFrames[i] === 0) {
      continue;
    }

    const nativeSymbol = frameTable.nativeSymbol[i];

    const newIndex = newFrameTable.length++;
    newFrameTable.address[newIndex] = frameTable.address[i];
    newFrameTable.inlineDepth[newIndex] = frameTable.inlineDepth[i];
    newFrameTable.category[newIndex] = frameTable.category[i];
    newFrameTable.subcategory[newIndex] = frameTable.subcategory[i];
    newFrameTable.func[newIndex] =
      oldFuncToNewFuncPlusOne[frameTable.func[i]] - 1;
    newFrameTable.nativeSymbol[newIndex] =
      nativeSymbol !== null
        ? oldNativeSymbolToNewNativeSymbolPlusOne[nativeSymbol] - 1
        : null;
    newFrameTable.innerWindowID[newIndex] = frameTable.innerWindowID[i];
    newFrameTable.line[newIndex] = frameTable.line[i];
    newFrameTable.column[newIndex] = frameTable.column[i];

    oldFrameToNewFramePlusOne[i] = newIndex + 1;
  }

  return newFrameTable;
}

function _gatherReferencesInFuncTable(
  funcTable: FuncTable,
  references: ReferencedThreadData
) {
  const { referencedFuncs, referencedStrings, referencedResources } =
    references;
  for (let i = 0; i < funcTable.length; i++) {
    if (referencedFuncs[i] === 0) {
      continue;
    }

    referencedStrings[funcTable.name[i]] = 1;

    const fileNameIndex = funcTable.fileName[i];
    if (fileNameIndex !== null) {
      referencedStrings[fileNameIndex] = 1;
    }

    const resource = funcTable.resource[i];
    if (resource !== -1) {
      referencedResources[resource] = 1;
    }
  }
}

function _createCompactedFuncTable(
  funcTable: FuncTable,
  { referencedFuncs }: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): FuncTable {
  const {
    oldFuncToNewFuncPlusOne,
    oldResourceToNewResourcePlusOne,
    oldStringToNewStringPlusOne,
  } = translationMaps;
  const newFuncTable = getEmptyFuncTable();
  for (let i = 0; i < funcTable.length; i++) {
    if (referencedFuncs[i] === 0) {
      continue;
    }

    const resource = funcTable.resource[i];
    const fileName = funcTable.fileName[i];

    const newIndex = newFuncTable.length++;
    newFuncTable.name[newIndex] =
      oldStringToNewStringPlusOne[funcTable.name[i]] - 1;
    newFuncTable.isJS[newIndex] = funcTable.isJS[i];
    newFuncTable.relevantForJS[newIndex] = funcTable.relevantForJS[i];
    newFuncTable.resource[newIndex] =
      resource !== -1 ? oldResourceToNewResourcePlusOne[resource] - 1 : -1;
    newFuncTable.fileName[newIndex] =
      fileName !== null ? oldStringToNewStringPlusOne[fileName] - 1 : null;
    newFuncTable.lineNumber[newIndex] = funcTable.lineNumber[i];
    newFuncTable.columnNumber[newIndex] = funcTable.columnNumber[i];

    oldFuncToNewFuncPlusOne[i] = newIndex + 1;
  }

  return newFuncTable;
}

function _gatherReferencesInResourceTable(
  resourceTable: ResourceTable,
  references: ReferencedThreadData
) {
  const { referencedResources, referencedStrings, referencedLibs } = references;
  for (let i = 0; i < resourceTable.length; i++) {
    if (referencedResources[i] === 0) {
      continue;
    }

    referencedStrings[resourceTable.name[i]] = 1;

    const host = resourceTable.host[i];
    if (host !== null) {
      referencedStrings[host] = 1;
    }

    const lib = resourceTable.lib[i];
    if (lib !== null) {
      referencedLibs[lib] = 1;
    }
  }
}

function _createCompactedResourceTable(
  resourceTable: ResourceTable,
  { referencedResources }: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): ResourceTable {
  const {
    oldResourceToNewResourcePlusOne,
    oldStringToNewStringPlusOne,
    oldLibToNewLibPlusOne,
  } = translationMaps;
  const newResourceTable = getEmptyResourceTable();
  for (let i = 0; i < resourceTable.length; i++) {
    if (referencedResources[i] === 0) {
      continue;
    }

    const host = resourceTable.host[i];
    const lib = resourceTable.lib[i];

    const newIndex = newResourceTable.length++;
    newResourceTable.name[newIndex] =
      oldStringToNewStringPlusOne[resourceTable.name[i]] - 1;
    newResourceTable.host[newIndex] =
      host !== null ? oldStringToNewStringPlusOne[host] - 1 : null;
    newResourceTable.lib[newIndex] =
      lib !== null ? oldLibToNewLibPlusOne[lib] - 1 : null;
    newResourceTable.type[newIndex] = resourceTable.type[i];

    oldResourceToNewResourcePlusOne[i] = newIndex + 1;
  }

  return newResourceTable;
}

function _gatherReferencesInNativeSymbols(
  nativeSymbols: NativeSymbolTable,
  references: ReferencedThreadData
) {
  const { referencedNativeSymbols, referencedStrings, referencedLibs } =
    references;
  for (let i = 0; i < nativeSymbols.length; i++) {
    if (referencedNativeSymbols[i] === 0) {
      continue;
    }

    referencedStrings[nativeSymbols.name[i]] = 1;
    referencedLibs[nativeSymbols.libIndex[i]] = 1;
  }
}

function _createCompactedNativeSymbols(
  nativeSymbols: NativeSymbolTable,
  { referencedNativeSymbols }: ReferencedThreadData,
  translationMaps: ThreadTranslationMaps
): NativeSymbolTable {
  const {
    oldNativeSymbolToNewNativeSymbolPlusOne,
    oldStringToNewStringPlusOne,
    oldLibToNewLibPlusOne,
  } = translationMaps;
  const newNativeSymbols = getEmptyNativeSymbolTable();
  for (let i = 0; i < nativeSymbols.length; i++) {
    if (referencedNativeSymbols[i] === 0) {
      continue;
    }

    const newIndex = newNativeSymbols.length++;
    newNativeSymbols.name[newIndex] =
      oldStringToNewStringPlusOne[nativeSymbols.name[i]] - 1;
    newNativeSymbols.libIndex[newIndex] =
      oldLibToNewLibPlusOne[nativeSymbols.libIndex[i]] - 1;
    newNativeSymbols.address[newIndex] = nativeSymbols.address[i];
    newNativeSymbols.functionSize[newIndex] = nativeSymbols.functionSize[i];

    oldNativeSymbolToNewNativeSymbolPlusOne[i] = newIndex + 1;
  }

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

function _createCompactedLibs(
  libs: Lib[],
  referencedSharedData: ReferencedSharedData,
  sharedDataTranslationMaps: SharedDataTranslationMaps
): Lib[] {
  const { referencedLibs } = referencedSharedData;
  const { oldLibToNewLibPlusOne } = sharedDataTranslationMaps;
  let nextIndex = 0;
  const newLibs = [];
  for (let i = 0; i < libs.length; i++) {
    if (referencedLibs[i] === 0) {
      continue;
    }

    const newIndex = nextIndex++;
    newLibs[newIndex] = libs[i];
    oldLibToNewLibPlusOne[i] = newIndex + 1;
  }

  return newLibs;
}
