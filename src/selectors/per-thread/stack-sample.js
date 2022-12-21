/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as UrlState from '../url-state';
import * as ProfileData from '../../profile-logic/profile-data';
import * as StackTiming from '../../profile-logic/stack-timing';
import * as FlameGraph from '../../profile-logic/flame-graph';
import * as CallTree from '../../profile-logic/call-tree';
import { PathSet } from '../../utils/path';
import * as ProfileSelectors from '../profile';
import { getRightClickedCallNodeInfo } from '../right-clicked-call-node';
import {
  getStackLineInfo,
  getLineTimings,
} from '../../profile-logic/line-timings';
import type { CallNodeInfoWithFuncMapping } from '../../profile-logic/profile-data';

import type {
  Thread,
  ThreadIndex,
  IndexIntoCategoryList,
  IndexIntoSamplesTable,
  WeightType,
  CallNodeInfo,
  CallNodePath,
  StackLineInfo,
  LineTimings,
  IndexIntoCallNodeTable,
  SelectedState,
  StartEndRange,
  Selector,
  $ReturnType,
  TracedTiming,
  ThreadsKey,
  IndexIntoFuncTable,
} from 'firefox-profiler/types';

import type { ThreadSelectorsPerThread } from './thread';

/**
 * Infer the return type from the getStackAndSampleSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type StackAndSampleSelectorsPerThread = $ReturnType<
  typeof getStackAndSampleSelectorsPerThread
>;

/**
 * Create the selectors for a thread that have to do with either stacks or samples.
 */
export function getStackAndSampleSelectorsPerThread(
  threadSelectors: ThreadSelectorsPerThread,
  threadIndexes: Set<ThreadIndex>,
  threadsKey: ThreadsKey
) {
  /**
   * The buffers of the samples can be cleared out. This function lets us know the
   * absolute range of samples that we have collected.
   */
  const unfilteredSamplesRange: Selector<StartEndRange | null> = createSelector(
    threadSelectors.getThread,
    ProfileSelectors.getProfileInterval,
    (thread, interval) => {
      const { time } = thread.samples;
      if (time.length === 0) {
        return null;
      }
      return { start: time[0], end: time[time.length - 1] + interval };
    }
  );

  const getCallNodeInfo: Selector<CallNodeInfo> = createSelector(
    threadSelectors.getFilteredThread,
    ProfileSelectors.getDefaultCategory,
    (
      { stackTable, frameTable, funcTable }: Thread,
      defaultCategory: IndexIntoCategoryList
    ): CallNodeInfo => {
      return ProfileData.getCallNodeInfo(
        stackTable,
        frameTable,
        funcTable,
        defaultCategory
      );
    }
  );

  const getFunctionTableCallNodeInfoWithFuncMapping: Selector<CallNodeInfoWithFuncMapping> =
    createSelector(
      threadSelectors.getFilteredThread,
      ProfileSelectors.getDefaultCategory,
      (
        { stackTable, frameTable, funcTable }: Thread,
        defaultCategory: IndexIntoCategoryList
      ): CallNodeInfoWithFuncMapping => {
        return ProfileData.getFunctionTableCallNodeInfoWithFuncMapping(
          stackTable,
          frameTable,
          funcTable,
          defaultCategory
        );
      }
    );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> =
    createSelector(
      threadSelectors.getFilteredThread,
      UrlState.getSourceViewFile,
      UrlState.getInvertCallstack,
      (
        { stackTable, frameTable, funcTable, stringTable }: Thread,
        sourceViewFile,
        invertCallStack
      ): StackLineInfo | null => {
        if (sourceViewFile === null) {
          return null;
        }
        return getStackLineInfo(
          stackTable,
          frameTable,
          funcTable,
          stringTable.indexForString(sourceViewFile),
          invertCallStack
        );
      }
    );

  const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions): CallNodePath => threadViewOptions.selectedCallNodePath
  );

  const getSelectedFunctionTableFunction: Selector<IndexIntoFuncTable | null> =
    createSelector(
      threadSelectors.getViewOptions,
      (threadViewOptions): IndexIntoFuncTable | null => {
        return threadViewOptions.selectedFunctionTableFunction;
      }
    );

  const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath) => {
        return ProfileData.getCallNodeIndexFromPath(
          callNodePath,
          callNodeInfo.callNodeTable
        );
      }
    );

  const getSelectedFunctionTableCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getFunctionTableCallNodeInfoWithFuncMapping,
      getSelectedFunctionTableFunction,
      (info, selectedFunction) => {
        return selectedFunction !== null
          ? info.funcToCallNodeIndex[selectedFunction]
          : null;
      }
    );

  const getExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions) => threadViewOptions.expandedCallNodePaths
  );

  const getExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    getCallNodeInfo,
    getExpandedCallNodePaths,
    ({ callNodeTable }, callNodePaths) =>
      ProfileData.getCallNodeIndicesFromPaths(
        Array.from(callNodePaths),
        callNodeTable
      )
  );

  const getSamplesSelectedStatesInFilteredThread: Selector<
    null | SelectedState[]
  > = createSelector(
    threadSelectors.getFilteredThread,
    threadSelectors.getTabFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    getFunctionTableCallNodeInfoWithFuncMapping,
    getSelectedFunctionTableCallNodeIndex,
    UrlState.getSelectedTab,
    (
      thread,
      tabFilteredThread,
      callNodeInfo,
      selectedCallNode,
      functionTableCallNodeInfo,
      selectedFunctionTableCallNodeIndex,
      selectedTab
    ) => {
      if (thread.isJsTracer) {
        // This is currently to slow to compute in JS Tracer threads.
        return null;
      }
      if (selectedTab === 'calltree' && selectedCallNode !== null) {
        const { info, selected } = {
          info: callNodeInfo,
          selected: selectedCallNode,
        };
        const { callNodeTable, stackIndexToCallNodeIndex } = info;
        const sampleIndexToCallNodeIndex =
          ProfileData.getSampleIndexToCallNodeIndex(
            thread.samples.stack,
            stackIndexToCallNodeIndex
          );
        const activeTabFilteredCallNodeIndex =
          ProfileData.getSampleIndexToCallNodeIndex(
            tabFilteredThread.samples.stack,
            stackIndexToCallNodeIndex
          );
        return ProfileData.getSamplesSelectedStates(
          callNodeTable,
          sampleIndexToCallNodeIndex,
          activeTabFilteredCallNodeIndex,
          selected
        );
      } else if (selectedTab === 'function-table') {
        const { stackIndexToCallNodeIndex } =
          functionTableCallNodeInfo.callNodeInfo;
        const sampleIndexToCallNodeIndex =
          ProfileData.getSampleIndexToCallNodeIndex(
            thread.samples.stack,
            stackIndexToCallNodeIndex
          );
        const activeTabFilteredCallNodeIndex =
          ProfileData.getSampleIndexToCallNodeIndex(
            tabFilteredThread.samples.stack,
            stackIndexToCallNodeIndex
          );
        return ProfileData.getSamplesSelectedStatesForFunction(
          functionTableCallNodeInfo,
          sampleIndexToCallNodeIndex,
          activeTabFilteredCallNodeIndex,
          selectedFunctionTableCallNodeIndex,
          tabFilteredThread
        );
      }
      return null;
    }
  );

  const getTreeOrderComparatorInFilteredThread: Selector<
    (IndexIntoSamplesTable, IndexIntoSamplesTable) => number
  > = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    (thread, { callNodeTable, stackIndexToCallNodeIndex }) => {
      const sampleIndexToCallNodeIndex =
        ProfileData.getSampleIndexToCallNodeIndex(
          thread.samples.stack,
          stackIndexToCallNodeIndex
        );
      return ProfileData.getTreeOrderComparator(
        callNodeTable,
        sampleIndexToCallNodeIndex
      );
    }
  );

  const getFilteredCallNodeMaxDepth: Selector<number> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  const getPreviewFilteredCallNodeMaxDepth: Selector<number> = createSelector(
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  /**
   * When computing the call tree, a "samples" table is used, which
   * can represent a variety of formats with different weight types.
   * This selector uses that table's weight type if it exists, or
   * defaults to samples, which the Gecko Profiler outputs by default.
   */
  const getWeightTypeForCallTree: Selector<WeightType> = createSelector(
    // The weight type is not changed by the filtering done on the profile.
    threadSelectors.getUnfilteredSamplesForCallTree,
    (samples) => samples.weightType || 'samples'
  );

  const getCallTreeCountsAndSummary: Selector<CallTree.CallTreeCountsAndSummary> =
    createSelector(
      threadSelectors.getPreviewFilteredSamplesForCallTree,
      getCallNodeInfo,
      ProfileSelectors.getProfileInterval,
      UrlState.getInvertCallstack,
      CallTree.computeCallTreeCountsAndSummary
    );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    ProfileSelectors.getProfileInterval,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    UrlState.getImplementationFilter,
    getCallTreeCountsAndSummary,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getFunctionTableCallTreeCountsAndSummary: Selector<CallTree.CallTreeCountsAndSummary> =
    createSelector(
      //threadSelectors.getPreviewFilteredThread,
      threadSelectors.getFilteredThread,
      ProfileSelectors.getPreviewSelection,
      threadSelectors.getFilteredSamplesForCallTree,
      getFunctionTableCallNodeInfoWithFuncMapping,
      (thread, previewSelection, samples, info) => {
        let selectionStart = 0;
        let selectionEnd = samples.length;
        if (previewSelection.hasSelection) {
          [selectionStart, selectionEnd] =
            ProfileData.getSampleIndexRangeForSelection(
              samples,
              previewSelection.selectionStart,
              previewSelection.selectionEnd
            );
        }
        return CallTree.computeFunctionTableCallTreeCountsAndSummary(
          thread,
          samples,
          info,
          selectionStart,
          selectionEnd
        );
      }
    );

  /** returns a flat call tree used for the FunctionTable view */
  const getFunctionTableCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    ProfileSelectors.getProfileInterval,
    getFunctionTableCallNodeInfoWithFuncMapping,
    ProfileSelectors.getCategories,
    UrlState.getImplementationFilter,
    getFunctionTableCallTreeCountsAndSummary,
    getWeightTypeForCallTree,
    CallTree.getFunctionTableCallTree
  );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getLineTimings
  );

  const getTracedTiming: Selector<TracedTiming | null> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileSelectors.getProfileInterval,
    UrlState.getInvertCallstack,
    CallTree.computeTracedTiming
  );

  const getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth> =
    createSelector(
      threadSelectors.getFilteredSamplesForCallTree,
      getCallNodeInfo,
      getFilteredCallNodeMaxDepth,
      ProfileSelectors.getProfileInterval,
      StackTiming.getStackTimingByDepth
    );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      threadSelectors.getPreviewFilteredThread,
      getCallNodeInfo,
      getCallTreeCountsAndSummary,
      FlameGraph.getFlameGraphTiming
    );

  const getRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getCallNodeInfo,
      (rightClickedCallNodeInfo, { callNodeTable }) => {
        if (
          rightClickedCallNodeInfo !== null &&
          threadsKey === rightClickedCallNodeInfo.threadsKey
        ) {
          return ProfileData.getCallNodeIndexFromPath(
            rightClickedCallNodeInfo.callNodePath,
            callNodeTable
          );
        }

        return null;
      }
    );

  return {
    unfilteredSamplesRange,
    getWeightTypeForCallTree,
    getCallNodeInfo,
    getFunctionTableCallNodeInfoWithFuncMapping,
    getSourceViewStackLineInfo,
    getSelectedCallNodePath,
    getSelectedCallNodeIndex,
    getExpandedCallNodePaths,
    getExpandedCallNodeIndexes,
    getSelectedFunctionTableCallNodeIndex,
    getSelectedFunctionTableFunction,
    getSamplesSelectedStatesInFilteredThread,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getFunctionTableCallTree,
    getSourceViewLineTimings,
    getTracedTiming,
    getStackTimingByDepth,
    getFilteredCallNodeMaxDepth,
    getPreviewFilteredCallNodeMaxDepth,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
  };
}
