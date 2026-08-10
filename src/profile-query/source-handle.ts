/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { IndexIntoSourceTable } from 'firefox-profiler/types';

/**
 * A handle like "src-3" always refers to sourceTable index 3 for this profile,
 * mirroring the `t-N` / `f-N` handle schemes.
 */
export function getSourceHandle(
  sourceIndex: IndexIntoSourceTable
): `src-${number}` {
  return `src-${sourceIndex}`;
}

/**
 * Parse a source handle and validate it against the shared sourceTable length.
 */
export function parseSourceHandle(
  sourceHandle: string,
  sourceCount: number
): IndexIntoSourceTable {
  const match = /^src-(\d+)$/.exec(sourceHandle);
  if (match === null) {
    throw new Error(`Unknown source ${sourceHandle}`);
  }

  const sourceIndex = Number(match[1]);
  if (sourceIndex >= sourceCount) {
    throw new Error(`Unknown source ${sourceHandle}`);
  }

  return sourceIndex;
}
