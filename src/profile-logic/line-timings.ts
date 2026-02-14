/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FrameTable,
  FuncTable,
  StackTable,
  SamplesLikeTable,
  StackLineInfo,
  LineTimings,
  LineNumber,
  IndexIntoSourceTable,
  IndexIntoLineSetTable,
} from 'firefox-profiler/types';
import { SetCollectionBuilder } from 'firefox-profiler/utils/set-collection';

/**
 * For each stack in `stackTable`, and one specific source file, compute the
 * sets of line numbers in file that are hit by the stack.
 *
 * For each stack we answer the following question:
 *  - "Does this stack contribute to line X's self time?"
 *       Answer: result.selfLine[stack] === X
 *  - "Does this stack contribute to line X's total time?"
 *       Answer: result.stackLines[stack].has(X)
 *
 * Compute the sets of line numbers in the given file that are hit by each stack.
 * For each stack in the stack table and each line in the file, we answer the
 * question "Does this stack contribute to line X's self time? Does it contribute
 * to line X's total time?"
 * Each stack can only contribute to one line's self time: the line of the stack's
 * own frame.
 * But each stack can contribute to the total time of multiple lines: All the lines
 * in the file that are encountered by any of the stack's ancestor stacks.
 * E.g if functions A, B and C are all in the same file, then a stack with the call
 * path [A, B, C] will contribute to the total time of 3 lines:
 *   1. The line in function A which has the call to B,
 *   2. The line in function B which has the call to C, and
 *   3. The line in function C that is being executed at that stack (stack.frame.line).
 *
 * This last line is the stack's "self line".
 * If there is recursion, and the same line is present in multiple frames in the
 * same stack, the line is only counted once - the lines are stored in a set.
 */
export function getStackLineInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  sourceViewSourceIndex: IndexIntoSourceTable
): StackLineInfo {
  const builder = new SetCollectionBuilder<number>();
  const stackIndexToLineSetIndex = new Int32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixLineSet: IndexIntoLineSetTable | -1 =
      prefixStack !== null ? stackIndexToLineSetIndex[prefixStack] : -1;

    const frame = stackTable.frame[stackIndex];
    const func = frameTable.func[frame];
    const sourceIndexOfThisStack = funcTable.source[func];
    const matchesSource = sourceIndexOfThisStack === sourceViewSourceIndex;
    if (prefixLineSet === -1 && !matchesSource) {
      stackIndexToLineSetIndex[stackIndex] = -1;
    } else {
      const selfLineOrNull = matchesSource
        ? (frameTable.line[frame] ?? funcTable.lineNumber[func])
        : null;

      stackIndexToLineSetIndex[stackIndex] = builder.extend(
        prefixLineSet !== -1 ? prefixLineSet : null,
        selfLineOrNull !== null ? selfLineOrNull : -1
      );
    }
  }
  return {
    stackIndexToLineSetIndex,
    lineSetTable: builder.finish(),
  };
}

// A LineTimings instance without any hits.
export const emptyLineTimings: LineTimings = {
  totalLineHits: new Map(),
  selfLineHits: new Map(),
};

// Compute the LineTimings for the supplied samples with the help of StackLineInfo.
// This is fast and can be done whenever the preview selection changes.
// The slow part was the computation of the StackLineInfo, which is already done.
export function getLineTimings(
  stackLineInfo: StackLineInfo | null,
  samples: SamplesLikeTable
): LineTimings {
  if (stackLineInfo === null) {
    return emptyLineTimings;
  }
  const { stackIndexToLineSetIndex, lineSetTable } = stackLineInfo;

  // We do two passes to compute the timings:
  // 1. One pass over the samples to accumulate the sample weight onto the
  //    nodes in the lineSetTable.
  // 2. One pass (from back to front) over the lineSetTable, propagating
  //    values up the tree and, at the same time, accumulating per-line
  //    totals.

  // First, do the pass over the samples to compute the weight per line set.
  const selfPerLineSet = new Float64Array(lineSetTable.length);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const lineSetIndex = stackIndexToLineSetIndex[stackIndex];
    if (lineSetIndex !== -1) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      selfPerLineSet[lineSetIndex] += weight;
    }
  }

  // Now, do a pass over the lineSetTable, from back to front.
  // This is a similar idea to what we do for the call tree or the function
  // list. The upwards propagation of a sample's weight will not contribute
  // to the same line multiple times thanks to the guarantees of the
  // lineSetTable - there are no duplicate values on a node's path to the
  // root.
  const totalLineHits: Map<LineNumber, number> = new Map();
  const selfLineHits: Map<LineNumber, number> = new Map();
  const selfSumOfLineSetDescendants = new Float64Array(lineSetTable.length);
  for (
    let lineSetIndex = lineSetTable.length - 1;
    lineSetIndex >= 0;
    lineSetIndex--
  ) {
    const selfWeight = selfPerLineSet[lineSetIndex];
    if (selfWeight !== 0) {
      const selfLine = lineSetTable.self[lineSetIndex];
      if (selfLine !== -1) {
        const oldHitCount = selfLineHits.get(selfLine) ?? 0;
        selfLineHits.set(selfLine, oldHitCount + selfWeight);
      }
    }

    const selfSumOfThisLineSetDescendants =
      selfSumOfLineSetDescendants[lineSetIndex];
    const thisLineSetWeight = selfWeight + selfSumOfThisLineSetDescendants;
    const lineSetParent = lineSetTable.parent[lineSetIndex];
    if (lineSetParent !== null) {
      selfSumOfLineSetDescendants[lineSetParent] += thisLineSetWeight;
    }

    if (thisLineSetWeight !== 0) {
      const line = lineSetTable.value[lineSetIndex];
      if (line !== -1) {
        const oldHitCount = totalLineHits.get(line) ?? 0;
        totalLineHits.set(line, oldHitCount + thisLineSetWeight);
      }
    }
  }
  return { totalLineHits, selfLineHits };
}

// Returns the line numbers which are hit in a specific call node,
// along with the total of the sample weights per line.
// callNodeFramePerStack needs to be a mapping from stackIndex to the
// corresponding frame in the call node of interest.
export function getTotalLineTimingsForCallNode(
  samples: SamplesLikeTable,
  callNodeFramePerStack: Int32Array,
  frameTable: FrameTable,
  funcLine: LineNumber | null
): Map<LineNumber, number> {
  const totalPerLine = new Map<LineNumber, number>();
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stack = samples.stack[sampleIndex];
    if (stack === null) {
      continue;
    }
    const callNodeFrame = callNodeFramePerStack[stack];
    if (callNodeFrame === -1) {
      // This sample does not contribute to the call node's total. Ignore.
      continue;
    }

    const frameLine = frameTable.line[callNodeFrame];
    const line = frameLine !== null ? frameLine : funcLine;
    if (line === null) {
      continue;
    }

    const sampleWeight =
      samples.weight !== null ? samples.weight[sampleIndex] : 1;
    totalPerLine.set(line, (totalPerLine.get(line) ?? 0) + sampleWeight);
  }

  return totalPerLine;
}
