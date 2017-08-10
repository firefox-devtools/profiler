/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * This file contains profile fixtures for call tree tests. It provides some internal
 * utility functions to help succinctly create call trees of a specific shape. This
 * is to help with asserting correct call tree functionality and data transformations
 * operating properly.
 */
import type {
  FuncTable,
  SamplesTable,
  FrameTable,
  StackTable,
  Profile,
  IndexIntoFrameTable,
  IndexIntoStackTable,
} from '../../../types/profile';

import { getEmptyProfile } from '../../../profile-logic/profile-data';
import { getEmptyThread } from '../../store/fixtures/profiles';

/**
 * Create the following sample structure:
 *
 *  A    A    A
 *  |    |    |
 *  v    v    v
 *  B    B    B
 *  |    |    |
 *  v    v    v
 *  C    C    H
 *  |    |    |
 *  v    v    v
 *  D    F    I
 *  |    |
 *  v    v
 *  E    G
 *
 *
 * It computes the following calltree:
 *
 *             A:3,0
 *               |
 *               v
 *             B:3,0
 *             /    \
 *            v      v
 *        C:2,0     H:1,0
 *       /      \         \
 *      v        v         v
 *    D:1,0     F:1,0     I:1,1
 *    |           |
 *    v           v
 *  E:1,1       G:1,1
 */
export function getProfileForUnfilteredCallTree(): Profile {
  // The indexes for funcs, frames, and stacks all share the same values as there is
  // a one to one relationship between them all in the layout of this fixture.
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const E = 4;
  const F = 5;
  const G = 6;
  const H = 7;
  const I = 8;

  const profile = _createProfileFromFuncsAndSampleStacks(
    // Function names:
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    // Sample's stacks:
    [E, G, I]
  );
  const { stackTable } = profile.threads[0];

  _addToStackTable(stackTable, A, null); // 0
  _addToStackTable(stackTable, B, A); // 1
  _addToStackTable(stackTable, C, B); // 2
  _addToStackTable(stackTable, D, C); // 3
  _addToStackTable(stackTable, E, D); // 4
  _addToStackTable(stackTable, F, C); // 5
  _addToStackTable(stackTable, G, F); // 6
  _addToStackTable(stackTable, H, B); // 7
  _addToStackTable(stackTable, I, H); // 8

  return profile;
}

/**
 * Create the following sample structure:
 *
 *      A    A    A
 *      |    |    |
 *      v    v    v
 *      B    B    B
 *      |    |    |
 *      v    v    v
 *      C    X    C
 *      |    |    |
 *      v    v    v
 *      D    Y    X
 *      |    |    |
 *      v    v    v
 *      E    Z    Y
 *                |
 *                v
 *                Z
 *
 * Computes the following inverted tree:
 *
 *       Z:2,2         E:1,1
 *         |             |
 *         v             v
 *       Y:2,0         D:1,0
 *         |             |
 *         v             v
 *       X:2,0         C:1,0
 *      /    \           |
 *     v      v          v
 *  B:1,0    C:1,0     B:1,0
 *    |        |         |
 *    v        v         v
 *  A:1,0    B:1,0     A:1,0
 *             |
 *             v
 *           A:1,0
 */
export function getProfileForInvertedCallTree(): Profile {
  // The indexes for funcs and frames share the same values.
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const E = 4;
  const X = 5;
  const Y = 6;
  const Z = 7;

  // Keep all of the names here even if they aren't used.
  /* eslint-disable no-unused-vars */
  const stackA = 0;
  const stackB = 1;
  const stackC = 2;
  const stackD = 3;
  const stackE = 4;
  // Left branch of the call tree
  const stackLeftX = 5;
  const stackLeftY = 6;
  const stackLeftZ = 7;
  // Right branch of the call tree
  const stackRightX = 8;
  const stackRightY = 9;
  const stackRightZ = 10;
  /* eslint-enable no-unused-vars */

  const profile = _createProfileFromFuncsAndSampleStacks(
    // Function names:
    ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'],
    // Sample's stacks:
    [stackE, stackLeftZ, stackRightZ]
  );

  const { stackTable } = profile.threads[0];

  _addToStackTable(stackTable, A, null); // 0
  _addToStackTable(stackTable, B, stackA); // 1
  _addToStackTable(stackTable, C, stackB); // 2
  _addToStackTable(stackTable, D, stackC); // 3
  _addToStackTable(stackTable, E, stackD); // 4

  // X Y Z stacks for left branch
  _addToStackTable(stackTable, X, stackB); // 5 prefix B
  _addToStackTable(stackTable, Y, stackLeftX); // 6 prefix X
  _addToStackTable(stackTable, Z, stackLeftY); // 7 prefix Y

  // X Y Z stacks for right branch
  _addToStackTable(stackTable, X, stackC); // 8 prefix C
  _addToStackTable(stackTable, Y, stackRightX); // 9 prefix X
  _addToStackTable(stackTable, Z, stackRightY); // 10 prefix Y

  return profile;
}

/**
 * This is a helper function to create a valid profile from a minimal set of information.
 * This is useful to easily create profiles of a specific structure to test call tree
 * structures. It can be augmented with additional features as needed.
 */
function _createProfileFromFuncsAndSampleStacks(
  funcNameStrings: string[],
  sampleStacks: Array<number | null>
): Profile {
  const profile = getEmptyProfile();
  const thread = getEmptyThread();
  const funcNames = funcNameStrings.map(name =>
    thread.stringTable.indexForString(name)
  );
  const blankStringIndex = thread.stringTable.indexForString('');

  // Be explicit about table creation so flow errors are really readable.
  const funcTable: FuncTable = {
    name: funcNames,
    address: Array(funcNames.length).fill(blankStringIndex),
    isJS: Array(funcNames.length).fill(false),
    resource: Array(funcNames.length).fill(-1),
    fileName: Array(funcNames.length).fill(blankStringIndex),
    lineNumber: Array(funcNames.length).fill(null),
    length: funcNames.length,
  };

  const frameTable: FrameTable = {
    func: funcNames.map((_, i) => i),
    address: Array(funcNames.length).fill(-1),
    category: Array(funcNames.length).fill(null),
    implementation: Array(funcNames.length).fill(null),
    line: Array(funcNames.length).fill(null),
    optimizations: Array(funcNames.length).fill(null),
    length: funcNames.length,
  };

  const stackTable: StackTable = {
    frame: [],
    prefix: [],
    length: 0,
    depth: [],
  };

  const samples: SamplesTable = {
    responsiveness: Array(sampleStacks.length).fill(0),
    stack: sampleStacks,
    time: sampleStacks.map((_, i) => i),
    rss: Array(sampleStacks.length).fill(0),
    uss: Array(sampleStacks.length).fill(0),
    length: sampleStacks.length,
  };

  profile.threads.push(
    Object.assign(thread, { samples, stackTable, funcTable, frameTable })
  );

  return profile;
}

/**
 * This is a helper function to help create readable stack fixtures.
 */
function _addToStackTable(
  stackTable: StackTable,
  frame: IndexIntoFrameTable,
  prefix: IndexIntoStackTable | null
): void {
  stackTable.frame.push(frame);
  stackTable.prefix.push(prefix);
  stackTable.length++;
}
