/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Thread, IndexIntoStackTable } from '../types/profile';

export type GetLabel = (Thread, IndexIntoStackTable) => string;

export function getFunctionName(thread: Thread, stackIndex: IndexIntoStackTable): string {
  const frameIndex = thread.stackTable.frame[stackIndex];
  const funcIndex = thread.frameTable.func[frameIndex];
  return thread.stringTable.getString(thread.funcTable.name[funcIndex]);
}

export function getImplementationName(thread: Thread, stackIndex: IndexIntoStackTable): string {
  const frameIndex = thread.stackTable.frame[stackIndex];
  const implementation = thread.frameTable.implementation[frameIndex];
  if (implementation) {
    return implementation === 'baseline' ? 'JS Baseline' : 'JS Ion';
  }
  const funcIndex = thread.frameTable.func[frameIndex];
  return thread.funcTable.isJS[funcIndex] ? 'JS Interpreter' : 'Platform';
}
