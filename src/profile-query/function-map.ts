/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import type {
  ThreadIndex,
  IndexIntoFuncTable,
  ThreadsKey,
} from 'firefox-profiler/types';

/**
 * Represents a function identified by its thread and function index.
 */
export type FunctionId = {
  threadIndexes: Set<ThreadIndex>;
  threadsKey: ThreadsKey;
  funcIndex: IndexIntoFuncTable;
};

/**
 * Maps function handles (like "f-1", "f-2") to (threadIndex, funcIndex) pairs.
 * This provides a user-friendly way to reference functions in the CLI.
 *
 * Since each thread has its own funcTable, we need to store both the thread
 * index and the function index to uniquely identify a function.
 */
export class FunctionMap {
  _handleToFunction: Map<string, FunctionId> = new Map();
  _nextHandleId: number = 1;

  /**
   * Get or create a handle for a function.
   * Returns the same handle if called multiple times with the same function.
   */
  handleForFunction(
    threadIndexes: Set<ThreadIndex>,
    funcIndex: IndexIntoFuncTable
  ): string {
    // Check if we already have a handle for this function
    const threadsKey = getThreadsKey(threadIndexes);
    for (const [handle, funcId] of this._handleToFunction.entries()) {
      if (funcId.threadsKey === threadsKey && funcId.funcIndex === funcIndex) {
        return handle;
      }
    }

    // Create a new handle
    const handle = 'f-' + this._nextHandleId++;
    this._handleToFunction.set(handle, {
      threadIndexes,
      threadsKey,
      funcIndex,
    });
    return handle;
  }

  /**
   * Look up a function by its handle.
   * Throws an error if the handle is unknown.
   */
  functionForHandle(functionHandle: string): FunctionId {
    const funcId = this._handleToFunction.get(functionHandle);
    if (funcId === undefined) {
      throw new Error(`Unknown function ${functionHandle}`);
    }
    return funcId;
  }
}
