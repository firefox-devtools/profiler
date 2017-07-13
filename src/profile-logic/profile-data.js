/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Profile,
  Thread,
  SamplesTable,
  StackTable,
  FrameTable,
  FuncTable,
  MarkersTable,
  IndexIntoFuncTable,
  IndexIntoStringTable,
  IndexIntoSamplesTable,
  IndexIntoMarkersTable,
  IndexIntoStackTable,
  ThreadIndex,
} from '../types/profile';
import type { MarkerPayload } from '../types/markers';
import type {
  FuncStackInfo,
  FuncStackTable,
  IndexIntoFuncStackTable,
  TracingMarker,
} from '../types/profile-derived';
import type { StartEndRange } from '../types/units';
import { timeCode } from '../utils/time-code';
import { getEmptyTaskTracerData } from './task-tracer';

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
 * Generate the FuncStackInfo which contains the FuncStackTable, and a map to convert
 * an IndexIntoStackTable to a IndexIntoFuncStackTable. This function runs through
 * a stackTable, and de-duplicates stacks that have frames that point to the same
 * function.
 *
 * See `src/types/profile-derived.js` for the type definitions.
 * See `docs/func-stacks.md` for a detailed explanation of funcStacks.
 */
export function getFuncStackInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable
): FuncStackInfo {
  return timeCode('getFuncStackInfo', () => {
    const stackIndexToFuncStackIndex = new Uint32Array(stackTable.length);
    const funcCount = funcTable.length;
    // Maps can't key off of two items, so combine the prefixFuncStack and the funcIndex
    // using the following formula: prefixFuncStack * funcCount + funcIndex => funcStack
    const prefixFuncStackAndFuncToFuncStackMap = new Map();

    // The funcStackTable components.
    const prefix: Array<IndexIntoFuncStackTable> = [];
    const func: Array<IndexIntoFuncTable> = [];
    const depth: Array<number> = [];
    let length = 0;

    function addFuncStack(
      prefixIndex: IndexIntoFuncStackTable,
      funcIndex: IndexIntoFuncTable
    ) {
      const index = length++;
      prefix[index] = prefixIndex;
      func[index] = funcIndex;
      if (prefixIndex === -1) {
        depth[index] = 0;
      } else {
        depth[index] = depth[prefixIndex] + 1;
      }
    }

    // Go through each stack, and create a new funcStack table, which is based off of
    // functions rather than frames.
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      // We know that at this point the following condition holds:
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixFuncStack =
        prefixStack === null ? -1 : stackIndexToFuncStackIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      const prefixFuncStackAndFuncIndex =
        prefixFuncStack * funcCount + funcIndex;
      let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(
        prefixFuncStackAndFuncIndex
      );
      if (funcStackIndex === undefined) {
        funcStackIndex = length;
        addFuncStack(prefixFuncStack, funcIndex);
        prefixFuncStackAndFuncToFuncStackMap.set(
          prefixFuncStackAndFuncIndex,
          funcStackIndex
        );
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

export function getSampleFuncStacks(
  samples: SamplesTable,
  stackIndexToFuncStackIndex: {
    [key: IndexIntoStackTable]: IndexIntoFuncStackTable,
  }
): Array<IndexIntoFuncStackTable | null> {
  return samples.stack.map(stack => {
    return stack === null ? null : stackIndexToFuncStackIndex[stack];
  });
}

function _getTimeRangeForThread(
  thread: Thread,
  interval: number
): StartEndRange {
  if (thread.samples.length === 0) {
    return { start: Infinity, end: -Infinity };
  }
  return {
    start: thread.samples.time[0],
    end: thread.samples.time[thread.samples.length - 1] + interval,
  };
}

export function getTimeRangeIncludingAllThreads(
  profile: Profile
): StartEndRange {
  const completeRange = { start: Infinity, end: -Infinity };
  profile.threads.forEach(thread => {
    const threadRange = _getTimeRangeForThread(thread, profile.meta.interval);
    completeRange.start = Math.min(completeRange.start, threadRange.start);
    completeRange.end = Math.max(completeRange.end, threadRange.end);
  });
  return completeRange;
}

export function defaultThreadOrder(threads: Thread[]): ThreadIndex[] {
  // Put the compositor/renderer thread last.
  const threadOrder = threads.map((thread, i) => i);
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;
    if (nameA === nameB) {
      return a - b;
    }
    return nameA === 'Compositor' || nameA === 'Renderer' ? 1 : -1;
  });
  return threadOrder;
}

export function filterThreadByImplementation(
  thread: Thread,
  implementation: string
): Thread {
  const { funcTable, stringTable } = thread;

  switch (implementation) {
    case 'cpp':
      return _filterThreadByFunc(thread, funcIndex => {
        // Return quickly if this is a JS frame.
        if (funcTable.isJS[funcIndex]) {
          return false;
        }
        // Regular C++ functions are associated with a resource that describes the
        // shared library that these C++ functions were loaded from. Jitcode is not
        // loaded from shared libraries but instead generated at runtime, so Jitcode
        // frames are not associated with a shared library and thus have no resource
        const locationString = stringTable.getString(funcTable.name[funcIndex]);
        const isProbablyJitCode =
          funcTable.resource[funcIndex] === -1 &&
          locationString.startsWith('0x');
        return !isProbablyJitCode;
      });
    case 'js':
      return _filterThreadByFunc(
        thread,
        funcIndex => funcTable.isJS[funcIndex]
      );
    default:
      return thread;
  }
}

function _filterThreadByFunc(
  thread: Thread,
  filter: IndexIntoFuncTable => boolean
): Thread {
  return timeCode('filterThread', () => {
    const { stackTable, frameTable, samples } = thread;

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
        if (filter(funcIndex)) {
          const prefixStackAndFrameIndex =
            (prefixNewStack === null ? -1 : prefixNewStack) * frameCount +
            frameIndex;
          newStack = prefixStackAndFrameToStack.get(prefixStackAndFrameIndex);
          if (newStack === undefined) {
            newStack = newStackTable.length++;
            newStackTable.prefix[newStack] = prefixNewStack;
            newStackTable.frame[newStack] = frameIndex;
          }
          oldStackToNewStack.set(stackIndex, newStack);
          prefixStackAndFrameToStack.set(prefixStackAndFrameIndex, newStack);
        } else {
          newStack = prefixNewStack;
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

/**
 * Given a thread with stacks like below, collapse together the platform stack frames into
 * a single pseudo platform stack frame. In the diagram "J" represents JavaScript stack
 * frame timing, and "P" Platform stack frame timing. New psuedo-stack frames are created
 * for the platform stacks.
 *
 * JJJJJJJJJJJJJJJJ  --->  JJJJJJJJJJJJJJJJ
 * PPPPPPPPPPPPPPPP        PPPPPPPPPPPPPPPP
 *     PPPPPPPPPPPP            JJJJJJJJ
 *     PPPPPPPP                JJJ  PPP
 *     JJJJJJJJ                     JJJ
 *     JJJ  PPP
 *          JJJ
 *
 * @param {Object} thread - A thread.
 * @returns {Object} The thread with collapsed samples.
 */
export function collapsePlatformStackFrames(thread: Thread): Thread {
  return timeCode('collapsePlatformStackFrames', () => {
    const { stackTable, funcTable, frameTable, samples, stringTable } = thread;

    // Create new tables for the data.
    const newStackTable: StackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };
    const newFrameTable: FrameTable = {
      length: frameTable.length,
      implementation: frameTable.implementation.slice(),
      optimizations: frameTable.optimizations.slice(),
      line: frameTable.line.slice(),
      category: frameTable.category.slice(),
      func: frameTable.func.slice(),
      address: frameTable.address.slice(),
    };
    const newFuncTable: FuncTable = {
      length: funcTable.length,
      name: funcTable.name.slice(),
      resource: funcTable.resource.slice(),
      address: funcTable.address.slice(),
      isJS: funcTable.isJS.slice(),
      fileName: funcTable.fileName.slice(),
      lineNumber: funcTable.lineNumber.slice(),
    };

    // Create a Map that takes a prefix and frame as input, and maps it to the new stack
    // index. Since Maps can't be keyed off of two values, do a little math to key off
    // of both values: newStackPrefix * potentialFrameCount + frame => newStackIndex
    const prefixStackAndFrameToStack = new Map();
    const potentialFrameCount = newFrameTable.length * 2;
    const oldStackToNewStack = new Map();

    function convertStack(oldStack) {
      if (oldStack === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(oldStack);
      if (newStack === undefined) {
        // No stack was found, generate a new one.
        const oldStackPrefix = stackTable.prefix[oldStack];
        const newStackPrefix = convertStack(oldStackPrefix);
        const frameIndex = stackTable.frame[oldStack];
        const funcIndex = newFrameTable.func[frameIndex];
        const oldStackIsPlatform = !newFuncTable.isJS[funcIndex];
        let keepStackFrame = true;

        if (oldStackIsPlatform) {
          if (oldStackPrefix !== null) {
            // Only keep the platform stack frame if the prefix is JS.
            const prefixFrameIndex = stackTable.frame[oldStackPrefix];
            const prefixFuncIndex = newFrameTable.func[prefixFrameIndex];
            keepStackFrame = newFuncTable.isJS[prefixFuncIndex];
          }
        }

        if (keepStackFrame) {
          // Convert the old JS stack to a new JS stack.
          const prefixStackAndFrameIndex =
            (newStackPrefix === null ? -1 : newStackPrefix) *
              potentialFrameCount +
            frameIndex;
          newStack = prefixStackAndFrameToStack.get(prefixStackAndFrameIndex);
          if (newStack === undefined) {
            newStack = newStackTable.length++;
            newStackTable.prefix[newStack] = newStackPrefix;
            if (oldStackIsPlatform) {
              // Create a new platform frame
              const newFuncIndex = newFuncTable.length++;
              newFuncTable.name.push(stringTable.indexForString('Platform'));
              newFuncTable.resource.push(-1);
              newFuncTable.address.push(-1);
              newFuncTable.isJS.push(false);
              newFuncTable.fileName.push(null);
              newFuncTable.lineNumber.push(null);
              if (newFuncTable.name.length !== newFuncTable.length) {
                console.error(
                  'length is not correct',
                  newFuncTable.name.length,
                  newFuncTable.length
                );
              }

              newFrameTable.implementation.push(null);
              newFrameTable.optimizations.push(null);
              newFrameTable.line.push(null);
              newFrameTable.category.push(null);
              newFrameTable.func.push(newFuncIndex);
              newFrameTable.address.push(-1);

              newStackTable.frame[newStack] = newFrameTable.length++;
            } else {
              newStackTable.frame[newStack] = frameIndex;
            }
          }
          oldStackToNewStack.set(oldStack, newStack);
          prefixStackAndFrameToStack.set(prefixStackAndFrameIndex, newStack);
        }

        // If the the stack frame was not kept, use the prefix.
        if (newStack === undefined) {
          newStack = newStackPrefix;
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
      frameTable: newFrameTable,
      funcTable: newFuncTable,
    });
  });
}

export function filterThreadToSearchString(
  thread: Thread,
  searchString: string
): Thread {
  return timeCode('filterThreadToSearchString', () => {
    if (searchString === '') {
      return thread;
    }
    const lowercaseSearchString = searchString.toLowerCase();
    const {
      samples,
      funcTable,
      frameTable,
      stackTable,
      stringTable,
      resourceTable,
    } = thread;

    function computeFuncMatchesFilter(func) {
      const nameIndex = funcTable.name[func];
      const nameString = stringTable.getString(nameIndex);
      if (nameString.toLowerCase().includes(lowercaseSearchString)) {
        return true;
      }

      const fileNameIndex = funcTable.fileName[func];
      if (fileNameIndex !== null) {
        const fileNameString = stringTable.getString(fileNameIndex);
        if (fileNameString.toLowerCase().includes(lowercaseSearchString)) {
          return true;
        }
      }

      const resourceIndex = funcTable.resource[func];
      const resourceNameIndex = resourceTable.name[resourceIndex];
      if (resourceNameIndex !== undefined) {
        const resourceNameString = stringTable.getString(resourceNameIndex);
        if (resourceNameString.toLowerCase().includes(lowercaseSearchString)) {
          return true;
        }
      }

      return false;
    }

    const funcMatchesFilterCache = new Map();
    function funcMatchesFilter(func) {
      let result = funcMatchesFilterCache.get(func);
      if (result === undefined) {
        result = computeFuncMatchesFilter(func);
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
        stack: samples.stack.map(s => (stackMatchesFilter(s) ? s : null)),
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
export function filterThreadToPrefixStack(
  thread: Thread,
  prefixFuncs: IndexIntoFuncTable[],
  matchJSOnly: boolean
): Thread {
  return timeCode('filterThreadToPrefixStack', () => {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const prefixDepth = prefixFuncs.length;
    const stackMatches = new Int32Array(stackTable.length);
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
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
          newStackTable.prefix[newStackIndex] =
            newStackPrefix !== undefined ? newStackPrefix : null;
          newStackTable.frame[newStackIndex] = frame;
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
      }
      stackMatches[stackIndex] = stackMatchesUpTo;
    }
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        if (oldStack === null || stackMatches[oldStack] !== prefixDepth) {
          return null;
        }
        const newStack = oldStackToNewStack.get(oldStack);
        if (newStack === undefined) {
          throw new Error(
            'Converting from the old stack to a new stack cannot be undefined'
          );
        }
        return newStack;
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
export function filterThreadToPostfixStack(
  thread: Thread,
  postfixFuncs: IndexIntoFuncTable[],
  matchJSOnly: boolean
): Thread {
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

function _getSampleIndexRangeForSelection(
  samples: SamplesTable,
  rangeStart: number,
  rangeEnd: number
): [IndexIntoSamplesTable, IndexIntoSamplesTable] {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstSample = samples.time.findIndex(t => t >= rangeStart);
  if (firstSample === -1) {
    return [samples.length, samples.length];
  }
  const afterLastSample = samples.time
    .slice(firstSample)
    .findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstSample, samples.length];
  }
  return [firstSample, firstSample + afterLastSample];
}

function _getMarkerIndexRangeForSelection(
  markers: MarkersTable,
  rangeStart: number,
  rangeEnd: number
): [IndexIntoMarkersTable, IndexIntoMarkersTable] {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstMarker = markers.time.findIndex(t => t >= rangeStart);
  if (firstMarker === -1) {
    return [markers.length, markers.length];
  }
  const afterLastSample = markers.time
    .slice(firstMarker)
    .findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstMarker, markers.length];
  }
  return [firstMarker, firstMarker + afterLastSample];
}

export function filterThreadToRange(
  thread: Thread,
  rangeStart: number,
  rangeEnd: number
): Thread {
  const { samples, markers } = thread;
  const [sBegin, sEnd] = _getSampleIndexRangeForSelection(
    samples,
    rangeStart,
    rangeEnd
  );
  const newSamples = {
    length: sEnd - sBegin,
    time: samples.time.slice(sBegin, sEnd),
    stack: samples.stack.slice(sBegin, sEnd),
    responsiveness: samples.responsiveness.slice(sBegin, sEnd),
    rss: samples.rss.slice(sBegin, sEnd),
    uss: samples.uss.slice(sBegin, sEnd),
  };
  const [mBegin, mEnd] = _getMarkerIndexRangeForSelection(
    markers,
    rangeStart,
    rangeEnd
  );
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

export function getFuncStackFromFuncArray(
  funcArray: IndexIntoFuncTable[],
  funcStackTable: FuncStackTable
): IndexIntoFuncStackTable | null {
  let fs = -1;
  for (let i = 0; i < funcArray.length; i++) {
    const func = funcArray[i];
    let nextFS = -1;
    for (
      let funcStackIndex = fs + 1;
      funcStackIndex < funcStackTable.length;
      funcStackIndex++
    ) {
      if (
        funcStackTable.prefix[funcStackIndex] === fs &&
        funcStackTable.func[funcStackIndex] === func
      ) {
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

export function getStackAsFuncArray(
  funcStackIndex: IndexIntoFuncStackTable | null,
  funcStackTable: FuncStackTable
): IndexIntoFuncTable[] {
  if (funcStackIndex === null) {
    return [];
  }
  if (funcStackIndex * 1 !== funcStackIndex) {
    console.log('bad funcStackIndex in getStackAsFuncArray:', funcStackIndex);
    return [];
  }
  const funcArray = [];
  let fs = funcStackIndex;
  while (fs !== -1) {
    funcArray.push(funcStackTable.func[fs]);
    fs = funcStackTable.prefix[fs];
  }
  funcArray.reverse();
  return funcArray;
}

export function invertCallstack(thread: Thread): Thread {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };
    // Create a Map that keys off of two values, both the prefix and frame combination
    // by using a bit of math: prefix * frameCount + frame => stackIndex
    const prefixAndFrameToStack = new Map();
    const frameCount = frameTable.length;

    function stackFor(prefix, frame) {
      const prefixAndFrameIndex =
        (prefix === null ? -1 : prefix) * frameCount + frame;
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
        for (
          let currentStack = stackIndex;
          currentStack !== null;
          currentStack = stackTable.prefix[currentStack]
        ) {
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

export function getSampleIndexClosestToTime(
  samples: SamplesTable,
  time: number
): IndexIntoSamplesTable {
  // TODO: This should really use bisect. samples.time is sorted.
  for (let i: number = 0; i < samples.length; i++) {
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

export function getJankInstances(
  samples: SamplesTable,
  threadName: string,
  thresholdInMs: number
): TracingMarker[] {
  const addTracingMarker = () =>
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      dur: lastResponsiveness,
      title: `${lastResponsiveness.toFixed(
        2
      )}ms event processing delay on ${threadName}`,
      name: 'Jank',
      data: null,
    });

  let lastResponsiveness = 0;
  let lastTimestamp = 0;
  const jankInstances = [];
  for (let i = 0; i < samples.length; i++) {
    const currentResponsiveness = samples.responsiveness[i];
    if (currentResponsiveness < lastResponsiveness) {
      if (lastResponsiveness >= thresholdInMs) {
        addTracingMarker();
      }
    }
    lastResponsiveness = currentResponsiveness;
    lastTimestamp = samples.time[i];
  }
  if (lastResponsiveness >= thresholdInMs) {
    addTracingMarker();
  }
  return jankInstances;
}

function getMarkerTitle(name: string, data: MarkerPayload): string {
  let title = name;
  if (data) {
    switch (data.type) {
      case 'UserTiming': {
        title = `${name}(${data.name})`;
        break;
      }
      default:
    }
  }
  return title;
}

export function getTracingMarkers(thread: Thread): TracingMarker[] {
  const { stringTable, markers } = thread;
  const tracingMarkers: TracingMarker[] = [];
  const openMarkers: Map<IndexIntoStringTable, TracingMarker> = new Map();
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data) {
      continue;
    }
    if (data.type === 'tracing') {
      const time = markers.time[i];
      const nameStringIndex = markers.name[i];
      if (data.interval === 'start') {
        const name = stringTable.getString(nameStringIndex);
        openMarkers.set(nameStringIndex, {
          start: time,
          name,
          dur: 0,
          data,
          title: name,
        });
      } else if (data.interval === 'end') {
        const marker = openMarkers.get(nameStringIndex);
        if (marker === undefined) {
          continue;
        }
        if (marker.start !== undefined) {
          marker.dur = time - marker.start;
        }
        tracingMarkers.push(marker);
      }
    } else if ('startTime' in data && 'endTime' in data) {
      const { startTime, endTime } = data;
      if (typeof startTime === 'number' && typeof endTime === 'number') {
        const name = stringTable.getString(markers.name[i]);
        if (name !== 'DOMEvent') {
          const duration = endTime - startTime;
          tracingMarkers.push({
            start: startTime,
            dur: duration,
            name,
            data,
            title: getMarkerTitle(name, data),
          });
        }
      }
    }
  }
  tracingMarkers.sort((a, b) => a.start - b.start);
  return tracingMarkers;
}

export function filterTracingMarkersToRange(
  tracingMarkers: TracingMarker[],
  rangeStart: number,
  rangeEnd: number
): TracingMarker[] {
  return tracingMarkers.filter(
    tm => tm.start < rangeEnd && tm.start + tm.dur >= rangeStart
  );
}

export function getFriendlyThreadName(
  threads: Thread[],
  thread: Thread
): string {
  let label;
  switch (thread.name) {
    case 'GeckoMain':
      switch (thread.processType) {
        case 'default':
          label = 'Main Thread';
          break;
        case 'tab': {
          const contentThreads = threads.filter(thread => {
            return thread.name === 'GeckoMain' && thread.processType === 'tab';
          });
          if (contentThreads.length > 1) {
            const index = 1 + contentThreads.indexOf(thread);
            label = `Content (${index} of ${contentThreads.length})`;
          } else {
            label = 'Content';
          }
          break;
        }
        case 'plugin':
          label = 'Plugin';
          break;
        default:
        // should we throw here ?
      }
      break;
    default:
  }

  if (!label) {
    label = thread.name;
  }
  return label;
}

export function getThreadProcessDetails(thread: Thread): string {
  let label = `thread: "${thread.name}"`;
  if (thread.tid !== undefined) {
    label += ` (${thread.tid})`;
  }

  if (thread.processType) {
    label += `\nprocess: "${thread.processType}"`;
    if (thread.pid !== undefined) {
      label += ` (${thread.pid})`;
    }
  }

  return label;
}

export function getEmptyProfile(): Profile {
  return {
    meta: { interval: 1 },
    threads: [],
    tasktracer: getEmptyTaskTracerData(),
  };
}
