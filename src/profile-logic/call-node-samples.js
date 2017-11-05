/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Thread } from '../types/profile';
import type { Milliseconds } from '../types/units';
import type {
  IndexIntoCallNodeTable,
  CallNodeTable,
  CallNodeInfo,
} from '../types/profile-derived';

import { getCallNodePath } from './profile-data';

export type CallNodeSamplesByDepth = Array<{
  start: Milliseconds[],
  end: Milliseconds[],
  callNode: IndexIntoCallNodeTable[],
  length: number,
}>;

type LastSeen = {
  startTimeByDepth: number[],
  callNodeIndexByDepth: IndexIntoCallNodeTable[],
};

type SamplesByFuncPath = {
  [string]: {
    samples: number,
    depth: number,
    callNodeIndex: IndexIntoCallNodeTable,
  },
};

/**
 * Build a CallNodeSamplesByDepth table from a given thread.
 *
 * @param {object} thread - The profile thread.
 * @param {object} callNodeInfo - from the callNodeInfo selector.
 * @param {integer} maxDepth - The max depth of the all the stacks.
 * @return {array} callNodeSamplesByDepth
 */
export function getCallNodeSamplesByDepth(
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  maxDepth: number
): CallNodeSamplesByDepth {
  const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
  const callNodeSamplesByDepth = Array.from({ length: maxDepth + 1 }, () => ({
    start: [],
    end: [],
    callNode: [],
    length: 0,
  }));

  const lastSeen: LastSeen = {
    startTimeByDepth: [],
    callNodeIndexByDepth: [],
  };

  const sampleCounts = _collectSamplesPerFuncPath(
    thread,
    stackIndexToCallNodeIndex,
    callNodeTable
  );
  const paths = Object.keys(sampleCounts);
  paths.sort(_compareFuncPath);

  let sampleTime = 0;
  let previousDepth = -1;
  for (const path of paths) {
    const { samples, callNodeIndex, depth } = sampleCounts[path];

    // Find the depth of the nearest shared stack.
    const depthToPop = _findNearestSharedStackDepth(
      callNodeTable,
      callNodeIndex,
      lastSeen,
      depth
    );
    _popStacks(
      callNodeSamplesByDepth,
      lastSeen,
      depthToPop,
      previousDepth,
      sampleTime
    );
    _pushStacks(
      thread,
      lastSeen,
      depth,
      callNodeIndex,
      callNodeTable,
      sampleTime
    );
    previousDepth = depth;
    sampleTime += samples;
  }

  // Pop the remaining stacks
  _popStacks(callNodeSamplesByDepth, lastSeen, -1, previousDepth, sampleTime);

  return callNodeSamplesByDepth;
}

function _findNearestSharedStackDepth(
  callNodeTable: CallNodeTable,
  callNodeIndex: IndexIntoCallNodeTable,
  lastSeen: LastSeen,
  depthStart: number
): number {
  let nextCallNodeIndex = callNodeIndex;
  for (let depth = depthStart; depth >= 0; depth--) {
    if (lastSeen.callNodeIndexByDepth[depth] === nextCallNodeIndex) {
      return depth;
    }
    nextCallNodeIndex = callNodeTable.prefix[nextCallNodeIndex];
  }
  return -1;
}

function _popStacks(
  callNodeSamplesByDepth: CallNodeSamplesByDepth,
  lastSeen: LastSeen,
  depth: number,
  previousDepth: number,
  sampleTime: number
) {
  // "Pop" off the stack, and commit the timing of the frames
  for (let stackDepth = depth + 1; stackDepth <= previousDepth; stackDepth++) {
    // Push on the new information.
    callNodeSamplesByDepth[stackDepth].start.push(
      lastSeen.startTimeByDepth[stackDepth]
    );
    callNodeSamplesByDepth[stackDepth].end.push(sampleTime);
    callNodeSamplesByDepth[stackDepth].callNode.push(
      lastSeen.callNodeIndexByDepth[stackDepth]
    );
    callNodeSamplesByDepth[stackDepth].length++;

    // Delete that this stack frame has been seen.
    delete lastSeen.callNodeIndexByDepth[stackDepth];
    delete lastSeen.startTimeByDepth[stackDepth];
  }
}

function _pushStacks(
  thread: Thread,
  lastSeen: LastSeen,
  depth: number,
  startingIndex: IndexIntoCallNodeTable,
  callNodeTable: CallNodeTable,
  sampleTime: number
) {
  let callNodeIndex = startingIndex;
  // "Push" onto the stack with new frames
  for (let parentDepth = depth; parentDepth >= 0; parentDepth--) {
    if (
      callNodeIndex === null ||
      lastSeen.callNodeIndexByDepth[parentDepth] !== undefined
    ) {
      break;
    }
    lastSeen.callNodeIndexByDepth[parentDepth] = callNodeIndex;
    lastSeen.startTimeByDepth[parentDepth] = sampleTime;
    callNodeIndex = callNodeTable.prefix[callNodeIndex];
  }
}

/**
 * This compare function will order functions such that the path to a
 * direct function call comes right after the paths where it is a
 * parent.
 *
 * That is, instead of a default alphabetic sort,
 * ['func', 'func,first', 'func,second']
 * we get
 * ['func,first', 'func,second', 'func'].
 * This sorting will "left align" the flame graph.
 */
function _compareFuncPath(a, b) {
  if (a.startsWith(b + ',')) {
    return -1;
  } else if (b.startsWith(a + ',')) {
    return 1;
  }
  return a < b ? -1 : 1;
}

function _collectSamplesPerFuncPath(
  thread: Thread,
  stackIndexToCallNodeIndex: Uint32Array,
  callNodeTable: CallNodeTable
): SamplesByFuncPath {
  const samples: SamplesByFuncPath = {};

  for (const stackIndex of thread.samples.stack) {
    if (stackIndex === null) {
      continue;
    }
    const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
    const callNodePath = getCallNodePath(callNodeIndex, callNodeTable);
    const funcPath = callNodePath
      .map(funcIndex =>
        thread.stringTable.getString(thread.funcTable.name[funcIndex])
      )
      .toString();

    if (samples[funcPath] === undefined) {
      samples[funcPath] = {
        samples: 1,
        depth: callNodePath.length - 1,
        callNodeIndex,
      };
    } else {
      samples[funcPath].samples++;
    }
  }
  return samples;
}
