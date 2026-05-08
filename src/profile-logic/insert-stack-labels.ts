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

export type LabelDescription = {
  name: string;
  funcPrefixes: string[];
};

export function insertStackLabels(
  profile: Profile,
  labelDescriptions: LabelDescription[]
): Profile {
  const labelCategory = profile.meta.categories!.length;
  profile.meta.categories!.push({
    name: 'Label',
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
  const unaccountedLabelFrameIndex = frameTable.length;
  const labelFramesStartIndex = unaccountedLabelFrameIndex + 1;
  const allLabelNames = [
    'Unaccounted',
    ...labelDescriptions.map((label) => label.name),
  ];
  for (let i = 0; i < allLabelNames.length; i++) {
    const labelName = allLabelNames[i];
    const funcIndex = funcTable.length++;
    funcTable.name[funcIndex] = stringTable.indexForString(labelName);
    funcTable.resource[funcIndex] = -1;
    funcTable.source[funcIndex] = null;
    funcTable.lineNumber[funcIndex] = null;
    funcTable.columnNumber[funcIndex] = null;
    funcTable.isJS[funcIndex] = false;
    funcTable.relevantForJS[funcIndex] = true;

    const frameIndex = frameTable.length++;
    frameTable.func[frameIndex] = funcIndex;
    frameTable.category[frameIndex] = labelCategory;
    frameTable.subcategory[frameIndex] = 0;
    frameTable.nativeSymbol[frameIndex] = null;
    frameTable.address[frameIndex] = 0;
    frameTable.inlineDepth[frameIndex] = 0;
    frameTable.line[frameIndex] = null;
    frameTable.column[frameIndex] = null;
    frameTable.innerWindowID[frameIndex] = null;
  }

  function getLabelIndexForFunc(funcIndex: IndexIntoFuncTable): number | null {
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
      let labelIndex = 0;
      labelIndex < labelDescriptions.length;
      labelIndex++
    ) {
      const labelDescription = labelDescriptions[labelIndex];
      for (
        let prefixIndex = 0;
        prefixIndex < labelDescription.funcPrefixes.length;
        prefixIndex++
      ) {
        const funcNamePrefix = labelDescription.funcPrefixes[prefixIndex];
        if (nameString.startsWith(funcNamePrefix)) {
          return labelIndex;
        }
      }
    }
    return null;
  }

  const funcIndexToLabelFrameIndex = new Array<number | null>(funcTable.length);
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    const labelIndex = getLabelIndexForFunc(funcIndex);
    const labelFrameIndex =
      labelIndex !== null ? labelFramesStartIndex + labelIndex : null;
    funcIndexToLabelFrameIndex[funcIndex] = labelFrameIndex;
  }

  const labelFrameIndexToInsertAtStack = new Array<number | null>(
    oldStackTable.length
  );
  const inheritedLabelFrameIndexAtStack = new Array<IndexIntoFrameTable | null>(
    oldStackTable.length
  );
  let stacksToInsertCount = 0;
  for (let stackIndex = 0; stackIndex < oldStackTable.length; stackIndex++) {
    const parentStackIndex = oldStackTable.prefix[stackIndex];
    const inheritedLabelFrameIndex =
      parentStackIndex !== null
        ? inheritedLabelFrameIndexAtStack[parentStackIndex]
        : null;
    const frameIndex = oldStackTable.frame[stackIndex];
    const funcIndex = oldFrameTable.func[frameIndex];
    const labelFrameIndex = funcIndexToLabelFrameIndex[funcIndex];
    if (
      labelFrameIndex !== null &&
      labelFrameIndex !== inheritedLabelFrameIndex
    ) {
      labelFrameIndexToInsertAtStack[stackIndex] = labelFrameIndex;
      inheritedLabelFrameIndexAtStack[stackIndex] = labelFrameIndex;
      stacksToInsertCount++;
    } else if (
      funcTable.isJS[funcIndex] ||
      funcTable.relevantForJS[funcIndex]
    ) {
      labelFrameIndexToInsertAtStack[stackIndex] = null;
      inheritedLabelFrameIndexAtStack[stackIndex] = null;
    } else if (parentStackIndex === null) {
      labelFrameIndexToInsertAtStack[stackIndex] = unaccountedLabelFrameIndex;
      inheritedLabelFrameIndexAtStack[stackIndex] = unaccountedLabelFrameIndex;
      stacksToInsertCount++;
    } else {
      labelFrameIndexToInsertAtStack[stackIndex] = null;
      inheritedLabelFrameIndexAtStack[stackIndex] = inheritedLabelFrameIndex;
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
    const labelFrameIndexToInsert =
      labelFrameIndexToInsertAtStack[oldStackIndex];
    const oldPrefix = oldStackTable.prefix[oldStackIndex];
    let newPrefix =
      oldPrefix !== null ? oldStackToNewStackPlusOne[oldPrefix] - 1 : null;
    const frameIndex = oldStackTable.frame[oldStackIndex];
    if (labelFrameIndexToInsert !== null) {
      const insertedStackIndex = nextNewStackIndex++;
      newPrefixCol[insertedStackIndex] = newPrefix;
      newFrameCol[insertedStackIndex] = labelFrameIndexToInsert;
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
