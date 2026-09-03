/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { FlameGraph } from 'firefox-profiler/components/flame-graph/FlameGraph';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import { nameColumn, libColumn, treeColumnsForWeightType } from './columns';

import {
  getCategories,
  getCommittedRange,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getProfileInterval,
  getInnerWindowIDToPageMap,
  getProfileUsesMultipleStackTypes,
  getCurrentTableViewOptions,
  getPreviewSelectionIsBeingModified,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getSelectedThreadsKey,
  getSearchStringsAsRegExp,
  getSelfWingView,
} from 'firefox-profiler/selectors/url-state';
import {
  updateBottomBoxContentsAndMaybeOpen,
  changeRightClickedFunctionIndex,
  changeTableViewOptions,
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
  CallNodeDisplayData,
  TableViewOptions,
  WingViewType,
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
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  readonly displayStackType: boolean;
  readonly searchStringsRegExp: RegExp | null;
  readonly disableOverscan: boolean;
  readonly tableViewOptions: TableViewOptions;
  readonly view: WingViewType;
};

type DispatchProps = {
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly changeRightClickedFunctionIndex: typeof changeRightClickedFunctionIndex;
  readonly onTableViewOptionsChange: (options: TableViewOptions) => any;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

type LocalState = {
  selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>;
};

class SelfWingImpl extends React.PureComponent<Props, LocalState> {
  override state: LocalState = {
    selectedCallNodeIndex: null,
    rightClickedCallNodeIndex: null,
    expandedCallNodeIndexes: [],
  };

  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = (treeView: TreeView<CallNodeDisplayData> | null) => {
    this._treeView = treeView;
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
        expandedCallNodeIndexes: [],
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

  _onTreeViewSelectionChange = (
    callNodeIndex: IndexIntoCallNodeTable,
    context: { source: 'keyboard' | 'pointer' }
  ) => {
    this.setState({ selectedCallNodeIndex: callNodeIndex }, () => {
      // Selection in this wing is local state, so the Redux-driven
      // scrollToSelectionGeneration mechanism used by the other wings does not
      // apply. Scroll directly when keyboard navigation moves the selection.
      if (context.source === 'keyboard' && this._treeView) {
        this._treeView.scrollSelectionIntoView();
      }
    });
  };

  _onTreeViewRightClickSelection = (callNodeIndex: IndexIntoCallNodeTable) => {
    this._onRightClickedCallNodeChange(callNodeIndex);
  };

  _onTreeViewExpandedNodesChange = (
    expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    this.setState({ expandedCallNodeIndexes });
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

  _renderFlameGraph() {
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
        startsAtBottom={true}
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

  _renderCallTree() {
    const {
      callTree,
      searchStringsRegExp,
      disableOverscan,
      maxStackDepthPlusOne,
      weightType,
      tableViewOptions,
      onTableViewOptionsChange,
    } = this.props;
    const {
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      expandedCallNodeIndexes,
    } = this.state;
    if (callTree.getRoots().length === 0) {
      return <CallTreeEmptyReasons />;
    }
    return (
      <TreeView
        tree={callTree}
        fixedColumns={treeColumnsForWeightType(weightType)}
        mainColumn={nameColumn}
        appendageColumn={libColumn}
        onSelectionChange={this._onTreeViewSelectionChange}
        onRightClickSelection={this._onTreeViewRightClickSelection}
        onExpandedNodesChange={this._onTreeViewExpandedNodesChange}
        ref={this._takeTreeViewRef}
        selectedNodeId={selectedCallNodeIndex}
        rightClickedNodeId={rightClickedCallNodeIndex}
        expandedNodeIds={expandedCallNodeIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        contextMenuId="FunctionListContextMenu"
        maxNodeDepth={maxStackDepthPlusOne}
        rowHeight={16}
        indentWidth={10}
        onEnterKey={this._onCallNodeEnterOrDoubleClick}
        onDoubleClick={this._onCallNodeEnterOrDoubleClick}
        viewOptions={tableViewOptions}
        onViewOptionsChange={onTableViewOptionsChange}
      />
    );
  }

  override render() {
    if (this.props.view === 'call-tree') {
      return this._renderCallTree();
    }
    return this._renderFlameGraph();
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
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
    innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
    ctssSamples: selectedThreadSelectors.getSelfWingCtssSamples(state),
    ctssSampleCategoriesAndSubcategories:
      selectedThreadSelectors.getSelfWingCtssSampleCategoriesAndSubcategories(
        state
      ),
    displayStackType: getProfileUsesMultipleStackTypes(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelectionIsBeingModified(state),
    tableViewOptions: getCurrentTableViewOptions(state),
    view: getSelfWingView(state),
  }),
  mapDispatchToProps: {
    updateBottomBoxContentsAndMaybeOpen,
    changeRightClickedFunctionIndex,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('calltree', options),
  },
  component: SelfWingImpl,
});
