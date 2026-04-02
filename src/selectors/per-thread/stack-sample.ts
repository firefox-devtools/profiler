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
import * as Transforms from '../../profile-logic/transforms';
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
  StartEndRange,
  Selector,
  ThreadsKey,
  SelfAndTotal,
  CallNodeTable,
  CallNodeSelfAndSummary,
  State,
  CallNodeTableBitSet,
  IndexIntoFuncTable,
  IndexIntoStackTable,
  SamplesLikeTable,
  SampleCategoriesAndSubcategories,
} from 'firefox-profiler/types';
import type {
  CallNodeInfo,
  CallNodeInfoInverted,
} from 'firefox-profiler/profile-logic/call-node-info';

import type { ThreadSelectorsPerThread } from './thread';
import type { MarkerSelectorsPerThread } from './markers';
import memoize from 'memoize-immutable';

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

// Memoize some of these functions globally, so that in the common case we only
// need to compute the call node table once globally instead of per thread. The
// call node table is computed from the tables inside the filtered thread, so
// unless there's per-thread transforms, those tables will be the same instance
// from the profile shared data, and the memoization will hit the cache.
const globallyMemoizedGetCallNodeInfo = memoize(ProfileData.getCallNodeInfo, {
  limit: 2,
});
const globallyMemoizedGetInvertedCallNodeInfo = memoize(
  ProfileData.getInvertedCallNodeInfo,
  { limit: 2 }
);

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
      globallyMemoizedGetCallNodeInfo
    );

  const _getInvertedCallNodeInfo: Selector<CallNodeInfoInverted> =
    createSelectorWithTwoCacheSlots(
      _getNonInvertedCallNodeInfo,
      ProfileSelectors.getDefaultCategory,
      (state: State) =>
        threadSelectors.getFilteredThread(state).funcTable.length,
      globallyMemoizedGetInvertedCallNodeInfo
    );

  const getCallNodeInfo: Selector<CallNodeInfo> = (state) => {
    if (UrlState.getInvertCallstack(state)) {
      return _getInvertedCallNodeInfo(state);
    }
    return _getNonInvertedCallNodeInfo(state);
  };

  const _getCallNodeTable: Selector<CallNodeTable> = (state) =>
    _getNonInvertedCallNodeInfo(state).getCallNodeTable();

  const getLowerWingCallNodeInfo = _getInvertedCallNodeInfo;

  const _getCallNodeFuncIsDuplicate: Selector<CallNodeTableBitSet> =
    createSelector(
      _getCallNodeTable,
      ProfileData.computeCallNodeFuncIsDuplicate
    );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> =
    createSelector(
      threadSelectors.getFilteredThread,
      UrlState.getSourceViewSourceIndex,
      (
        { stackTable, frameTable, funcTable }: Thread,
        sourceIndex
      ): StackLineInfo | null => {
        if (sourceIndex === null) {
          return null;
        }
        return getStackLineInfo(stackTable, frameTable, funcTable, sourceIndex);
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

  const getSelectedFunctionIndex: Selector<IndexIntoFuncTable | null> =
    createSelector(
      threadSelectors.getViewOptions,
      (threadViewOptions): IndexIntoFuncTable | null => {
        return threadViewOptions.selectedFunctionIndex;
      }
    );

  const getUpperWingCallNodeInfo: Selector<CallNodeInfo> = createSelector(
    _getNonInvertedCallNodeInfo,
    getSelectedFunctionIndex,
    (state: State) => threadSelectors.getFilteredThread(state).stackTable,
    (state: State) => threadSelectors.getFilteredThread(state).frameTable,
    (state: State) => threadSelectors.getFilteredThread(state).funcTable.length,
    ProfileSelectors.getDefaultCategory,
    ProfileData.createUpperWingCallNodeInfo
  );

  const getLowerWingSelectedCallNodePath: Selector<CallNodePath> =
    createSelector(
      threadSelectors.getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedLowerWingCallNodePath
    );

  const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
    threadSelectors.getViewOptions,
    UrlState.getInvertCallstack,
    (threadViewOptions, invertCallStack): CallNodePath =>
      invertCallStack
        ? threadViewOptions.selectedInvertedCallNodePath
        : threadViewOptions.selectedNonInvertedCallNodePath
  );

  const getUpperWingSelectedCallNodePath: Selector<CallNodePath> =
    createSelector(
      threadSelectors.getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedUpperWingCallNodePath
    );

  const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath) => {
        return callNodeInfo.getCallNodeIndexFromPath(callNodePath);
      }
    );

  const getLowerWingSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getLowerWingCallNodeInfo,
      getLowerWingSelectedCallNodePath,
      (callNodeInfo, callNodePath) => {
        return callNodeInfo.getCallNodeIndexFromPath(callNodePath);
      }
    );

  const getUpperWingSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> =
    createSelector(
      getUpperWingCallNodeInfo,
      getUpperWingSelectedCallNodePath,
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

  const getLowerWingExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions) => threadViewOptions.expandedLowerWingCallNodePaths
  );

  const getUpperWingExpandedCallNodePaths: Selector<PathSet> = createSelector(
    threadSelectors.getViewOptions,
    (threadViewOptions) => threadViewOptions.expandedUpperWingCallNodePaths
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

  const getLowerWingExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    getLowerWingCallNodeInfo,
    getLowerWingExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      Array.from(callNodePaths).map((path) =>
        callNodeInfo.getCallNodeIndexFromPath(path)
      )
  );

  const getUpperWingExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    getUpperWingCallNodeInfo,
    getUpperWingExpandedCallNodePaths,
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

  const _getPreviewFilteredCtssSampleIndexToUpperWingCallNodeIndex: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) =>
      threadSelectors.getPreviewFilteredCtssSamples(state).stack,
    (state: State) =>
      getUpperWingCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    (sampleStacks, stackIndexToCallNodeIndex) => {
      return sampleStacks.map((stackIndex: IndexIntoStackTable | null) => {
        if (stackIndex === null) {
          return null;
        }
        const callNodeIndex = stackIndexToCallNodeIndex[stackIndex];
        if (callNodeIndex === -1) {
          return null;
        }
        return callNodeIndex;
      });
    }
  );

  const getSampleIndexToNonInvertedCallNodeIndexForFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) => threadSelectors.getFilteredThread(state).samples.stack,
    (state: State) =>
      getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const getSampleSelectedStatesInFilteredThread: Selector<Uint8Array> =
    createSelector(
      getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
      getCallNodeInfo,
      getSelectedCallNodeIndex,
      (
        sampleIndexToNonInvertedCallNodeIndex,
        callNodeInfo,
        selectedCallNode
      ) => {
        return ProfileData.getSampleSelectedStates(
          callNodeInfo,
          sampleIndexToNonInvertedCallNodeIndex,
          selectedCallNode
        );
      }
    );

  const getSampleSelectedStatesForFunctionListTab: Selector<Uint8Array> =
    createSelector(
      getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
      _getCallNodeTable,
      getSelectedFunctionIndex,
      (sampleCallNodes, callNodeTable, selectedFunctionIndex) =>
        ProfileData.getSamplesSelectedStatesForFunction(
          sampleCallNodes,
          selectedFunctionIndex,
          callNodeTable
        )
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

  const getUpperWingCallNodeSelfAndSummary: Selector<CallNodeSelfAndSummary> =
    createSelector(
      threadSelectors.getPreviewFilteredCtssSamples,
      _getPreviewFilteredCtssSampleIndexToUpperWingCallNodeIndex,
      getUpperWingCallNodeInfo,
      getCallNodeSelfAndSummary,
      (
        samples,
        sampleIndexToCallNodeIndex,
        callNodeInfo,
        regularTreeSelfAndSummary
      ) => {
        const { rootTotalSummary } = regularTreeSelfAndSummary;
        const { callNodeSelf } = CallTree.computeCallNodeSelfAndSummary(
          samples,
          sampleIndexToCallNodeIndex,
          callNodeInfo.getCallNodeTable().length
        );
        return { rootTotalSummary, callNodeSelf };
      }
    );

  const getCallTreeTimings: Selector<CallTree.CallTreeTimings> = createSelector(
    getCallNodeInfo,
    getCallNodeSelfAndSummary,
    CallTree.computeCallTreeTimings
  );

  const _getLowerWingCallTreeTimings: Selector<CallTree.CallTreeTimings> =
    createSelector(
      _getInvertedCallNodeInfo,
      getCallNodeSelfAndSummary,
      getSelectedFunctionIndex,
      CallTree.computeLowerWingTimings
    );

  const _getUpperWingCallTreeTimings: Selector<CallTree.CallTreeTimings> =
    createSelector(
      getUpperWingCallNodeInfo,
      getUpperWingCallNodeSelfAndSummary,
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
    threadSelectors.getPreviewFilteredCtssSamples,
    getCallTreeTimings,
    getWeightTypeForCallTree,
    ProfileSelectors.getSourceTable,
    CallTree.getCallTree
  );

  const getFunctionListTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getFilteredThread,
    _getInvertedCallNodeInfo,
    ProfileSelectors.getCategories,
    threadSelectors.getPreviewFilteredCtssSamples,
    getFunctionListTimings,
    getWeightTypeForCallTree,
    (
      thread,
      callNodeInfoInverted,
      categories,
      previewFilteredCtssSamples,
      functionListTimings,
      weightType
    ) =>
      CallTree.getCallTree(
        thread,
        callNodeInfoInverted,
        categories,
        previewFilteredCtssSamples,
        { type: 'FUNCTION_LIST', timings: functionListTimings },
        weightType
      )
  );

  const getUpperWingCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getUpperWingCallNodeInfo,
    ProfileSelectors.getCategories,
    threadSelectors.getPreviewFilteredCtssSamples,
    _getUpperWingCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getLowerWingCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getLowerWingCallNodeInfo,
    ProfileSelectors.getCategories,
    threadSelectors.getPreviewFilteredCtssSamples,
    _getLowerWingCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
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

  const _getUpperWingCallTreeTimingsNonInverted: Selector<CallTree.CallTreeTimingsNonInverted> =
    createSelector(
      getUpperWingCallNodeInfo,
      getUpperWingCallNodeSelfAndSummary,
      CallTree.computeCallTreeTimingsNonInverted
    );

  const getUpperWingFlameGraphRows: Selector<FlameGraph.FlameGraphRows> =
    createSelector(
      (state: State) => getUpperWingCallNodeInfo(state).getCallNodeTable(),
      (state: State) =>
        threadSelectors.getPreviewFilteredThread(state).funcTable,
      (state: State) =>
        threadSelectors.getPreviewFilteredThread(state).stringTable,
      FlameGraph.computeFlameGraphRows
    );

  const getUpperWingFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      getUpperWingFlameGraphRows,
      (state: State) => getUpperWingCallNodeInfo(state).getCallNodeTable(),
      _getUpperWingCallTreeTimingsNonInverted,
      FlameGraph.getFlameGraphTiming
    );

  // Self wing: focusSelf(rangeAndTransformFilteredThread, selectedFunc, implFilter)
  // This uses the thread BEFORE the implementation filter so that native frames
  // that are "inside" the selected function's self time are visible even when
  // the implementation filter is set to "JS only".
  const getSelfWingThread: Selector<Thread> = createSelector(
    threadSelectors.getRangeAndTransformFilteredThread,
    getSelectedFunctionIndex,
    UrlState.getImplementationFilter,
    (thread, funcIndex, implFilter) => {
      if (funcIndex === null) {
        return thread;
      }
      return Transforms.focusSelf(thread, funcIndex, implFilter);
    }
  );

  const _getSelfWingCallNodeInfo: Selector<CallNodeInfo> = createSelector(
    (state: State) => getSelfWingThread(state).stackTable,
    (state: State) => getSelfWingThread(state).frameTable,
    ProfileSelectors.getDefaultCategory,
    ProfileData.getCallNodeInfo
  );

  const _getSelfWingCtssSamples: Selector<SamplesLikeTable> = createSelector(
    getSelfWingThread,
    threadSelectors.getCallTreeSummaryStrategy,
    CallTree.extractSamplesLikeTable
  );

  const _getSelfWingSampleIndexToCallNodeIndex: Selector<
    Array<IndexIntoCallNodeTable | null>
  > = createSelector(
    (state: State) => _getSelfWingCtssSamples(state).stack,
    (state: State) =>
      _getSelfWingCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const _getSelfWingCallNodeSelfAndSummary: Selector<CallNodeSelfAndSummary> =
    createSelector(
      _getSelfWingCtssSamples,
      _getSelfWingSampleIndexToCallNodeIndex,
      (state: State) =>
        _getSelfWingCallNodeInfo(state).getCallNodeTable().length,
      CallTree.computeCallNodeSelfAndSummary
    );

  const _getSelfWingCallTreeTimings: Selector<CallTree.CallTreeTimings> =
    createSelector(
      _getSelfWingCallNodeInfo,
      _getSelfWingCallNodeSelfAndSummary,
      CallTree.computeCallTreeTimings
    );

  const _getSelfWingCallTreeTimingsNonInverted: Selector<CallTree.CallTreeTimingsNonInverted> =
    createSelector(
      _getSelfWingCallNodeInfo,
      _getSelfWingCallNodeSelfAndSummary,
      CallTree.computeCallTreeTimingsNonInverted
    );

  const getSelfWingCallTree: Selector<CallTree.CallTree> = createSelector(
    getSelfWingThread,
    _getSelfWingCallNodeInfo,
    ProfileSelectors.getCategories,
    _getSelfWingCtssSamples,
    _getSelfWingCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const _getSelfWingFlameGraphRows: Selector<FlameGraph.FlameGraphRows> =
    createSelector(
      (state: State) => _getSelfWingCallNodeInfo(state).getCallNodeTable(),
      (state: State) => getSelfWingThread(state).funcTable,
      (state: State) => getSelfWingThread(state).stringTable,
      FlameGraph.computeFlameGraphRows
    );

  const getSelfWingFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      _getSelfWingFlameGraphRows,
      (state: State) => _getSelfWingCallNodeInfo(state).getCallNodeTable(),
      _getSelfWingCallTreeTimingsNonInverted,
      FlameGraph.getFlameGraphTiming
    );

  const getSelfWingCallNodeMaxDepthPlusOne: Selector<number> = createSelector(
    (state: State) => _getSelfWingCallNodeInfo(state).getCallNodeTable(),
    (callNodeTable) => callNodeTable.maxDepth + 1
  );

  const getSelfWingCallNodeInfo: Selector<CallNodeInfo> =
    _getSelfWingCallNodeInfo;

  const getSelfWingCtssSamples: Selector<SamplesLikeTable> =
    _getSelfWingCtssSamples;

  const getSelfWingCtssSampleCategoriesAndSubcategories: Selector<SampleCategoriesAndSubcategories> =
    createSelector(
      getSelfWingThread,
      _getSelfWingCtssSamples,
      ProfileSelectors.getDefaultCategory,
      CallTree.computeUnfilteredCtssSampleCategoriesAndSubcategories
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
          const expectedArea = callNodeInfo.isInverted()
            ? 'INVERTED_TREE'
            : 'NON_INVERTED_TREE';
          if (rightClickedCallNodeInfo.area === expectedArea) {
            return callNodeInfo.getCallNodeIndexFromPath(
              rightClickedCallNodeInfo.callNodePath
            );
          }
        }

        return null;
      }
    );

  const getLowerWingRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getLowerWingCallNodeInfo,
      (rightClickedCallNodeInfo, callNodeInfo) => {
        if (
          rightClickedCallNodeInfo !== null &&
          rightClickedCallNodeInfo.threadsKey === threadsKey &&
          rightClickedCallNodeInfo.area === 'LOWER_WING'
        ) {
          return callNodeInfo.getCallNodeIndexFromPath(
            rightClickedCallNodeInfo.callNodePath
          );
        }

        return null;
      }
    );

  const getLowerWingRightClickedFuncIndex: Selector<null | IndexIntoFuncTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getLowerWingCallNodeInfo,
      (rightClickedCallNodeInfo, callNodeInfo) => {
        if (
          rightClickedCallNodeInfo === null ||
          rightClickedCallNodeInfo.threadsKey !== threadsKey ||
          rightClickedCallNodeInfo.area !== 'LOWER_WING'
        ) {
          return null;
        }
        const callNodeIndex = callNodeInfo.getCallNodeIndexFromPath(
          rightClickedCallNodeInfo.callNodePath
        );
        if (callNodeIndex === null) {
          return null;
        }
        return callNodeInfo.funcForNode(callNodeIndex);
      }
    );

  const getUpperWingRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getUpperWingCallNodeInfo,
      (rightClickedCallNodeInfo, callNodeInfo) => {
        if (
          rightClickedCallNodeInfo !== null &&
          rightClickedCallNodeInfo.threadsKey === threadsKey &&
          rightClickedCallNodeInfo.area === 'UPPER_WING'
        ) {
          return callNodeInfo.getCallNodeIndexFromPath(
            rightClickedCallNodeInfo.callNodePath
          );
        }

        return null;
      }
    );

  const getRightClickedFunctionIndex: Selector<null | IndexIntoFuncTable> =
    createSelector(
      ProfileSelectors.getProfileViewOptions,
      (profileViewOptions) => {
        const rightClickedFunctionInfo =
          profileViewOptions.rightClickedFunction;
        if (
          rightClickedFunctionInfo !== null &&
          threadsKey === rightClickedFunctionInfo.threadsKey
        ) {
          return rightClickedFunctionInfo.functionIndex;
        }

        return null;
      }
    );

  return {
    unfilteredSamplesRange,
    getWeightTypeForCallTree,
    getCallNodeInfo,
    getLowerWingCallNodeInfo,
    getUpperWingCallNodeInfo,
    getSourceViewStackLineInfo,
    getAssemblyViewNativeSymbolIndex,
    getAssemblyViewStackAddressInfo,
    getSelectedCallNodePath,
    getSelectedCallNodeIndex,
    getLowerWingSelectedCallNodePath,
    getLowerWingSelectedCallNodeIndex,
    getUpperWingSelectedCallNodePath,
    getUpperWingSelectedCallNodeIndex,
    getSelectedFunctionIndex,
    getExpandedCallNodePaths,
    getExpandedCallNodeIndexes,
    getLowerWingExpandedCallNodePaths,
    getLowerWingExpandedCallNodeIndexes,
    getUpperWingExpandedCallNodePaths,
    getUpperWingExpandedCallNodeIndexes,
    getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
    getSampleSelectedStatesInFilteredThread,
    getSampleSelectedStatesForFunctionListTab,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getFunctionListTree,
    getFunctionListTimings,
    getLowerWingCallTree,
    getUpperWingCallTree,
    getUpperWingFlameGraphTiming,
    getSelfWingThread,
    getSelfWingCallNodeInfo,
    getSelfWingCallTree,
    getSelfWingFlameGraphTiming,
    getSelfWingCallNodeMaxDepthPlusOne,
    getSelfWingCtssSamples,
    getSelfWingCtssSampleCategoriesAndSubcategories,
    getSourceViewLineTimings,
    getAssemblyViewAddressTimings,
    getTracedTiming,
    getTracedSelfAndTotalForSelectedCallNode,
    getStackTimingByDepth,
    getSameWidthsIndexToTimestampMap,
    getFilteredCallNodeMaxDepthPlusOne,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
    getRightClickedFunctionIndex,
    getLowerWingRightClickedCallNodeIndex,
    getLowerWingRightClickedFuncIndex,
    getUpperWingRightClickedCallNodeIndex,
  };
}
