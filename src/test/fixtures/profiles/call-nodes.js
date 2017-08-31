/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  FuncTable,
  SamplesTable,
  FrameTable,
  StackTable,
  Profile,
} from '../../../types/profile';

import { getEmptyProfile } from '../../../profile-logic/profile-data';
import { getEmptyThread } from '../../store/fixtures/profiles';

/**
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
  const thread = getEmptyThread();
  const funcNames = [
    'funcA',
    'funcB',
    'funcC',
    'funcD',
    'funcE',
    'funcF',
  ].map(name => thread.stringTable.indexForString(name));

  // Be explicit about table creation so flow errors are really readable.
  const funcTable: FuncTable = {
    name: funcNames,
    address: Array(funcNames.length).fill(''),
    isJS: Array(funcNames.length).fill(false),
    resource: Array(funcNames.length).fill(-1),
    fileName: Array(funcNames.length).fill(''),
    lineNumber: Array(funcNames.length).fill(null),
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
  ].map(name => thread.stringTable.indexForString(name));
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
    func: frameFuncs.map(stringIndex => funcTable.name.indexOf(stringIndex)),
    address: Array(frameFuncs.length).fill(-1),
    category: Array(frameFuncs.length).fill(null),
    implementation: Array(frameFuncs.length).fill(null),
    line: Array(frameFuncs.length).fill(null),
    optimizations: Array(frameFuncs.length).fill(null),
    length: frameFuncs.length,
  };

  const stackTable: StackTable = {
    frame: [],
    prefix: [],
    length: 0,
    depth: [],
  };

  // Provide a utility function for readability.
  function addToStackTable(frame, prefix) {
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
  const samples: SamplesTable = {
    responsiveness: [0, 0],
    stack: [4, 6],
    time: [0, 0],
    rss: [0, 0],
    uss: [0, 0],
    length: 2,
  };

  profile.threads.push(
    Object.assign(thread, { samples, stackTable, funcTable, frameTable })
  );

  return profile;
}
