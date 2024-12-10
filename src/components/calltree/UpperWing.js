/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import {
  treeColumnsForTracingMs,
  treeColumnsForSamples,
  treeColumnsForBytes,
} from './columns';
import {
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getPreviewSelection,
  getCategories,
  getCurrentTableViewOptions,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeUpperWingSelectedCallNode,
  changeUpperWingRightClickedCallNode,
  changeUpperWingExpandedCallNodes,
  addTransformToStack,
  handleCallNodeTransformShortcut,
  changeTableViewOptions,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  State,
  ThreadsKey,
  CategoryList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  WeightType,
  TableViewOptions,
  SelectionContext,
} from 'firefox-profiler/types';
import type { CallTree as CallTreeType } from 'firefox-profiler/profile-logic/call-tree';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type {
  Column,
  MaybeResizableColumn,
} from 'firefox-profiler/components/shared/TreeView';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallTree.css';

type StateProps = {|
  +threadsKey: ThreadsKey,
  +scrollToSelectionGeneration: number,
  +tree: CallTreeType,
  +callNodeInfo: CallNodeInfo,
  +categories: CategoryList,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>,
  +searchStringsRegExp: RegExp | null,
  +disableOverscan: boolean,
  +callNodeMaxDepthPlusOne: number,
  +weightType: WeightType,
  +tableViewOptions: TableViewOptions,
|};

type DispatchProps = {|
  +changeUpperWingSelectedCallNode: typeof changeUpperWingSelectedCallNode,
  +changeUpperWingRightClickedCallNode: typeof changeUpperWingRightClickedCallNode,
  +changeUpperWingExpandedCallNodes: typeof changeUpperWingExpandedCallNodes,
  +addTransformToStack: typeof addTransformToStack,
  +handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut,
  +updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen,
  +onTableViewOptionsChange: (TableViewOptions) => any,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class UpperWingImpl extends PureComponent<Props> {
  _mainColumn: Column<CallNodeDisplayData> = {
    propName: 'name',
    titleL10nId: '',
  };
  _appendageColumn: Column<CallNodeDisplayData> = {
    propName: 'lib',
    titleL10nId: '',
  };
  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = (treeView) => (this._treeView = treeView);

  /**
   * Call Trees can have different types of "weights" for the data. Choose the
   * appropriate labels for the call tree based on this weight.
   */
  _weightTypeToColumns = memoize(
    (weightType: WeightType): MaybeResizableColumn<CallNodeDisplayData>[] => {
      switch (weightType) {
        case 'tracing-ms':
          return treeColumnsForTracingMs;
        case 'samples':
          return treeColumnsForSamples;
        case 'bytes':
          return treeColumnsForBytes;
        default:
          throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
      }
    },
    // Use a Map cache, as the function only takes one argument, which is a simple string.
    { cache: new Map() }
  );

  componentDidMount() {
    this.focus();
    this.maybeProcureInterestingInitialSelection();

    if (this.props.selectedCallNodeIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  componentDidUpdate(prevProps) {
    this.maybeProcureInterestingInitialSelection();

    if (
      this.props.selectedCallNodeIndex !== null &&
      this.props.scrollToSelectionGeneration >
        prevProps.scrollToSelectionGeneration &&
      this._treeView
    ) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  focus() {
    if (this._treeView) {
      this._treeView.focus();
    }
  }

  _onSelectedCallNodeChange = (
    newSelectedCallNode: IndexIntoCallNodeTable,
    context: SelectionContext
  ) => {
    const { callNodeInfo, threadsKey, changeUpperWingSelectedCallNode } =
      this.props;
    changeUpperWingSelectedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(newSelectedCallNode),
      context
    );
  };

  _onRightClickSelection = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadsKey, changeUpperWingRightClickedCallNode } =
      this.props;
    changeUpperWingRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(newSelectedCallNode)
    );
  };

  _onExpandedCallNodesChange = (
    newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    const { callNodeInfo, threadsKey, changeUpperWingExpandedCallNodes } =
      this.props;
    changeUpperWingExpandedCallNodes(
      threadsKey,
      newExpandedCallNodeIndexes.map((callNodeIndex) =>
        callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
      )
    );
  };

  _onKeyDown = (event: SyntheticKeyboardEvent<>) => {
    const {
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      handleCallNodeTransformShortcut,
      threadsKey,
    } = this.props;
    const nodeIndex =
      rightClickedCallNodeIndex !== null
        ? rightClickedCallNodeIndex
        : selectedCallNodeIndex;
    if (nodeIndex === null) {
      return;
    }
    handleCallNodeTransformShortcut(event, threadsKey, nodeIndex);
  };

  _onEnterOrDoubleClick = (nodeId: IndexIntoCallNodeTable) => {
    const { tree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(nodeId);
    updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo);
  };

  maybeProcureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const {
      tree,
      expandedCallNodeIndexes,
      selectedCallNodeIndex,
      callNodeInfo,
      categories,
    } = this.props;

    if (selectedCallNodeIndex !== null || expandedCallNodeIndexes.length > 0) {
      // Let's not change some existing state.
      return;
    }

    const idleCategoryIndex = categories.findIndex(
      (category) => category.name === 'Idle'
    );

    const newExpandedCallNodeIndexes = expandedCallNodeIndexes.slice();
    const maxInterestingDepth = 17; // scientifically determined
    let currentCallNodeIndex = tree.getRoots()[0];
    if (currentCallNodeIndex === undefined) {
      // This tree is empty.
      return;
    }
    newExpandedCallNodeIndexes.push(currentCallNodeIndex);
    for (let i = 0; i < maxInterestingDepth; i++) {
      const children = tree.getChildren(currentCallNodeIndex);
      if (children.length === 0) {
        break;
      }

      // Let's find if there's a non idle children.
      const firstNonIdleNode = children.find(
        (nodeIndex) =>
          callNodeInfo.categoryForNode(nodeIndex) !== idleCategoryIndex
      );

      // If there's a non idle children, use it; otherwise use the first
      // children (that will be idle).
      currentCallNodeIndex =
        firstNonIdleNode !== undefined ? firstNonIdleNode : children[0];
      newExpandedCallNodeIndexes.push(currentCallNodeIndex);
    }
    this._onExpandedCallNodesChange(newExpandedCallNodeIndexes);

    const categoryIndex = callNodeInfo.categoryForNode(currentCallNodeIndex);
    if (categoryIndex !== idleCategoryIndex) {
      // If we selected the call node with a "idle" category, we'd have a
      // completely dimmed activity graph because idle stacks are not drawn in
      // this graph. Because this isn't probably what the average user wants we
      // do it only when the category is something different.
      this._onSelectedCallNodeChange(currentCallNodeIndex, { source: 'auto' });
    }
  }

  render() {
    const {
      tree,
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      expandedCallNodeIndexes,
      searchStringsRegExp,
      disableOverscan,
      callNodeMaxDepthPlusOne,
      weightType,
      tableViewOptions,
      onTableViewOptionsChange,
    } = this.props;
    if (tree.getRoots().length === 0) {
      return <CallTreeEmptyReasons />;
    }
    return (
      <TreeView
        tree={tree}
        fixedColumns={this._weightTypeToColumns(weightType)}
        mainColumn={this._mainColumn}
        appendageColumn={this._appendageColumn}
        onSelectionChange={this._onSelectedCallNodeChange}
        onRightClickSelection={this._onRightClickSelection}
        onExpandedNodesChange={this._onExpandedCallNodesChange}
        selectedNodeId={selectedCallNodeIndex}
        rightClickedNodeId={rightClickedCallNodeIndex}
        expandedNodeIds={expandedCallNodeIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        ref={this._takeTreeViewRef}
        contextMenuId="CallNodeContextMenu"
        maxNodeDepth={callNodeMaxDepthPlusOne}
        rowHeight={16}
        indentWidth={10}
        onKeyDown={this._onKeyDown}
        onEnterKey={this._onEnterOrDoubleClick}
        onDoubleClick={this._onEnterOrDoubleClick}
        viewOptions={tableViewOptions}
        onViewOptionsChange={onTableViewOptionsChange}
      />
    );
  }
}

export const UpperWing = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    tree: selectedThreadSelectors.getUpperWingCallTree(state),
    callNodeInfo: selectedThreadSelectors.getUpperWingCallNodeInfo(state),
    categories: getCategories(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getUpperWingSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getUpperWingRightClickedCallNodeIndex(state),
    expandedCallNodeIndexes:
      selectedThreadSelectors.getUpperWingExpandedCallNodeIndexes(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelection(state).isModifying,
    // Use the filtered call node max depth, rather than the preview filtered call node
    // max depth so that the width of the TreeView component is stable across preview
    // selections.
    callNodeMaxDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
  }),
  mapDispatchToProps: {
    changeUpperWingSelectedCallNode,
    changeUpperWingRightClickedCallNode,
    changeUpperWingExpandedCallNodes,
    addTransformToStack,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('function-list', options),
  },
  component: UpperWingImpl,
});
