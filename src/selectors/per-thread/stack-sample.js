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
  CallNodePath,
  StackLineInfo,
  StackAddressInfo,
  LineTimings,
  AddressTimings,
  IndexIntoFuncTable,
  IndexIntoCallNodeTable,
  IndexIntoNativeSymbolTable,
  SelectedState,
  StartEndRange,
  Selector,
  $ReturnType,
  ThreadsKey,
  SelfAndTotal,
  CallNodeSelfAndSummary,
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
      (state) => threadSelectors.getFilteredThread(state).stackTable,
      (state) => threadSelectors.getFilteredThread(state).frameTable,
      (state) => threadSelectors.getFilteredThread(state).funcTable,
      ProfileSelectors.getDefaultCategory,
      ProfileData.getCallNodeInfo
    );

  const _getInvertedCallNodeInfo: Selector<CallNodeInfoInverted> =
    createSelectorWithTwoCacheSlots(
      _getNonInvertedCallNodeInfo,
      ProfileSelectors.getDefaultCategory,
      (state) => threadSelectors.getFilteredThread(state).funcTable.length,
      (nonInvertedCallNodeInfo, defaultCategory, funcCount) => {
        return ProfileData.getInvertedCallNodeInfo(
          nonInvertedCallNodeInfo.getNonInvertedCallNodeTable(),
          nonInvertedCallNodeInfo.getStackIndexToNonInvertedCallNodeIndex(),
          defaultCategory,
          funcCount
        );
      }
    );

  const getCallNodeInfo: Selector<CallNodeInfo> = (state) => {
    if (UrlState.getInvertCallstack(state)) {
      return _getInvertedCallNodeInfo(state);
    }
    return _getNonInvertedCallNodeInfo(state);
  };

  const getLowerWingCallNodeInfo = _getInvertedCallNodeInfo;

  const _getCallNodeFuncIsDuplicate: Selector<CallNodeTableBitSet> =
    createSelector(getCallNodeInfo, (callNodeInfo) => {
      const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
      return ProfileData.computeCallNodeFuncIsDuplicate(callNodeTable);
    });

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
    ProfileSelectors.getDefaultCategory,
    ProfileData.createUpperWingCallNodeInfo
  );

  const getLowerWingSelectedCallNodePath: Selector<CallNodePath> =
    createSelector(
      threadSelectors.getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedLowerWingCallNodePath
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
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    getCallNodeInfo,
    getExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      Array.from(callNodePaths).map((path) =>
        callNodeInfo.getCallNodeIndexFromPath(path)
      )
  );

  const getLowerWingExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    getLowerWingCallNodeInfo,
    getLowerWingExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      Array.from(callNodePaths).map((path) =>
        callNodeInfo.getCallNodeIndexFromPath(path)
      )
  );

  const getUpperWingExpandedCallNodeIndexes: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    getUpperWingCallNodeInfo,
    getUpperWingExpandedCallNodePaths,
    (callNodeInfo, callNodePaths) =>
      Array.from(callNodePaths).map((path) =>
        callNodeInfo.getCallNodeIndexFromPath(path)
      )
  );

  const getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    (state) =>
      threadSelectors.getPreviewFilteredSamplesForCallTree(state).stack,
    (state) => getCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    ProfileData.getSampleIndexToCallNodeIndex
  );

  const getSampleIndexToUpperWingCallNodeIndexForPreviewFilteredThread: Selector<
    Array<IndexIntoCallNodeTable | null>,
  > = createSelector(
    (state) =>
      threadSelectors.getPreviewFilteredSamplesForCallTree(state).stack,
    (state) =>
      getUpperWingCallNodeInfo(state).getStackIndexToNonInvertedCallNodeIndex(),
    (sampleStacks, stackIndexToCallNodeIndex) => {
      return sampleStacks.map((stackIndex) => {
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

  const _getSampleIndexToNonInvertedCallNodeIndexForTabFilteredThread: Selector<
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
    _getSampleIndexToNonInvertedCallNodeIndexForTabFilteredThread,
    getCallNodeInfo,
    getSelectedCallNodeIndex,
    (
      sampleIndexToNonInvertedCallNodeIndex,
      activeTabFilteredNonInvertedCallNodes,
      callNodeInfo,
      selectedCallNode
    ) => {
      return ProfileData.getSamplesSelectedStates(
        callNodeInfo,
        sampleIndexToNonInvertedCallNodeIndex,
        activeTabFilteredNonInvertedCallNodes,
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

  const getFilteredCallNodeMaxDepthPlusOne: Selector<number> = createSelector(
    threadSelectors.getFilteredSamplesForCallTree,
    getCallNodeInfo,
    ProfileData.computeCallNodeMaxDepthPlusOne
  );

  const getPreviewFilteredCallNodeMaxDepthPlusOne: Selector<number> =
    createSelector(
      threadSelectors.getPreviewFilteredSamplesForCallTree,
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
    threadSelectors.getUnfilteredSamplesForCallTree,
    (samples) => samples.weightType || 'samples'
  );

  const getCallNodeSelfAndSummary: Selector<CallNodeSelfAndSummary> =
    createSelector(
      threadSelectors.getPreviewFilteredSamplesForCallTree,
      getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredThread,
      getCallNodeInfo,
      (samples, sampleIndexToCallNodeIndex, callNodeInfo) => {
        return CallTree.computeCallNodeSelfAndSummary(
          samples,
          sampleIndexToCallNodeIndex,
          callNodeInfo.getNonInvertedCallNodeTable().length
        );
      }
    );

  const getUpperWingCallNodeSelfAndSummary: Selector<CallNodeSelfAndSummary> =
    createSelector(
      threadSelectors.getPreviewFilteredSamplesForCallTree,
      getSampleIndexToUpperWingCallNodeIndexForPreviewFilteredThread,
      getUpperWingCallNodeInfo,
      (samples, sampleIndexToCallNodeIndex, callNodeInfo) => {
        return CallTree.computeCallNodeSelfAndSummary(
          samples,
          sampleIndexToCallNodeIndex,
          callNodeInfo.getNonInvertedCallNodeTable().length
        );
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

  // const _getCallTreeTimingsInverted: Selector<CallTree.CallTreeTimingsInverted> =
  //   createSelector(
  //     _getInvertedCallNodeInfo,
  //     getCallNodeSelfAndSummary,
  //     CallTree.computeCallTreeTimingsInverted
  //   );

  const getFunctionListTimings: Selector<CallTree.FunctionListTimings> =
    createSelector(
      getCallNodeInfo,
      _getCallNodeFuncIsDuplicate,
      getCallNodeSelfAndSummary,
      (state) => threadSelectors.getFilteredThread(state).funcTable.length,
      CallTree.computeFunctionListTimings
    );

  const getCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getCallNodeInfo,
    ProfileSelectors.getCategories,
    getCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getFunctionListTree: Selector<CallTree.FunctionListTree> =
    createSelector(
      threadSelectors.getPreviewFilteredThread,
      _getInvertedCallNodeInfo,
      ProfileSelectors.getCategories,
      getFunctionListTimings,
      getWeightTypeForCallTree,
      CallTree.getFunctionListTree
    );

  const getUpperWingCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getUpperWingCallNodeInfo,
    ProfileSelectors.getCategories,
    _getUpperWingCallTreeTimings,
    getWeightTypeForCallTree,
    CallTree.getCallTree
  );

  const getLowerWingCallTree: Selector<CallTree.CallTree> = createSelector(
    threadSelectors.getPreviewFilteredThread,
    getLowerWingCallNodeInfo,
    ProfileSelectors.getCategories,
    _getLowerWingCallTreeTimings,
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

  const getTracedTiming: Selector<CallTree.CallTreeTimings | null> =
    createSelector(
      threadSelectors.getPreviewFilteredSamplesForCallTree,
      getSampleIndexToNonInvertedCallNodeIndexForPreviewFilteredThread,
      getCallNodeInfo,
      ProfileSelectors.getProfileInterval,
      (samples, sampleIndexToCallNodeIndex, callNodeInfo, interval) => {
        const CallNodeSelfAndSummary =
          CallTree.computeCallNodeTracedSelfAndSummary(
            samples,
            sampleIndexToCallNodeIndex,
            callNodeInfo.getNonInvertedCallNodeTable().length,
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

  const getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth> =
    createSelector(
      threadSelectors.getFilteredSamplesForCallTree,
      getSampleIndexToNonInvertedCallNodeIndexForFilteredThread,
      getCallNodeInfo,
      getFilteredCallNodeMaxDepthPlusOne,
      ProfileSelectors.getProfileInterval,
      StackTiming.getStackTimingByDepth
    );

  const getFlameGraphRows: Selector<FlameGraph.FlameGraphRows> = createSelector(
    (state) => getCallNodeInfo(state).getNonInvertedCallNodeTable(),
    (state) => threadSelectors.getFilteredThread(state).funcTable,
    (state) => threadSelectors.getFilteredThread(state).stringTable,
    FlameGraph.computeFlameGraphRows
  );

  const getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming> =
    createSelector(
      getFlameGraphRows,
      (state) => getCallNodeInfo(state).getNonInvertedCallNodeTable(),
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
      getCallNodeInfo,
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

  const getUpperWingRightClickedCallNodeIndex: Selector<null | IndexIntoCallNodeTable> =
    createSelector(
      getRightClickedCallNodeInfo,
      getCallNodeInfo,
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
    getSamplesSelectedStatesInFilteredThread,
    getTreeOrderComparatorInFilteredThread,
    getCallTree,
    getFunctionListTree,
    getLowerWingCallTree,
    getUpperWingCallTree,
    getSourceViewLineTimings,
    getAssemblyViewAddressTimings,
    getTracedTiming,
    getTracedSelfAndTotalForSelectedCallNode,
    getStackTimingByDepth,
    getFilteredCallNodeMaxDepthPlusOne,
    getPreviewFilteredCallNodeMaxDepthPlusOne,
    getFlameGraphTiming,
    getRightClickedCallNodeIndex,
    getRightClickedFunctionIndex,
    getLowerWingRightClickedCallNodeIndex,
    getUpperWingRightClickedCallNodeIndex,
  };
}
