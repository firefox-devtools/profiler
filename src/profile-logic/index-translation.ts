/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  CallNodePath,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoSourceTable,
  ProfileIndexTranslationMaps,
} from 'firefox-profiler/types';

// Returns the new resource index for the given old resource index.
// Returns null if the index has no new index equivalent, e.g. if
// the resource was removed because it wasn't used in the sanitized data.
export function translateResourceIndex(
  resourceIndex: IndexIntoResourceTable,
  translationMaps: ProfileIndexTranslationMaps
): IndexIntoResourceTable | null {
  const newResourceIndexPlusOne =
    translationMaps.oldResourceToNewResourcePlusOne[resourceIndex];
  return newResourceIndexPlusOne !== 0 ? newResourceIndexPlusOne - 1 : null;
}

// Returns the new source index for the given old source index.
// Returns null if the index has no new index equivalent.
export function translateSourceIndex(
  sourceIndex: IndexIntoSourceTable,
  translationMaps: ProfileIndexTranslationMaps
): IndexIntoSourceTable | null {
  const newSourceIndexPlusOne =
    translationMaps.oldSourceToNewSourcePlusOne[sourceIndex];
  return newSourceIndexPlusOne !== 0 ? newSourceIndexPlusOne - 1 : null;
}

// Returns the new func index for the given old func index.
// This handles indexes for "reserved funcs" for collapsed resources and
// collapsed sources, which are located after the regular funcTable.
// Returns null if the index has no new index equivalent.
export function translateFuncIndex(
  funcIndex: IndexIntoFuncTable,
  translationMaps: ProfileIndexTranslationMaps
): IndexIntoFuncTable | null {
  const oldFuncCount = translationMaps.oldFuncCount;
  if (funcIndex < oldFuncCount) {
    const newFuncIndexPlusOne =
      translationMaps.oldFuncToNewFuncPlusOne[funcIndex];
    return newFuncIndexPlusOne !== 0 ? newFuncIndexPlusOne - 1 : null;
  }
  const reservedOffset = funcIndex - oldFuncCount;
  const oldResourceCount = translationMaps.oldResourceCount;
  if (reservedOffset < oldResourceCount) {
    // This is a reserved func for a collapsed resource.
    const resourceIndex = reservedOffset;
    const newResourceIndex = translateResourceIndex(
      resourceIndex,
      translationMaps
    );
    return newResourceIndex !== null
      ? translationMaps.newFuncCount + newResourceIndex
      : null;
  }
  // This is a reserved func for a collapsed source.
  const sourceIndex = reservedOffset - oldResourceCount;
  const newSourceIndex = translateSourceIndex(sourceIndex, translationMaps);
  return newSourceIndex !== null
    ? translationMaps.newFuncCount +
        translationMaps.newResourceCount +
        newSourceIndex
    : null;
}

// Applies the func index translation map to each func in the call node path.
// If any of the indexes is missing (i.e. has no "new index" equivalent),
// this function returns null. In other words, the entire path is discarded.
export function translateCallNodePath(
  callNodePath: CallNodePath,
  translationMaps: ProfileIndexTranslationMaps
): CallNodePath | null {
  const newCallNodePath = new Array<IndexIntoFuncTable>();
  for (const funcIndex of callNodePath) {
    const funcIndexOrNull = translateFuncIndex(funcIndex, translationMaps);
    if (funcIndexOrNull === null) {
      return null;
    }
    newCallNodePath.push(funcIndexOrNull);
  }

  return newCallNodePath;
}
