/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import TreeView from '../shared/TreeView';
import CallTreeEmptyReasons from './CallTreeEmptyReasons';
import NodeIcon from '../shared/NodeIcon';
import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadIndex,
} from 'selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelection,
} from 'selectors/profile';
import { selectedThreadSelectors } from 'selectors/per-thread';
import { getIconsWithClassNames } from 'selectors/icons';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  addTransformToStack,
} from '../../actions/profile-view';
import { assertExhaustiveCheck } from '../../utils/flow';

import type { IconWithClassName, State } from '../../types/state';
import type { CallTree } from '../../profile-logic/call-tree';
import type {
  ImplementationFilter,
  CallTreeSummaryStrategy,
} from '../../types/actions';
import type { ThreadIndex } from '../../types/profile';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
} from '../../types/profile-derived';
import type { Column } from '../shared/TreeView';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +threadIndex: ThreadIndex,
  +scrollToSelectionGeneration: number,
  +focusCallTreeGeneration: number,
  +tree: CallTree,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>,
  +searchStringsRegExp: RegExp | null,
  +disableOverscan: boolean,
  +invertCallstack: boolean,
  +implementationFilter: ImplementationFilter,
  +icons: IconWithClassName[],
  +callNodeMaxDepth: number,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +changeRightClickedCallNode: typeof changeRightClickedCallNode,
  +changeExpandedCallNodes: typeof changeExpandedCallNodes,
  +addTransformToStack: typeof addTransformToStack,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CallTreeComponent extends PureComponent<Props> {
  _fixedColumnsTiming: Column[] = [
    { propName: 'totalTimePercent', title: '' },
    { propName: 'totalTime', title: 'Running Time (ms)' },
    { propName: 'selfTime', title: 'Self (ms)' },
    { propName: 'icon', title: '', component: NodeIcon },
  ];
  _fixedColumnsAllocations: Column[] = [
    { propName: 'totalTimePercent', title: '' },
    { propName: 'totalTime', title: 'Total Size (bytes)' },
    { propName: 'selfTime', title: 'Self (bytes)' },
    { propName: 'icon', title: '', component: NodeIcon },
  ];
  _mainColumn: Column = { propName: 'name', title: '' };
  _appendageColumn: Column = { propName: 'lib', title: '' };
  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  componentDidMount() {
    this.focus();
    if (this.props.selectedCallNodeIndex === null) {
      this.procureInterestingInitialSelection();
    } else if (this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.scrollToSelectionGeneration >
      prevProps.scrollToSelectionGeneration
    ) {
      if (this._treeView) {
        this._treeView.scrollSelectionIntoView();
      }
    }

    if (
      this.props.focusCallTreeGeneration > prevProps.focusCallTreeGeneration
    ) {
      this.focus();
    }
  }

  focus() {
    if (this._treeView) {
      this._treeView.focus();
    }
  }

  _onSelectedCallNodeChange = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadIndex, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadIndex,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
  };

  _onRightClickSelection = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const {
      callNodeInfo,
      threadIndex,
      changeRightClickedCallNode,
    } = this.props;
    changeRightClickedCallNode(
      threadIndex,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
  };

  _onExpandedCallNodesChange = (
    newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    const { callNodeInfo, threadIndex, changeExpandedCallNodes } = this.props;
    changeExpandedCallNodes(
      threadIndex,
      newExpandedCallNodeIndexes.map(callNodeIndex =>
        getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
      )
    );
  };

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedCallNodeIndexes } = this.props;
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
      currentCallNodeIndex = children[0];
      newExpandedCallNodeIndexes.push(currentCallNodeIndex);
    }
    this._onExpandedCallNodesChange(newExpandedCallNodeIndexes);

    const category = tree.getDisplayData(currentCallNodeIndex).categoryName;
    if (category !== 'Idle') {
      // If we selected the call node with a "idle" category, we'd have a
      // completely dimmed activity graph because idle stacks are not drawn in
      // this graph. Because this isn't probably what the average user wants we
      // do it only when the category is something different.
      this._onSelectedCallNodeChange(currentCallNodeIndex);
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
      callNodeMaxDepth,
      callTreeSummaryStrategy,
    } = this.props;
    if (tree.getRoots().length === 0) {
      return <CallTreeEmptyReasons />;
    }
    let fixedColumns;
    switch (callTreeSummaryStrategy) {
      case 'timing':
        fixedColumns = this._fixedColumnsTiming;
        break;
      case 'native-retained-allocations':
      case 'native-allocations':
      case 'native-deallocations':
      case 'js-allocations':
        fixedColumns = this._fixedColumnsAllocations;
        break;
      default:
        throw assertExhaustiveCheck(callTreeSummaryStrategy);
    }
    return (
      <TreeView
        tree={tree}
        fixedColumns={fixedColumns}
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
        maxNodeDepth={callNodeMaxDepth}
        icons={this.props.icons}
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => ({
    threadIndex: getSelectedThreadIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    focusCallTreeGeneration: getFocusCallTreeGeneration(state),
    tree: selectedThreadSelectors.getCallTree(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
      state
    ),
    rightClickedCallNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(
      state
    ),
    expandedCallNodeIndexes: selectedThreadSelectors.getExpandedCallNodeIndexes(
      state
    ),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelection(state).isModifying,
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    icons: getIconsWithClassNames(state),
    callNodeMaxDepth: selectedThreadSelectors.getCallNodeMaxDepth(state),
    callTreeSummaryStrategy: selectedThreadSelectors.getCallTreeSummaryStrategy(
      state
    ),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    addTransformToStack,
  },
  options: { withRef: true },
  component: CallTreeComponent,
});
