/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { UniqueStringArray } from '../utils/unique-string-array';
import type { TaskTracer } from '../types/profile';

export function getTasksByThread(
  taskTable: Object,
  threadTable: Object
): Map<*, *> {
  const threadIndexToTaskIndicesMap = new Map();
  for (let threadIndex = 0; threadIndex < threadTable.length; threadIndex++) {
    const taskIndices = [];
    for (let taskIndex = 0; taskIndex < taskTable.length; taskIndex++) {
      if (taskTable.threadIndex[taskIndex] === threadIndex) {
        taskIndices.push(taskIndex);
      }
    }
    const afterEnd = 1477254572877 * 2;
    taskIndices.sort(
      (a, b) =>
        (taskTable.beginTime[a] || afterEnd) -
        (taskTable.beginTime[b] || afterEnd)
    );
    threadIndexToTaskIndicesMap.set(threadIndex, taskIndices);
  }
  return threadIndexToTaskIndicesMap;
}

export function getEmptyTaskTracerData(): TaskTracer {
  return {
    taskTable: {
      length: 0,
      dispatchTime: [],
      sourceEventId: [],
      sourceEventType: [],
      parentTaskId: [],
      beginTime: [],
      processId: [],
      threadIndex: [],
      endTime: [],
      ipdlMsg: [],
      label: [],
      address: [],
    },
    tasksIdToTaskIndexMap: new Map(),
    stringTable: new UniqueStringArray(),
    addressTable: {
      length: 0,
      address: [],
      className: [],
      lib: [],
    },
    addressIndicesByLib: new Map(),
    threadTable: {
      length: 0,
      tid: [],
      name: [],
      start: [],
    },
    tidToThreadIndexMap: new Map(),
  };
}
