/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import {
  CalleesFlameGraph,
  type CalleesFlameGraphHandle,
} from './CalleesFlameGraph';
import {
  CallersFlameGraph,
  type CallersFlameGraphHandle,
} from './CallersFlameGraph';
import { nameColumn, libColumn, treeColumnsForWeightType } from './columns';
import {
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
  getCalleesView,
  getCallersView,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getCategories,
  getCurrentTableViewOptions,
  getPreviewSelectionIsBeingModified,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeFuncPanelSelectedCallNode,
  changeFuncPanelRightClickedCallNode,
  changeFuncPanelExpandedCallNodes,
  addTransformToStack,
  handleCallNodeTransformShortcut,
  changeTableViewOptions,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import type {
  State,
  ThreadsKey,
  CategoryList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  WeightType,
  TableViewOptions,
  SelectionContext,
  FuncPanelViewType,
  CallNodePath,
  FuncPanelName,
} from 'firefox-profiler/types';
import type { CallTree as CallTreeType } from 'firefox-profiler/profile-logic/call-tree';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallTree.css';

// Structural interface satisfied by both panel flame graph components' ref
// handles. Used so the shared impl can call focus() on either.
type FuncPanelFlameGraphHandle = { focus(): void };

type StateProps = {
  readonly threadsKey: ThreadsKey;
  readonly scrollToSelectionGeneration: number;
  readonly tree: CallTreeType;
  readonly callNodeInfo: CallNodeInfo;
  readonly categories: CategoryList;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>;
  readonly searchStringsRegExp: RegExp | null;
  readonly disableOverscan: boolean;
  readonly callNodeMaxDepthPlusOne: number;
  readonly weightType: WeightType;
  readonly tableViewOptions: TableViewOptions;
  readonly view: FuncPanelViewType;
};

type DispatchProps = {
  readonly changeSelectedCallNode: (
    threadsKey: ThreadsKey,
    path: CallNodePath,
    context?: SelectionContext
  ) => any;
  readonly changeRightClickedCallNode: (
    threadsKey: ThreadsKey,
    path: CallNodePath | null
  ) => any;
  readonly changeExpandedCallNodes: (
    threadsKey: ThreadsKey,
    paths: Array<CallNodePath>
  ) => any;
  readonly addTransformToStack: typeof addTransformToStack;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly onTableViewOptionsChange: (options: TableViewOptions) => any;
};

// Panel-specific bits that vary between the callees and callers panels.
// Injected by each wrapper below.
type FuncPanelConfigProps = {
  readonly contextMenuId: string;
  readonly renderFlameGraph: (
    ref: React.RefObject<FuncPanelFlameGraphHandle | null>
  ) => React.ReactNode;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps> &
  FuncPanelConfigProps;

class FuncPanelCallTreeImpl extends PureComponent<Props> {
  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = (treeView: TreeView<CallNodeDisplayData> | null) => {
    this._treeView = treeView;
  };
  _flameGraphRef: React.RefObject<FuncPanelFlameGraphHandle | null> =
    React.createRef();

  override componentDidMount() {
    this.focus();
    this.maybeProcureInterestingInitialSelection();

    if (this.props.selectedCallNodeIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  override componentDidUpdate(prevProps: Props) {
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
    if (this.props.view === 'flame-graph') {
      this._flameGraphRef.current?.focus();
      return;
    }
    if (this._treeView) {
      this._treeView.focus();
    }
  }

  _onSelectedCallNodeChange = (
    newSelectedCallNode: IndexIntoCallNodeTable,
    context: SelectionContext
  ) => {
    const { callNodeInfo, threadsKey, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(newSelectedCallNode),
      context
    );
  };

  _onRightClickSelection = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(newSelectedCallNode)
    );
  };

  _onExpandedCallNodesChange = (
    newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    const { callNodeInfo, threadsKey, changeExpandedCallNodes } = this.props;
    changeExpandedCallNodes(
      threadsKey,
      newExpandedCallNodeIndexes.map((callNodeIndex) =>
        callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
      )
    );
  };

  _onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const {
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      callNodeInfo,
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
    handleCallNodeTransformShortcut(event, threadsKey, callNodeInfo, nodeIndex);
  };

  _onEnterOrDoubleClick = (nodeId: IndexIntoCallNodeTable) => {
    const { tree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(nodeId);
    updateBottomBoxContentsAndMaybeOpen('function-list', bottomBoxInfo);
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

  _renderCallTree() {
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
      contextMenuId,
    } = this.props;
    if (tree.getRoots().length === 0) {
      return <CallTreeEmptyReasons />;
    }
    return (
      <TreeView
        tree={tree}
        fixedColumns={treeColumnsForWeightType(weightType)}
        mainColumn={nameColumn}
        appendageColumn={libColumn}
        onSelectionChange={this._onSelectedCallNodeChange}
        onRightClickSelection={this._onRightClickSelection}
        onExpandedNodesChange={this._onExpandedCallNodesChange}
        selectedNodeId={selectedCallNodeIndex}
        rightClickedNodeId={rightClickedCallNodeIndex}
        expandedNodeIds={expandedCallNodeIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        ref={this._takeTreeViewRef}
        contextMenuId={contextMenuId}
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

  override render() {
    if (this.props.view === 'call-tree') {
      return this._renderCallTree();
    }
    return this.props.renderFlameGraph(this._flameGraphRef);
  }
}

function makeMapDispatchToProps(panel: FuncPanelName) {
  return {
    changeSelectedCallNode: (
      threadsKey: ThreadsKey,
      path: CallNodePath,
      context?: SelectionContext
    ) => changeFuncPanelSelectedCallNode(panel, threadsKey, path, context),
    changeRightClickedCallNode: (
      threadsKey: ThreadsKey,
      path: CallNodePath | null
    ) => changeFuncPanelRightClickedCallNode(panel, threadsKey, path),
    changeExpandedCallNodes: (
      threadsKey: ThreadsKey,
      paths: Array<CallNodePath>
    ) => changeFuncPanelExpandedCallNodes(panel, threadsKey, paths),
    addTransformToStack,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('calltree', options),
  };
}

const renderCalleesFlameGraph = (
  ref: React.RefObject<FuncPanelFlameGraphHandle | null>
) => <CalleesFlameGraph ref={ref as React.Ref<CalleesFlameGraphHandle>} />;

const renderCallersFlameGraph = (
  ref: React.RefObject<FuncPanelFlameGraphHandle | null>
) => <CallersFlameGraph ref={ref as React.Ref<CallersFlameGraphHandle>} />;

function CalleesComponent(
  props: ConnectedProps<{}, StateProps, DispatchProps>
) {
  return (
    <FuncPanelCallTreeImpl
      {...props}
      contextMenuId="CallNodeContextMenu"
      renderFlameGraph={renderCalleesFlameGraph}
    />
  );
}

function CallersComponent(
  props: ConnectedProps<{}, StateProps, DispatchProps>
) {
  return (
    <FuncPanelCallTreeImpl
      {...props}
      contextMenuId="CallersContextMenu"
      renderFlameGraph={renderCallersFlameGraph}
    />
  );
}

export const CalleesCallTree = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state: State): StateProps => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    tree: selectedThreadSelectors.getCalleesCallTree(state),
    callNodeInfo: selectedThreadSelectors.getCalleesCallNodeInfo(state),
    categories: getCategories(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getCalleesSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getCalleesRightClickedCallNodeIndex(state),
    expandedCallNodeIndexes:
      selectedThreadSelectors.getCalleesExpandedCallNodeIndexes(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelectionIsBeingModified(state),
    // Use the filtered call node max depth, rather than the preview filtered
    // call node max depth so that the width of the TreeView component is stable
    // across preview selections.
    callNodeMaxDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
    view: getCalleesView(state),
  }),
  mapDispatchToProps: makeMapDispatchToProps('callees'),
  component: CalleesComponent,
});

export const CallersCallTree = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state: State): StateProps => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    tree: selectedThreadSelectors.getCallersCallTree(state),
    callNodeInfo: selectedThreadSelectors.getCallersCallNodeInfo(state),
    categories: getCategories(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getCallersSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getCallersRightClickedCallNodeIndex(state),
    expandedCallNodeIndexes:
      selectedThreadSelectors.getCallersExpandedCallNodeIndexes(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelectionIsBeingModified(state),
    callNodeMaxDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
    view: getCallersView(state),
  }),
  mapDispatchToProps: makeMapDispatchToProps('callers'),
  component: CallersComponent,
});
