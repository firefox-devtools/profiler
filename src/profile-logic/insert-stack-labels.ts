/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  IndexIntoFrameTable,
  IndexIntoStackTable,
  RawStackTable,
  IndexIntoFuncTable,
  Profile,
  Category,
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

/**
 * Takes a profile and creates one which contains "stack labels".
 *
 * ## Example
 *
 * Before:
 *
 * ```
 * - BaselineIC: Call.CallNative
 *   - mozilla::dom::Element_Binding::getBoundingClientRect <- matches a funcPrefix
 *     - nsIContent::GetPrimaryFrame
 *       - mozilla::PresShell::DoFlushLayout
 *         - mozilla::PresShell::ProcessReflowCommands <- matches a funcPrefix
 * ```
 *
 * After:
 *
 * ```
 * - BaselineIC: Call.CallNative
 *   - Element.getBoundingClientRect <== NEW
 *     - mozilla::dom::Element_Binding::getBoundingClientRect
 *       - nsIContent::GetPrimaryFrame
 *         - mozilla::PresShell::DoFlushLayout
 *           - Update layout <== NEW
 *             - mozilla::PresShell::ProcessReflowCommands
 * ```
 *
 * The label frames are inserted as new parent stack nodes for the matched
 * stack node. The caller supplies the list of labels and their matchers
 * (as function name prefixes).
 *
 * ## No "duplicate labels"
 *
 * This implementation avoids duplicate labels. This is best explained with
 * an example. Let "Label A" apply to prefix "a" and "Label B" apply to prefix "b".
 *
 * Input:
 *
 * ```
 * - a1
 *   - a2
 *     - b1
 *       - a2
 * ```
 *
 * Then we get:
 *
 * ```
 * - Label A
 *   - a1
 *     - a2
 *       - Label B
 *         - b1
 *           - Label A
 *             - a2
 * ```
 *
 * Notably there is no extra "Label A" frame between a1 and a2, even though a2
 * also matches. We avoid it in order to keep the tree simple; and in the JS-only
 * call tree, the samples at a1,a2 are already accounted to the Label A node which
 * is all we wanted to achieve.
 */
export function insertStackLabels(
  profile: Profile,
  labelDescriptions: LabelDescription[]
): Profile {
  const labelCategoryIndex = profile.meta.categories!.length;

  const newCategories: Category[] = [
    ...profile.meta.categories!,
    {
      name: 'Label',
      color: 'blue',
      subcategories: ['Other'],
    },
  ];

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

  const rootLabelName = 'Root (unaccounted / catch-all)';
  const rootLabelFrameIndex = frameTable.length;

  const labelFramesStartIndex = rootLabelFrameIndex + 1;
  const allLabelNames = [
    rootLabelName,
    ...labelDescriptions.map((label) => label.name),
  ];

  // First, add the label frames and funcs to the frameTable + funcTable.
  for (let i = 0; i < allLabelNames.length; i++) {
    const labelName = allLabelNames[i];
    const funcIndex = funcTable.length++;
    funcTable.name[funcIndex] = stringTable.indexForString(labelName);
    funcTable.resource[funcIndex] = -1;
    funcTable.source[funcIndex] = null;
    funcTable.lineNumber[funcIndex] = null;
    funcTable.columnNumber[funcIndex] = null;
    funcTable.originalLocation[funcIndex] = null;
    funcTable.isJS[funcIndex] = false;
    funcTable.relevantForJS[funcIndex] = true;

    const frameIndex = frameTable.length++;
    frameTable.func[frameIndex] = funcIndex;
    frameTable.category[frameIndex] = labelCategoryIndex;
    frameTable.subcategory[frameIndex] = 0;
    frameTable.nativeSymbol[frameIndex] = null;
    frameTable.address[frameIndex] = 0;
    frameTable.inlineDepth[frameIndex] = 0;
    frameTable.line[frameIndex] = null;
    frameTable.column[frameIndex] = null;
    frameTable.originalLocation[frameIndex] = null;
    frameTable.innerWindowID[frameIndex] = null;
  }

  // Run the function name against the substring matchers and return the first
  // match.
  function getLabelIndexForFunc(funcIndex: IndexIntoFuncTable): number | null {
    let nameString = stringArray[funcTable.name[funcIndex]];

    // Include the filename (in brackets), if present. This allows matchers
    // like `onStateChange (chrome://browser/content/tabbrowser/`
    const sourceIndex = funcTable.source[funcIndex];
    if (sourceIndex !== null) {
      const filenameString = stringArray[sources.filename[sourceIndex]];
      nameString += ` (${filenameString})`;
    }

    // Check against every funcPrefix of every label. Return the first match.
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

  // Compute the label frame index (if any) for every func.
  const funcIndexToLabelFrameIndex = new Array<number | null>(funcTable.length);
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    const labelIndex = getLabelIndexForFunc(funcIndex);
    const labelFrameIndex =
      labelIndex !== null ? labelFramesStartIndex + labelIndex : null;
    funcIndexToLabelFrameIndex[funcIndex] = labelFrameIndex;
  }

  // Now compute where in the stack table we need labels.
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
      labelFrameIndexToInsertAtStack[stackIndex] = rootLabelFrameIndex;
      inheritedLabelFrameIndexAtStack[stackIndex] = rootLabelFrameIndex;
      stacksToInsertCount++;
    } else {
      labelFrameIndexToInsertAtStack[stackIndex] = null;
      inheritedLabelFrameIndexAtStack[stackIndex] = inheritedLabelFrameIndex;
    }
  }

  // Now compute the new stack table.
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
  const newMeta = {
    ...profile.meta,
    categories: newCategories,
  };

  const newProfile: Profile = {
    ...profile,
    meta: newMeta,
    shared: newShared,
    threads: newThreads,
  };

  return newProfile;
}
