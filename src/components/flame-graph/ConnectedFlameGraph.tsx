/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { explicitConnectWithForwardRef } from '../../utils/connect';
import { FlameGraph } from './FlameGraph';

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
import { getSelectedThreadsKey } from '../../selectors/url-state';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
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
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  readonly tracedTiming: CallTreeTimings | null;
  readonly displayStackType: boolean;
};

type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

export interface ConnectedFlameGraphHandle {
  focus(): void;
}

class ConnectedFlameGraphImpl
  extends React.PureComponent<Props>
  implements ConnectedFlameGraphHandle
{
  _flameGraph: React.RefObject<FlameGraph | null> = React.createRef();

  // eslint-disable-next-line react/no-unused-class-component-methods -- called via ConnectedFlameGraphHandle ref from FlameGraphViewImpl
  focus() {
    this._flameGraph.current?.focus();
  }

  _onSelectedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadsKey, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
  };

  _onRightClickedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
  };

  _onCallNodeEnterOrDoubleClick = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    if (callNodeIndex === null) {
      return;
    }
    const { callTree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(callNodeIndex);
    updateBottomBoxContentsAndMaybeOpen('flame-graph', bottomBoxInfo);
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
        callTreeSummaryStrategy={callTreeSummaryStrategy}
        ctssSamples={ctssSamples}
        ctssSampleCategoriesAndSubcategories={
          ctssSampleCategoriesAndSubcategories
        }
        tracedTiming={tracedTiming}
        displayStackType={displayStackType}
        onSelectedCallNodeChange={this._onSelectedCallNodeChange}
        onRightClickedCallNodeChange={this._onRightClickedCallNodeChange}
        onCallNodeEnterOrDoubleClick={this._onCallNodeEnterOrDoubleClick}
        onKeyboardTransformShortcut={this._onKeyboardTransformShortcut}
      />
    );
  }
}

export const ConnectedFlameGraph = explicitConnectWithForwardRef<
  {},
  StateProps,
  DispatchProps,
  ConnectedFlameGraphHandle
>({
  mapStateToProps: (state) => ({
    thread: selectedThreadSelectors.getFilteredThread(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    // Use the filtered call node max depth, rather than the preview filtered one, so
    // that the viewport height is stable across preview selections.
    maxStackDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    flameGraphTiming: selectedThreadSelectors.getFlameGraphTiming(state),
    callTree: selectedThreadSelectors.getCallTree(state),
    timeRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    categories: getCategories(state),
    threadsKey: getSelectedThreadsKey(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getRightClickedCallNodeIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    interval: getProfileInterval(state),
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
    changeSelectedCallNode,
    changeRightClickedCallNode,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
  },
  options: { forwardRef: true },
  component: ConnectedFlameGraphImpl,
});
