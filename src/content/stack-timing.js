// @flow
import type { IndexIntoStackTable, IndexIntoFrameTable, Thread, StackTable } from '../common/types/profile';
import type { FuncStackInfo } from '../common/types/profile-derived';
import type { GetCategory } from './color-categories';
/**
 * The StackTimingByDepth data structure organizes stack frames by their depth, and start
 * and end times. This optimizes sample data for Flame Chart timeline views. It
 * makes it really easy to draw a large amount of boxes at once based on where the
 * viewport is in the stack frame data. Plus the end timings for frames need to be
 * reconstructed from the sample data, as the samples only contain start timings.
 *
 * This format allows for specifically selecting certain rows of stack frames by using
 * the stack depth information. In addition, the start and end times of samples can be
 * found through binary searches, allowing for selecting the proper subsets of frames
 * to be drawn. Each row's sample length is different, but it can still be efficient
 * to find subsets of the data.
 *
 * Each object in the array below represents a single row of stack frames at a given
 * depth. Each object is a table that contains the the start time and end time in
 * milliseconds, and the stack index that points into the stack table.
 *
 * stackTimingByDepth Example:
 * [
 *   // This first object represents the first box at the base of the chart. It only
 *   // contains a single stack frame to draw, starting at 10ms, ending at 100ms. It
 *   // points to the stackIndex 0.
 *
 *   {start: [10], end: [100], stack: [0]}
 *
 *   // This next object represents 3 boxes to draw, the first box being stack 1 in the
 *   // stack table, and it starts at 20ms, and ends at 40ms.
 *
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [1, 2, 3]}
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [34, 59, 72]}
 *   ...
 *   {start: [25, 45], end: [35, 55], stack: [123, 159]}
 * ]
 */
export type StackTimingByDepth = Array<{
  // Start time of stack in milliseconds.
  start: number[],
  // End time of stack in milliseconds.
  end: number[],
  stack: IndexIntoStackTable[],
  length: number,
}>

type LastSeen = {
  startTimeByDepth: number[],
  stackIndexByDepth: IndexIntoStackTable[],
}

/**
 * Build a StackTimingByDepth table from a given thread.
 *
 * @param {object} thread - The profile thread.
 * @param {object} funcStackInfo - from the funcStackInfo selector.
 * @param {integer} maxDepth - The max depth of the all the stacks.
 * @param {number} interval - The sampling interval that the profile was recorded with.
 * @return {array} stackTimingByDepth
 */
export function getStackTimingByDepth(
  thread: Thread, funcStackInfo: FuncStackInfo, maxDepth: number, interval: number
): StackTimingByDepth {
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  const stackTimingByDepth = Array.from({length: maxDepth + 1}, () => ({
    start: [],
    end: [],
    stack: [],
    length: 0,
  }));

  const lastSeen:LastSeen = {
    startTimeByDepth: [],
    stackIndexByDepth: [],
  };

  // Go through each sample, and push/pop it on the stack to build up
  // the stackTimingByDepth.
  let previousDepth = -1;
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    const sampleTime = thread.samples.time[i];

    // If this stack index is null (for instance if it was filtered out) then pop back
    // down to the base stack.
    if (stackIndex === null) {
      _popStacks(stackTimingByDepth, lastSeen, -1, previousDepth, sampleTime);
      previousDepth = -1;
    } else {
      const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
      const depth = funcStackTable.depth[funcStackIndex];

      // Find the depth of the nearest shared stack.
      const depthToPop = _findNearestSharedStackDepth(thread.stackTable, stackIndex, lastSeen, depth);
      _popStacks(stackTimingByDepth, lastSeen, depthToPop, previousDepth, sampleTime);
      _pushStacks(thread, lastSeen, depth, stackIndex, sampleTime);
      previousDepth = depth;
    }
  }

  // Pop the remaining stacks
  const endingTime = thread.samples.time[thread.samples.time.length - 1] + interval;
  _popStacks(stackTimingByDepth, lastSeen, -1, previousDepth, endingTime);

  return stackTimingByDepth;
}

function _findNearestSharedStackDepth(
  stackTable: StackTable, stackIndex: IndexIntoStackTable, lastSeen: LastSeen, depthStart: number
): number {
  let nextStackIndex = stackIndex;
  for (let depth = depthStart; depth >= 0; depth--) {
    if (lastSeen.stackIndexByDepth[depth] === nextStackIndex) {
      return depth;
    }
    nextStackIndex = stackTable.prefix[nextStackIndex];
  }
  return -1;
}

function _popStacks(
  stackTimingByDepth: StackTimingByDepth, lastSeen: LastSeen, depth: number,
  previousDepth: number, sampleTime: number
) {
  // "Pop" off the stack, and commit the timing of the frames
  for (let stackDepth = depth + 1; stackDepth <= previousDepth; stackDepth++) {
    // Push on the new information.
    stackTimingByDepth[stackDepth].start.push(lastSeen.startTimeByDepth[stackDepth]);
    stackTimingByDepth[stackDepth].end.push(sampleTime);
    stackTimingByDepth[stackDepth].stack.push(lastSeen.stackIndexByDepth[stackDepth]);
    stackTimingByDepth[stackDepth].length++;

    // Delete that this stack frame has been seen.
    delete lastSeen.stackIndexByDepth[stackDepth];
    delete lastSeen.startTimeByDepth[stackDepth];
  }
}

function _pushStacks(
  thread: Thread, lastSeen: LastSeen, depth: number, startingIndex: IndexIntoStackTable,
  sampleTime: number
) {
  let stackIndex = startingIndex;
  // "Push" onto the stack with new frames
  for (let parentDepth = depth; parentDepth >= 0; parentDepth--) {
    if (stackIndex === null || lastSeen.stackIndexByDepth[parentDepth] !== undefined) {
      break;
    }
    lastSeen.stackIndexByDepth[parentDepth] = stackIndex;
    lastSeen.startTimeByDepth[parentDepth] = sampleTime;
    stackIndex = thread.stackTable.prefix[stackIndex];
  }
}

export function computeFuncStackMaxDepth(rangedThread: Thread, funcStackInfo: FuncStackInfo): number {
  let maxDepth = 0;
  const {samples} = rangedThread;
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  for (let i = 0; i < rangedThread.samples.length; i++) {
    const stackIndex = samples.stack[i];
    if (stackIndex !== null) {
      const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
      const depth = funcStackTable.depth[funcStackIndex];
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }
  return maxDepth;
}

type GetRelevantFrame = (Thread, IndexIntoStackTable) => IndexIntoFrameTable;

export function getLeafCategoryStackTiming(
  thread: Thread, interval: number, getCategory: GetCategory,
  getRelevantLeafStack: GetRelevantFrame = getNearestJSFrame
) {
  const stackTiming = {
    start: [],
    end: [],
    stack: [],
    length: 0,
  };

  let previousName = null;
  let previousSampleTime = null;
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    if (stackIndex === null) {
      if (previousSampleTime !== null) {
        stackTiming.end.push(previousSampleTime);
      }
      previousName = null;
    } else {
      const relevantStackIndex = getRelevantLeafStack(thread, stackIndex);
      const frameIndex = thread.stackTable.frame[relevantStackIndex];
      const {name} = getCategory(thread, frameIndex);

      if (name !== previousName) {
        const sampleTime = thread.samples.time[i];
        stackTiming.start.push(sampleTime);
        stackTiming.stack.push(relevantStackIndex);
        stackTiming.length++;
        if (previousName !== null) {
          stackTiming.end.push(sampleTime);
        }
        previousName = name;
        previousSampleTime = sampleTime;
      }
    }
  }

  if (stackTiming.end.length !== stackTiming.start.length) {
    // Calculate the final end time.
    stackTiming.end.push(thread.samples.time[thread.samples.length - 1] + interval);
  }

  return [stackTiming];
}

function _getLeafStack(thread: Thread, stackIndex: IndexIntoStackTable): IndexIntoStackTable {
  return stackIndex;
}

function getNearestJSFrame(thread: Thread, stackIndex: IndexIntoStackTable): IndexIntoStackTable {
  let nextStackIndex = stackIndex;
  while (nextStackIndex !== null) {
    const frameIndex = thread.stackTable.frame[nextStackIndex];
    const funcIndex = thread.frameTable.func[frameIndex];
    const isJS = thread.funcTable.isJS[funcIndex];
    if (isJS) {
      return nextStackIndex;
    }
    nextStackIndex = thread.stackTable.prefix[nextStackIndex];
  }
  return stackIndex;
}
