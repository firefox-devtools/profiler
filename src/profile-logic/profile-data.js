/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Profile,
  Thread,
  SamplesTable,
  StackTable,
  ExtensionTable,
  CategoryList,
  FrameTable,
  FuncTable,
  MarkersTable,
  ResourceTable,
  IndexIntoCategoryList,
  IndexIntoFuncTable,
  IndexIntoSamplesTable,
  IndexIntoMarkersTable,
  IndexIntoStackTable,
  ThreadIndex,
} from '../types/profile';
import type {
  CallNodeInfo,
  CallNodeTable,
  CallNodePath,
  IndexIntoCallNodeTable,
} from '../types/profile-derived';
import { CURRENT_VERSION as GECKO_PROFILE_VERSION } from './gecko-profile-versioning';
import { CURRENT_VERSION as PROCESSED_PROFILE_VERSION } from './processed-profile-versioning';

import type { Milliseconds, StartEndRange } from '../types/units';
import { timeCode } from '../utils/time-code';
import { hashPath } from '../utils/path';
import type { ImplementationFilter } from '../types/actions';
import bisection from 'bisection';
import type { UniqueStringArray } from '../utils/unique-string-array';

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

export const emptyExtensions: ExtensionTable = Object.freeze({
  id: Object.freeze([]),
  name: Object.freeze([]),
  baseURL: Object.freeze([]),
  length: 0,
});

export const defaultCategories: CategoryList = Object.freeze([
  { name: 'Idle', color: 'transparent' },
  { name: 'Other', color: 'grey' },
  { name: 'Layout', color: 'purple' },
  { name: 'JavaScript', color: 'yellow' },
  { name: 'GC / CC', color: 'orange' },
  { name: 'Network', color: 'lightblue' },
  { name: 'Graphics', color: 'green' },
  { name: 'DOM', color: 'blue' },
]);

/**
 * Generate the CallNodeInfo which contains the CallNodeTable, and a map to convert
 * an IndexIntoStackTable to a IndexIntoCallNodeTable. This function runs through
 * a stackTable, and de-duplicates stacks that have frames that point to the same
 * function.
 *
 * See `src/types/profile-derived.js` for the type definitions.
 * See `docs-developer/call-trees.md` for a detailed explanation of CallNodes.
 */
export function getCallNodeInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  defaultCategory: IndexIntoCategoryList
): CallNodeInfo {
  return timeCode('getCallNodeInfo', () => {
    const stackIndexToCallNodeIndex = new Uint32Array(stackTable.length);
    const funcCount = funcTable.length;
    // Maps can't key off of two items, so combine the prefixCallNode and the funcIndex
    // using the following formula: prefixCallNode * funcCount + funcIndex => callNode
    const prefixCallNodeAndFuncToCallNodeMap = new Map();

    // The callNodeTable components.
    const prefix: Array<IndexIntoCallNodeTable> = [];
    const func: Array<IndexIntoFuncTable> = [];
    const category: Array<IndexIntoCategoryList> = [];
    const depth: Array<number> = [];
    let length = 0;

    function addCallNode(
      prefixIndex: IndexIntoCallNodeTable,
      funcIndex: IndexIntoFuncTable,
      categoryIndex: IndexIntoCategoryList
    ) {
      const index = length++;
      prefix[index] = prefixIndex;
      func[index] = funcIndex;
      category[index] = categoryIndex;
      if (prefixIndex === -1) {
        depth[index] = 0;
      } else {
        depth[index] = depth[prefixIndex] + 1;
      }
    }

    // Go through each stack, and create a new callNode table, which is based off of
    // functions rather than frames.
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefixStack = stackTable.prefix[stackIndex];
      // We know that at this point the following condition holds:
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixCallNode =
        prefixStack === null ? -1 : stackIndexToCallNodeIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const categoryIndex = stackTable.category[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      const prefixCallNodeAndFuncIndex = prefixCallNode * funcCount + funcIndex;
      let callNodeIndex = prefixCallNodeAndFuncToCallNodeMap.get(
        prefixCallNodeAndFuncIndex
      );
      if (callNodeIndex === undefined) {
        callNodeIndex = length;
        addCallNode(prefixCallNode, funcIndex, categoryIndex);
        prefixCallNodeAndFuncToCallNodeMap.set(
          prefixCallNodeAndFuncIndex,
          callNodeIndex
        );
      } else if (category[callNodeIndex] !== categoryIndex) {
        // Conflicting origin stack categories -> default category.
        category[callNodeIndex] = defaultCategory;
      }
      stackIndexToCallNodeIndex[stackIndex] = callNodeIndex;
    }

    const callNodeTable: CallNodeTable = {
      prefix: new Int32Array(prefix),
      func: new Int32Array(func),
      category: new Int32Array(category),
      depth,
      length,
    };

    return { callNodeTable, stackIndexToCallNodeIndex };
  });
}

/**
 * Take a samples table, and return an array that contain indexes that point to the
 * leaf most call node, or null.
 */
export function getSampleCallNodes(
  samples: SamplesTable,
  stackIndexToCallNodeIndex: {
    [key: IndexIntoStackTable]: IndexIntoCallNodeTable,
  }
): Array<IndexIntoCallNodeTable | null> {
  return samples.stack.map(stack => {
    return stack === null ? null : stackIndexToCallNodeIndex[stack];
  });
}

export type SelectedState =
  // Samples can be filtered through various operations, like searching, or
  // call tree transforms.
  | 'FILTERED_OUT'
  // This sample is selected because either the tip or an ancestor call node matches
  // the currently selected call node.
  | 'SELECTED'
  // This call node is not selected, and the stacks are ordered before the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_BEFORE_SELECTED'
  // This call node is not selected, and the stacks are ordered after the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_AFTER_SELECTED';

/**
 * Go through the samples, and determine their current state.
 *
 * For samples that are neither 'FILTERED_OUT' nor 'SELECTED', this function compares
 * the sample's call node to the selected call node, in tree order. It uses the same
 * ordering as the function compareCallNodes in getTreeOrderComparator. But it does not
 * call compareCallNodes with the selected node for each sample's call node, because doing
 * so would recompute information about the selected call node on every call. Instead, it
 * has an equivalent implementation that is faster because it only computes information
 * about the selected call node's ancestors once.
 */
export function getSamplesSelectedStates(
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  selectedCallNodeIndex: IndexIntoCallNodeTable | null
): SelectedState[] {
  const result = new Array(sampleCallNodes.length);

  const selectedCallNodeDepth =
    selectedCallNodeIndex === -1 || selectedCallNodeIndex === null
      ? 0
      : callNodeTable.depth[selectedCallNodeIndex];

  // Find all of the call nodes from the current depth to the root.
  const selectedCallNodeAtDepth: IndexIntoCallNodeTable[] = new Array(
    selectedCallNodeDepth
  );
  for (
    let callNodeIndex = selectedCallNodeIndex, depth = selectedCallNodeDepth;
    depth >= 0 && callNodeIndex !== null;
    depth--, callNodeIndex = callNodeTable.prefix[callNodeIndex]
  ) {
    selectedCallNodeAtDepth[depth] = callNodeIndex;
  }

  /**
   * Take a call node, and compute its selected state.
   */
  function getSelectedStateFromCallNode(
    callNode: IndexIntoCallNodeTable | null
  ): SelectedState {
    let callNodeIndex = callNode;
    if (callNodeIndex === null) {
      return 'FILTERED_OUT';
    }

    // Walk the call nodes toward the root, and get the call node at the the depth
    // of the selected call node.
    let depth = callNodeTable.depth[callNodeIndex];
    while (depth > selectedCallNodeDepth) {
      callNodeIndex = callNodeTable.prefix[callNodeIndex];
      depth--;
    }

    if (callNodeIndex === selectedCallNodeIndex) {
      // This sample's call node at the depth matches the selected call node.
      return 'SELECTED';
    }

    // If we're here, it means that callNode is not selected, because it's not
    // an ancestor of selectedCallNodeIndex.
    // Determine if it's ordered "before" or "after" the selected call node,
    // in order to provide a stable ordering when rendering visualizations.
    // Walk the call nodes towards the root, until we find the common ancestor.
    // Once we've found the common ancestor, compare the order of the two
    // child nodes that we passed through, which are siblings.
    while (true) {
      const prevCallNodeIndex = callNodeIndex;
      callNodeIndex = callNodeTable.prefix[callNodeIndex];
      depth--;
      if (
        callNodeIndex === -1 ||
        callNodeIndex === selectedCallNodeAtDepth[depth]
      ) {
        // callNodeIndex is the lowest common ancestor of selectedCallNodeIndex
        // and callNode. Compare the order of the two children that we passed
        // through on the way up to the ancestor. These nodes are siblings, so
        // their order is defined by the numerical order of call node indexes.
        return prevCallNodeIndex <= selectedCallNodeAtDepth[depth + 1]
          ? 'UNSELECTED_ORDERED_BEFORE_SELECTED'
          : 'UNSELECTED_ORDERED_AFTER_SELECTED';
      }
    }

    // This code is unreachable, but Flow doesn't know that and thinks this
    // function could return undefined. So throw an error.
    /* eslint-disable no-unreachable */
    throw new Error('unreachable');
    /* eslint-enable no-unreachable */
  }

  // Go through each sample, and label its state.
  for (
    let sampleIndex = 0;
    sampleIndex < sampleCallNodes.length;
    sampleIndex++
  ) {
    result[sampleIndex] = getSelectedStateFromCallNode(
      sampleCallNodes[sampleIndex]
    );
  }
  return result;
}

/**
 * This function returns the function index for a specific call node path. This
 * is the last element of this path, or the leaf element of the path.
 */
export function getLeafFuncIndex(path: CallNodePath): IndexIntoFuncTable {
  if (path.length === 0) {
    throw new Error("getLeafFuncIndex assumes that the path isn't empty.");
  }

  return path[path.length - 1];
}

export type JsImplementation = 'interpreter' | 'ion' | 'baseline' | 'unknown';
export type StackImplementation = 'native' | JsImplementation;
export type BreakdownByImplementation = { [StackImplementation]: Milliseconds };
type ItemTimings = {|
  selfTime: {|
    // time spent excluding children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
  |},
  totalTime: {|
    // time spent including children
    value: Milliseconds,
    breakdownByImplementation: BreakdownByImplementation | null,
  |},
|};

export type TimingsForPath = {|
  // timings for this path
  forPath: ItemTimings,
  // timings for this func across the tree
  forFunc: ItemTimings,
  rootTime: Milliseconds, // time for all the samples in the current tree
|};

/**
 * This function Returns the JS implementation information for a specific stack.
 */
export function getJsImplementationForStack(
  stackIndex: IndexIntoStackTable,
  { stackTable, frameTable, stringTable }: Thread
): JsImplementation {
  const frameIndex = stackTable.frame[stackIndex];
  const jsImplementationStrIndex = frameTable.implementation[frameIndex];

  if (jsImplementationStrIndex === null) {
    return 'interpreter';
  }

  const jsImplementation = stringTable.getString(jsImplementationStrIndex);

  switch (jsImplementation) {
    case 'baseline':
    case 'ion':
      return jsImplementation;
    default:
      return 'unknown';
  }
}

/**
 * This function returns the timings for a specific path. The algorithm is
 * adjusted when the call tree is inverted.
 */
export function getTimingsForPath(
  needlePath: CallNodePath,
  { callNodeTable, stackIndexToCallNodeIndex }: CallNodeInfo,
  interval: number,
  isInvertedTree: boolean,
  thread: Thread
): TimingsForPath {
  if (!needlePath.length) {
    // If the path is empty, which shouldn't usually happen, we return an empty
    // structure right away.
    // The rest of this function's code assumes a non-empty path.
    return {
      forPath: {
        selfTime: { value: 0, breakdownByImplementation: null },
        totalTime: { value: 0, breakdownByImplementation: null },
      },
      forFunc: {
        selfTime: { value: 0, breakdownByImplementation: null },
        totalTime: { value: 0, breakdownByImplementation: null },
      },
      rootTime: 0,
    };
  }

  const { samples, stackTable, funcTable } = thread;
  const needleNodeIndex = getCallNodeIndexFromPath(needlePath, callNodeTable);
  const needleFuncIndex = getLeafFuncIndex(needlePath);

  const pathTimings: ItemTimings = {
    selfTime: { value: 0, breakdownByImplementation: null },
    totalTime: { value: 0, breakdownByImplementation: null },
  };
  const funcTimings: ItemTimings = {
    selfTime: { value: 0, breakdownByImplementation: null },
    totalTime: { value: 0, breakdownByImplementation: null },
  };
  let rootTime = 0;

  /**
   * This is a small utility function to more easily add data to breakdowns.
   * The funcIndex could be computed from the stackIndex but is provided as an
   * argument because it's been already computed when this function is called.
   */
  function accumulateDataToTimings(
    timings: {
      breakdownByImplementation: BreakdownByImplementation | null,
      value: number,
    },
    stackIndex: IndexIntoStackTable,
    funcIndex: IndexIntoFuncTable
  ): void {
    // Step 1: increment the total value
    timings.value += interval;

    // Step 2: find the implementation value for this stack
    const implementation = funcTable.isJS[funcIndex]
      ? getJsImplementationForStack(stackIndex, thread)
      : 'native';

    // Step 3: increment the right value in the implementation breakdown
    if (timings.breakdownByImplementation === null) {
      timings.breakdownByImplementation = {};
    }
    if (timings.breakdownByImplementation[implementation] === undefined) {
      timings.breakdownByImplementation[implementation] = 0;
    }
    timings.breakdownByImplementation[implementation] += interval;
  }

  // Loop over each sample and accumulate the self time, running time, and
  // the implementation breakdown.
  for (const thisStackIndex of samples.stack) {
    if (thisStackIndex === null) {
      continue;
    }

    rootTime += interval;

    const thisNodeIndex = stackIndexToCallNodeIndex[thisStackIndex];
    const thisFunc = callNodeTable.func[thisNodeIndex];

    if (!isInvertedTree) {
      // For non-inverted trees, we compute the self time from the stacks' leaf nodes.
      if (thisNodeIndex === needleNodeIndex) {
        accumulateDataToTimings(pathTimings.selfTime, thisStackIndex, thisFunc);
      }

      if (thisFunc === needleFuncIndex) {
        accumulateDataToTimings(funcTimings.selfTime, thisStackIndex, thisFunc);
      }
    }

    // Use the stackTable to traverse the call node path and get various
    // measurements.
    // We don't use getCallNodePathFromIndex because we don't need the result
    // itself, and it's costly to get. Moreover we can break out of the loop
    // early if necessary.
    let funcFound = false;
    let pathFound = false;
    let nextStackIndex;
    for (
      let currentStackIndex = thisStackIndex;
      currentStackIndex !== null;
      currentStackIndex = nextStackIndex
    ) {
      const currentNodeIndex = stackIndexToCallNodeIndex[currentStackIndex];
      const currentFuncIndex = callNodeTable.func[currentNodeIndex];
      nextStackIndex = stackTable.prefix[currentStackIndex];

      if (currentNodeIndex === needleNodeIndex) {
        // One of the parents is the exact passed path.
        // For non-inverted trees, we can contribute the data to the
        // implementation breakdown now.
        // Note that for inverted trees, we need to traverse up to the root node
        // first, see below for this.
        if (!isInvertedTree) {
          accumulateDataToTimings(
            pathTimings.totalTime,
            thisStackIndex,
            thisFunc
          );
        }

        pathFound = true;
      }

      if (!funcFound && currentFuncIndex === needleFuncIndex) {
        // One of the parents' func is the same function as the passed path.
        // Note we could have the same function several times in the stack, so
        // we need a boolean variable to prevent adding it more than once.
        // The boolean variable will also be used to accumulate timings for
        // inverted trees below.
        if (!isInvertedTree) {
          accumulateDataToTimings(
            funcTimings.totalTime,
            thisStackIndex,
            thisFunc
          );
        }
        funcFound = true;
      }

      // When the tree isn't inverted, we don't need to move further up the call
      // node if we already found all the data.
      // But for inverted trees, the selfTime is counted on the root node so we
      // need to go on looping the stack until we find it.

      if (!isInvertedTree && funcFound && pathFound) {
        // As explained above, for non-inverted trees, we can break here if we
        // found everything already.
        break;
      }

      if (isInvertedTree && nextStackIndex === null) {
        // This is an inverted tree, and we're at the root node because its
        // prefix is `null`.
        if (currentNodeIndex === needleNodeIndex) {
          // This root node matches the passed call node path.
          // This is the only place where we don't accumulate timings, mainly
          // because this would be the same as for the total time.
          pathTimings.selfTime.value += interval;
        }

        if (currentFuncIndex === needleFuncIndex) {
          // This root node is the same function as the passed call node path.
          accumulateDataToTimings(
            funcTimings.selfTime,
            currentStackIndex,
            currentFuncIndex
          );
        }

        if (pathFound) {
          // We contribute the implementation information if the passed path was
          // found in this stack earlier.
          accumulateDataToTimings(
            pathTimings.totalTime,
            currentStackIndex,
            currentFuncIndex
          );
        }

        if (funcFound) {
          // We contribute the implementation information if the leaf function
          // of the passed path was found in this stack earlier.
          accumulateDataToTimings(
            funcTimings.totalTime,
            currentStackIndex,
            currentFuncIndex
          );
        }
      }
    }
  }

  return { forPath: pathTimings, forFunc: funcTimings, rootTime };
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

export function toValidImplementationFilter(
  implementation: string
): ImplementationFilter {
  switch (implementation) {
    case 'cpp':
    case 'js':
      return implementation;
    default:
      return 'combined';
  }
}

export function filterThreadByImplementation(
  thread: Thread,
  implementation: string,
  defaultCategory: IndexIntoCategoryList
): Thread {
  const { funcTable, stringTable } = thread;

  switch (implementation) {
    case 'cpp':
      return _filterThreadByFunc(
        thread,
        funcIndex => {
          // Return quickly if this is a JS frame.
          if (funcTable.isJS[funcIndex]) {
            return false;
          }
          // Regular C++ functions are associated with a resource that describes the
          // shared library that these C++ functions were loaded from. Jitcode is not
          // loaded from shared libraries but instead generated at runtime, so Jitcode
          // frames are not associated with a shared library and thus have no resource
          const locationString = stringTable.getString(
            funcTable.name[funcIndex]
          );
          const isProbablyJitCode =
            funcTable.resource[funcIndex] === -1 &&
            locationString.startsWith('0x');
          return !isProbablyJitCode;
        },
        defaultCategory
      );
    case 'js':
      return _filterThreadByFunc(
        thread,
        funcIndex => funcTable.isJS[funcIndex],
        defaultCategory
      );
    default:
      return thread;
  }
}

function _filterThreadByFunc(
  thread: Thread,
  filter: IndexIntoFuncTable => boolean,
  defaultCategory: IndexIntoCallNodeTable
): Thread {
  return timeCode('filterThread', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
      category: [],
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
            newStackTable.category[newStack] = stackTable.category[stackIndex];
          } else if (
            newStackTable.category[newStack] !== stackTable.category[stackIndex]
          ) {
            // Conflicting origin stack categories -> default category.
            newStackTable.category[newStack] = defaultCategory;
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
      category: [],
      prefix: [],
    };
    const newFrameTable: FrameTable = {
      length: frameTable.length,
      implementation: frameTable.implementation.slice(),
      optimizations: frameTable.optimizations.slice(),
      line: frameTable.line.slice(),
      column: frameTable.column.slice(),
      category: frameTable.category.slice(),
      func: frameTable.func.slice(),
      address: frameTable.address.slice(),
    };
    const newFuncTable: FuncTable = {
      length: funcTable.length,
      name: funcTable.name.slice(),
      resource: funcTable.resource.slice(),
      relevantForJS: funcTable.relevantForJS.slice(),
      address: funcTable.address.slice(),
      isJS: funcTable.isJS.slice(),
      fileName: funcTable.fileName.slice(),
      lineNumber: funcTable.lineNumber.slice(),
      columnNumber: funcTable.columnNumber.slice(),
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
            newStackTable.category[newStack] = stackTable.category[oldStack];
            if (oldStackIsPlatform) {
              // Create a new platform frame
              const newFuncIndex = newFuncTable.length++;
              newFuncTable.name.push(stringTable.indexForString('Platform'));
              newFuncTable.resource.push(-1);
              newFuncTable.address.push(-1);
              newFuncTable.isJS.push(false);
              newFuncTable.fileName.push(null);
              newFuncTable.lineNumber.push(null);
              newFuncTable.columnNumber.push(null);
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
              newFrameTable.column.push(null);
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

export function filterThreadToSearchStrings(
  thread: Thread,
  searchStrings: string[] | null
): Thread {
  return timeCode('filterThreadToSearchStrings', () => {
    if (!searchStrings || !searchStrings.length) {
      return thread;
    }

    return searchStrings.reduce(filterThreadToSearchString, thread);
  });
}

export function filterThreadToSearchString(
  thread: Thread,
  searchString: string
): Thread {
  if (!searchString) {
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

// --------------- CallNodePath and CallNodeIndex manipulations ---------------

// Returns a list of CallNodeIndex from CallNodePaths. This function uses a map
// to speed up the look-up process.
export function getCallNodeIndicesFromPaths(
  callNodePaths: CallNodePath[],
  callNodeTable: CallNodeTable
): Array<IndexIntoCallNodeTable | null> {
  // This is a Map<CallNodePathHash, IndexIntoCallNodeTable>. This map speeds up
  // the look-up process by caching every CallNodePath we handle which avoids
  // looking up parents again and again.
  const cache = new Map();
  return callNodePaths.map(path =>
    _getCallNodeIndexFromPathWithCache(path, callNodeTable, cache)
  );
}

// Returns a CallNodeIndex from a CallNodePath, using and contributing to the
// cache parameter.
function _getCallNodeIndexFromPathWithCache(
  callNodePath: CallNodePath,
  callNodeTable: CallNodeTable,
  cache: Map<string, IndexIntoCallNodeTable>
): IndexIntoCallNodeTable | null {
  const hashFullPath = hashPath(callNodePath);
  const result = cache.get(hashFullPath);
  if (result !== undefined) {
    // The cache already has the result for the full path.
    return result;
  }

  // This array serves as a map and stores the hashes of callNodePath's
  // parents to speed up the algorithm. First we'll follow the tree from the
  // bottom towards the top, pushing hashes as we compute them, and then we'll
  // move back towards the bottom popping hashes from this array.
  const sliceHashes = [hashFullPath];

  // Step 1: find whether we already computed the index for one of the path's
  // parents, starting from the closest parent and looping towards the "top" of
  // the tree.
  // If we find it for one of the parents, we'll be able to start at this point
  // in the following look up.
  let i = callNodePath.length;
  let index;
  while (--i > 0) {
    // Looking up each parent for this call node, starting from the deepest node.
    // If we find a parent this makes it possible to start the look up from this location.
    const subPath = callNodePath.slice(0, i);
    const hash = hashPath(subPath);
    index = cache.get(hash);
    if (index !== undefined) {
      // Yay, we already have the result for a parent!
      break;
    }
    // Cache the hashed value because we'll need it later, after resolving this path.
    // Note we don't add the hash if we found the parent in the cache, so the
    // last added element here will accordingly be the first popped in the next
    // algorithm.
    sliceHashes.push(hash);
  }

  // Step 2: look for the requested path using the call node table, starting at
  // the parent we already know if we found one, and looping down the tree.
  // We're contributing to the cache at the same time.

  // `index` is undefined if no parent was found in the cache. In that case we
  // start from the start, and use `-1` which is the prefix we use to indicate
  // the root node.
  if (index === undefined) {
    index = -1;
  }

  while (i < callNodePath.length) {
    // Resolving the index for subpath `callNodePath.slice(0, i+1)` given we
    // know the index for the subpath `callNodePath.slice(0, i)` (its parent).
    const func = callNodePath[i];
    const nextNodeIndex = _getCallNodeIndexFromParentAndFunc(
      index,
      func,
      callNodeTable
    );

    // We couldn't find this path into the call node table. This shouldn't
    // normally happen.
    if (nextNodeIndex === null) {
      return null;
    }

    // Contributing to the shared cache
    const hash = sliceHashes.pop();
    cache.set(hash, nextNodeIndex);

    index = nextNodeIndex;
    i++;
  }

  return index < 0 ? null : index;
}

// Returns the CallNodeIndex that matches the function `func` and whose parent's
// CallNodeIndex is `parent`.
function _getCallNodeIndexFromParentAndFunc(
  parent: IndexIntoCallNodeTable,
  func: IndexIntoFuncTable,
  callNodeTable: CallNodeTable
): IndexIntoCallNodeTable | null {
  // Node children always come after their parents in the call node table,
  // that's why we start looping at `parent + 1`.
  // Note that because the root parent is `-1`, we correctly start at `0` when
  // we look for a top-level item.
  for (
    let callNodeIndex = parent + 1; // the root parent is -1
    callNodeIndex < callNodeTable.length;
    callNodeIndex++
  ) {
    if (
      callNodeTable.prefix[callNodeIndex] === parent &&
      callNodeTable.func[callNodeIndex] === func
    ) {
      return callNodeIndex;
    }
  }

  return null;
}

// This function returns a CallNodeIndex from a CallNodePath, using the
// specified `callNodeTable`.
export function getCallNodeIndexFromPath(
  callNodePath: CallNodePath,
  callNodeTable: CallNodeTable
): IndexIntoCallNodeTable | null {
  const [result] = getCallNodeIndicesFromPaths([callNodePath], callNodeTable);
  return result;
}

// This function returns a CallNodePath from a CallNodeIndex.
export function getCallNodePathFromIndex(
  callNodeIndex: IndexIntoCallNodeTable | null,
  callNodeTable: CallNodeTable
): CallNodePath {
  if (callNodeIndex === null || callNodeIndex === -1) {
    return [];
  }

  const callNodePath = [];
  let fs = callNodeIndex;
  while (fs !== -1) {
    callNodePath.push(callNodeTable.func[fs]);
    fs = callNodeTable.prefix[fs];
  }
  callNodePath.reverse();
  return callNodePath;
}

/**
 * This function converts a stack information into a call node path structure.
 */
export function convertStackToCallNodePath(
  thread: Thread,
  stack: IndexIntoStackTable
): CallNodePath {
  const { stackTable, frameTable } = thread;
  const path = [];
  for (
    let stackIndex = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    path.push(frameTable.func[stackTable.frame[stackIndex]]);
  }
  return path;
}

/**
 * Compute maximum depth of call stack for a given thread.
 *
 * Returns the depth of the deepest call node, but with a one-based
 * depth instead of a zero-based.
 *
 * If no samples are found, 0 is returned.
 */
export function computeCallNodeMaxDepth(
  thread: Thread,
  callNodeInfo: CallNodeInfo
): number {
  let maxDepth = 0;
  const { samples } = thread;
  const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
  for (let i = 0; i < samples.length; i++) {
    const stackIndex = samples.stack[i];
    if (stackIndex !== null) {
      const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
      // Change to one-based depth
      const depth = callNodeTable.depth[callNodeIndex] + 1;
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }
  return maxDepth;
}

export function invertCallstack(
  thread: Thread,
  defaultCategory: IndexIntoCategoryList
): Thread {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      category: [],
      prefix: [],
    };
    // Create a Map that keys off of two values, both the prefix and frame combination
    // by using a bit of math: prefix * frameCount + frame => stackIndex
    const prefixAndFrameToStack = new Map();
    const frameCount = frameTable.length;

    // Returns the stackIndex for a specific frame (that is, a function and its
    // context), and a specific prefix. If it doesn't exist yet it will create
    // a new stack entry and return its index.
    function stackFor(prefix, frame, category) {
      const prefixAndFrameIndex =
        (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        newStackTable.category[stackIndex] = category;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
      } else if (newStackTable.category[stackIndex] !== category) {
        // If two stack nodes from the non-inverted stack tree with different
        // categories happen to collapse into the same stack node in the
        // inverted tree, discard their category and set the category to the
        // default category.
        newStackTable.category[stackIndex] = defaultCategory;
      }
      return stackIndex;
    }

    const oldStackToNewStack = new Map();

    // For one specific stack, this will ensure that stacks are created for all
    // of its ancestors, by walking its prefix chain up to the root.
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
          // Notice how we reuse the previous stack as the prefix. This is what
          // effectively inverts the call tree.
          newStack = stackFor(
            newStack,
            stackTable.frame[currentStack],
            stackTable.category[currentStack]
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
  time: number,
  interval: number
): IndexIntoSamplesTable {
  // Bisect to find the index of the first sample after the provided time.
  const index = bisection.right(samples.time, time);

  if (index === 0) {
    return 0;
  }

  if (index === samples.length) {
    return samples.length - 1;
  }

  // Check the distance between the provided time and the center of the bisected sample
  // and its predecessor.
  const distanceToThis = samples.time[index] + interval / 2 - time;
  const distanceToLast = time - (samples.time[index - 1] + interval / 2);
  return distanceToThis < distanceToLast ? index : index - 1;
}

export function getFriendlyThreadName(
  threads: Thread[],
  thread: Thread
): string {
  let label;

  switch (thread.name) {
    case 'GeckoMain': {
      if (thread.processName) {
        // If processName is present, use that as it should contain a friendly name.
        // We want to use that for the GeckoMain thread because it is shown as the
        // root of other threads in each process group.
        label = thread.processName;
        const homonymThreads = threads.filter(thread => {
          return thread.name === 'GeckoMain' && thread.processName === label;
        });
        if (homonymThreads.length > 1) {
          const index = 1 + homonymThreads.indexOf(thread);
          label += ` (${index}/${homonymThreads.length})`;
        }
      } else {
        switch (thread.processType) {
          case 'default':
            label = 'Parent Process';
            break;
          case 'gpu':
            label = 'GPU Process';
            break;
          case 'tab': {
            const contentThreads = threads.filter(thread => {
              return (
                thread.name === 'GeckoMain' && thread.processType === 'tab'
              );
            });
            if (contentThreads.length > 1) {
              const index = 1 + contentThreads.indexOf(thread);
              label = `Content Process (${index}/${contentThreads.length})`;
            } else {
              label = 'Content Process';
            }
            break;
          }
          case 'plugin':
            label = 'Plugin Process';
            break;
          default:
          // should we throw here ?
        }
      }
      break;
    }
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
    meta: {
      interval: 1,
      startTime: 0,
      abi: '',
      misc: '',
      oscpu: '',
      platform: '',
      processType: 0,
      extensions: emptyExtensions,
      categories: [...defaultCategories],
      product: 'Firefox',
      stackwalk: 0,
      toolkit: '',
      version: GECKO_PROFILE_VERSION,
      preprocessedProfileVersion: PROCESSED_PROFILE_VERSION,
      appBuildID: '',
      sourceURL: '',
      physicalCPUs: 0,
      logicalCPUs: 0,
    },
    pages: [],
    threads: [],
  };
}

/**
 * This function returns the source origin for a function. This can be:
 * - a filename (javascript or object file)
 * - a URL (if the source is a website)
 */
export function getOriginAnnotationForFunc(
  funcIndex: IndexIntoFuncTable,
  funcTable: FuncTable,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray
): string {
  const resourceIndex = funcTable.resource[funcIndex];
  const resourceNameIndex = resourceTable.name[resourceIndex];

  let origin;
  if (resourceNameIndex !== undefined) {
    origin = stringTable.getString(resourceNameIndex);
  }

  const fileNameIndex = funcTable.fileName[funcIndex];
  let fileName;
  if (fileNameIndex !== null) {
    fileName = stringTable.getString(fileNameIndex);
    const lineNumber = funcTable.lineNumber[funcIndex];
    if (lineNumber !== null) {
      fileName += ':' + lineNumber;
      const columnNumber = funcTable.columnNumber[funcIndex];
      if (columnNumber !== null) {
        fileName += ':' + columnNumber;
      }
    }
  }

  if (fileName) {
    // If the origin string is just a URL prefix that's part of the
    // filename, it doesn't add any useful information, so just return
    // the filename. If it's something else (e.g., an extension or
    // library name), prepend it to the filename.
    if (origin && !fileName.startsWith(origin)) {
      return `${origin}: ${fileName}`;
    }
    return fileName;
  }

  if (origin) {
    return origin;
  }

  return '';
}

/**
 * Return a function that can compare two samples' call nodes, and determine a sort order.
 *
 * The order is determined as follows:
 *  - Ancestor call nodes are ordered before their descendants.
 *  - Sibling call nodes are ordered by their call node index.
 * This order can be different than the order of the rows that are displayed in the
 * call tree, because it does not take any sample information into account. This
 * makes it independent of any range selection and cheaper to compute.
 */
export function getTreeOrderComparator(
  callNodeTable: CallNodeTable,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>
): (IndexIntoSamplesTable, IndexIntoSamplesTable) => number {
  /**
   * Determine the ordering of two non-null call nodes.
   */
  function compareCallNodes(
    callNodeA: IndexIntoCallNodeTable,
    callNodeB: IndexIntoCallNodeTable
  ): number {
    const initialDepthA = callNodeTable.depth[callNodeA];
    const initialDepthB = callNodeTable.depth[callNodeB];
    let depthA = initialDepthA;
    let depthB = initialDepthB;

    // Walk call tree towards the roots until the call nodes are at the same depth.
    while (depthA > depthB) {
      callNodeA = callNodeTable.prefix[callNodeA];
      depthA--;
    }
    while (depthB > depthA) {
      callNodeB = callNodeTable.prefix[callNodeB];
      depthB--;
    }

    // Sort the call nodes by the initial depth.
    if (callNodeA === callNodeB) {
      return initialDepthA - initialDepthB;
    }

    // The call nodes are at the same depth, walk towards the roots until a match is
    // is found, then sort them based on stack order.
    while (true) {
      const parentNodeA = callNodeTable.prefix[callNodeA];
      const parentNodeB = callNodeTable.prefix[callNodeB];
      if (parentNodeA === parentNodeB) {
        break;
      }
      callNodeA = parentNodeA;
      callNodeB = parentNodeB;
    }

    return callNodeA - callNodeB;
  }

  /**
   * Determine the ordering of (possibly null) call nodes for two given samples.
   */
  return function treeOrderComparator(
    sampleA: IndexIntoSamplesTable,
    sampleB: IndexIntoSamplesTable
  ): number {
    const callNodeA = sampleCallNodes[sampleA];
    const callNodeB = sampleCallNodes[sampleB];
    if (callNodeA === null) {
      if (callNodeB === null) {
        return 0;
      }
      return -1;
    }
    if (callNodeB === null) {
      return 1;
    }
    return compareCallNodes(callNodeA, callNodeB);
  };
}

/**
 * This is the root-most call node for which, if selected, only the clicked category
 * is highlighted in the thread activity graph. In other words, it's the root-most call
 * node which only 'contains' samples whose sample category is the clicked category.
 */
export function findBestAncestorCallNode(
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  sampleCategories: Array<IndexIntoCategoryList | null>,
  clickedCallNode: IndexIntoCallNodeTable,
  clickedCategory: IndexIntoCategoryList
): IndexIntoCallNodeTable {
  const { callNodeTable } = callNodeInfo;
  if (callNodeTable.category[clickedCallNode] !== clickedCategory) {
    return clickedCallNode;
  }

  // Compute the callNodesOnSameCategoryPath.
  // Given a call node path with some arbitrary categories, e.g. A, B, C
  //
  //     Categories: A -> A -> B -> B -> C -> C -> C
  //   Node Indexes: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6

  // This loop will select the leaf-most call nodes that match the leaf call-node's
  // category. Running the above path through this loop would produce the list:
  //
  //     Categories: [C, C, C]
  //   Node Indexes: [6, 5, 4]  (note the reverse order)
  const callNodesOnSameCategoryPath = [clickedCallNode];
  let callNode = clickedCallNode;
  while (true) {
    const parentCallNode = callNodeTable.prefix[callNode];
    if (parentCallNode === -1) {
      // The entire call path is just clickedCategory.
      return clickedCallNode; // TODO: is this a useful behavior?
    }
    if (callNodeTable.category[parentCallNode] !== clickedCategory) {
      break;
    }
    callNodesOnSameCategoryPath.push(parentCallNode);
    callNode = parentCallNode;
  }

  // Now find the callNode in callNodesOnSameCategoryPath with the lowest depth
  // such that selecting it will not highlight any samples whose unfiltered
  // category is different from clickedCategory. If no such callNode exists,
  // return clickedCallNode.

  const clickedDepth = callNodeTable.depth[clickedCallNode];
  // The handledCallNodes is used as a Map<CallNodeIndex, bool>.
  const handledCallNodes = new Uint8Array(callNodeTable.length);

  function limitSameCategoryPathToCommonAncestor(callNode) {
    // The callNode argument is the leaf call node of a sample whose sample category is a
    // different category than clickedCategory. If callNode's ancestor path crosses
    // callNodesOnSameCategoryPath, that implies that callNode would be highlighted
    // if we were to select the root-most node in callNodesOnSameCategoryPath.
    // If that is the case, we need to truncate callNodesOnSameCategoryPath in such
    // a way that the root-most node in that list is no longer an ancestor of callNode.
    const walkUpToDepth =
      clickedDepth - (callNodesOnSameCategoryPath.length - 1);
    let depth = callNodeTable.depth[callNode];

    // Go from leaf to root in the call nodes.
    while (depth >= walkUpToDepth) {
      if (handledCallNodes[callNode]) {
        // This call node was already handled. Stop checking.
        return;
      }
      handledCallNodes[callNode] = 1;
      if (depth <= clickedDepth) {
        // This call node's depth is less than the clicked depth, it needs to be
        // checked to see if the call node is in the callNodesOnSameCategoryPath.
        if (callNode === callNodesOnSameCategoryPath[clickedDepth - depth]) {
          // Remove some of the call nodes, as they are not on the same path.
          // This is done by shortening the array length. Keep in mind that this
          // array is in the opposite order of a CallNodePath, with the leaf-most
          // nodes first, and the root-most last.
          callNodesOnSameCategoryPath.length = clickedDepth - depth;
          return;
        }
      }
      callNode = callNodeTable.prefix[callNode];
      depth--;
    }
  }

  // Go through every sample and look at each sample's call node.
  for (let sample = 0; sample < sampleCallNodes.length; sample++) {
    if (
      sampleCategories[sample] !== clickedCategory &&
      sampleCallNodes[sample] !== null
    ) {
      // This sample's category is a different one than the one clicked. Make
      // sure to limit the callNodesOnSameCategoryPath to just the call nodes
      // that share the same common ancestor.
      limitSameCategoryPathToCommonAncestor(sampleCallNodes[sample]);
    }
  }

  if (callNodesOnSameCategoryPath.length > 0) {
    // The last call node in this list will be the root-most call node that has
    // the same category on the path as the clicked call node.
    return callNodesOnSameCategoryPath[callNodesOnSameCategoryPath.length - 1];
  }
  return clickedCallNode;
}

/**
 * Look at the leaf-most stack for every sample, and take its category.
 */
export function getSampleCategories(
  samples: SamplesTable,
  stackTable: StackTable
): Array<IndexIntoSamplesTable | null> {
  return samples.stack.map(s => (s !== null ? stackTable.category[s] : null));
}

export function getFuncNamesAndOriginsForPath(
  path: CallNodePath,
  thread: Thread
): Array<{ funcName: string, origin: string }> {
  const { funcTable, stringTable, resourceTable } = thread;

  return path.map(func => ({
    funcName: stringTable.getString(funcTable.name[func]),
    origin: getOriginAnnotationForFunc(
      func,
      funcTable,
      resourceTable,
      stringTable
    ),
  }));
}
