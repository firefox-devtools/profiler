/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  IndexIntoFrameTable,
  IndexIntoStackTable,
  RawStackTable,
  IndexIntoFuncTable,
  Profile,
} from '../types/profile';
import {
  shallowCloneFrameTable,
  shallowCloneFuncTable,
} from 'firefox-profiler/profile-logic/data-structures';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { updateRawThreadStacks } from 'firefox-profiler/profile-logic/profile-data';

export type BucketDescription = {
  name: string;
  funcPrefixes: string[];
};

export function insertStackLabels(
  profile: Profile,
  bucketDescriptions: BucketDescription[]
): Profile {
  const bucketCategory = profile.meta.categories!.length;
  profile.meta.categories!.push({
    name: 'Bucket',
    color: 'blue',
    subcategories: ['Other'],
  });

  const {
    funcTable: oldFuncTable,
    frameTable: oldFrameTable,
    stackTable: oldStackTable,
    sources,
    stringArray,
  } = profile.shared;
  const frameTable = shallowCloneFrameTable(oldFrameTable);
  const funcTable = shallowCloneFuncTable(oldFuncTable);
  const stringTable = StringTable.withBackingArray(stringArray);
  const unaccountedBucketFrameIndex = frameTable.length;
  const bucketFramesStartIndex = unaccountedBucketFrameIndex + 1;
  const allBucketNames = [
    'Unaccounted',
    ...bucketDescriptions.map((bucket) => bucket.name),
  ];
  for (let i = 0; i < allBucketNames.length; i++) {
    const bucketName = allBucketNames[i];
    const funcIndex = funcTable.length++;
    funcTable.name[funcIndex] = stringTable.indexForString(bucketName);
    funcTable.resource[funcIndex] = -1;
    funcTable.source[funcIndex] = null;
    funcTable.lineNumber[funcIndex] = null;
    funcTable.columnNumber[funcIndex] = null;
    funcTable.isJS[funcIndex] = false;
    funcTable.relevantForJS[funcIndex] = true;

    const frameIndex = frameTable.length++;
    frameTable.func[frameIndex] = funcIndex;
    frameTable.category[frameIndex] = bucketCategory;
    frameTable.subcategory[frameIndex] = 0;
    frameTable.nativeSymbol[frameIndex] = null;
    frameTable.address[frameIndex] = 0;
    frameTable.inlineDepth[frameIndex] = 0;
    frameTable.line[frameIndex] = null;
    frameTable.column[frameIndex] = null;
    frameTable.innerWindowID[frameIndex] = null;
  }

  function getBucketIndexForFunc(funcIndex: IndexIntoFuncTable): number | null {
    let nameString = stringArray[funcTable.name[funcIndex]];
    const sourceIndex = funcTable.source[funcIndex];
    if (sourceIndex !== null) {
      const filenameString = stringArray[sources.filename[sourceIndex]];
      const line = funcTable.lineNumber[funcIndex];
      const col = funcTable.columnNumber[funcIndex];
      if (line !== null && col !== null) {
        nameString += ` (${filenameString}:${line}:${col})`;
      } else if (line !== null) {
        nameString += ` (${filenameString}:${line})`;
      } else {
        nameString += ` (${filenameString})`;
      }
    }
    for (
      let bucketIndex = 0;
      bucketIndex < bucketDescriptions.length;
      bucketIndex++
    ) {
      const bucketDescription = bucketDescriptions[bucketIndex];
      for (
        let prefixIndex = 0;
        prefixIndex < bucketDescription.funcPrefixes.length;
        prefixIndex++
      ) {
        const funcNamePrefix = bucketDescription.funcPrefixes[prefixIndex];
        if (nameString.startsWith(funcNamePrefix)) {
          return bucketIndex;
        }
      }
    }
    return null;
  }

  const funcIndexToBucketFrameIndex = new Array<number | null>(
    funcTable.length
  );
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    const bucketIndex = getBucketIndexForFunc(funcIndex);
    const bucketFrameIndex =
      bucketIndex !== null ? bucketFramesStartIndex + bucketIndex : null;
    funcIndexToBucketFrameIndex[funcIndex] = bucketFrameIndex;
  }

  const bucketFrameIndexToInsertAtStack = new Array<number | null>(
    oldStackTable.length
  );
  const inheritedBucketFrameIndexAtStack =
    new Array<IndexIntoFrameTable | null>(oldStackTable.length);
  let stacksToInsertCount = 0;
  for (let stackIndex = 0; stackIndex < oldStackTable.length; stackIndex++) {
    const parentStackIndex = oldStackTable.prefix[stackIndex];
    const inheritedBucketFrameIndex =
      parentStackIndex !== null
        ? inheritedBucketFrameIndexAtStack[parentStackIndex]
        : null;
    const frameIndex = oldStackTable.frame[stackIndex];
    const funcIndex = oldFrameTable.func[frameIndex];
    const bucketFrameIndex = funcIndexToBucketFrameIndex[funcIndex];
    if (
      bucketFrameIndex !== null &&
      bucketFrameIndex !== inheritedBucketFrameIndex
    ) {
      bucketFrameIndexToInsertAtStack[stackIndex] = bucketFrameIndex;
      inheritedBucketFrameIndexAtStack[stackIndex] = bucketFrameIndex;
      stacksToInsertCount++;
    } else if (
      funcTable.isJS[funcIndex] ||
      funcTable.relevantForJS[funcIndex]
    ) {
      bucketFrameIndexToInsertAtStack[stackIndex] = null;
      inheritedBucketFrameIndexAtStack[stackIndex] = null;
    } else if (parentStackIndex === null) {
      bucketFrameIndexToInsertAtStack[stackIndex] = unaccountedBucketFrameIndex;
      inheritedBucketFrameIndexAtStack[stackIndex] =
        unaccountedBucketFrameIndex;
      stacksToInsertCount++;
    } else {
      bucketFrameIndexToInsertAtStack[stackIndex] = null;
      inheritedBucketFrameIndexAtStack[stackIndex] = inheritedBucketFrameIndex;
    }
  }

  const newStackCount = oldStackTable.length + stacksToInsertCount;
  const newPrefixCol = new Array<IndexIntoStackTable | null>(newStackCount);
  const newFrameCol = new Array<IndexIntoFrameTable>(newStackCount);
  const oldStackToNewStackPlusOne = new Int32Array(oldStackTable.length);
  let nextNewStackIndex = 0;
  for (
    let oldStackIndex = 0;
    oldStackIndex < oldStackTable.length;
    oldStackIndex++
  ) {
    const bucketFrameIndexToInsert =
      bucketFrameIndexToInsertAtStack[oldStackIndex];
    const oldPrefix = oldStackTable.prefix[oldStackIndex];
    let newPrefix =
      oldPrefix !== null ? oldStackToNewStackPlusOne[oldPrefix] - 1 : null;
    const frameIndex = oldStackTable.frame[oldStackIndex];
    if (bucketFrameIndexToInsert !== null) {
      const insertedStackIndex = nextNewStackIndex++;
      newPrefixCol[insertedStackIndex] = newPrefix;
      newFrameCol[insertedStackIndex] = bucketFrameIndexToInsert;
      newPrefix = insertedStackIndex;
    }
    const newStackIndex = nextNewStackIndex++;
    newPrefixCol[newStackIndex] = newPrefix;
    newFrameCol[newStackIndex] = frameIndex;
    oldStackToNewStackPlusOne[oldStackIndex] = newStackIndex + 1;
  }

  if (nextNewStackIndex !== newStackCount) {
    console.error('Unexpected new stack count!', {
      nextNewStackIndex,
      newStackCount,
      stacksToInsertCount,
    });
  }

  const stackTable: RawStackTable = {
    prefix: newPrefixCol,
    frame: newFrameCol,
    length: newStackCount,
  };

  const newShared = { ...profile.shared, stackTable, frameTable, funcTable };
  const newThreads = updateRawThreadStacks(profile.threads, (oldStack) =>
    oldStack !== null ? oldStackToNewStackPlusOne[oldStack] - 1 : null
  );

  return {
    ...profile,
    shared: newShared,
    threads: newThreads,
  };
}
