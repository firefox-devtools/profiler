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

import type {
  IndexIntoCategoryList,
  Thread,
  IndexIntoSamplesTable,
} from '../../types/profile';
import type {
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
  SelectedState,
} from '../../types/profile-derived';
import type { StartEndRange } from '../../types/units';
import type { Selector } from '../../types/store';
import type { $ReturnType } from '../../types/utils';
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
  threadSelectors: ThreadSelectorsPerThread
): * {
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

  const getCallNodeMaxDepth: Selector<number> = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions): CallNodePath => threadViewOptions.selectedCallNodePath
  );

  const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = createSelector(
    getCallNodeInfo,
    getSelectedCallNodePath,
    (callNodeInfo, callNodePath) => {
      return ProfileData.getCallNodeIndexFromPath(
        callNodePath,
        callNodeInfo.callNodeTable
      );
    }
  );

  const getRightClickedCallNodePath: Selector<CallNodePath | null> = state =>
    threadSelectors.getViewOptions(state).rightClickedCallNodePath;

  const getRightClickedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = createSelector(
    getCallNodeInfo,
    getRightClickedCallNodePath,
    ({ callNodeTable }, callNodePath): IndexIntoCallNodeTable | null => {
      if (callNodePath === null) {
        return null;
      }

      return ProfileData.getCallNodeIndexFromPath(callNodePath, callNodeTable);
    }
  );

  const getExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    threadViewOptions => threadViewOptions.expandedCallNodePaths
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
    SelectedState[]
  > = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    (
      thread,
      { callNodeTable, stackIndexToCallNodeIndex },
      selectedCallNode
    ) => {
      const sampleCallNodes = ProfileData.getSampleCallNodes(
        thread.samples,
        stackIndexToCallNodeIndex
      );
      return ProfileData.getSamplesSelectedStates(
        callNodeTable,
        sampleCallNodes,
        selectedCallNode
      );
    }
  );

  const getTreeOrderComparatorInFilteredThread: Selector<
    (IndexIntoSamplesTable, IndexIntoSamplesTable) => number
  > = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    (thread, { callNodeTable, stackIndexToCallNodeIndex }) => {
      const sampleCallNodes = ProfileData.getSampleCallNodes(
        thread.samples,
        stackIndexToCallNodeIndex
      );
      return ProfileData.getTreeOrderComparator(callNodeTable, sampleCallNodes);
    }
  );

  const getCallTreeCountsAndTimings: Selector<CallTree.CallTreeCountsAndTimings> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    UrlState.getInvertCallstack,
    CallTree.computeCallTreeCountsAndTimings
  );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    UrlState.getImplementationFilter,
    getCallTreeCountsAndTimings,
    CallTree.getCallTree
  );

  const getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth> = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    getCallNodeMaxDepth,
    StackTiming.getStackTimingByDepth
  );

  const getCallNodeMaxDepthForFlameGraph: Selector<number> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepth
  );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    getCallTreeCountsAndTimings,
    FlameGraph.getFlameGraphTiming
  );

  return {
    unfilteredSamplesRange,
    getCallNodeInfo,
    getCallNodeMaxDepth,
    getSelectedCallNodePath,
    getSelectedCallNodeIndex,
    getRightClickedCallNodePath,
    getRightClickedCallNodeIndex,
    getExpandedCallNodePaths,
    getExpandedCallNodeIndexes,
    getSamplesSelectedStatesInFilteredThread,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getStackTimingByDepth,
    getCallNodeMaxDepthForFlameGraph,
    getFlameGraphTiming,
  };
}
