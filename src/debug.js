/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  Thread,
  IndexIntoStackTable,
  IndexIntoFrameTable,
} from './types/profile';

/**
 * Returns an object representing an entry in soe table.
 */
export function getEntry(table: Object, index: number) {
  const keys = Object.keys(table).filter(key => key !== 'length');
  const entry = {};
  for (const key of keys) {
    entry[key] = table[key][index];
  }
  return entry;
}

/**
 * Returns a stack entry, plus the names of the functions making up the stack.
 */
export function getStack(thread: Thread, stackIndex: IndexIntoStackTable) {
  const stackEntry = getEntry(thread.stackTable, stackIndex);
  stackEntry.funcNames = getStackFuncNames(thread, stackIndex);
  return stackEntry;
}

/**
 * Returns a text representation of a StackTable.
 */
export function stackTableToText(thread: Thread, separator: string = ', ') {
  let text = '';
  for (let i = 0; i < thread.stackTable.length; i++) {
    const stackFuncNames = getStackFuncNames(thread, i).reverse();
    text += `stack ${i}: ${stackFuncNames.join(separator)}\n`;
  }
  return text;
}

/**
 * Returns a reconstructed frame entry with the function name.
 */
export function getFrame(thread: Thread, frameIndex: IndexIntoFrameTable) {
  const frameEntry = getEntry(thread.frameTable, frameIndex);
  const stringIndex = thread.funcTable.name[frameEntry.func];
  frameEntry.funcName = thread.stringTable.getString(stringIndex);
  return frameEntry;
}

/**
 * Returns a list of function names that make up a stack from the root to the stackIndex.
 */
export function getStackFuncNames(
  thread: Thread,
  stackIndex: IndexIntoStackTable
): string[] {
  let nextStackIndex = stackIndex;
  const stackNames = [];
  const { frameTable, stackTable, funcTable, stringTable } = thread;
  while (nextStackIndex !== null) {
    const frameIndex = stackTable.frame[nextStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const stringIndex = funcTable.name[funcIndex];
    stackNames.push(stringTable.getString(stringIndex));
    nextStackIndex = stackTable.prefix[nextStackIndex];
  }
  return stackNames;
}

export default {
  getEntry,
  getStack,
  getStackFuncNames,
  getFrame,
  stackTableToText,
};
