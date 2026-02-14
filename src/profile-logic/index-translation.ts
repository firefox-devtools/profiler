/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  CallNodePath,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
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

// Returns the new func index for the given old func index.
// This handles indexes for "reserved funcs" for collapsed resources, which
// are located after the regular funcTable.
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
  // This must be a funcIndex from the "func table with reserved functions for collapsed resources".
  const resourceIndex = funcIndex - oldFuncCount;
  const newResourceIndex = translateResourceIndex(
    resourceIndex,
    translationMaps
  );
  return newResourceIndex !== null
    ? translationMaps.newFuncCount + newResourceIndex
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

  return newCallNodePath.length !== 0 ? newCallNodePath : null;
}
