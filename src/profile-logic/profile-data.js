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
  IndexIntoFrameTable,
  IndexIntoStringTable,
  IndexIntoSamplesTable,
  IndexIntoMarkersTable,
  IndexIntoStackTable,
  ThreadIndex,
} from '../types/profile';
import type { TracingMarker } from '../types/profile-derived';
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
 * This function runs through a stackTable, and de-duplicates stacks that have frames
 * that point to the same function. When a profiler runs, it only collects raw memory
 * addresses. During the symbolication process (where names are assigned to these
 * memory addresses) any addresses that fall within the same function symbol have their
 * functions merged. These addresses still have different frames even if their functions
 * were merged together. This function simplifies the matter by combining the stacks
 * that are made up of frames that share the same function.
 */
export function deDuplicateFunctionFrames(thread: Thread): Thread {
  return timeCode('deDuplicateFunctionFrames', () => {
    const { stackTable, frameTable, funcTable, samples } = thread;
    if (
      stackTable.transformedToOriginalStack ||
      frameTable.transformedToOriginalFrame
    ) {
      throw new Error(
        'This function is currently assuming that it is the first to transform a ' +
          'thread, so if there are already transformations applied it will fail.'
      );
    }
    const func: Array<IndexIntoFuncTable> = [];
    const funcCount = funcTable.length;

    // Maps can't key off of two items, so combine the transformedPrefixStack and the funcIndex
    // using the following formula: transformedPrefixStack * funcCount + funcIndex => stackIndex
    const transformedPrefixStackAndFuncToTransformedStackMap = new Map();

    const prefix = [];
    const frame = [];
    const depth = [];
    const originalToTransformedStack = [];
    const transformedToOriginalStack = [];
    const length = 0;

    const transformedStackTable: StackTable = {
      prefix,
      frame,
      depth,
      length,
      originalToTransformedStack,
      transformedToOriginalStack,
    };

    const originalToTransformedFrame = [];
    const transformedToOriginalFrame = [];

    const transformedFrameTable: FrameTable = {
      address: [],
      category: [],
      func: [],
      implementation: [],
      line: [],
      optimizations: [],
      length: 0,
      originalToTransformedFrame,
      transformedToOriginalFrame,
    };

    function addTransformedStack(
      prefixIndex: IndexIntoStackTable | -1,
      stackIndex: IndexIntoStackTable,
      funcIndex: IndexIntoFuncTable,
      frameIndex: IndexIntoFrameTable
    ) {
      const index = transformedStackTable.length++;

      prefix[index] = prefixIndex === -1 ? null : prefixIndex;
      func[index] = funcIndex;

      _addMergedIndexToMap(transformedToOriginalStack, stackIndex, index);
      _addMergedIndexToMap(transformedToOriginalFrame, frameIndex, frameIndex);

      frame[index] = frameIndex;
      if (prefixIndex === -1) {
        depth[index] = 0;
      } else {
        depth[index] = depth[prefixIndex] + 1;
      }
    }

    function addTransformedFrame(
      originalFrameIndex: IndexIntoFrameTable,
      funcIndex: IndexIntoFuncTable
    ): IndexIntoFrameTable {
      const index = transformedFrameTable.length++;
      // Get the address of the function itself.
      transformedFrameTable.address[index] = funcTable.address[funcIndex];

      // Copy over the rest of the information, it should be the same across all
      transformedFrameTable.func[index] = frameTable.func[originalFrameIndex];
      transformedFrameTable.category[index] =
        frameTable.category[originalFrameIndex];
      transformedFrameTable.implementation[index] =
        frameTable.implementation[originalFrameIndex];
      transformedFrameTable.line[index] = frameTable.line[originalFrameIndex];
      transformedFrameTable.optimizations[index] =
        frameTable.optimizations[originalFrameIndex];
      return index;
    }

    // Go through each stack, and de-duplicate the stacks by basing them off of frames
    // from the functions rather than frames from memory addresses.
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];

      const transformedPrefixStack =
        prefixStack === null ? -1 : originalToTransformedStack[prefixStack];
      const transformedPrefixStackAndFuncIndex =
        transformedPrefixStack * funcCount + funcIndex;
      let transformedStackIndex = transformedPrefixStackAndFuncToTransformedStackMap.get(
        transformedPrefixStackAndFuncIndex
      );

      // No existing stack from that function was found, so create a new one.
      if (transformedStackIndex === undefined) {
        transformedStackIndex = transformedStackTable.length;
        const transformedFrameIndex = addTransformedFrame(
          frameIndex,
          funcIndex
        );
        addTransformedStack(
          transformedPrefixStack,
          stackIndex,
          funcIndex,
          transformedFrameIndex
        );
        transformedPrefixStackAndFuncToTransformedStackMap.set(
          transformedPrefixStackAndFuncIndex,
          transformedStackIndex
        );
      } else {
        // We found an existing stack from that function, so don't add a new one.

        // Map the merged frames and stacks back to their original ids.
        const transformedFrameIndex =
          transformedStackTable.frame[transformedStackIndex];

        originalToTransformedFrame[frameIndex] = transformedFrameIndex;
        originalToTransformedStack[stackIndex] = transformedStackIndex;

        _addMergedIndexToMap(
          transformedToOriginalStack,
          stackIndex,
          transformedStackIndex
        );
        _addMergedIndexToMap(
          transformedToOriginalFrame,
          frameIndex,
          transformedFrameIndex
        );
      }
      originalToTransformedStack[stackIndex] = transformedStackIndex;
    }

    // The indices here are stable:
    const transformedSamples = Object.assign({}, samples, {
      stack: samples.stack.map(
        stackIndex =>
          stackIndex === null ? null : originalToTransformedStack[stackIndex]
      ),
    });

    if (process.env.NODE_ENV === 'development') {
      _assertStacksOrderedCorrectly(stackTable);
    }
    const newThread = Object.assign({}, thread, {
      stackTable: transformedStackTable,
      samples: transformedSamples,
      frameTable: transformedFrameTable,
    });

    return newThread;
  });
}

function _assertStacksOrderedCorrectly(stackTable: StackTable) {
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixIndex = stackTable.prefix[stackIndex];
    if (prefixIndex !== null && prefixIndex >= stackIndex) {
      throw new Error('Stacks were not ordered correctly');
    }
  }
}

/**
 * This is a helper function to add a mapping from one index to possibly many indices.
 */
function _addMergedIndexToMap(
  transformedToOriginal: Array<number | number[]>,
  originalIndex: number,
  transformedIndex: number
): void {
  const existingValue = transformedToOriginal[transformedIndex];
  if (existingValue === undefined) {
    transformedToOriginal[transformedIndex] = originalIndex;
  } else if (typeof existingValue === 'number') {
    transformedToOriginal[transformedIndex] = [existingValue, originalIndex];
  } else {
    existingValue.push(originalIndex);
  }
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
    const newStackTable: StackTable = {
      length: 0,
      frame: [],
      prefix: [],
      depth: [],
      transformedToOriginalStack: [],
      originalToTransformedStack: [],
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
            if (prefixNewStack !== null) {
              newStackTable.depth[newStack] =
                newStackTable.depth[prefixNewStack] + 1;
            } else {
              newStackTable.depth[newStack] = 0;
            }
            _updateTransformStacks(
              stackTable,
              newStackTable,
              stackIndex,
              newStack
            );
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
 * As frames get transformed, it's useful to be able to point back to the canonical
 * indexes for those stacks. This a helper function to handle the logic of updating
 * a StackTable to for newly transformed indexes.
 *
 * Warning! This function mutates the stackTable.
 */
function _updateTransformStacks(
  stackTable: StackTable,
  newStackTable: StackTable,
  stackIndex: IndexIntoStackTable,
  newStackIndex: IndexIntoStackTable
): void {
  if (
    !stackTable.transformedToOriginalStack ||
    !stackTable.originalToTransformedStack ||
    !newStackTable.transformedToOriginalStack ||
    !newStackTable.originalToTransformedStack
  ) {
    throw new Error('The StackTable did not have transformation tables');
  }
  const newStackTableTransformedToOriginalStack =
    newStackTable.transformedToOriginalStack;
  const canonicalStacks = stackTable.transformedToOriginalStack[stackIndex];
  if (Array.isArray(canonicalStacks)) {
    for (let i = 0; i < canonicalStacks.length; i++) {
      const canonicalStack = canonicalStacks[i];
      newStackTable.originalToTransformedStack[
        canonicalStacks[i]
      ] = newStackIndex;
      _addMergedIndexToMap(
        newStackTableTransformedToOriginalStack,
        canonicalStack,
        newStackIndex
      );
    }
  } else if (canonicalStacks !== null) {
    newStackTable.originalToTransformedStack[canonicalStacks] = newStackIndex;
  }
}

/**
 * As stacks get transformed, it's useful to be able to point back to the canonical
 * indexes for those stacks. This a helper function to handle the logic of updating
 * a StackTable to for newly transformed indexes.
 *
 * Warning! This function mutates the stackTable.
 */
function _updateTransformFrames(
  frameTable: FrameTable,
  newFrameTable: FrameTable,
  frameIndex: IndexIntoStackTable,
  newFrameIndex: IndexIntoFrameTable
): void {
  if (
    !frameTable.transformedToOriginalFrame ||
    !frameTable.originalToTransformedFrame ||
    !newFrameTable.transformedToOriginalFrame ||
    !newFrameTable.originalToTransformedFrame
  ) {
    throw new Error('The FrameTable did not have transformation tables');
  }
  const newFrameTableTransformedToOriginalFrame =
    newFrameTable.transformedToOriginalFrame;
  const canonicalFrames = frameTable.transformedToOriginalFrame[frameIndex];
  if (Array.isArray(canonicalFrames)) {
    for (let i = 0; i < canonicalFrames.length; i++) {
      const canonicalFrame = canonicalFrames[i];
      newFrameTable.originalToTransformedFrame[
        canonicalFrames[i]
      ] = newFrameIndex;
      _addMergedIndexToMap(
        newFrameTableTransformedToOriginalFrame,
        canonicalFrame,
        newFrameIndex
      );
    }
  } else if (canonicalFrames !== null) {
    newFrameTable.originalToTransformedFrame[canonicalFrames] = newFrameIndex;
  }
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
      depth: [],
      transformedToOriginalStack: [],
      originalToTransformedStack: [],
    };
    const newFrameTable: FrameTable = {
      length: frameTable.length,
      implementation: frameTable.implementation.slice(),
      optimizations: frameTable.optimizations.slice(),
      line: frameTable.line.slice(),
      category: frameTable.category.slice(),
      func: frameTable.func.slice(),
      address: frameTable.address.slice(),
      transformedToOriginalFrame: [],
      originalToTransformedFrame: [],
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
            if (newStackPrefix !== null) {
              newStackTable.depth[newStack] =
                newStackTable.depth[newStackPrefix] + 1;
            } else {
              newStackTable.depth[newStack] = 0;
            }
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

              const newFrameIndex = newFrameTable.length++;
              newFrameTable.implementation.push(null);
              newFrameTable.optimizations.push(null);
              newFrameTable.line.push(null);
              newFrameTable.category.push(null);
              newFrameTable.func.push(newFuncIndex);
              newFrameTable.address.push(-1);
              _updateTransformFrames(
                frameTable,
                newFrameTable,
                frameIndex,
                newFrameIndex
              );

              newStackTable.frame[newStack] = newFrameIndex;
            } else {
              newStackTable.frame[newStack] = frameIndex;
            }
            _updateTransformStacks(
              stackTable,
              newStackTable,
              oldStack,
              newStack
            );
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
    const newStackTable: StackTable = {
      length: 0,
      prefix: [],
      frame: [],
      depth: [],
      transformedToOriginalStack: [],
      originalToTransformedStack: [],
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
          if (newStackPrefix !== null && newStackPrefix !== undefined) {
            newStackTable.depth[newStackIndex] =
              newStackTable.depth[newStackPrefix] + 1;
          } else {
            newStackTable.depth[newStackIndex] = 0;
          }
          oldStackToNewStack.set(stackIndex, newStackIndex);
          _updateTransformStacks(
            stackTable,
            newStackTable,
            stackIndex,
            newStackIndex
          );
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

/**
 * Searches through a thread's StackTable to find a stackIndex given a list
 * of function indexes.
 */
export function getStackFromFuncArray(
  funcArray: IndexIntoFuncTable[],
  { stackTable, frameTable }: Thread
): IndexIntoStackTable | null {
  let stackToSearch = null;
  // Go through the func array
  for (let i = 0; i < funcArray.length; i++) {
    const funcIndex = funcArray[i];
    let postfixStack = null;
    // Go through the entire StackTable and try to find a postfix stack.
    // This works because there is an invariant in the stackTable that a
    // stack's prefix is always less than its stack index.
    for (
      let possiblyPostfixStack = stackToSearch === null ? 0 : stackToSearch + 1;
      possiblyPostfixStack < stackTable.length;
      possiblyPostfixStack++
    ) {
      const frameIndex = stackTable.frame[possiblyPostfixStack];
      if (
        // This is a postfix stack.
        stackTable.prefix[possiblyPostfixStack] === stackToSearch &&
        // This matches the func in the funcArray.
        frameTable.func[frameIndex] === funcIndex
      ) {
        postfixStack = possiblyPostfixStack;
        break;
      }
    }
    if (postfixStack === null) {
      return null;
    }
    stackToSearch = postfixStack;
  }
  // log(`@@@ getStackFromFuncArray -> ${stackToSearch}`);
  return stackToSearch;
}

/**
 * Transform a stack index into a list of functions from the root to that stack.
 */
export function getStackAsFuncArray(
  stackIndex: IndexIntoStackTable | null,
  { stackTable, frameTable }: Thread
): IndexIntoFuncTable[] {
  if (stackIndex === null) {
    return [];
  }
  if (stackIndex * 1 !== stackIndex) {
    console.log('bad stackIndex in getStackAsFuncArray:', stackIndex);
    return [];
  }
  const funcArray = [];
  let prefixStackIndex = stackIndex;
  while (prefixStackIndex !== null) {
    const frameIndex = stackTable.frame[prefixStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    funcArray.push(funcIndex);
    prefixStackIndex = stackTable.prefix[prefixStackIndex];
  }
  funcArray.reverse();
  return funcArray;
}

export function invertCallstack(thread: Thread): Thread {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable: StackTable = {
      length: 0,
      frame: [],
      prefix: [],
      depth: [],
      transformedToOriginalStack: [],
      originalToTransformedStack: [],
    };
    // Create a Map that keys off of two values, both the prefix and frame combination
    // by using a bit of math: prefix * frameCount + frame => stackIndex
    const prefixAndFrameToStack = new Map();
    const frameCount = frameTable.length;

    function stackFor(oldStack, prefix, frame) {
      const prefixAndFrameIndex =
        (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
        if (prefix !== null) {
          newStackTable.depth[stackIndex] = newStackTable.depth[prefix] + 1;
        } else {
          newStackTable.depth[stackIndex] = 0;
        }
        _updateTransformStacks(stackTable, newStackTable, oldStack, stackIndex);
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
          newStack = stackFor(
            currentStack,
            newStack,
            stackTable.frame[currentStack]
          );
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
        openMarkers.set(nameStringIndex, {
          start: time,
          name: stringTable.getString(nameStringIndex),
          dur: 0,
          title: null,
          data,
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
        const duration = endTime - startTime;
        tracingMarkers.push({
          start: startTime,
          dur: duration,
          name,
          data,
          title: null,
        });
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
