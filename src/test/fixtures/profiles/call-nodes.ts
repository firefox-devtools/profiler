/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  FuncTable,
  RawSamplesTable,
  FrameTable,
  Profile,
} from 'firefox-profiler/types';

import {
  getEmptyThread,
  getEmptyProfile,
  getEmptyRawStackTable,
} from '../../../profile-logic/data-structures';
import { StringTable } from '../../../utils/string-table';

/**
 * Create a profile with three identical threads, with the frame tree and call
 * tree shown below.
 *
 * Note that this fixture doesn't use the `getProfileFromTextSamples()` function to
 * generate the profile, as it's testing the relationships between frames, and thus
 * cannot be generated from a list of functions.
 *
 *            stack0 (funcA)                               callNode0 (funcA)
 *                 |                                            |
 *                 v                                            v
 *            stack1 (funcB)            merged             callNode1 (funcB)
 *                 |                  stackTable                |
 *                 v                      ->                    v
 *            stack2 (funcC)                               callNode2 (funcC)
 *            /            \                                    |
 *           V              V                                   v
 *    stack3 (funcD)     stack5 (funcD)                    callNode3 (funcD)
 *         |                  |                          /               \
 *         v                  V                         V                 V
 *    stack4 (funcE)     stack6 (funcF)         callNode4 (funcE)       callNode5 (funcF)
 */
export default function getProfile(): Profile {
  const profile = getEmptyProfile();
  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);
  let thread = getEmptyThread();
  const funcNames = ['funcA', 'funcB', 'funcC', 'funcD', 'funcE', 'funcF'].map(
    (name) => stringTable.indexForString(name)
  );

  // Be explicit about table creation so flow errors are really readable.
  const funcTable: FuncTable = {
    name: funcNames,
    isJS: Array(funcNames.length).fill(false),
    resource: Array(funcNames.length).fill(-1),
    relevantForJS: Array(funcNames.length).fill(false),
    fileName: Array(funcNames.length).fill(''),
    lineNumber: Array(funcNames.length).fill(null),
    columnNumber: Array(funcNames.length).fill(null),
    length: funcNames.length,
  };

  const frameFuncs = [
    'funcA', // 0
    'funcB', // 1
    'funcC', // 2
    'funcD', // 3
    'funcD', // 4 duplicate
    'funcE', // 5
    'funcF', // 6
  ].map((name) => stringTable.indexForString(name));
  // Name the indices
  const [
    funcAFrame,
    funcBFrame,
    funcCFrame,
    funcDFrame,
    funcDFrameDuplicate,
    funcEFrame,
    funcFFrame,
  ] = frameFuncs.map((_, i) => i);

  const frameTable: FrameTable = {
    func: frameFuncs.map((stringIndex) => funcTable.name.indexOf(stringIndex)),
    address: Array(frameFuncs.length).fill(-1),
    inlineDepth: Array(frameFuncs.length).fill(0),
    nativeSymbol: Array(frameFuncs.length).fill(null),
    category: Array(frameFuncs.length).fill(null),
    subcategory: Array(frameFuncs.length).fill(null),
    innerWindowID: Array(frameFuncs.length).fill(null),
    line: Array(frameFuncs.length).fill(null),
    column: Array(frameFuncs.length).fill(null),
    length: frameFuncs.length,
  };

  const stackTable = getEmptyRawStackTable();

  // Provide a utility function for readability.
  function addToStackTable(frame: any, prefix: any) {
    stackTable.frame.push(frame);
    stackTable.prefix.push(prefix);
    stackTable.length++;
  }
  // Shared root stacks.
  addToStackTable(funcAFrame, null);
  addToStackTable(funcBFrame, 0);
  addToStackTable(funcCFrame, 1);

  // Branch 1.
  addToStackTable(funcDFrame, 2);
  addToStackTable(funcEFrame, 3);

  // Branch 2.
  addToStackTable(funcDFrameDuplicate, 2);
  addToStackTable(funcFFrame, 5);

  // Have the first sample pointing to the first branch, and the second sample to
  // the second branch of the stack.
  const samples: RawSamplesTable = {
    responsiveness: [0, 0],
    stack: [4, 6],
    time: [0, 0],
    weightType: 'samples',
    weight: null,
    length: 2,
  };

  thread = Object.assign(thread, {
    samples,
    stackTable,
    funcTable,
    frameTable,
  });

  profile.threads.push(
    thread,
    Object.assign({}, thread),
    Object.assign({}, thread)
  );

  return profile;
}
