/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { explicitConnectWithForwardRef } from 'firefox-profiler/utils/connect';
import { FlameGraph } from 'firefox-profiler/components/flame-graph/FlameGraph';

import {
  getCategories,
  getCommittedRange,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getProfileInterval,
  getInnerWindowIDToPageMap,
  getProfileUsesMultipleStackTypes,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getSelectedThreadsKey,
  getInvertCallstack,
} from 'firefox-profiler/selectors/url-state';
import {
  changeUpperWingSelectedCallNode,
  changeUpperWingRightClickedCallNode,
  changeRightClickedFunctionIndex,
  handleCallNodeTransformShortcut,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';

import type {
  Thread,
  CategoryList,
  Milliseconds,
  StartEndRange,
  WeightType,
  SamplesLikeTable,
  PreviewSelection,
  CallTreeSummaryStrategy,
  IndexIntoCallNodeTable,
  ThreadsKey,
  InnerWindowID,
  Page,
  SampleCategoriesAndSubcategories,
  SelectionContext,
} from 'firefox-profiler/types';

import type { FlameGraphTiming } from 'firefox-profiler/profile-logic/flame-graph';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type {
  CallTree,
  CallTreeTimings,
} from 'firefox-profiler/profile-logic/call-tree';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly maxStackDepthPlusOne: number;
  readonly timeRange: StartEndRange;
  readonly previewSelection: PreviewSelection | null;
  readonly flameGraphTiming: FlameGraphTiming;
  readonly callTree: CallTree;
  readonly callNodeInfo: CallNodeInfo;
  readonly threadsKey: ThreadsKey;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly scrollToSelectionGeneration: number;
  readonly categories: CategoryList;
  readonly interval: Milliseconds;
  readonly isInverted: boolean;
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  readonly tracedTiming: CallTreeTimings | null;
  readonly displayStackType: boolean;
};

type DispatchProps = {
  readonly changeUpperWingSelectedCallNode: typeof changeUpperWingSelectedCallNode;
  readonly changeUpperWingRightClickedCallNode: typeof changeUpperWingRightClickedCallNode;
  readonly changeRightClickedFunctionIndex: typeof changeRightClickedFunctionIndex;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

export interface UpperWingFlameGraphHandle {
  focus(): void;
}

class UpperWingFlameGraphImpl
  extends React.PureComponent<Props>
  implements UpperWingFlameGraphHandle
{
  _flameGraph: React.RefObject<FlameGraph> = React.createRef();

  focus() {
    this._flameGraph.current?.focus();
  }

  _onSelectedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadsKey, changeUpperWingSelectedCallNode } =
      this.props;
    const context: SelectionContext = { source: 'pointer' };
    changeUpperWingSelectedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex),
      context
    );
  };

  _onRightClickedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const {
      callNodeInfo,
      threadsKey,
      changeUpperWingRightClickedCallNode,
      changeRightClickedFunctionIndex,
    } = this.props;
    changeUpperWingRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
    const funcIndex =
      callNodeIndex !== null ? callNodeInfo.funcForNode(callNodeIndex) : null;
    changeRightClickedFunctionIndex(threadsKey, funcIndex);
  };

  _onCallNodeEnterOrDoubleClick = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    if (callNodeIndex === null) {
      return;
    }
    const { callTree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(callNodeIndex);
    updateBottomBoxContentsAndMaybeOpen('function-list', bottomBoxInfo);
  };

  _onKeyboardTransformShortcut = (
    event: React.KeyboardEvent<HTMLElement>,
    nodeIndex: IndexIntoCallNodeTable
  ) => {
    const { threadsKey, callNodeInfo, handleCallNodeTransformShortcut } =
      this.props;
    handleCallNodeTransformShortcut(event, threadsKey, callNodeInfo, nodeIndex);
  };

  override render() {
    const {
      thread,
      threadsKey,
      maxStackDepthPlusOne,
      flameGraphTiming,
      callTree,
      callNodeInfo,
      timeRange,
      previewSelection,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
      callTreeSummaryStrategy,
      categories,
      interval,
      isInverted,
      innerWindowIDToPageMap,
      weightType,
      ctssSamples,
      ctssSampleCategoriesAndSubcategories,
      tracedTiming,
      displayStackType,
    } = this.props;

    return (
      <FlameGraph
        ref={this._flameGraph}
        thread={thread}
        weightType={weightType}
        innerWindowIDToPageMap={innerWindowIDToPageMap}
        maxStackDepthPlusOne={maxStackDepthPlusOne}
        timeRange={timeRange}
        previewSelection={previewSelection}
        flameGraphTiming={flameGraphTiming}
        callTree={callTree}
        callNodeInfo={callNodeInfo}
        threadsKey={threadsKey}
        selectedCallNodeIndex={selectedCallNodeIndex}
        rightClickedCallNodeIndex={rightClickedCallNodeIndex}
        scrollToSelectionGeneration={scrollToSelectionGeneration}
        categories={categories}
        interval={interval}
        isInverted={isInverted}
        callTreeSummaryStrategy={callTreeSummaryStrategy}
        ctssSamples={ctssSamples}
        ctssSampleCategoriesAndSubcategories={
          ctssSampleCategoriesAndSubcategories
        }
        tracedTiming={tracedTiming}
        displayStackType={displayStackType}
        contextMenuId="FunctionListContextMenu"
        onSelectedCallNodeChange={this._onSelectedCallNodeChange}
        onRightClickedCallNodeChange={this._onRightClickedCallNodeChange}
        onCallNodeEnterOrDoubleClick={this._onCallNodeEnterOrDoubleClick}
        onKeyboardTransformShortcut={this._onKeyboardTransformShortcut}
      />
    );
  }
}

export const UpperWingFlameGraph = explicitConnectWithForwardRef<
  {},
  StateProps,
  DispatchProps,
  UpperWingFlameGraphHandle
>({
  mapStateToProps: (state) => ({
    thread: selectedThreadSelectors.getPreviewFilteredThread(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    maxStackDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    flameGraphTiming:
      selectedThreadSelectors.getUpperWingFlameGraphTiming(state),
    callTree: selectedThreadSelectors.getUpperWingCallTree(state),
    timeRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
    callNodeInfo: selectedThreadSelectors.getUpperWingCallNodeInfo(state),
    categories: getCategories(state),
    threadsKey: getSelectedThreadsKey(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getUpperWingSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getUpperWingRightClickedCallNodeIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    interval: getProfileInterval(state),
    isInverted: getInvertCallstack(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
    innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
    ctssSamples: selectedThreadSelectors.getPreviewFilteredCtssSamples(state),
    ctssSampleCategoriesAndSubcategories:
      selectedThreadSelectors.getPreviewFilteredCtssSampleCategoriesAndSubcategories(
        state
      ),
    tracedTiming: selectedThreadSelectors.getTracedTiming(state),
    displayStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    changeUpperWingSelectedCallNode,
    changeUpperWingRightClickedCallNode,
    changeRightClickedFunctionIndex,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
  },
  component: UpperWingFlameGraphImpl,
});
