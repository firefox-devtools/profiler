/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getSelectedThreadIndexes,
  getAllCommittedRanges,
} from 'firefox-profiler/selectors/url-state';
import {
  getCategories,
  getDefaultCategory,
  getProfile,
} from 'firefox-profiler/selectors/profile';
import { printSliceTree, collectSliceTree } from '../cpu-activity';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import type {
  ThreadInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadFunctionsResult,
  FunctionFilterOptions,
  TopFunctionInfo,
} from '../types';
import {
  extractFunctionData,
  formatFunctionNameWithLibrary,
} from '../function-list';
import { collectCallTree } from './call-tree';
import type { CallTreeCollectionOptions } from './call-tree';
import {
  computeCallTreeTimings,
  getCallTree,
  computeCallNodeSelfAndSummary,
} from 'firefox-profiler/profile-logic/call-tree';
import { getInvertedCallNodeInfo } from 'firefox-profiler/profile-logic/profile-data';
import type { Store } from '../../types/store';
import type { TimestampManager } from '../timestamps';
import type { ThreadMap } from '../thread-map';
import type { FunctionMap } from '../function-map';
import type { CallNodePath } from 'firefox-profiler/types';

export function formatThreadInfo(
  store: Store,
  timestampManager: TimestampManager,
  threadMap: ThreadMap,
  threadHandle?: string
): string {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const thread = threadSelectors.getRawThread(state);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const cptuActivity = threadSelectors.getRangeFilteredActivitySlices(state);
  const cpuActivityLines =
    cptuActivity !== null ? printSliceTree(cptuActivity, timestampManager) : [];

  return `\
Name: ${friendlyThreadName}
Created at: ${timestampManager.nameForTimestamp(thread.registerTime)}
Ended at: ${thread.unregisterTime !== null ? timestampManager.nameForTimestamp(thread.unregisterTime) : 'still alive at end of recording'}

This thread contains ${thread.samples.length} samples and ${thread.markers.length} markers.

CPU activity over time:
${cpuActivityLines.join('\n')}
`;
}

/**
 * Collect thread info as structured data.
 */
export function collectThreadInfo(
  store: Store,
  timestampManager: TimestampManager,
  threadMap: ThreadMap,
  threadHandle?: string
): ThreadInfoResult {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const thread = threadSelectors.getRawThread(state);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const cpuActivitySlices =
    threadSelectors.getRangeFilteredActivitySlices(state);
  const cpuActivity =
    cpuActivitySlices !== null
      ? collectSliceTree(cpuActivitySlices, timestampManager)
      : null;

  const actualThreadHandle =
    threadHandle ?? threadMap.handleForThreadIndexes(threadIndexes);

  return {
    type: 'thread-info',
    threadHandle: actualThreadHandle,
    name: thread.name,
    friendlyName: friendlyThreadName,
    createdAt: thread.registerTime,
    createdAtName: timestampManager.nameForTimestamp(thread.registerTime),
    endedAt: thread.unregisterTime,
    endedAtName:
      thread.unregisterTime !== null
        ? timestampManager.nameForTimestamp(thread.unregisterTime)
        : null,
    sampleCount: thread.samples.length,
    markerCount: thread.markers.length,
    cpuActivity,
  };
}

/**
 * Collect thread samples data in structured format.
 */
export function collectThreadSamples(
  store: Store,
  threadMap: ThreadMap,
  functionMap: FunctionMap,
  threadHandle?: string
): ThreadSamplesResult {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const thread = threadSelectors.getFilteredThread(state);
  const libs = getProfile(state).libs;

  // Get call trees for analysis
  const functionListTree = threadSelectors.getFunctionListTree(state);
  const callTree = threadSelectors.getCallTree(state);

  // Extract function data
  const functions = extractFunctionData(functionListTree, thread, libs);

  // Sort by total and take top 50
  const sortedByTotal = functions
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  // Sort by self and take top 50
  const sortedBySelf = functions
    .slice()
    .sort((a, b) => b.self - a.self)
    .slice(0, 50);

  // Convert top functions to structured format
  const topFunctionsByTotal: TopFunctionInfo[] = sortedByTotal.map((func) => ({
    functionHandle: functionMap.handleForFunction(
      threadIndexes,
      func.funcIndex
    ),
    functionIndex: func.funcIndex,
    name: func.funcName,
    nameWithLibrary: func.funcName, // Already includes library from extractFunctionData
    totalSamples: func.total,
    totalPercentage: func.totalRelative * 100,
    selfSamples: func.self,
    selfPercentage: func.selfRelative * 100,
    library: undefined, // Could extract from funcName if needed
  }));

  const topFunctionsBySelf: TopFunctionInfo[] = sortedBySelf.map((func) => ({
    functionHandle: functionMap.handleForFunction(
      threadIndexes,
      func.funcIndex
    ),
    functionIndex: func.funcIndex,
    name: func.funcName,
    nameWithLibrary: func.funcName, // Already includes library from extractFunctionData
    totalSamples: func.total,
    totalPercentage: func.totalRelative * 100,
    selfSamples: func.self,
    selfPercentage: func.selfRelative * 100,
    library: undefined, // Could extract from funcName if needed
  }));

  // Create a map from funcIndex to function data for quick lookup
  const funcMap = new Map(functions.map((f) => [f.funcIndex, f]));

  // Collect heaviest stack
  const roots = callTree.getRoots();
  let heaviestStack: ThreadSamplesResult['heaviestStack'] = {
    selfSamples: 0,
    frameCount: 0,
    frames: [],
  };

  if (roots.length > 0) {
    const heaviestPath: CallNodePath =
      callTree._internal.findHeaviestPathInSubtree(roots[0]);

    if (heaviestPath.length > 0) {
      const callNodeInfo = callTree._callNodeInfo;
      const leafNodeIndex = callNodeInfo.getCallNodeIndexFromPath(heaviestPath);

      if (leafNodeIndex !== null) {
        const leafNodeData = callTree.getNodeData(leafNodeIndex);

        heaviestStack = {
          selfSamples: leafNodeData.self,
          frameCount: heaviestPath.length,
          frames: heaviestPath.map((funcIndex) => {
            const funcName = formatFunctionNameWithLibrary(
              funcIndex,
              thread,
              libs
            );
            const funcData = funcMap.get(funcIndex);
            return {
              funcIndex,
              name: funcName,
              nameWithLibrary: funcName,
              totalSamples: funcData?.total ?? 0,
              totalPercentage: (funcData?.totalRelative ?? 0) * 100,
              selfSamples: funcData?.self ?? 0,
              selfPercentage: (funcData?.selfRelative ?? 0) * 100,
            };
          }),
        };
      }
    }
  }

  return {
    type: 'thread-samples',
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    topFunctionsByTotal,
    topFunctionsBySelf,
    heaviestStack,
  };
}

/**
 * Collect thread samples bottom-up data in structured format.
 * Shows the inverted call tree (callers of hot functions).
 */
export function collectThreadSamplesBottomUp(
  store: Store,
  threadMap: ThreadMap,
  functionMap: FunctionMap,
  threadHandle?: string,
  callTreeOptions?: CallTreeCollectionOptions
): ThreadSamplesBottomUpResult {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const thread = threadSelectors.getFilteredThread(state);

  // Collect inverted call tree
  let invertedCallTree = null;
  try {
    const callNodeInfo = threadSelectors.getCallNodeInfo(state);
    const categories = getCategories(state);
    const defaultCategory = getDefaultCategory(state);
    const weightType = threadSelectors.getWeightTypeForCallTree(state);

    const samples = threadSelectors.getPreviewFilteredCtssSamples(state);
    const sampleIndexToCallNodeIndex =
      threadSelectors.getSampleIndexToNonInvertedCallNodeIndexForFilteredThread(
        state
      );

    const callNodeSelfAndSummary = computeCallNodeSelfAndSummary(
      samples,
      sampleIndexToCallNodeIndex,
      callNodeInfo.getCallNodeTable().length
    );

    const invertedCallNodeInfo = getInvertedCallNodeInfo(
      callNodeInfo,
      defaultCategory,
      thread.funcTable.length
    );

    const invertedTimings = computeCallTreeTimings(
      invertedCallNodeInfo,
      callNodeSelfAndSummary
    );

    const invertedTree = getCallTree(
      thread,
      invertedCallNodeInfo,
      categories,
      invertedTimings,
      weightType
    );

    // Note: Bottom-up tree uses the same threadIndexes to generate function handles
    const libs = getProfile(state).libs;
    invertedCallTree = collectCallTree(
      invertedTree,
      functionMap,
      threadIndexes,
      libs,
      callTreeOptions
    );
  } catch (_e) {
    // Inverted tree creation failed, leave as null
  }

  return {
    type: 'thread-samples-bottom-up',
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    invertedCallTree,
  };
}

/**
 * Collect thread samples top-down data in structured format.
 * Shows the regular call tree (top-down view of hot paths).
 */
export function collectThreadSamplesTopDown(
  store: Store,
  threadMap: ThreadMap,
  functionMap: FunctionMap,
  threadHandle?: string,
  callTreeOptions?: CallTreeCollectionOptions
): ThreadSamplesTopDownResult {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const callTree = threadSelectors.getCallTree(state);
  const libs = getProfile(state).libs;

  // Collect regular call tree
  const regularCallTree = collectCallTree(
    callTree,
    functionMap,
    threadIndexes,
    libs,
    callTreeOptions
  );

  return {
    type: 'thread-samples-top-down',
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    regularCallTree,
  };
}

/**
 * Collect thread functions data in structured format.
 * Lists all functions with their CPU percentages, supporting search and filtering.
 */
export function collectThreadFunctions(
  store: Store,
  threadMap: ThreadMap,
  functionMap: FunctionMap,
  threadHandle?: string,
  filterOptions?: FunctionFilterOptions
): ThreadFunctionsResult {
  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const thread = threadSelectors.getFilteredThread(state);
  const libs = getProfile(state).libs;

  // Get function list tree
  const functionListTree = threadSelectors.getFunctionListTree(state);

  // Extract function data
  const allFunctions = extractFunctionData(functionListTree, thread, libs);
  const totalFunctionCount = allFunctions.length;

  // Check if we're zoomed (have committed ranges)
  const committedRanges = getAllCommittedRanges(state);
  const isZoomed = committedRanges.length > 0;

  // If zoomed, get full profile total samples for percentage calculation
  // We can compute this from any function in allFunctions that has a non-zero totalRelative
  // Formula: fullTotalSamples = total / totalRelative
  // But since totalRelative is based on current view, we need the UNzoomed totalRelative
  // Simpler approach: The raw thread has all samples - count them directly
  let fullProfileTotalSamples: number | null = null;
  if (isZoomed) {
    // Get the unfiltered thread to count total samples
    const rawThread = threadSelectors.getRawThread(state);
    fullProfileTotalSamples = rawThread.samples.length;
  }

  // Apply filters
  let filteredFunctions = allFunctions;

  // Filter by search string (case-insensitive substring match)
  if (filterOptions?.searchString) {
    const searchLower = filterOptions.searchString.toLowerCase();
    filteredFunctions = filteredFunctions.filter((func) =>
      func.funcName.toLowerCase().includes(searchLower)
    );
  }

  // Filter by minimum self time percentage
  if (filterOptions?.minSelf !== undefined) {
    const minSelfFraction = filterOptions.minSelf / 100;
    filteredFunctions = filteredFunctions.filter(
      (func) => func.selfRelative >= minSelfFraction
    );
  }

  // Sort by self time (descending)
  filteredFunctions.sort((a, b) => b.self - a.self);

  // Apply limit
  const limit = filterOptions?.limit ?? filteredFunctions.length;
  const limitedFunctions = filteredFunctions.slice(0, limit);

  // Convert to structured format
  const functions: ThreadFunctionsResult['functions'] = limitedFunctions.map(
    (func) => {
      const nameWithLibrary = func.funcName;
      // Extract library name if present (format: "library!function")
      const bangIndex = nameWithLibrary.indexOf('!');
      const library =
        bangIndex !== -1 ? nameWithLibrary.substring(0, bangIndex) : undefined;
      const name =
        bangIndex !== -1
          ? nameWithLibrary.substring(bangIndex + 1)
          : nameWithLibrary;

      // Get full profile percentages if zoomed
      let fullSelfPercentage: number | undefined;
      let fullTotalPercentage: number | undefined;
      if (fullProfileTotalSamples !== null) {
        // Calculate percentages relative to full profile
        fullSelfPercentage = (func.self / fullProfileTotalSamples) * 100;
        fullTotalPercentage = (func.total / fullProfileTotalSamples) * 100;
      }

      return {
        functionHandle: functionMap.handleForFunction(
          threadIndexes,
          func.funcIndex
        ),
        functionIndex: func.funcIndex,
        name,
        nameWithLibrary,
        selfSamples: func.self,
        selfPercentage: func.selfRelative * 100,
        totalSamples: func.total,
        totalPercentage: func.totalRelative * 100,
        library,
        fullSelfPercentage,
        fullTotalPercentage,
      };
    }
  );

  return {
    type: 'thread-functions',
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    totalFunctionCount,
    filteredFunctionCount: filteredFunctions.length,
    filters: filterOptions
      ? {
          searchString: filterOptions.searchString,
          minSelf: filterOptions.minSelf,
          limit: filterOptions.limit,
        }
      : undefined,
    functions,
  };
}
