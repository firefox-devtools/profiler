// @flow
import type {
  SamplesTable,
  StackTable,
  FrameTable,
  FuncTable,
  IndexIntoFuncTable,
  Thread,
  Profile,
  MarkersTable,
  Marker,
} from '../common/types/profile';
import type { FuncStackTable, IndexIntoFuncStack } from '../common/types/profile-derived';
import { timeCode } from '../common/time-code';

/**
 * Various helpers for dealing with the profile as a data structure.
 * @module profile-data
 */

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5,
};

/**
 * Takes the stack table and the frame table, creates a func stack table and
 * returns a map from each stack to its corresponding func stack which can be
 * used to provide funcStack information for the samples data.
 * @param  {Object} stackTable The thread's stackTable.
 * @param  {Object} frameTable The thread's frameTable.
 * @param  {Object} funcTable  The thread's funcTable.
 * @return {Object}            The funcStackTable and the stackIndexToFuncStackIndex map.
 */
export function getFuncStackInfo(stackTable: StackTable, frameTable: FrameTable, funcTable: FuncTable) {
  return timeCode('getFuncStackInfo', () => {
    const stackIndexToFuncStackIndex = new Uint32Array(stackTable.length);
    const funcCount = funcTable.length;
    const prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack

    // The funcStackTable components.
    const prefix: Array<number> = [];
    const func: Array<number> = [];
    const depth: Array<number> = [];
    let length = 0;

    function addFuncStack(prefixIndex, funcIndex) {
      const index = length++;
      prefix[index] = prefixIndex;
      func[index] = funcIndex;
      if (prefixIndex === -1) {
        depth[index] = 0;
      } else {
        depth[index] = depth[prefixIndex] + 1;
      }
    }

    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixFuncStack = (prefixStack === null) ? -1 :
         stackIndexToFuncStackIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
      let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
      if (funcStackIndex === undefined) {
        funcStackIndex = length;
        addFuncStack(prefixFuncStack, funcIndex);
        prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
      }
      stackIndexToFuncStackIndex[stackIndex] = funcStackIndex;
    }

    const funcStackTable: FuncStackTable = {
      prefix: new Int32Array(prefix),
      func: new Int32Array(func),
      depth,
      length,
    };

    return { funcStackTable, stackIndexToFuncStackIndex };
  });
}

export function getSampleFuncStacks(samples: SamplesTable, stackIndexToFuncStackIndex: { [key: number]: number }) {
  return samples.stack.map(stack => stackIndexToFuncStackIndex[stack]);
}

function getTimeRangeForThread(thread: Thread, interval: number) {
  if (thread.samples.length === 0) {
    return { start: Infinity, end: -Infinity };
  }
  return { start: thread.samples.time[0], end: thread.samples.time[thread.samples.length - 1] + interval};
}

export function getTimeRangeIncludingAllThreads(profile: Profile) {
  const completeRange = { start: Infinity, end: -Infinity };
  profile.threads.forEach(thread => {
    const threadRange = getTimeRangeForThread(thread, profile.meta.interval);
    completeRange.start = Math.min(completeRange.start, threadRange.start);
    completeRange.end = Math.max(completeRange.end, threadRange.end);
  });
  return completeRange;
}

export function defaultThreadOrder(threads: Thread[]) {
  // Put the compositor thread last.
  const threadOrder = threads.map((thread, i) => i);
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;
    if (nameA === nameB) {
      return a - b;
    }
    return (nameA === 'Compositor') ? 1 : -1;
  });
  return threadOrder;
}

export function filterThreadToJSOnly(thread: Thread) {
  return timeCode('filterThreadToJSOnly', () => {
    const { stackTable, funcTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };

    const oldStackToNewStack = new Map();
    const frameCount = frameTable.length;
    const prefixStackAndFrameToStack = new Map(); // prefixNewStack * frameCount + frame => newStackIndex

    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        const prefixNewStack = convertStack(stackTable.prefix[stackIndex]);
        const frameIndex = stackTable.frame[stackIndex];
        const funcIndex = frameTable.func[frameIndex];
        if (!funcTable.isJS[funcIndex]) {
          newStack = prefixNewStack;
        } else {
          const prefixStackAndFrameIndex = (prefixNewStack === null ? -1 : prefixNewStack) * frameCount + frameIndex;
          newStack = prefixStackAndFrameToStack.get(prefixStackAndFrameIndex);
          if (newStack === undefined) {
            newStack = newStackTable.length++;
            newStackTable.prefix[newStack] = prefixNewStack;
            newStackTable.frame[newStack] = frameIndex;
          }
          oldStackToNewStack.set(stackIndex, newStack);
          prefixStackAndFrameToStack.set(prefixStackAndFrameIndex, newStack);
        }
      }
      return newStack;
    }

    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => convertStack(oldStack)),
    });

    return Object.assign({}, thread, {
      samples: newSamples,
      stackTable: newStackTable,
    });
  });
}

export function filterThreadToSearchString(thread: Thread, searchString: string) {
  return timeCode('filterThreadToSearchString', () => {
    if (searchString === '') {
      return thread;
    }
    const lowercaseSearchString = searchString.toLowerCase();
    const { samples, funcTable, frameTable, stackTable, stringTable } = thread;

    const funcMatchesFilterCache = new Map();
    function funcMatchesFilter(func) {
      let result = funcMatchesFilterCache.get(func);
      if (result === undefined) {
        const nameIndex = funcTable.name[func];
        const nameString = stringTable.getString(nameIndex);
        result = nameString.toLowerCase().includes(lowercaseSearchString);
        funcMatchesFilterCache.set(func, result);
      }
      return result;
    }

    const stackMatchesFilterCache = new Map();
    function stackMatchesFilter(stackIndex) {
      if (stackIndex === null) {
        return false;
      }
      let result = stackMatchesFilterCache.get(stackIndex);
      if (result === undefined) {
        const prefix = stackTable.prefix[stackIndex];
        if (stackMatchesFilter(prefix)) {
          result = true;
        } else {
          const frame = stackTable.frame[stackIndex];
          const func = frameTable.func[frame];
          result = funcMatchesFilter(func);
        }
        stackMatchesFilterCache.set(stackIndex, result);
      }
      return result;
    }

    return Object.assign({}, thread, {
      samples: Object.assign({}, samples, {
        stack: samples.stack.map(s => stackMatchesFilter(s) ? s : null),
      }),
    });
  });
}

/**
 * Filter thread to only contain stacks which start with |prefixFuncs|, and
 * only samples witth those stacks. The new stacks' roots will be frames whose
 * func is the last element of the prefix func array.
 * @param  {object} thread      The thread.
 * @param  {array} prefixFuncs  The prefix stack, as an array of funcs.
 * @param  {bool} matchJSOnly   Ignore non-JS frames during matching.
 * @return {object}             The filtered thread.
 */
export function filterThreadToPrefixStack(thread: Thread, prefixFuncs: IndexIntoFuncTable[], matchJSOnly: boolean) {
  return timeCode('filterThreadToPrefixStack', () => {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const prefixDepth = prefixFuncs.length;
    const stackMatches = new Int32Array(stackTable.length);
    const oldStackToNewStack = new Map();
    oldStackToNewStack.set(null, null);
    const newStackTable = {
      length: 0,
      prefix: [],
      frame: [],
    };
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const prefixMatchesUpTo = prefix !== null ? stackMatches[prefix] : 0;
      let stackMatchesUpTo = -1;
      if (prefixMatchesUpTo !== -1) {
        const frame = stackTable.frame[stackIndex];
        if (prefixMatchesUpTo === prefixDepth) {
          stackMatchesUpTo = prefixDepth;
        } else {
          const func = frameTable.func[frame];
          if (func === prefixFuncs[prefixMatchesUpTo]) {
            stackMatchesUpTo = prefixMatchesUpTo + 1;
          } else if (matchJSOnly && !funcTable.isJS[func]) {
            stackMatchesUpTo = prefixMatchesUpTo;
          }
        }
        if (stackMatchesUpTo === prefixDepth) {
          const newStackIndex = newStackTable.length++;
          const newStackPrefix = oldStackToNewStack.get(prefix);
          newStackTable.prefix[newStackIndex] = newStackPrefix !== undefined ? newStackPrefix : null;
          newStackTable.frame[newStackIndex] = frame;
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
      }
      stackMatches[stackIndex] = stackMatchesUpTo;
    }
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        if (stackMatches[oldStack] !== prefixDepth) {
          return null;
        }
        return oldStackToNewStack.get(oldStack);
      }),
    });
    return Object.assign({}, thread, {
      stackTable: newStackTable,
      samples: newSamples,
    });
  });
}

/**
 * Filter thread to only contain stacks which end with |postfixFuncs|, and
 * only samples witth those stacks. The new stacks' leaf frames will be
 * frames whose func is the last element of the postfix func array.
 * @param  {object} thread      The thread.
 * @param  {array} postfixFuncs The postfix stack, as an array of funcs,
 *                              starting from the leaf func.
 * @param  {bool} matchJSOnly   Ignore non-JS frames during matching.
 * @return {object}             The filtered thread.
 */
export function filterThreadToPostfixStack(thread: Thread, postfixFuncs: IndexIntoFuncTable[], matchJSOnly: boolean) {
  return timeCode('filterThreadToPostfixStack', () => {
    const postfixDepth = postfixFuncs.length;
    const { stackTable, frameTable, funcTable, samples } = thread;

    function convertStack(leaf) {
      let matchesUpToDepth = 0; // counted from the leaf
      for (let stack = leaf; stack !== null; stack = stackTable.prefix[stack]) {
        const frame = stackTable.frame[stack];
        const func = frameTable.func[frame];
        if (func === postfixFuncs[matchesUpToDepth]) {
          matchesUpToDepth++;
          if (matchesUpToDepth === postfixDepth) {
            return stack;
          }
        } else if (!matchJSOnly || funcTable.isJS[func]) {
          return null;
        }
      }
      return null;
    }

    const oldStackToNewStack = new Map();
    oldStackToNewStack.set(null, null);
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(stackIndex => {
        let newStackIndex = oldStackToNewStack.get(stackIndex);
        if (newStackIndex === undefined) {
          newStackIndex = convertStack(stackIndex);
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
        return newStackIndex;
      }),
    });
    return Object.assign({}, thread, {
      samples: newSamples,
    });
  });
}

function getSampleIndexRangeForSelection(samples: SamplesTable, rangeStart: number, rangeEnd: number) {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstSample = samples.time.findIndex(t => t >= rangeStart);
  if (firstSample === -1) {
    return [samples.length, samples.length];
  }
  const afterLastSample = samples.time.slice(firstSample).findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstSample, samples.length];
  }
  return [firstSample, firstSample + afterLastSample];
}

function getMarkerIndexRangeForSelection(markers: MarkersTable, rangeStart: number, rangeEnd: number) {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstMarker = markers.time.findIndex(t => t >= rangeStart);
  if (firstMarker === -1) {
    return [markers.length, markers.length];
  }
  const afterLastSample = markers.time.slice(firstMarker).findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstMarker, markers.length];
  }
  return [firstMarker, firstMarker + afterLastSample];
}

export function filterThreadToRange(thread: Thread, rangeStart: number, rangeEnd: number) {
  const { samples, markers } = thread;
  const [sBegin, sEnd] = getSampleIndexRangeForSelection(samples, rangeStart, rangeEnd);
  const newSamples = {
    length: sEnd - sBegin,
    time: samples.time.slice(sBegin, sEnd),
    stack: samples.stack.slice(sBegin, sEnd),
    responsiveness: samples.responsiveness.slice(sBegin, sEnd),
    rss: samples.rss.slice(sBegin, sEnd),
    uss: samples.uss.slice(sBegin, sEnd),
    frameNumber: samples.frameNumber.slice(sBegin, sEnd),
  };
  const [mBegin, mEnd] = getMarkerIndexRangeForSelection(markers, rangeStart, rangeEnd);
  const newMarkers = {
    length: mEnd - mBegin,
    time: markers.time.slice(mBegin, mEnd),
    name: markers.name.slice(mBegin, mEnd),
    data: markers.data.slice(mBegin, mEnd),
  };
  return Object.assign({}, thread, {
    samples: newSamples,
    markers: newMarkers,
  });
}

export function getFuncStackFromFuncArray(funcArray: IndexIntoFuncTable[], funcStackTable: FuncStackTable) {
  let fs = -1;
  for (let i = 0; i < funcArray.length; i++) {
    const func = funcArray[i];
    let nextFS = -1;
    for (let funcStackIndex = fs + 1; funcStackIndex < funcStackTable.length; funcStackIndex++) {
      if (funcStackTable.prefix[funcStackIndex] === fs &&
          funcStackTable.func[funcStackIndex] === func) {
        nextFS = funcStackIndex;
        break;
      }
    }
    if (nextFS === -1) {
      return null;
    }
    fs = nextFS;
  }
  return fs;
}

export function getStackAsFuncArray(funcStackIndex: IndexIntoFuncStack, funcStackTable: FuncStackTable) {
  if (funcStackIndex === null) {
    return [];
  }
  if (funcStackIndex * 1 !== funcStackIndex) {
    console.log('bad funcStackIndex in getStackAsFuncArray:', funcStackIndex);
    return [];
  }
  const funcArray: IndexIntoFuncTable[] = [];
  let fs = funcStackIndex;
  while (fs !== -1) {
    funcArray.push(funcStackTable.func[fs]);
    fs = funcStackTable.prefix[fs];
  }
  funcArray.reverse();
  return funcArray;
}

export function invertCallstack(thread: Thread) {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };
    const frameCount = frameTable.length;
    const prefixAndFrameToStack = new Map(); // prefix * frameCount + frame => stackIndex
    function stackFor(prefix, frame) {
      const prefixAndFrameIndex = (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
      }
      return stackIndex;
    }

    const oldStackToNewStack = new Map();

    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        newStack = null;
        for (let currentStack = stackIndex; currentStack !== null; currentStack = stackTable.prefix[currentStack]) {
          newStack = stackFor(newStack, stackTable.frame[currentStack]);
        }
        oldStackToNewStack.set(stackIndex, newStack);
      }
      return newStack;
    }

    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => convertStack(oldStack)),
    });

    return Object.assign({}, thread, {
      samples: newSamples,
      stackTable: newStackTable,
    });
  });
}

export function getSampleIndexClosestToTime(samples: SamplesTable, time: number) {
  // TODO: This should really use bisect. samples.time is sorted.
  for (let i = 0; i < samples.length; i++) {
    if (samples.time[i] >= time) {
      if (i === 0) {
        return 0;
      }
      const distanceToThis = samples.time[i] - time;
      const distanceToLast = time - samples.time[i - 1];
      return distanceToThis < distanceToLast ? i : i - 1;
    }
  }
  return samples.length - 1;
}

export function getJankInstances(samples: SamplesTable, processType: string, thresholdInMs: number) {
  let lastResponsiveness = 0;
  let lastTimestamp = 0;
  const jankInstances = [];
  for (let i = 0; i < samples.length; i++) {
    const currentResponsiveness = samples.responsiveness[i];
    if (currentResponsiveness < lastResponsiveness) {
      if (lastResponsiveness >= thresholdInMs) {
        jankInstances.push({
          start: lastTimestamp - lastResponsiveness,
          dur: lastResponsiveness,
          title: `${lastResponsiveness.toFixed(2)}ms event processing delay on ${processType} thread`,
          name: 'Jank',
        });
      }
    }
    lastResponsiveness = currentResponsiveness;
    lastTimestamp = samples.time[i];
  }
  if (lastResponsiveness >= thresholdInMs) {
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      dur: lastResponsiveness,
      title: `${lastResponsiveness.toFixed(2)}ms event processing delay on ${processType} thread`,
      name: 'Jank',
    });
  }
  return jankInstances;
}

export function getTracingMarkers(thread: Thread, markers: MarkersTable) {
  const { stringTable } = thread;
  const tracingMarkers: Marker[] = [];
  const openMarkers: Marker[] = [];
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data || data.type !== 'tracing') {
      // console.log('non-tracing marker:', name);
      continue;
    }

    const time = markers.time[i];
    const name = stringTable.getString(markers.name[i]);
    if (data.interval === 'start') {
      openMarkers.push({
        start: time,
        name,
      });
    } else if (data.interval === 'end') {
      const marker = openMarkers.pop();
      if (marker === undefined) {
        continue;
      }
      if (marker.start !== undefined) {
        marker.dur = time - marker.start;
      }
      if (marker.name !== undefined && marker.dur !== undefined) {
        marker.title = `${marker.name} for ${marker.dur.toFixed(2)}ms`;
      }
      tracingMarkers.push(marker);
    }
  }
  return tracingMarkers;
}

export function computeFuncStackMaxDepth({funcStackTable}) {
  let maxDepth = 0;
  for (let i = 0; i < funcStackTable.depth.length; i++) {
    if (funcStackTable.depth[i] > maxDepth) {
      maxDepth = funcStackTable.depth[i];
    }
  }
  return maxDepth;
}

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
 * @param {object} thread - The profile thread.
 * @param {object} funcStackInfo - from the funcStackInfo selector.
 * @param {integer} maxDepth - The max depth of the all the stacks.
 * @param {number} interval - The interval of how long the profile was recorded.
 * @param {boolean} jsOnly - Whether or not to collapse platform stacks.
 * @return {array} stackTimingByDepth - for example:
 *
 * [
 *   {start: [10], end: [100], stack: [0]}
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [1, 2, 3]}
 *   {start: [20, 40, 60], end: [40, 60, 80], stack: [34, 59, 72]}
 *   ...
 *   {start: [25, 45], end: [35, 55], stack: [123, 159, 160]}
 * ]
 */
export function getStackTimingByDepth(thread, funcStackInfo, maxDepth, interval, jsOnly) {
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  const stackTimingByDepth = Array.from({length: maxDepth + 1}, () => ({
    start: [],
    end: [],
    stack: [],
    length: 0,
  }));
  const lastSeenStartTimeByDepth = [];
  const lastSeenStackIndexByDepth = [];

  function popStacks(depth, previousDepth, sampleTime) {
    // "Pop" off the stack, and commit the timing of the frames
    for (let stackDepth = depth + 1; stackDepth <= previousDepth; stackDepth++) {
      // Push on the new information.
      stackTimingByDepth[stackDepth].start.push(lastSeenStartTimeByDepth[stackDepth]);
      stackTimingByDepth[stackDepth].end.push(sampleTime);
      stackTimingByDepth[stackDepth].stack.push(lastSeenStackIndexByDepth[stackDepth]);
      stackTimingByDepth[stackDepth].length++;

      // Delete that this stack frame has been seen.
      lastSeenStackIndexByDepth[stackDepth] = undefined;
      lastSeenStartTimeByDepth[stackDepth] = undefined;
    }
  }

  function pushStacks(depth, startingIndex, sampleTime) {
    let stackIndex = startingIndex;
    // "Push" onto the stack with new frames
    for (let parentDepth = depth; parentDepth >= 0; parentDepth--) {
      if (lastSeenStackIndexByDepth[parentDepth] !== undefined) {
        break;
      }
      lastSeenStackIndexByDepth[parentDepth] = stackIndex;
      lastSeenStartTimeByDepth[parentDepth] = sampleTime;
      stackIndex = thread.stackTable.prefix[stackIndex];
    }
  }

  // Go through each sample, and push/pop it on the stack to build up
  // the stackTimingByDepth.
  let previousDepth = 0;
  for (let i = 0; i < thread.samples.length; i++) {
    const stackIndex = thread.samples.stack[i];
    const sampleTime = thread.samples.time[i];
    const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
    const depth = funcStackTable.depth[funcStackIndex];

    // If the two samples at the top of the stack are different, pop the last stack frame.
    const depthToPop = lastSeenStackIndexByDepth[depth] === stackIndex ? depth : depth - 1;
    popStacks(depthToPop, previousDepth, sampleTime);
    pushStacks(depth, stackIndex, sampleTime);
    previousDepth = depth;
  }

  // Pop the remaining stacks
  const endingTime = thread.samples.time[thread.samples.time.length - 1] + interval;
  popStacks(-1, previousDepth, endingTime);

  // Collapse platform code into single rows if JS only.
  if (jsOnly) {
    collapsePlatformStacks(stackTimingByDepth, thread, funcStackInfo);
  }

  return stackTimingByDepth;
}

/**
 * Given timing information like below, collapse out the platform stacks. In the diagram
 * "J" represents JavaScript stack frame timing, and "P" Platform stack frame timing.
 * The timing stack index gets changed to -1 for collapsed platform code.
 *
 * JJJJJJJJJJJJJJJJ  --->  JJJJJJJJJJJJJJJJ
 * PPPPPPPPPPPPPPPP        PPPPPPPPPPPPPPPP
 *     PPPPPPPPPPPP            JJJJJJJJ
 *     PPPPPPPP                JJJ  JJJ
 *     JJJJJJJJ
 *     JJJ  JJJ
 *
 * @param {Object} stackTimingByDepth - Table of stack timings.
 * @param {Object} thread - The current thread.
 * @param {Object} funcStackInfo - Info about funcStacks.
 * @returns {Object} The mutated and collapsed timing information.
 */
function collapsePlatformStacks(stackTimingByDepth, thread, funcStackInfo) {
  const {funcStackTable, stackIndexToFuncStackIndex} = funcStackInfo;
  function findParentTimingIndex(timingRow, start, end) {
    for (let i = 0; i < timingRow.stack.length; i++) {
      if (timingRow.start[i] <= start && timingRow.end[i] >= end) {
        return i;
      }
    }
    return -1;
  }

  function findChildTimingIndicesInRange(timingRow, start, end) {
    const inRange = {
      index: [],
      stack: [],
      start: [],
      end: [],
    };

    for (let i = 0; i < timingRow.stack.length; i++) {
      if (timingRow.start[i] >= start) {
        if (timingRow.end[i] <= end) {
          inRange.index.push(i);
          inRange.stack.push(timingRow.stack[i]);
          inRange.start.push(timingRow.start[i]);
          inRange.end.push(timingRow.end[i]);
        } else {
          break;
        }
      }
    }
    return inRange;
  }

  /**
   * Walk from the parent to the leaf of the stack, collapsing the stack down one level.
   *
   * JJJJJJJJJJJJJJJJ
   * PPPPPPPPPPPPPPPP
   *     PPPPPPPPPPPP   <- parent
   *     [ collapse ]   <- empty (the platform timing that was removed)
   *     JJJJJJJJ       <- child
   *  ^  JJJ  JJJ
   *  |
   *  collapse down
   *
   * @param {Integer} depth - The depth of the empty row.
   * @param {Integer} timingIndex - The timingIndex of the removed timing.
   * @param {Number} start - The starting time of the removed timing.
   * @param {Number} end - The ending time of the removed timing.
   * @return {undefined}
   */
  function collapseStackDownOneLevel(depth, timingIndex, start, end) {
    let emptyTimingIndex = timingIndex;
    for (let emptyDepth = depth; emptyDepth < stackTimingByDepth.length - 1; emptyDepth++) {
      const childDepth = emptyDepth + 1;
      const emptyTimingRow = stackTimingByDepth[emptyDepth];
      const childTimingRow = stackTimingByDepth[childDepth];
      const inRangeTimings = findChildTimingIndicesInRange(childTimingRow, start, end);
      const childTimingIndex = inRangeTimings.index[0];

      // If all of the samples were found, then bail out.
      if (inRangeTimings.index.length === 0) {
        break;
      }

      // Splice out all of the children timings.
      childTimingRow.stack.splice(childTimingIndex, inRangeTimings.index.length);
      childTimingRow.start.splice(childTimingIndex, inRangeTimings.index.length);
      childTimingRow.end.splice(childTimingIndex, inRangeTimings.index.length);

      // Insert them all into the empty row.
      emptyTimingRow.stack.splice(emptyTimingIndex, 0, ...inRangeTimings.stack);
      emptyTimingRow.start.splice(emptyTimingIndex, 0, ...inRangeTimings.start);
      emptyTimingRow.end.splice(emptyTimingIndex, 0, ...inRangeTimings.end);

      emptyTimingIndex = childTimingIndex;
    }
  }

  // Set any platform stacks to -1
  for (let depth = 0; depth < stackTimingByDepth.length; depth++) {
    const timingRow = stackTimingByDepth[depth];
    for (let i = 0; i < timingRow.stack.length; i++) {
      const stackIndex = timingRow.stack[i];
      const funcStackIndex = stackIndexToFuncStackIndex[stackIndex];
      const funcIndex = funcStackTable.func[funcStackIndex];
      if (!thread.funcTable.isJS[funcIndex]) {
        timingRow.stack[i] = -1;
      }
    }
  }

  // Pre-emptively merge together consecutive platform stacks in the same row to minimize
  // operations in the collapsing function.
  for (let depth = 0; depth < stackTimingByDepth.length; depth++) {
    const timingRow = stackTimingByDepth[depth];
    for (let bIndex = 1; bIndex < timingRow.length; bIndex++) {
      const aIndex = bIndex - 1;
      const stackA = timingRow[aIndex];
      const stackB = timingRow[bIndex];
      if (stackA === -1 && stackB === -1) {
        timingRow.start.splice(bIndex, 1);
        timingRow.stack.splice(bIndex, 1);
        timingRow.end.splice(aIndex, 1);
        timingRow.oDepth.splice(bIndex, 1);
        timingRow.oStack.splice(bIndex, 1);
      }
    }
  }

  // Compare neighboring stacks (a child, and parent). If both child and parent are
  // platform code, then pop off the child, and shift the rest of the children stacks
  // up.
  for (let childDepth = stackTimingByDepth.length - 1; childDepth > 0; childDepth--) {
    const parentDepth = childDepth - 1;
    const parentTimingRow = stackTimingByDepth[parentDepth];
    const childTimingRow = stackTimingByDepth[childDepth];

    // Go through each stack frame at this depth.
    for (let childTimingIndex = 0; childTimingIndex < childTimingRow.start.length; childTimingIndex++) {
      // Find the parent frame.
      const childStart = childTimingRow.start[childTimingIndex];
      const childEnd = childTimingRow.end[childTimingIndex];
      const parentTimingIndex = findParentTimingIndex(parentTimingRow, childStart, childEnd);
      const childTimingRowLengthBefore = childTimingRow.start.length;

      // Are both stacks from the platform?
      if (childTimingRow.stack[childTimingIndex] === -1 &&
          parentTimingRow.stack[parentTimingIndex] === -1) {

        childTimingRow.start.splice(childTimingIndex, 1);
        childTimingRow.end.splice(childTimingIndex, 1);
        childTimingRow.stack.splice(childTimingIndex, 1);

        collapseStackDownOneLevel(childDepth, childTimingIndex, childStart, childEnd);

        // If a sample was deleted, make sure and adjust the index to go back a sample.
        if (childTimingRowLengthBefore - childTimingRow.start.length === 1) {
          childTimingIndex--;
        }
      }
    }
  }

  // Perform some final updates based on the final computed timing.
  for (let depth = 0; depth < stackTimingByDepth.length; depth++) {
    // Update row lengths.
    const timingRow = stackTimingByDepth[depth];
    timingRow.length = timingRow.stack.length;

    // If a row is empty from shifting samples, then drop the rest of the rows.
    if (timingRow.length === 0) {
      stackTimingByDepth.length = depth;
    }
  }

  return stackTimingByDepth;
}
