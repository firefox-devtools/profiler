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
} from 'firefox-profiler/types';

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
 *
 * The returned StackLineInfo is computed as follows:
 *   selfLine[stack]:
 *     For stacks whose stack.frame.func.file is the given file, this is stack.frame.line.
 *     For all other stacks this is null.
 *   stackLines[stack]:
 *     For stacks whose stack.frame.func.file is the given file, this is the stackLines
 *     of its prefix stack, plus stack.frame.line added to the set.
 *     For all other stacks this is the same as the stackLines set of the stack's prefix.
 */
export function getStackLineInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  sourceViewSourceIndex: IndexIntoSourceTable
): StackLineInfo {
  // "self line" == "the line which a stack's self time is contributed to"
  const selfLineForAllStacks = [];
  // "total lines" == "the set of lines whose total time this stack contributes to"
  const totalLinesForAllStacks: Array<Set<LineNumber> | null> = [];

  // This loop takes advantage of the fact that the stack table is topologically ordered:
  // Prefix stacks are always visited before their descendants.
  // Each stack inherits the "total" lines from its parent stack, and then adds its
  // self line to that set. If the stack doesn't have a self line in the file, we just
  // re-use the prefix's set object without copying it.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const frame = stackTable.frame[stackIndex];
    const prefixStack = stackTable.prefix[stackIndex];
    const func = frameTable.func[frame];
    const sourceIndexOfThisStack = funcTable.source[func];

    let selfLine: LineNumber | null = null;
    let totalLines: Set<LineNumber> | null =
      prefixStack !== null ? totalLinesForAllStacks[prefixStack] : null;

    if (sourceIndexOfThisStack === sourceViewSourceIndex) {
      selfLine = frameTable.line[frame];
      // Fallback to func line info if frame line info is not available
      if (selfLine === null) {
        selfLine = funcTable.lineNumber[func];
      }
      if (selfLine !== null) {
        // Add this stack's line to this stack's totalLines. The rest of this stack's
        // totalLines is the same as for the parent stack.
        // We avoid creating new Set objects unless the new set is actually
        // different.
        if (totalLines === null) {
          // None of the ancestor stack nodes have hit a line in the given file.
          totalLines = new Set([selfLine]);
        } else if (!totalLines.has(selfLine)) {
          totalLines = new Set(totalLines);
          totalLines.add(selfLine);
        }
      }
    }

    selfLineForAllStacks.push(selfLine);
    totalLinesForAllStacks.push(totalLines);
  }
  return {
    selfLine: selfLineForAllStacks,
    stackLines: totalLinesForAllStacks,
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
  const { selfLine, stackLines } = stackLineInfo;
  const totalLineHits: Map<LineNumber, number> = new Map();
  const selfLineHits: Map<LineNumber, number> = new Map();

  // Iterate over all the samples, and aggregate the sample's weight into the
  // lines which are hit by the sample's stack.
  // TODO: Maybe aggregate sample count per stack first, and then visit each stack only once?
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const weight = samples.weight ? samples.weight[sampleIndex] : 1;
    const setOfHitLines = stackLines[stackIndex];
    if (setOfHitLines !== null) {
      for (const line of setOfHitLines) {
        const oldHitCount = totalLineHits.get(line) ?? 0;
        totalLineHits.set(line, oldHitCount + weight);
      }
    }
    const line = selfLine[stackIndex];
    if (line !== null) {
      const oldHitCount = selfLineHits.get(line) ?? 0;
      selfLineHits.set(line, oldHitCount + weight);
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
