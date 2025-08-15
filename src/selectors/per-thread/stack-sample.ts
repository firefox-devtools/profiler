/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
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
import type { PathSet } from '../../utils/path';
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
  IndexIntoSamplesTable,
  WeightType,
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
  ThreadsKey,
  SelfAndTotal,
  CallNodeTable,
  CallNodeSelfAndSummary,
  State,
  CallNodeTableBitSet,
} from 'firefox-profiler/types';
import type {
  CallNodeInfo,
  CallNodeInfoInverted,
} from 'firefox-profiler/profile-logic/call-node-info';

import type { ThreadSelectorsPerThread } from './thread';
import type { MarkerSelectorsPerThread } from './markers';

/**
 * Infer the return type from the getStackAndSampleSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type StackAndSampleSelectorsPerThread = ReturnType<
  typeof getStackAndSampleSelectorsPerThread
>;

type ThreadAndMarkerSelectorsPerThread = ThreadSelectorsPerThread &
  MarkerSelectorsPerThread;

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

  // A selector for the non-inverted call node info.
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
  const _getNonInvertedCallNodeInfo: Selector<CallNodeInfo> =
    createSelectorWithTwoCacheSlots(
      (state: State) => threadSelectors.getFilteredThread(state).stackTable,
      (state: State) => threadSelectors.getFilteredThread(state).frameTable,
      ProfileSelectors.getDefaultCategory,
      ProfileData.getCallNodeInfo
    );

  const _getInvertedCallNodeInfo: Selector<CallNodeInfoInverted> =
    createSelectorWithTwoCacheSlots(
      _getNonInvertedCallNodeInfo,
      ProfileSelectors.getDefaultCategory,
      (state: State) =>
        threadSelectors.getFilteredThread(state).funcTable.length,
      ProfileData.getInvertedCallNodeInfo
    );

  const getCallNodeInfo: Selector<CallNodeInfo> = (state) => {
    if (UrlState.getInvertCallstack(state)) {
      return _getInvertedCallNodeInfo(state);
    }
    return _getNonInvertedCallNodeInfo(state);
  };

  const _getCallNodeTable: Selector<CallNodeTable> = (state) =>
    _getNonInvertedCallNodeInfo(state).getCallNodeTable();

  const _getCallNodeFuncIsDuplicate: Selector<CallNodeTableBitSet> =
    createSelector(
      _getCallNodeTable,
      ProfileData.computeCallNodeFuncIsDuplicate
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
    UrlState.getInvertCallstack,
    (threadViewOptions, invertCallStack): CallNodePath =>
      invertCallStack
        ? threadViewOptions.selectedInvertedCallNodePath
        : threadViewOptions.selectedNonInvertedCallNodePath
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
    UrlState.getInvertCallstack,
    (threadViewOptions, invertCallStack) =>
      invertCallStack
        ? threadViewOptions.expandedInvertedCallNodePaths
        : threadViewOptions.expandedNonInvertedCallNodePaths
  );

  const getExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    getCallNodeInfo,
    getExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      Array.from(callNodePaths).map((path) =>
        callNodeInfo.getCallNodeIndexFromPath(path)
      )
  );

  const _getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredCtssThread: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) =>
      threadSelectors.getPreviewFilteredCtssSamples(state).stack,
    (state: State) =>
      getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const _getSampleIndexToNonInvertedCallNodeIndexForFilteredCtssThread: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) => threadSelectors.getFilteredCtssSamples(state).stack,
    (state: State) =>
      getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const getSampleIndexToNonInvertedCallNodeIndexForFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) => threadSelectors.getFilteredThread(state).samples.stack,
    (state: State) =>
      getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const getSamplesSelectedStatesInFilteredThread: Selector<
    null | SelectedState[]
  > = createSelector(
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    (sampleIndexToNonInvertedCallNodeIndex, callNodeInfo, selectedCallNode) => {
      return ProfileData.getSamplesSelectedStates(
        callNodeInfo,
        sampleIndexToNonInvertedCallNodeIndex,
        selectedCallNode
      );
    }
  );

  const getTreeOrderComparatorInFilteredThread: Selector<
    (
      sampleIndexA: IndexIntoSamplesTable,
      sampleIndexB: IndexIntoSamplesTable
    ) => number
  > = createSelector(
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getCallNodeInfo,
    ProfileData.getTreeOrderComparator
  );

  const getFilteredCallNodeMaxDepthPlusOne: Selector<number> = createSelector(
    threadSelectors.getFilteredCtssSamples,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepthPlusOne
  );

  /**
   * When computing the call tree, a "samples" table is used, which
   * can represent a variety of formats with different weight types.
   * This selector uses that table's weight type if it exists, or
   * defaults to samples, which the Gecko Profiler outputs by default.
   */
  const getWeightTypeForCallTree: Selector<WeightType> = createSelector(
    // The weight type is not changed by the filtering done on the profile.
    threadSelectors.getUnfilteredCtssSamples,
    (samples) => samples.weightType || 'samples'
  );

  const getCallNodeSelfAndSummary: Selector<CallNodeSelfAndSummary> =
    createSelector(
      threadSelectors.getPreviewFilteredCtssSamples,
      _getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredCtssThread,
      getCallNodeInfo,
      (samples, sampleIndexToCallNodeIndex, callNodeInfo) => {
        return CallTree.computeCallNodeSelfAndSummary(
          samples,
          sampleIndexToCallNodeIndex,
          callNodeInfo.getCallNodeTable().length
        );
      }
    );

  const getCallTreeTimings: Selector<CallTree.CallTreeTimings> = createSelector(
    getCallNodeInfo,
    getCallNodeSelfAndSummary,
    CallTree.computeCallTreeTimings
  );

  const getCallTreeTimingsNonInverted: Selector<CallTree.CallTreeTimingsNonInverted> =
    createSelector(
      getCallNodeInfo,
      getCallNodeSelfAndSummary,
      CallTree.computeCallTreeTimingsNonInverted
    );

  const getFunctionListTimings: Selector<CallTree.CallTreeTimingsFunctionList> =
    createSelector(
      _getCallNodeTable,
      _getCallNodeFuncIsDuplicate,
      getCallNodeSelfAndSummary,
      (state: State) =>
        threadSelectors.getFilteredThread(state).funcTable.length,
      CallTree.computeFunctionListTimings
    );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getFilteredThread,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    getCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getFunctionListTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getFilteredThread,
    _getInvertedCallNodeInfo,
    ProfileSelectors.getCategories,
    getFunctionListTimings,
    getWeightTypeForCallTree,
    (
      thread,
      callNodeInfoInverted,
      categories,
      functionListTimings,
      weightType
    ) =>
      CallTree.getCallTree(
        thread,
        callNodeInfoInverted,
        categories,
        { type: 'FUNCTION_LIST', timings: functionListTimings },
        weightType
      )
  );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    threadSelectors.getPreviewFilteredCtssSamples,
    getLineTimings
  );

  const getAssemblyViewAddressTimings: Selector<AddressTimings> =
    createSelector(
      getAssemblyViewStackAddressInfo,
      threadSelectors.getPreviewFilteredCtssSamples,
      getAddressTimings
    );

  const getTracedTiming: Selector<CallTree.CallTreeTimings | null> =
    createSelector(
      threadSelectors.getPreviewFilteredCtssSamples,
      _getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredCtssThread,
      getCallNodeInfo,
      ProfileSelectors.getProfileInterval,
      (samples, sampleIndexToCallNodeIndex, callNodeInfo, interval) => {
        const CallNodeSelfAndSummary =
          CallTree.computeCallNodeTracedSelfAndSummary(
            samples,
            sampleIndexToCallNodeIndex,
            callNodeInfo.getCallNodeTable().length,
            interval
          );
        if (CallNodeSelfAndSummary === null) {
          return null;
        }
        return CallTree.computeCallTreeTimings(
          callNodeInfo,
          CallNodeSelfAndSummary
        );
      }
    );

  const getTracedSelfAndTotalForSelectedCallNode: Selector<SelfAndTotal | null> =
    createSelector(
      getSelectedCallNodeIndex,
      getCallNodeInfo,
      getTracedTiming,
      (selectedCallNodeIndex, callNodeInfo, tracedTiming) => {
        if (selectedCallNodeIndex === null || tracedTiming === null) {
          return null;
        }
        return CallTree.getSelfAndTotalForCallNode(
          selectedCallNodeIndex,
          callNodeInfo,
          tracedTiming
        );
      }
    );

  const _getStackTimingByDepthWithMap: Selector<StackTiming.StackTimingByDepthWithMap> =
    createSelector(
      threadSelectors.getFilteredCtssSamples,
      _getSampleIndexToNonInvertedCallNodeIndexForFilteredCtssThread,
      getCallNodeInfo,
      getFilteredCallNodeMaxDepthPlusOne,
      ProfileSelectors.getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
  const getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth> = (
    state
  ) => _getStackTimingByDepthWithMap(state).timings;
  const getSameWidthsIndexToTimestampMap: Selector<
    StackTiming.SameWidthsIndexToTimestampMap
  > = (state) =>
    _getStackTimingByDepthWithMap(state).sameWidthsIndexToTimestampMap;

  const getFlameGraphRows: Selector<FlameGraph.FlameGraphRows> = createSelector(
    (state: State) => getCallNodeInfo(state).getCallNodeTable(),
    (state: State) => threadSelectors.getFilteredThread(state).funcTable,
    (state: State) => threadSelectors.getFilteredThread(state).stringTable,
    FlameGraph.computeFlameGraphRows
  );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      getFlameGraphRows,
      (state: State) => getCallNodeInfo(state).getCallNodeTable(),
      getCallTreeTimingsNonInverted,
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
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getSamplesSelectedStatesInFilteredThread,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getFunctionListTree,
    getSourceViewLineTimings,
    getAssemblyViewAddressTimings,
    getTracedTiming,
    getTracedSelfAndTotalForSelectedCallNode,
    getStackTimingByDepth,
    getSameWidthsIndexToTimestampMap,
    getFilteredCallNodeMaxDepthPlusOne,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
  };
}
