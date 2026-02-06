/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getEmptyRawStackTable,
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyResourceTable,
  getEmptyNativeSymbolTable,
  getEmptySourceTable,
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
  SourceTable,
} from 'firefox-profiler/types';

export type CompactedProfileWithTranslationMaps = {
  profile: Profile;
  translationMaps: TranslationMaps;
};

type ReferencedProfileData = {
  referencedStacks: Uint8Array;
  referencedFrames: Uint8Array;
  referencedFuncs: Uint8Array;
  referencedResources: Uint8Array;
  referencedNativeSymbols: Uint8Array;
  referencedSources: Uint8Array;
  referencedStrings: Uint8Array;
  referencedLibs: Uint8Array;
};

type TranslationMaps = {
  oldStackToNewStackPlusOne: Int32Array;
  oldFrameToNewFramePlusOne: Int32Array;
  oldFuncToNewFuncPlusOne: Int32Array;
  oldResourceToNewResourcePlusOne: Int32Array;
  oldNativeSymbolToNewNativeSymbolPlusOne: Int32Array;
  oldSourceToNewSourcePlusOne: Int32Array;
  oldStringToNewStringPlusOne: Int32Array;
  oldLibToNewLibPlusOne: Int32Array;
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
  const { shared, threads } = profile;
  const referencedSharedData: ReferencedProfileData = {
    referencedStacks: new Uint8Array(shared.stackTable.length),
    referencedFrames: new Uint8Array(shared.frameTable.length),
    referencedFuncs: new Uint8Array(shared.funcTable.length),
    referencedResources: new Uint8Array(shared.resourceTable.length),
    referencedNativeSymbols: new Uint8Array(shared.nativeSymbols.length),
    referencedSources: new Uint8Array(shared.sources.length),
    referencedLibs: new Uint8Array(profile.libs.length),
    referencedStrings: new Uint8Array(shared.stringArray.length),
  };

  for (const thread of threads) {
    _gatherReferencesInThread(
      thread,
      referencedSharedData,
      stringIndexMarkerFieldsByDataType
    );
  }

  _gatherReferencesInStackTable(shared.stackTable, referencedSharedData);
  _gatherReferencesInFrameTable(shared.frameTable, referencedSharedData);
  _gatherReferencesInFuncTable(shared.funcTable, referencedSharedData);
  _gatherReferencesInResourceTable(shared.resourceTable, referencedSharedData);
  _gatherReferencesInNativeSymbols(shared.nativeSymbols, referencedSharedData);
  _gatherReferencesInSources(shared.sources, referencedSharedData);

  return referencedSharedData;
}

function _createCompactedProfile(
  profile: Profile,
  referencedSharedData: ReferencedProfileData,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): CompactedProfileWithTranslationMaps {
  const { shared } = profile;
  const translationMaps: TranslationMaps = {
    oldStackToNewStackPlusOne: new Int32Array(shared.stackTable.length),
    oldFrameToNewFramePlusOne: new Int32Array(shared.frameTable.length),
    oldFuncToNewFuncPlusOne: new Int32Array(shared.funcTable.length),
    oldResourceToNewResourcePlusOne: new Int32Array(
      shared.resourceTable.length
    ),
    oldNativeSymbolToNewNativeSymbolPlusOne: new Int32Array(
      shared.nativeSymbols.length
    ),
    oldSourceToNewSourcePlusOne: new Int32Array(shared.sources.length),
    oldStringToNewStringPlusOne: new Int32Array(shared.stringArray.length),
    oldLibToNewLibPlusOne: new Int32Array(profile.libs.length),
  };

  const newStringArray = _createCompactedStringArray(
    shared.stringArray,
    referencedSharedData,
    translationMaps
  );
  const newLibs = _createCompactedLibs(
    profile.libs,
    referencedSharedData,
    translationMaps
  );
  const newSources = _createCompactedSources(
    shared.sources,
    referencedSharedData,
    translationMaps
  );
  const newNativeSymbols = _createCompactedNativeSymbols(
    shared.nativeSymbols,
    referencedSharedData,
    translationMaps
  );
  const newResourceTable = _createCompactedResourceTable(
    shared.resourceTable,
    referencedSharedData,
    translationMaps
  );
  const newFuncTable = _createCompactedFuncTable(
    shared.funcTable,
    referencedSharedData,
    translationMaps
  );
  const newFrameTable = _createCompactedFrameTable(
    shared.frameTable,
    referencedSharedData,
    translationMaps
  );
  const newStackTable = _createCompactedStackTable(
    shared.stackTable,
    referencedSharedData,
    translationMaps
  );

  const newThreads = profile.threads.map(
    (thread): RawThread =>
      _createCompactedThread(
        thread,
        translationMaps,
        stringIndexMarkerFieldsByDataType
      )
  );

  const newShared: RawProfileSharedData = {
    stringArray: newStringArray,
    sources: newSources,
    nativeSymbols: newNativeSymbols,
    resourceTable: newResourceTable,
    funcTable: newFuncTable,
    frameTable: newFrameTable,
    stackTable: newStackTable,
  };

  const newProfile: Profile = {
    ...profile,
    libs: newLibs,
    shared: newShared,
    threads: newThreads,
  };

  return {
    profile: newProfile,
    translationMaps,
  };
}

function _gatherReferencesInThread(
  thread: RawThread,
  referencedSharedData: ReferencedProfileData,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
) {
  _gatherReferencesInSamples(thread.samples, referencedSharedData);
  if (thread.jsAllocations) {
    _gatherReferencesInJsAllocations(
      thread.jsAllocations,
      referencedSharedData
    );
  }
  if (thread.nativeAllocations) {
    _gatherReferencesInNativeAllocations(
      thread.nativeAllocations,
      referencedSharedData
    );
  }
  _gatherReferencesInMarkers(
    thread.markers,
    stringIndexMarkerFieldsByDataType,
    referencedSharedData
  );
}

function _createCompactedThread(
  thread: RawThread,
  translationMaps: TranslationMaps,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): RawThread {
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
    samples: newSamples,
    jsAllocations: newJsAllocations,
    nativeAllocations: newNativeAllocations,
    markers: newMarkers,
  };

  return newThread;
}

function _gatherReferencesInSamples(
  samples: RawSamplesTable,
  references: ReferencedProfileData
) {
  _gatherReferencesInStackCol(samples.stack, references);
}

function _createCompactedSamples(
  samples: RawSamplesTable,
  translationMaps: TranslationMaps
): RawSamplesTable {
  return {
    ...samples,
    stack: _translateStackCol(samples.stack, translationMaps),
  };
}

function _gatherReferencesInJsAllocations(
  jsAllocations: JsAllocationsTable,
  references: ReferencedProfileData
) {
  _gatherReferencesInStackCol(jsAllocations.stack, references);
}

function _createCompactedJsAllocations(
  jsAllocations: JsAllocationsTable,
  translationMaps: TranslationMaps
): JsAllocationsTable {
  return {
    ...jsAllocations,
    stack: _translateStackCol(jsAllocations.stack, translationMaps),
  };
}

function _gatherReferencesInNativeAllocations(
  nativeAllocations: NativeAllocationsTable,
  references: ReferencedProfileData
) {
  _gatherReferencesInStackCol(nativeAllocations.stack, references);
}

function _createCompactedNativeAllocations(
  nativeAllocations: NativeAllocationsTable,
  translationMaps: TranslationMaps
): NativeAllocationsTable {
  return {
    ...nativeAllocations,
    stack: _translateStackCol(nativeAllocations.stack, translationMaps),
  };
}

function _gatherReferencesInStackCol(
  stackCol: Array<IndexIntoStackTable | null>,
  references: ReferencedProfileData
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
  translationMaps: TranslationMaps
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
  references: ReferencedProfileData
) {
  const { referencedStacks, referencedStrings } = references;
  for (let i = 0; i < markers.length; i++) {
    referencedStrings[markers.name[i]] = 1;

    const data = markers.data[i];
    if (!data) {
      continue;
    }

    if ('cause' in data && data.cause) {
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
          const stringIndex = (data as any)[fieldKey];
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
  translationMaps: TranslationMaps,
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
    if ('cause' in newData && newData.cause) {
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

function _gatherReferencesInStackTable(
  stackTable: RawStackTable,
  references: ReferencedProfileData
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
  { referencedStacks }: ReferencedProfileData,
  translationMaps: TranslationMaps
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
  references: ReferencedProfileData
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
  { referencedFrames }: ReferencedProfileData,
  translationMaps: TranslationMaps
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
  references: ReferencedProfileData
) {
  const {
    referencedFuncs,
    referencedStrings,
    referencedSources,
    referencedResources,
  } = references;
  for (let i = 0; i < funcTable.length; i++) {
    if (referencedFuncs[i] === 0) {
      continue;
    }

    referencedStrings[funcTable.name[i]] = 1;

    const source = funcTable.source[i];
    if (source !== null) {
      referencedSources[source] = 1;
    }

    const resource = funcTable.resource[i];
    if (resource !== -1) {
      referencedResources[resource] = 1;
    }
  }
}

function _createCompactedFuncTable(
  funcTable: FuncTable,
  { referencedFuncs }: ReferencedProfileData,
  translationMaps: TranslationMaps
): FuncTable {
  const {
    oldFuncToNewFuncPlusOne,
    oldResourceToNewResourcePlusOne,
    oldSourceToNewSourcePlusOne,
    oldStringToNewStringPlusOne,
  } = translationMaps;
  const newFuncTable = getEmptyFuncTable();
  for (let i = 0; i < funcTable.length; i++) {
    if (referencedFuncs[i] === 0) {
      continue;
    }

    const resource = funcTable.resource[i];
    const source = funcTable.source[i];

    const newIndex = newFuncTable.length++;
    newFuncTable.name[newIndex] =
      oldStringToNewStringPlusOne[funcTable.name[i]] - 1;
    newFuncTable.isJS[newIndex] = funcTable.isJS[i];
    newFuncTable.relevantForJS[newIndex] = funcTable.relevantForJS[i];
    newFuncTable.resource[newIndex] =
      resource !== -1 ? oldResourceToNewResourcePlusOne[resource] - 1 : -1;
    newFuncTable.source[newIndex] =
      source !== null ? oldSourceToNewSourcePlusOne[source] - 1 : null;
    newFuncTable.lineNumber[newIndex] = funcTable.lineNumber[i];
    newFuncTable.columnNumber[newIndex] = funcTable.columnNumber[i];

    oldFuncToNewFuncPlusOne[i] = newIndex + 1;
  }

  return newFuncTable;
}

function _gatherReferencesInResourceTable(
  resourceTable: ResourceTable,
  references: ReferencedProfileData
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
  { referencedResources }: ReferencedProfileData,
  translationMaps: TranslationMaps
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
  references: ReferencedProfileData
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
  { referencedNativeSymbols }: ReferencedProfileData,
  translationMaps: TranslationMaps
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

function _gatherReferencesInSources(
  sources: SourceTable,
  references: ReferencedProfileData
) {
  const { referencedSources, referencedStrings } = references;
  for (let i = 0; i < sources.length; i++) {
    if (referencedSources[i] === 0) {
      continue;
    }

    referencedStrings[sources.filename[i]] = 1;
  }
}

function _createCompactedSources(
  sources: SourceTable,
  { referencedSources }: ReferencedProfileData,
  translationMaps: TranslationMaps
): SourceTable {
  const { oldSourceToNewSourcePlusOne, oldStringToNewStringPlusOne } =
    translationMaps;
  const newSources = getEmptySourceTable();
  for (let i = 0; i < sources.length; i++) {
    if (referencedSources[i] === 0) {
      continue;
    }

    const newIndex = newSources.length++;
    newSources.filename[newIndex] =
      oldStringToNewStringPlusOne[sources.filename[i]] - 1;
    newSources.uuid[newIndex] = sources.uuid[i];

    oldSourceToNewSourcePlusOne[i] = newIndex + 1;
  }

  return newSources;
}

function _createCompactedStringArray(
  stringArray: string[],
  { referencedStrings }: ReferencedProfileData,
  translationMaps: TranslationMaps
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
  referencedSharedData: ReferencedProfileData,
  translationMaps: TranslationMaps
): Lib[] {
  const { referencedLibs } = referencedSharedData;
  const { oldLibToNewLibPlusOne } = translationMaps;
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
