/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FrameTable,
  FuncTable,
  StackTable,
  SamplesLikeTable,
  IndexIntoCallNodeTable,
  IndexIntoStringTable,
  StackLineInfo,
  LineTimings,
  LineNumber,
} from 'firefox-profiler/types';

import { getMatchingAncestorStackForInvertedCallNode } from './profile-data';
import type { CallNodeInfo, CallNodeInfoInverted } from './call-node-info';

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
  fileNameStringIndex: IndexIntoStringTable
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
    const fileNameStringIndexOfThisStack = funcTable.fileName[func];

    let selfLine: LineNumber | null = null;
    let totalLines: Set<LineNumber> | null =
      prefixStack !== null ? totalLinesForAllStacks[prefixStack] : null;

    if (fileNameStringIndexOfThisStack === fileNameStringIndex) {
      selfLine = frameTable.line[frame];
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

/**
 * Gathers the line numbers which are hit by a given call node.
 * This is different from `getStackLineInfo`: `getStackLineInfo` counts line hits
 * anywhere in the stack, and this function only counts hits *in the given call node*.
 *
 * This is useful when opening a file from a call node: We can directly jump to the
 * place in the file where *this particular call node* spends its time.
 *
 * Returns a StackLineInfo object for the given stackTable and for the source file
 * which contains the call node's func.
 */
export function getStackLineInfoForCallNode(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo
): StackLineInfo {
  const callNodeInfoInverted = callNodeInfo.asInverted();
  return callNodeInfoInverted !== null
    ? getStackLineInfoForCallNodeInverted(
        stackTable,
        frameTable,
        callNodeIndex,
        callNodeInfoInverted
      )
    : getStackLineInfoForCallNodeNonInverted(
        stackTable,
        frameTable,
        callNodeIndex,
        callNodeInfo
      );
}

/**
 * This function handles the non-inverted case of getStackLineInfoForCallNode.
 *
 * Gathers the line numbers which are hit by a given call node.
 * These line numbers are in the source file that contains that call node's func.
 *
 * This is best explained with an example.
 * Let the call node be the node for the call path [A, B, C].
 * Let this be the stack tree:
 *
 *  - stack 1, func A
 *    - stack 2, func B
 *      - stack 3, func C, line 30
 *      - stack 4, func C, line 40
 *    - stack 5, func B
 *      - stack 6, func C, line 60
 *      - stack 7, func C, line 70
 *        - stack 8, func D
 *      - stack 9, func E
 *    - stack 10, func F
 *
 * This maps to the following call tree:
 *
 *  - call node 1, func A
 *    - call node 2, func B
 *      - call node 3, func C
 *        - call node 4, func D
 *      - call node 5, func E
 *   - call node 6, func F
 *
 * The call path [A, B, C] uniquely identifies call node 3.
 * The following stacks all "collapse into" ("map to") call node 3:
 * stack 3, 4, 6 and 7.
 * Stack 8 maps to call node 4, which is a child of call node 3.
 * Stacks 1, 2, 5, 9 and 10 are outside the call path [A, B, C].
 *
 * In this function, we only compute "line hits" that are contributed to
 * the given call node.
 * Stacks 3, 4, 6 and 7 all contribute their time both as "self time"
 * and as "total time" to call node 3, at the line numbers 30, 40, 60,
 * and 70, respectively.
 * Stack 8 also hits call node 3 at line 70, but does not contribute to
 * call node 3's "self time", it only contributes to its "total time".
 * Stacks 1, 2, 5, 9 and 10 don't contribute to call node 3's self or total time.
 *
 * All stacks can contribute no more than one line in the given call node.
 * This is different from the getStackLineInfo function above, where each
 * stack can hit many lines in the same file, because all of the ancestor
 * stacks are taken into account, rather than just one of them. Concretely,
 * this means that in the returned StackLineInfo, each stackLines[stack]
 * set will only contain at most one element.
 *
 * The returned StackLineInfo is computed as follows:
 *   selfLine[stack]:
 *     For stacks that map to the given call node, this is stack.frame.line.
 *     For all other stacks this is null.
 *   stackLines[stack]:
 *     For stacks that map to the given call node or one of its descendant
 *     call nodes, this is a set containing one element, which is
 *     ancestorStack.frame.line, where ancestorStack maps to the given call
 *     node.
 *     For all other stacks, this is null.
 */
export function getStackLineInfoForCallNodeNonInverted(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo
): StackLineInfo {
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();

  // "self line" == "the line which a stack's self time is contributed to"
  const callNodeSelfLineForAllStacks = [];
  // "total lines" == "the set of lines whose total time this stack contributes to"
  // Either null or a single-element set.
  const callNodeTotalLinesForAllStacks: Array<Set<LineNumber> | null> = [];

  // This loop takes advantage of the fact that the stack table is topologically ordered:
  // Prefix stacks are always visited before their descendants.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    let selfLine: LineNumber | null = null;
    let totalLines: Set<LineNumber> | null = null;

    if (stackIndexToCallNodeIndex[stackIndex] === callNodeIndex) {
      // This stack contributes to the call node's self time.
      // We don't need to check the stack's func or file because it'll be
      // the same as the given call node's func and file.
      const frame = stackTable.frame[stackIndex];
      selfLine = frameTable.line[frame];
      if (selfLine !== null) {
        totalLines = new Set([selfLine]);
      }
    } else {
      // This stack does not map to the given call node.
      // So this stack contributes no self time to the call node, and we
      // leave selfLine at null.
      // As for totalTime, this stack contributes to the same line's totalTime
      // as its parent stack: If it is a descendant of a stack X which maps to
      // the given call node, then it contributes to stack X's line's totalTime,
      // otherwise it contributes to no line's totalTime.
      // In the example above, this is how stack 8 contributes to call node 3's
      // totalTime.
      const prefixStack = stackTable.prefix[stackIndex];
      totalLines =
        prefixStack !== null
          ? callNodeTotalLinesForAllStacks[prefixStack]
          : null;
    }

    callNodeSelfLineForAllStacks.push(selfLine);
    callNodeTotalLinesForAllStacks.push(totalLines);
  }
  return {
    selfLine: callNodeSelfLineForAllStacks,
    stackLines: callNodeTotalLinesForAllStacks,
  };
}

/**
 * This handles the inverted case of getStackLineInfoForCallNode.
 *
 * The returned StackLineInfo is computed as follows:
 *   selfLine[stack]:
 *     For (inverted thread) root stack nodes that map to the given call node
 *     and whose stack.frame.func.file is the given file, this is stack.frame.line.
 *     For (inverted thread) root stack nodes whose frame is in a different file,
 *     or which don't map to the given call node, this is null.
 *     For (inverted thread) *non-root* stack nodes, this is the same as the selfLine
 *     of the stack's prefix. This way, the selfLine is always inherited from the
 *     subtree root.
 *   stackLines[stack]:
 *     For stacks that map to the given call node or one of its (inverted tree)
 *     descendant call nodes, this is a set containing one element, which is
 *     ancestorStack.frame.line, where ancestorStack maps to the given call
 *     node.
 *     For all other stacks, this is null.
 */
export function getStackLineInfoForCallNodeInverted(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfoInverted
): StackLineInfo {
  const depth = callNodeInfo.depthForNode(callNodeIndex);
  const [rangeStart, rangeEnd] =
    callNodeInfo.getSuffixOrderIndexRangeForCallNode(callNodeIndex);
  const callNodeIsRootOfInvertedTree = callNodeInfo.isRoot(callNodeIndex);
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  const stackTablePrefixCol = stackTable.prefix;
  const suffixOrderIndexes = callNodeInfo.getSuffixOrderIndexes();

  // "self line" == "the line which a stack's self time is contributed to"
  const callNodeSelfLineForAllStacks = [];
  // "total lines" == "the set of lines whose total time this stack contributes to"
  // Either null or a single-element set.
  const callNodeTotalLinesForAllStacks = [];

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    let selfLine: LineNumber | null = null;
    let totalLines: Set<LineNumber> | null = null;

    const stackForCallNode = getMatchingAncestorStackForInvertedCallNode(
      stackIndex,
      rangeStart,
      rangeEnd,
      suffixOrderIndexes,
      depth,
      stackIndexToCallNodeIndex,
      stackTablePrefixCol
    );
    if (stackForCallNode !== null) {
      const frameForCallNode = stackTable.frame[stackForCallNode];
      // assert(frameTable.func[frameForCallNode] === suffixPath[0]);

      // This stack contributes to the call node's total time.
      // We don't need to check the stack's func or file because it'll be
      // the same as the given call node's func and file.
      const line = frameTable.line[frameForCallNode];
      if (line !== null) {
        totalLines = new Set([line]);
        if (callNodeIsRootOfInvertedTree) {
          // This is a root of the inverted tree, and it is the given
          // call node. That means that we have a self address.
          selfLine = line;
        } else {
          // This is not a root stack node, so no self time is spent
          // in the given call node for this stack node.
        }
      }
    }

    callNodeSelfLineForAllStacks.push(selfLine);
    callNodeTotalLinesForAllStacks.push(totalLines);
  }
  return {
    selfLine: callNodeSelfLineForAllStacks,
    stackLines: callNodeTotalLinesForAllStacks,
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
