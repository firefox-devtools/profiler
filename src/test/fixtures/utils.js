/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { CallTree } from '../../profile-logic/call-tree';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';

export function getBoundingBox(width: number, height: number) {
  return {
    width,
    height,
    left: 0,
    x: 0,
    top: 0,
    y: 0,
    right: width,
    bottom: height,
  };
}

export function formatTree(
  callTree: CallTree,
  children: IndexIntoCallNodeTable[] = callTree.getRoots(),
  depth: number = 0,
  previousString: string = ''
) {
  const whitespace = Array(depth * 2).join(' ');

  return children.reduce((string, callNodeIndex) => {
    const { name, totalTime, selfTime } = callTree.getDisplayData(
      callNodeIndex
    );
    const text = `\n${whitespace}- ${name} (total: ${totalTime}, self:${selfTime})`;
    return formatTree(
      callTree,
      callTree.getChildren(callNodeIndex),
      depth + 1,
      string + text
    );
  }, previousString);
}

/**
 * Formatting a tree like this allows the assertions to not be as snapshots.
 * This makes it easier to debug and read tests, while still giving nice test output
 * when they fail.
 */
export function formatTreeAsArray(callTree: CallTree): string[] {
  return formatTree(callTree).split('\n').filter(a => a);
}
