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
  SourceLocationTable,
} from 'firefox-profiler/types';
import { FrameFlag, FuncFlag } from 'firefox-profiler/types';
import { SetCollectionBuilder } from 'firefox-profiler/utils/set-collection';
import { mapGetKeyWithMaxValue } from 'firefox-profiler/utils';

// Maps a line and column in a source to the line that should be used for the
// line timings. The column is null if it's unknown.
export type PositionToLineMapper = (
  line: LineNumber,
  column: number | null
) => LineNumber;

/**
 * For each stack in `stackTable`, and one specific source file, compute the
 * sets of line numbers in file that are hit by the stack.
 *
 * For each stack we answer the following question:
 *  - "Does this stack contribute to line X's self time?"
 *       Answer: result.lineSetTable.self[result.stackIndexToLineSetIndex[stack]] === X
 *  - "Does this stack contribute to line X's total time?"
 *       Answer: X is in the set represented by entry result.stackIndexToLineSetIndex[stack] in result.lineSetTable
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
 * If sourceLocationTable is null, source-mapped frames are attributed to their
 * generated (compiled) position rather than to their original position. This
 * is used to compute the timings for the generated code of a bundle.
 *
 * If mapPositionToLine is given, it maps each line and column to the line
 * which is used in the result. This is used when the source view shows
 * pretty-printed code. The column is null if it's unknown.
 */
export function getStackLineInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  sourceViewSourceIndex: IndexIntoSourceTable,
  sourceLocationTable: SourceLocationTable | null,
  mapPositionToLine: PositionToLineMapper | null = null
): StackLineInfo {
  const builder = new SetCollectionBuilder<number>();
  const stackIndexToLineSetIndex = new Int32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixLineSet: IndexIntoLineSetTable | -1 =
      prefixStack !== -1 ? stackIndexToLineSetIndex[prefixStack] : -1;

    const frame = stackTable.frame[stackIndex];
    const func = frameTable.func[frame];

    // Inlined source resolution from getOriginalPositionForFrame. We avoid
    // its per-stack {source, line, column} allocation, skip resolving the
    // column entirely, and defer the line lookup until we know the source
    // matches.
    const frameFlags = frameTable.flags[frame];
    const funcFlags = funcTable.flags[func];
    const frameHasOriginalLocation =
      sourceLocationTable !== null &&
      (frameFlags & FrameFlag.HasOriginalLocation) !== 0;
    const funcHasOriginalLocation =
      sourceLocationTable !== null &&
      (funcFlags & FuncFlag.HasOriginalLocation) !== 0;
    const frameOriginalLocationIdx = frameHasOriginalLocation
      ? frameTable.originalLocation[frame]
      : -1;
    const funcOriginalLocationIdx = funcHasOriginalLocation
      ? funcTable.originalLocation[func]
      : -1;
    let sourceIndexOfThisStack;
    if (frameHasOriginalLocation) {
      sourceIndexOfThisStack =
        sourceLocationTable.source[frameOriginalLocationIdx];
    } else if (funcHasOriginalLocation) {
      sourceIndexOfThisStack =
        sourceLocationTable.source[funcOriginalLocationIdx];
    } else if ((funcFlags & FuncFlag.HasSource) !== 0) {
      sourceIndexOfThisStack = funcTable.source[func];
    } else {
      sourceIndexOfThisStack = -1;
    }

    const matchesSource = sourceIndexOfThisStack === sourceViewSourceIndex;
    if (prefixLineSet === -1 && !matchesSource) {
      stackIndexToLineSetIndex[stackIndex] = -1;
    } else {
      let selfLineOrNull: number | null = null;
      if (matchesSource) {
        let column: number | null = null;
        if (frameHasOriginalLocation) {
          selfLineOrNull = sourceLocationTable.line[frameOriginalLocationIdx];
          column = sourceLocationTable.column[frameOriginalLocationIdx];
        } else if (funcHasOriginalLocation) {
          selfLineOrNull = sourceLocationTable.line[funcOriginalLocationIdx];
          column = sourceLocationTable.column[funcOriginalLocationIdx];
        } else if ((frameFlags & FrameFlag.HasLine) !== 0) {
          selfLineOrNull = frameTable.line[frame];
          if ((frameFlags & FrameFlag.HasColumn) !== 0) {
            column = frameTable.column[frame];
          }
        } else if ((funcFlags & FuncFlag.HasLine) !== 0) {
          selfLineOrNull = funcTable.lineNumber[func];
          if ((funcFlags & FuncFlag.HasColumn) !== 0) {
            column = funcTable.columnNumber[func];
          }
        }
        if (mapPositionToLine !== null && selfLineOrNull !== null) {
          selfLineOrNull = mapPositionToLine(selfLineOrNull, column);
        }
      }

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
// If sourceLocationTable is null, the generated (compiled) lines are used for
// source-mapped frames, like in getStackLineInfo.
export function getTotalLineTimingsForCallNode(
  samples: SamplesLikeTable,
  callNodeFramePerStack: Int32Array,
  frameTable: FrameTable,
  funcTable: FuncTable,
  funcLine: LineNumber | null,
  sourceLocationTable: SourceLocationTable | null
): Map<LineNumber, number> {
  const totalPerLine = new Map<LineNumber, number>();
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stack = samples.stack[sampleIndex];
    if (stack === null) {
      continue;
    }
    const callNodeFrame = callNodeFramePerStack[stack];
    if (callNodeFrame === -1) {
      continue;
    }

    // Resolve in the same coordinate space as the source view: prefer the
    // source-mapped line, otherwise the frame's compiled line, otherwise the
    // func's compiled line. Inlined from getOriginalPositionForFrame to avoid
    // the per-sample object allocation.
    const funcIndex = frameTable.func[callNodeFrame];
    const frameFlags = frameTable.flags[callNodeFrame];
    const funcFlags = funcTable.flags[funcIndex];
    let frameLine: number | null;
    if (
      sourceLocationTable !== null &&
      (frameFlags & FrameFlag.HasOriginalLocation) !== 0
    ) {
      frameLine =
        sourceLocationTable.line[frameTable.originalLocation[callNodeFrame]];
    } else if (
      sourceLocationTable !== null &&
      (funcFlags & FuncFlag.HasOriginalLocation) !== 0
    ) {
      frameLine =
        sourceLocationTable.line[funcTable.originalLocation[funcIndex]];
    } else if ((frameFlags & FrameFlag.HasLine) !== 0) {
      frameLine = frameTable.line[callNodeFrame];
    } else if ((funcFlags & FuncFlag.HasLine) !== 0) {
      frameLine = funcTable.lineNumber[funcIndex];
    } else {
      frameLine = null;
    }
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

/**
 * Returns the column with the highest sample weight on the given line of a
 * call node, or undefined if no sample has a column on this line. The lines
 * are resolved in the same way as in getTotalLineTimingsForCallNode.
 *
 * This is used to scroll to the right place in a pretty-printed source view:
 * minified code often has very long lines, so the line alone doesn't say
 * much.
 */
export function getHottestColumnForLineInCallNode(
  samples: SamplesLikeTable,
  callNodeFramePerStack: Int32Array,
  frameTable: FrameTable,
  funcTable: FuncTable,
  line: LineNumber,
  sourceLocationTable: SourceLocationTable | null
): number | undefined {
  const totalPerColumn = new Map<number, number>();
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stack = samples.stack[sampleIndex];
    if (stack === null) {
      continue;
    }
    const callNodeFrame = callNodeFramePerStack[stack];
    if (callNodeFrame === -1) {
      continue;
    }

    const funcIndex = frameTable.func[callNodeFrame];
    const frameFlags = frameTable.flags[callNodeFrame];
    const funcFlags = funcTable.flags[funcIndex];
    let frameLine: number;
    let frameColumn: number;
    if (
      sourceLocationTable !== null &&
      (frameFlags & FrameFlag.HasOriginalLocation) !== 0
    ) {
      const locationIndex = frameTable.originalLocation[callNodeFrame];
      frameLine = sourceLocationTable.line[locationIndex];
      frameColumn = sourceLocationTable.column[locationIndex];
    } else if (
      sourceLocationTable !== null &&
      (funcFlags & FuncFlag.HasOriginalLocation) !== 0
    ) {
      const locationIndex = funcTable.originalLocation[funcIndex];
      frameLine = sourceLocationTable.line[locationIndex];
      frameColumn = sourceLocationTable.column[locationIndex];
    } else if ((frameFlags & FrameFlag.HasLine) !== 0) {
      if ((frameFlags & FrameFlag.HasColumn) === 0) {
        continue;
      }
      frameLine = frameTable.line[callNodeFrame];
      frameColumn = frameTable.column[callNodeFrame];
    } else if (
      (funcFlags & FuncFlag.HasLine) !== 0 &&
      (funcFlags & FuncFlag.HasColumn) !== 0
    ) {
      // Like in getTotalLineTimingsForCallNode, frames without a line use the
      // start of the function.
      frameLine = funcTable.lineNumber[funcIndex];
      frameColumn = funcTable.columnNumber[funcIndex];
    } else {
      continue;
    }
    if (frameLine !== line) {
      continue;
    }

    const sampleWeight =
      samples.weight !== null ? samples.weight[sampleIndex] : 1;
    totalPerColumn.set(
      frameColumn,
      (totalPerColumn.get(frameColumn) ?? 0) + sampleWeight
    );
  }

  return mapGetKeyWithMaxValue(totalPerColumn);
}
