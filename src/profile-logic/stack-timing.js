/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { bisectionLeft } from 'firefox-profiler/utils/bisect';

import type {
  SamplesLikeTable,
  Milliseconds,
  CallNodeInfo,
  StackTable,
  IndexIntoCallNodeTable,
  DevicePixels,
  IndexIntoFuncTable,
  IndexIntoSamplesTable,
  IndexIntoCategoryList,
} from 'firefox-profiler/types';
/**
 * The StackTimingByDepth data structure organizes stack frames by their depth, and start
 * and end times. This optimizes sample data for Stack Chart views. It
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

export type StackTimingDepth = number;
export type IndexIntoStackTiming = number;

export type StackTiming = {|
  start: DevicePixels[],
  end: DevicePixels[],
  func: IndexIntoFuncTable[],
  category: IndexIntoCategoryList[],
  isSelectedPath: boolean[],
  parentIndexInPreviousRow: IndexIntoStackTiming[],
  length: number,
|};

export type StackTimingByDepth = StackTiming[];

function getEmptyStackTimingByDepth(
  maxDepth: StackTimingDepth
): StackTimingByDepth {
  return Array.from({ length: maxDepth }, () => ({
    start: [],
    end: [],
    func: [],
    category: [],
    isSelectedPath: [],
    parentIndexInPreviousRow: [],
    length: 0,
  }));
}

/**
 * Round the given value to integers, consistently rounding x.5 towards positive infinity.
 * This is different from Math.round: Math.round rounds 0.5 to the right (to 1), and -0.5
 * to the left (to -1).
 * snap should be preferred over Math.round for rounding coordinates which might
 * be negative, so that there is no discontinuity when a box moves past zero.
 */
function snap(floatDeviceValue: DevicePixels): DevicePixels {
  return Math.floor(floatDeviceValue + 0.5);
}

/**
 * Round the given value to a multiple of 2.
 */
function snapValueToMultipleOfTwo(
  floatDeviceValue: DevicePixels
): DevicePixels {
  return snap(floatDeviceValue / 2) << 1;
}

/**
 * Build a StackTimingByDepth table from a given thread.
 */
export function getStackTimingByDepth(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  timeRangeEnd: Milliseconds,
  deviceWidth: DevicePixels,
  selectedCallNode: IndexIntoCallNodeTable | null,
  defaultCategory: IndexIntoCategoryList,
  interval: Milliseconds
): StackTimingByDepth {
  if (timeRangeStart >= timeRangeEnd || deviceWidth <= 0) {
    return getEmptyStackTimingByDepth(maxDepth);
  }

  let sampleIndexRangeStart = Math.max(
    0,
    bisectionLeft(samples.time, timeRangeStart) - 1
  );
  const sampleIndexRangeEnd = Math.min(
    samples.length - 1,
    bisectionLeft(samples.time, timeRangeEnd, sampleIndexRangeStart)
  );

  while (
    sampleIndexRangeStart < sampleIndexRangeEnd &&
    samples.stack[sampleIndexRangeStart] === null
  ) {
    sampleIndexRangeStart++;
  }

  if (sampleIndexRangeStart === sampleIndexRangeEnd) {
    return getEmptyStackTimingByDepth(maxDepth);
  }

  const timeWindowSizeInMilliseconds = timeRangeEnd - timeRangeStart;
  const devPxPerMs = deviceWidth / timeWindowSizeInMilliseconds;

  const firstSampleTime = samples.time[sampleIndexRangeStart];
  const firstSamplePos = snapValueToMultipleOfTwo(
    (firstSampleTime - timeRangeStart) * devPxPerMs
  );
  const firstPos = Math.max(0, firstSamplePos);

  const endTime =
    sampleIndexRangeEnd < samples.length
      ? samples.time[sampleIndexRangeEnd]
      : samples.time[sampleIndexRangeEnd - 1] + interval;
  const endPos = Math.min(
    deviceWidth,
    snapValueToMultipleOfTwo((endTime - timeRangeStart) * devPxPerMs)
  );

  return callNodeInfo.isInverted()
    ? getStackTimingByDepthInverted(
        samples,
        stackTable,
        callNodeInfo,
        maxDepth,
        timeRangeStart,
        devPxPerMs,
        selectedCallNode,
        defaultCategory,
        sampleIndexRangeStart,
        sampleIndexRangeEnd,
        firstPos,
        endPos
      )
    : getStackTimingByDepthNonInverted(
        samples,
        stackTable,
        callNodeInfo,
        maxDepth,
        timeRangeStart,
        devPxPerMs,
        selectedCallNode,
        sampleIndexRangeStart,
        sampleIndexRangeEnd,
        firstPos,
        endPos
      );
}

type StackTimingOpenBox = {|
  callNodeIndex: IndexIntoCallNodeTable | -1,
  start: DevicePixels,
|};

export function getStackTimingByDepthNonInverted(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  devPxPerMs: number,
  selectedCallNode: IndexIntoCallNodeTable | null,
  sampleIndexRangeStart: IndexIntoSamplesTable,
  sampleIndexRangeEnd: IndexIntoSamplesTable,
  firstPos: DevicePixels,
  endPos: DevicePixels
): StackTimingByDepth {
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  const callNodeTablePrefixColumn = callNodeTable.prefix;

  const stackTimingByDepth = getEmptyStackTimingByDepth(maxDepth);

  // Must be called in order of decreasing depth.
  function commitBox(
    openBox: StackTimingOpenBox,
    depth: StackTimingDepth,
    currentPos: DevicePixels
  ) {
    const { start, callNodeIndex } = openBox;
    if (start === currentPos) {
      return;
    }
    const stackTimingForThisDepth = stackTimingByDepth[depth];
    const index = stackTimingForThisDepth.length++;
    stackTimingForThisDepth.start[index] = start;
    stackTimingForThisDepth.end[index] = currentPos;
    stackTimingForThisDepth.func[index] = callNodeTable.func[callNodeIndex];
    stackTimingForThisDepth.category[index] =
      callNodeTable.category[callNodeIndex];
    stackTimingForThisDepth.isSelectedPath[index] =
      callNodeIndex === selectedCallNode;
    stackTimingForThisDepth.isSelectedPath[index] =
      callNodeIndex === selectedCallNode;
    const parentIndexInPreviousRow =
      depth === 0 ? 0 : stackTimingByDepth[depth - 1].length;
    stackTimingForThisDepth.parentIndexInPreviousRow[index] =
      parentIndexInPreviousRow;
  }

  let prevCallNodeIndex = null;
  let prevCallNodeDepth = -1;
  const prevBoxByDepth: Array<StackTimingOpenBox> = Array.from(
    { length: maxDepth },
    () => ({ callNodeIndex: -1, start: 0 })
  );

  let nextSamplePos = firstPos;

  for (
    let sampleIndex = sampleIndexRangeStart;
    sampleIndex < sampleIndexRangeEnd;
    sampleIndex++
  ) {
    const currentStack = samples.stack[sampleIndex];
    let currentCallNodeIndex =
      currentStack !== null ? stackIndexToCallNodeIndex[currentStack] : -1;
    if (currentCallNodeIndex === prevCallNodeIndex) {
      if (sampleIndex + 1 < sampleIndexRangeEnd) {
        const nextSampleTime = samples.time[sampleIndex + 1];
        nextSamplePos = snapValueToMultipleOfTwo(
          (nextSampleTime - timeRangeStart) * devPxPerMs
        );
      }
      continue;
    }

    const currentPos = nextSamplePos;

    while (sampleIndex + 1 < sampleIndexRangeEnd) {
      const nextSampleTime = samples.time[sampleIndex + 1];
      nextSamplePos = snapValueToMultipleOfTwo(
        (nextSampleTime - timeRangeStart) * devPxPerMs
      );

      if (nextSamplePos !== currentPos) {
        break;
      }

      if (prevCallNodeDepth !== -1) {
        // Close boxes for current sample.
        let currentDepth =
          currentCallNodeIndex === -1
            ? -1
            : callNodeTable.depth[currentCallNodeIndex];

        // If this stack is smaller than the previous stack, close the excess boxes.
        while (prevCallNodeDepth > currentDepth) {
          const openBox = prevBoxByDepth[prevCallNodeDepth];
          commitBox(openBox, prevCallNodeDepth, currentPos);
          openBox.callNodeIndex = -1;
          prevCallNodeDepth--;
        }

        // If this stack is larger than the previous stack, walk up until we're at the same depth.
        while (currentDepth > prevCallNodeDepth) {
          currentCallNodeIndex =
            callNodeTablePrefixColumn[currentCallNodeIndex];
          currentDepth--;
        }

        // Close all mismatching boxes. Don't open any new ones because this sample
        // doesn't have a width.
        while (currentDepth >= 0) {
          const openBox = prevBoxByDepth[currentDepth];
          if (openBox.callNodeIndex === currentCallNodeIndex) {
            break;
          }

          commitBox(openBox, currentDepth, currentPos);
          openBox.callNodeIndex = -1;
          currentCallNodeIndex =
            callNodeTablePrefixColumn[currentCallNodeIndex];
          currentDepth--;
        }

        prevCallNodeDepth = currentDepth;
        prevCallNodeIndex = currentCallNodeIndex;
      }

      sampleIndex++;
      const currentStack = samples.stack[sampleIndex];
      currentCallNodeIndex =
        currentStack !== null ? stackIndexToCallNodeIndex[currentStack] : -1;
    }

    let currentDepth =
      currentCallNodeIndex === -1
        ? -1
        : callNodeTable.depth[currentCallNodeIndex];

    // assert(currentDepth < maxDepth);

    // If this stack is smaller than the previous stack, close the excess boxes.
    while (prevCallNodeDepth > currentDepth) {
      const openBox = prevBoxByDepth[prevCallNodeDepth];
      commitBox(openBox, prevCallNodeDepth, currentPos);
      openBox.callNodeIndex = -1;
      prevCallNodeDepth--;
    }

    const thisCallNodeIndex = currentCallNodeIndex;
    const thisCallNodeDepth = currentDepth;

    // If this stack is larger than the previous stack, initialize the new boxes.
    while (currentDepth > prevCallNodeDepth) {
      const openBox = prevBoxByDepth[currentDepth];
      openBox.callNodeIndex = currentCallNodeIndex;
      openBox.start = currentPos;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentDepth--;
    }

    // Now currentDepth === prevCallNodeDepth.
    // Walk the common depth and check if the boxes differ.

    // First, walk the part for which the callNodeIndex has changed. Even if the
    // func in the row is unchanged, a differing callNodeIndex means that some
    // func further to the root of the stack has changed, so it wouldn't be the
    // same call to that function and we'd need to open a new box.
    while (currentDepth >= 0) {
      const openBox = prevBoxByDepth[currentDepth];
      if (openBox.callNodeIndex === currentCallNodeIndex) {
        break;
      }

      commitBox(openBox, currentDepth, currentPos);
      openBox.callNodeIndex = currentCallNodeIndex;
      openBox.start = currentPos;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentDepth--;
    }

    // We're done with the part of the stack where the callNodeIndex per depth differs.
    // If currentDepth is still >= 0, the rest of the stack has matching call node
    // indexes. These boxes can stay unchanged.

    // We are done with this sample. Go to the next.

    prevCallNodeIndex = thisCallNodeIndex;
    prevCallNodeDepth = thisCallNodeDepth;
  }

  // Commit all open boxes.
  for (let depth = prevCallNodeDepth; depth >= 0; depth--) {
    const openBox = prevBoxByDepth[depth];
    commitBox(openBox, depth, endPos);
  }

  return stackTimingByDepth;
}

type StackTimingOpenBoxInverted = {|
  func: IndexIntoFuncTable,
  category: IndexIntoCategoryList,
  start: DevicePixels,
  isSelectedPath: boolean,
|};

export function getStackTimingByDepthInverted(
  samples: SamplesLikeTable,
  stackTable: StackTable,
  callNodeInfo: CallNodeInfo,
  maxDepth: number,
  timeRangeStart: Milliseconds,
  devPxPerMs: number,
  selectedCallNode: IndexIntoCallNodeTable | null,
  defaultCategory: IndexIntoCategoryList,
  sampleIndexRangeStart: IndexIntoSamplesTable,
  sampleIndexRangeEnd: IndexIntoSamplesTable,
  firstPos: DevicePixels,
  endPos: DevicePixels
): StackTimingByDepth {
  const selectedCallPath =
    callNodeInfo.getCallNodePathFromIndex(selectedCallNode);
  const selectedCallPathDepth = selectedCallPath.length - 1;
  const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
  const callNodeTablePrefixColumn = callNodeTable.prefix;
  const stackIndexToNonInvertedCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();

  function commitBox(
    openBox: StackTimingOpenBoxInverted,
    depth: StackTimingDepth,
    currentPos: DevicePixels,
    parentBoxHasAlreadyBeenCommitted: boolean
  ) {
    const { start, func, category, isSelectedPath } = openBox;
    if (start === currentPos) {
      return;
    }
    const stackTimingForThisDepth = stackTimingByDepth[depth];
    const index = stackTimingForThisDepth.length++;
    stackTimingForThisDepth.start[index] = start;
    stackTimingForThisDepth.end[index] = currentPos;
    stackTimingForThisDepth.func[index] = func;
    stackTimingForThisDepth.category[index] = category;
    stackTimingForThisDepth.isSelectedPath[index] = isSelectedPath;
    const indexAdjust = parentBoxHasAlreadyBeenCommitted ? 1 : 0;
    const parentIndexInPreviousRow =
      depth === 0 ? 0 : stackTimingByDepth[depth - 1].length - indexAdjust;
    stackTimingForThisDepth.parentIndexInPreviousRow[index] =
      parentIndexInPreviousRow;
  }

  const stackTimingByDepth = getEmptyStackTimingByDepth(maxDepth);

  let prevCallNodeIndex = null;
  let prevCallNodeDepth = -1;
  let prevSampleWasVisible = true;
  const prevBoxByDepth: Array<StackTimingOpenBoxInverted> = Array.from(
    { length: maxDepth },
    () => ({ func: 0, category: 0, start: 0, isSelectedPath: false })
  );

  let nextSamplePos = firstPos;

  for (
    let sampleIndex = sampleIndexRangeStart;
    sampleIndex < sampleIndexRangeEnd;
    sampleIndex++
  ) {
    const currentStack = samples.stack[sampleIndex];
    const currentPos = nextSamplePos;
    let thisSampleIsVisible = true;

    if (sampleIndex + 1 < sampleIndexRangeEnd) {
      nextSamplePos = snapValueToMultipleOfTwo(
        (samples.time[sampleIndex + 1] - timeRangeStart) * devPxPerMs
      );
      thisSampleIsVisible = nextSamplePos !== currentPos;
    }

    if (currentStack === null) {
      // Commit all open boxes.
      for (let depth = 0; depth <= prevCallNodeDepth; depth++) {
        const openBox = prevBoxByDepth[depth];
        commitBox(openBox, depth, currentPos, true);
      }

      prevCallNodeIndex = -1;
      prevCallNodeDepth = -1;
      continue;
    }

    const thisCallNodeIndex =
      stackIndexToNonInvertedCallNodeIndex[currentStack];
    let thisCallNodeDepth = callNodeTable.depth[thisCallNodeIndex];

    if (thisCallNodeIndex === prevCallNodeIndex && prevSampleWasVisible) {
      continue;
    }

    let currentCallNodeIndex = thisCallNodeIndex;
    let currentFunc = callNodeTable.func[currentCallNodeIndex];
    let currentDepth = 0;
    let currentPathMatchesSelectedCallPath =
      currentDepth <= selectedCallPathDepth &&
      currentFunc === selectedCallPath[currentDepth];

    // Step 1: Walk common depth while funcs match
    while (
      currentDepth <= prevCallNodeDepth &&
      currentDepth <= thisCallNodeDepth
    ) {
      const openBox = prevBoxByDepth[currentDepth];
      if (openBox.func !== currentFunc) {
        break;
      }

      // Resolve category mismatches.
      const category = callNodeTable.category[currentCallNodeIndex];
      if (openBox.category !== category) {
        openBox.category = defaultCategory;
      }
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    if (!thisSampleIsVisible) {
      thisCallNodeDepth = currentDepth;
    }

    // Step 2: Walk common depth after first func mismatch; close and reopen boxes
    let currentParentHasBeenCommitted = false;
    while (
      currentDepth <= prevCallNodeDepth &&
      currentDepth <= thisCallNodeDepth
    ) {
      const openBox = prevBoxByDepth[currentDepth];
      commitBox(
        openBox,
        currentDepth,
        currentPos,
        currentParentHasBeenCommitted
      );
      openBox.func = currentFunc;
      openBox.start = currentPos;
      openBox.category = callNodeTable.category[currentCallNodeIndex];
      openBox.isSelectedPath =
        currentPathMatchesSelectedCallPath &&
        currentDepth === selectedCallPathDepth;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentParentHasBeenCommitted = true;
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    // Step 3a: Previous stack was deeper - close extra boxes.
    for (let depth = currentDepth; depth <= prevCallNodeDepth; depth++) {
      const openBox = prevBoxByDepth[depth];
      commitBox(openBox, depth, currentPos, currentParentHasBeenCommitted);
      currentParentHasBeenCommitted = true;
    }

    // Step 3b: This stack is deeper - open extra boxes.
    while (currentDepth <= thisCallNodeDepth) {
      const openBox = prevBoxByDepth[currentDepth];
      openBox.func = currentFunc;
      openBox.start = currentPos;
      openBox.category = callNodeTable.category[currentCallNodeIndex];
      openBox.isSelectedPath =
        currentPathMatchesSelectedCallPath &&
        currentDepth === selectedCallPathDepth;
      currentCallNodeIndex = callNodeTablePrefixColumn[currentCallNodeIndex];
      currentFunc = callNodeTable.func[currentCallNodeIndex];
      currentDepth++;
      if (currentPathMatchesSelectedCallPath) {
        currentPathMatchesSelectedCallPath =
          currentDepth <= selectedCallPathDepth &&
          currentFunc === selectedCallPath[currentDepth];
      }
    }

    prevCallNodeIndex = thisCallNodeIndex;
    prevCallNodeDepth = thisCallNodeDepth;
    prevSampleWasVisible = thisSampleIsVisible;
  }

  // Commit all open boxes.
  for (let depth = 0; depth <= prevCallNodeDepth; depth++) {
    const openBox = prevBoxByDepth[depth];
    commitBox(openBox, depth, endPos, true);
  }

  return stackTimingByDepth;
}
