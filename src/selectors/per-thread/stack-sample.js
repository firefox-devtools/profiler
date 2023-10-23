/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  createSelector,
  createSelectorCreator,
  defaultMemoize,
} from 'reselect';
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
import {
  getStackAddressInfo,
  getAddressTimings,
} from '../../profile-logic/address-timings';

import type {
  Thread,
  ThreadIndex,
  IndexIntoSamplesTable,
  WeightType,
  CallNodeInfo,
  CallNodePath,
  StackLineInfo,
  StackAddressInfo,
  LineTimings,
  AddressTimings,
  IndexIntoCallNodeTable,
  IndexIntoNativeSymbolTable,
  SelectedState,
  StartEndRange,
  Selector,
  $ReturnType,
  TracedTiming,
  ThreadsKey,
} from 'firefox-profiler/types';

import type { ThreadSelectorsPerThread } from './thread';
import type { MarkerSelectorsPerThread } from './markers';

/**
 * Infer the return type from the getStackAndSampleSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type StackAndSampleSelectorsPerThread = $ReturnType<
  typeof getStackAndSampleSelectorsPerThread,
>;

type ThreadAndMarkerSelectorsPerThread = {|
  ...ThreadSelectorsPerThread,
  ...MarkerSelectorsPerThread,
|};

// A variant of createSelector which caches the value for two most recent keys,
// not just for the single most recent key.
const createSelectorWithTwoCacheSlots = createSelectorCreator(defaultMemoize, {
  maxSize: 2,
});

/**
 * Create the selectors for a thread that have to do with either stacks or samples.
 */
export function getStackAndSampleSelectorsPerThread(
  threadSelectors: ThreadAndMarkerSelectorsPerThread,
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

  // A selector for getCallNodeInfo.
  // getCallNodeInfo can be very expensive, so we want to minimize the number of
  // times it gets called, in particular when transforms are applied and unapplied
  // or when the filtered time range changes.
  // To do this, the memoization cache key is not based on the thread object's
  // identity (which changes if e.g. only a thread's samples table changes),
  // but on the identities of just the subset of thread tables that are used by
  // getCallNodeInfo. This avoids recomputations when samples are dropped.
  // In addition, we use createSelectorWithTwoCacheSlots so that removing the last
  // transform is fast. This lets you quickly go back and forth between a focused
  // function and the whole profile.
  const getNonInvertedCallNodeInfo: Selector<CallNodeInfo> =
    createSelectorWithTwoCacheSlots(
      (state) => threadSelectors.getFilteredThread(state).stackTable,
      (state) => threadSelectors.getFilteredThread(state).frameTable,
      (state) => threadSelectors.getFilteredThread(state).funcTable,
      ProfileSelectors.getDefaultCategory,
      ProfileData.getCallNodeInfo
    );

  const getCallNodeInfo: Selector<CallNodeInfo> =
    createSelectorWithTwoCacheSlots(
      threadSelectors.getFilteredThread,
      getNonInvertedCallNodeInfo,
      UrlState.getInvertCallstack,
      ProfileSelectors.getDefaultCategory,
      (thread, nonInvertedCallNodeInfo, invertCallStack, defaultCategory) => {
        if (!invertCallStack) {
          return nonInvertedCallNodeInfo;
        }
        return ProfileData.getInvertedCallNodeInfo(
          thread,
          nonInvertedCallNodeInfo.getNonInvertedCallNodeTable(),
          nonInvertedCallNodeInfo.getStackIndexToNonInvertedCallNodeIndex(),
          defaultCategory
        );
      }
    );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> =
    createSelector(
      threadSelectors.getFilteredThread,
      UrlState.getSourceViewFile,
      (
        { stackTable, frameTable, funcTable, stringTable }: Thread,
        sourceViewFile
      ): StackLineInfo | null => {
        if (sourceViewFile === null) {
          return null;
        }
        return getStackLineInfo(
          stackTable,
          frameTable,
          funcTable,
          stringTable.indexForString(sourceViewFile)
        );
      }
    );

  // Converts the global NativeSymbolInfo into an index into selectedFilteredThread.nativeSymbols.
  const getAssemblyViewNativeSymbolIndex: Selector<IndexIntoNativeSymbolTable | null> =
    createSelector(
      threadSelectors.getFilteredThread,
      UrlState.getAssemblyViewNativeSymbol,
      ({ nativeSymbols }: Thread, nativeSymbolInfo) => {
        if (nativeSymbolInfo === null) {
          return null;
        }
        return nativeSymbols.address.findIndex(
          (address, i) =>
            address === nativeSymbolInfo.address &&
            nativeSymbols.libIndex[i] === nativeSymbolInfo.libIndex
        );
      }
    );

  const getAssemblyViewStackAddressInfo: Selector<StackAddressInfo | null> =
    createSelector(
      threadSelectors.getFilteredThread,
      getAssemblyViewNativeSymbolIndex,
      (
        { stackTable, frameTable, funcTable }: Thread,
        nativeSymbolIndex
      ): StackAddressInfo | null => {
        if (nativeSymbolIndex === null) {
          return null;
        }
        return getStackAddressInfo(
          stackTable,
          frameTable,
          funcTable,
          nativeSymbolIndex
        );
      }
    );

  const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions): CallNodePath => threadViewOptions.selectedCallNodePath
  );

  const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath) => {
        return callNodeInfo.getCallNodeIndexFromPath(callNodePath);
      }
    );

  const getExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions) => threadViewOptions.expandedCallNodePaths
  );

  const getExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    getCallNodeInfo,
    getExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      callNodeInfo.getCallNodeIndicesFromPaths(Array.from(callNodePaths))
  );

  const getSampleIndexToCallNodeIndexForFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    (state) => threadSelectors.getFilteredThread(state).samples.stack,
    (state) => getCallNodeInfo(state).getStackIndexToCallNodeIndex(),
    (filteredThreadSampleStacks, stackIndexToCallNodeIndex) =>
      ProfileData.getSampleIndexToCallNodeIndex(
        filteredThreadSampleStacks,
        stackIndexToCallNodeIndex
      )
  );

  const getSampleIndexToNonInvertedCallNodeIndexForFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    (state) => threadSelectors.getFilteredThread(state).samples.stack,
    (state) => getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    (filteredThreadSampleStacks, stackIndexToNonInvertedCallNodeIndex) =>
      ProfileData.getSampleIndexToCallNodeIndex(
        filteredThreadSampleStacks,
        stackIndexToNonInvertedCallNodeIndex
      )
  );

  const getSampleIndexToNonInvertedCallNodeIndexForTabFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    (state) => threadSelectors.getTabFilteredThread(state).samples.stack,
    (state) => getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    (tabFilteredThreadSampleStacks, stackIndexToNonInvertedCallNodeIndex) =>
      ProfileData.getSampleIndexToCallNodeIndex(
        tabFilteredThreadSampleStacks,
        stackIndexToNonInvertedCallNodeIndex
      )
  );

  const getSamplesSelectedStatesInFilteredThread: Selector<
    null | SelectedState[],
  > = createSelector(
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getSampleIndexToNonInvertedCallNodeIndexForTabFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    (
      sampleIndexToNonInvertedCallNodeIndex,
      activeTabFilteredNonInvertedCallNodeIndex,
      callNodeInfo,
      selectedCallNode
    ) => {
      return ProfileData.getSamplesSelectedStates(
        callNodeInfo,
        sampleIndexToNonInvertedCallNodeIndex,
        activeTabFilteredNonInvertedCallNodeIndex,
        selectedCallNode
      );
    }
  );

  const getTreeOrderComparatorInFilteredThread: Selector<
    (IndexIntoSamplesTable, IndexIntoSamplesTable) => number,
  > = createSelector(
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getCallNodeInfo,
    ProfileData.getTreeOrderComparator
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
      (samples, callNodeInfo, interval, invertCallStack) => {
        const sampleIndexToCallNodeIndex =
          ProfileData.getSampleIndexToCallNodeIndex(
            samples.stack,
            callNodeInfo.getStackIndexToCallNodeIndex()
          );
        return CallTree.computeCallTreeCountsAndSummary(
          samples,
          sampleIndexToCallNodeIndex,
          callNodeInfo,
          invertCallStack
        );
      }
    );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    getCallTreeCountsAndSummary,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    threadSelectors.getPreviewFilteredSamplesForCallTree,
    getLineTimings
  );

  const getAssemblyViewAddressTimings: Selector<AddressTimings> =
    createSelector(
      getAssemblyViewStackAddressInfo,
      threadSelectors.getPreviewFilteredSamplesForCallTree,
      getAddressTimings
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

  const getFlameGraphOrderedCallNodeRows: Selector<FlameGraph.OrderedCallNodeRows> =
    createSelector(
      (state) => getCallNodeInfo(state).getNonInvertedCallNodeTable(),
      (state) => threadSelectors.getFilteredThread(state).funcTable,
      (state) => threadSelectors.getFilteredThread(state).stringTable,
      FlameGraph.computeOrderedCallNodeRows
    );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      getFlameGraphOrderedCallNodeRows,
      (state) => getCallNodeInfo(state).getNonInvertedCallNodeTable(),
      getCallTreeCountsAndSummary,
      FlameGraph.getFlameGraphTiming
    );

  const getRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getCallNodeInfo,
      (rightClickedCallNodeInfo, callNodeInfo) => {
        if (
          rightClickedCallNodeInfo !== null &&
          threadsKey === rightClickedCallNodeInfo.threadsKey
        ) {
          return callNodeInfo.getCallNodeIndexFromPath(
            rightClickedCallNodeInfo.callNodePath
          );
        }

        return null;
      }
    );

  return {
    unfilteredSamplesRange,
    getWeightTypeForCallTree,
    getCallNodeInfo,
    getSourceViewStackLineInfo,
    getAssemblyViewNativeSymbolIndex,
    getAssemblyViewStackAddressInfo,
    getSelectedCallNodePath,
    getSelectedCallNodeIndex,
    getExpandedCallNodePaths,
    getExpandedCallNodeIndexes,
    getSampleIndexToCallNodeIndexForFilteredThread,
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getSamplesSelectedStatesInFilteredThread,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getSourceViewLineTimings,
    getAssemblyViewAddressTimings,
    getTracedTiming,
    getStackTimingByDepth,
    getFilteredCallNodeMaxDepth,
    getPreviewFilteredCallNodeMaxDepth,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
  };
}
