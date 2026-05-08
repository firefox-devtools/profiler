/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
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
  updateBottomBoxContentsAndMaybeOpen,
  changeRightClickedFunctionIndex,
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
} from 'firefox-profiler/types';

import type { FlameGraphTiming } from 'firefox-profiler/profile-logic/flame-graph';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';
import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';

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
  readonly scrollToSelectionGeneration: number;
  readonly categories: CategoryList;
  readonly interval: Milliseconds;
  readonly isInverted: boolean;
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  readonly displayStackType: boolean;
};

type DispatchProps = {
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly changeRightClickedFunctionIndex: typeof changeRightClickedFunctionIndex;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

type LocalState = {
  selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
};

class SelfWingImpl extends React.PureComponent<Props, LocalState> {
  override state: LocalState = {
    selectedCallNodeIndex: null,
    rightClickedCallNodeIndex: null,
  };

  override componentDidUpdate(prevProps: Props, _prevState: LocalState) {
    // Reset local selection when the call node info changes (e.g. different
    // function selected) since old call node indices are no longer valid.
    if (
      prevProps.callNodeInfo !== this.props.callNodeInfo ||
      prevProps.threadsKey !== this.props.threadsKey
    ) {
      this.setState({
        selectedCallNodeIndex: null,
        rightClickedCallNodeIndex: null,
      });
    }
  }

  _onSelectedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    this.setState({ selectedCallNodeIndex: callNodeIndex });
  };

  _onRightClickedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    this.setState({ rightClickedCallNodeIndex: callNodeIndex });
    const { callNodeInfo, threadsKey, changeRightClickedFunctionIndex } =
      this.props;
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

  // Transforms are disabled in the SelfWing because it operates on an ephemeral
  // thread that is not part of the Redux transform stack.
  _onKeyboardTransformShortcut = (
    _event: React.KeyboardEvent<HTMLElement>,
    _nodeIndex: IndexIntoCallNodeTable
  ) => {};

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
      scrollToSelectionGeneration,
      callTreeSummaryStrategy,
      categories,
      interval,
      isInverted,
      innerWindowIDToPageMap,
      weightType,
      ctssSamples,
      ctssSampleCategoriesAndSubcategories,
      displayStackType,
    } = this.props;

    const { selectedCallNodeIndex, rightClickedCallNodeIndex } = this.state;

    return (
      <FlameGraph
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
        tracedTiming={null}
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

export const SelfWing = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    thread: selectedThreadSelectors.getSelfWingThread(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    maxStackDepthPlusOne:
      selectedThreadSelectors.getSelfWingCallNodeMaxDepthPlusOne(state),
    flameGraphTiming:
      selectedThreadSelectors.getSelfWingFlameGraphTiming(state),
    callTree: selectedThreadSelectors.getSelfWingCallTree(state),
    timeRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
    callNodeInfo: selectedThreadSelectors.getSelfWingCallNodeInfo(state),
    categories: getCategories(state),
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    interval: getProfileInterval(state),
    isInverted: getInvertCallstack(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
    innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
    ctssSamples: selectedThreadSelectors.getSelfWingCtssSamples(state),
    ctssSampleCategoriesAndSubcategories:
      selectedThreadSelectors.getSelfWingCtssSampleCategoriesAndSubcategories(
        state
      ),
    displayStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    updateBottomBoxContentsAndMaybeOpen,
    changeRightClickedFunctionIndex,
  },
  component: SelfWingImpl,
});
