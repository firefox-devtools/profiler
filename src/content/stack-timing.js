/**
 * Build a sample timing table that lists all of the sample's timing information
 * by call stack depth. This optimizes sample data for Flame Chart timeline views. It
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
 *   {start: [25, 45], end: [35, 55], stack: [123, 159, 160]}
 * ]
 *
 * @param {object} thread - The profile thread.
 * @param {object} funcStackInfo - from the funcStackInfo selector.
 * @param {integer} maxDepth - The max depth of the all the stacks.
 * @param {number} interval - The sampling interval that the profile was recorded with.
 * @return {array} stackTimingByDepth
 */
export function getStackTimingByDepth(thread, funcStackInfo, maxDepth, interval) {
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  const stackTimingByDepth = Array.from({length: maxDepth + 1}, () => ({
    start: [],
    end: [],
    stack: [],
    length: 0,
  }));

  const lastSeen = {
    startTimeByDepth: [],
    stackIndexByDepth: [],
  };

  // Go through each sample, and push/pop it on the stack to build up
  // the stackTimingByDepth.
  let previousDepth = -1;
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    const sampleTime = thread.samples.time[i];
    const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
    const depth = funcStackTable.depth[funcStackIndex];

    // If the two samples at the top of the stack are different, pop the last stack frame.
    const depthToPop = lastSeen.stackIndexByDepth[depth] === stackIndex ? depth : depth - 1;
    _popStacks(stackTimingByDepth, lastSeen, depthToPop, previousDepth, sampleTime);
    _pushStacks(thread, lastSeen, depth, stackIndex, sampleTime);
    previousDepth = depth;
  }

  // Pop the remaining stacks
  const endingTime = thread.samples.time[thread.samples.time.length - 1] + interval;
  _popStacks(stackTimingByDepth, lastSeen, -1, previousDepth, endingTime);

  return stackTimingByDepth;
}

function _popStacks(stackTimingByDepth, lastSeen, depth, previousDepth, sampleTime) {
  // "Pop" off the stack, and commit the timing of the frames
  for (let stackDepth = depth + 1; stackDepth <= previousDepth; stackDepth++) {
    // Push on the new information.
    stackTimingByDepth[stackDepth].start.push(lastSeen.startTimeByDepth[stackDepth]);
    stackTimingByDepth[stackDepth].end.push(sampleTime);
    stackTimingByDepth[stackDepth].stack.push(lastSeen.stackIndexByDepth[stackDepth]);
    stackTimingByDepth[stackDepth].length++;

    // Delete that this stack frame has been seen.
    lastSeen.stackIndexByDepth[stackDepth] = undefined;
    lastSeen.startTimeByDepth[stackDepth] = undefined;
  }
}

function _pushStacks(thread, lastSeen, depth, startingIndex, sampleTime) {
  let stackIndex = startingIndex;
  // "Push" onto the stack with new frames
  for (let parentDepth = depth; parentDepth >= 0; parentDepth--) {
    if (lastSeen.stackIndexByDepth[parentDepth] !== undefined) {
      break;
    }
    lastSeen.stackIndexByDepth[parentDepth] = stackIndex;
    lastSeen.startTimeByDepth[parentDepth] = sampleTime;
    stackIndex = thread.stackTable.prefix[stackIndex];
  }
}

export function computeFuncStackMaxDepth(rangedThread, funcStackInfo) {
  let maxDepth = 0;
  const {samples} = rangedThread;
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  for (let i = 0; i < rangedThread.samples.length; i++) {
    const stackIndex = samples.stack[i];
    const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
    const depth = funcStackTable.depth[funcStackIndex];
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }
  return maxDepth;
}
