/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { IndexIntoFuncTable } from 'firefox-profiler/types';

/**
 * A handle like "f-123" always refers to funcTable index 123 for this profile,
 * making handles stable across sessions for the same processed profile data.
 */
export function getFunctionHandle(
  funcIndex: IndexIntoFuncTable
): `f-${number}` {
  return `f-${funcIndex}`;
}

/**
 * Parse a function handle and validate it against the shared funcTable length.
 */
export function parseFunctionHandle(
  functionHandle: string,
  funcCount: number
): IndexIntoFuncTable {
  const match = /^f-(\d+)$/.exec(functionHandle);
  if (match === null) {
    throw new Error(`Unknown function ${functionHandle}`);
  }

  const funcIndex = Number(match[1]);
  if (!Number.isInteger(funcIndex) || funcIndex < 0 || funcIndex >= funcCount) {
    throw new Error(`Unknown function ${functionHandle}`);
  }

  return funcIndex;
}
