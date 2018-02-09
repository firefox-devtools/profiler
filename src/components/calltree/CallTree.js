/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import TreeView from '../shared/TreeView';
import NodeIcon from './NodeIcon';
import { getCallNodePath } from '../../profile-logic/profile-data';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadIndex,
} from '../../reducers/url-state';
import {
  selectedThreadSelectors,
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import { getIconsWithClassNames } from '../../reducers/icons';
import {
  changeSelectedCallNode,
  changeExpandedCallNodes,
  expandSingleBranchedDescendants,
  addTransformToStack,
} from '../../actions/profile-view';

import type { IconWithClassName, State } from '../../types/reducers';
import type { CallTree } from '../../profile-logic/call-tree';
import type { ImplementationFilter } from '../../types/actions';
import type { ThreadIndex } from '../../types/profile';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
} from '../../types/profile-derived';
import type { Column } from '../shared/TreeView';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +threadIndex: ThreadIndex,
  +scrollToSelectionGeneration: number,
  +focusCallTreeGeneration: number,
  +tree: CallTree,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>,
  +searchStringsRegExp: RegExp | null,
  +disableOverscan: boolean,
  +invertCallstack: boolean,
  +implementationFilter: ImplementationFilter,
  +icons: IconWithClassName[],
  +callNodeMaxDepth: number,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +changeExpandedCallNodes: typeof changeExpandedCallNodes,
  +expandSingleBranchedDescendants: (
    ThreadIndex,
    IndexIntoCallNodeTable
  ) => IndexIntoCallNodeTable,
  +addTransformToStack: typeof addTransformToStack,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CallTreeComponent extends PureComponent<Props> {
  _fixedColumns: Column[];
  _mainColumn: Column;
  _appendageColumn: Column;
  _appendageButtons: string[];
  _treeView: TreeView<IndexIntoCallNodeTable, CallNodeDisplayData> | null;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  constructor(props: Props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTimePercent', title: '' },
      { propName: 'totalTime', title: 'Running Time (ms)' },
      { propName: 'selfTime', title: 'Self (ms)' },
      { propName: 'icon', title: '', component: NodeIcon },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._appendageColumn = { propName: 'lib', title: '' };
    this._appendageButtons = ['focusCallstackButton'];
    this._treeView = null;
  }

  componentDidMount() {
    this.focus();
    this.procureInterestingInitialSelection();
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
      getCallNodePath(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
  };

  _onExpandedCallNodesChange = (
    newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    const { callNodeInfo, threadIndex, changeExpandedCallNodes } = this.props;
    changeExpandedCallNodes(
      threadIndex,
      newExpandedCallNodeIndexes.map(callNodeIndex =>
        getCallNodePath(callNodeIndex, callNodeInfo.callNodeTable)
      )
    );
  };

  _onExpandNode = (
    callNodeIndex: IndexIntoCallNodeTable
  ): IndexIntoCallNodeTable => {
    return this.props.expandSingleBranchedDescendants(
      this.props.threadIndex,
      callNodeIndex
    );
  };

  _onAppendageButtonClick = (callNodeIndex: IndexIntoCallNodeTable | null) => {
    const {
      callNodeInfo,
      threadIndex,
      addTransformToStack,
      implementationFilter: implementation,
      invertCallstack,
    } = this.props;
    const callNodePath = getCallNodePath(
      callNodeIndex,
      callNodeInfo.callNodeTable
    );
    addTransformToStack(threadIndex, {
      type: 'focus-subtree',
      callNodePath,
      implementation,
      inverted: invertCallstack,
    });
  };

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedCallNodeIndexes } = this.props;
    const newExpandedCallNodeIndexes = expandedCallNodeIndexes.slice();
    const maxInterestingDepth = 17; // scientifically determined
    let currentCallNodeIndex = tree.getRoots()[0];
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
    this._onSelectedCallNodeChange(currentCallNodeIndex);
  }

  render() {
    const {
      tree,
      selectedCallNodeIndex,
      expandedCallNodeIndexes,
      searchStringsRegExp,
      disableOverscan,
      callNodeMaxDepth,
    } = this.props;
    return (
      <TreeView
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        appendageColumn={this._appendageColumn}
        onSelectionChange={this._onSelectedCallNodeChange}
        onExpandedNodesChange={this._onExpandedCallNodesChange}
        selectedNodeId={selectedCallNodeIndex}
        expandedNodeIds={expandedCallNodeIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        appendageButtons={this._appendageButtons}
        onAppendageButtonClick={this._onAppendageButtonClick}
        onExpandNode={this._onExpandNode}
        ref={this._takeTreeViewRef}
        contextMenuId={'ProfileCallTreeContextMenu'}
        maxNodeDepth={callNodeMaxDepth}
        icons={this.props.icons}
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: (state: State) => ({
    threadIndex: getSelectedThreadIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    focusCallTreeGeneration: getFocusCallTreeGeneration(state),
    tree: selectedThreadSelectors.getCallTree(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
      state
    ),
    expandedCallNodeIndexes: selectedThreadSelectors.getExpandedCallNodeIndexes(
      state
    ),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getProfileViewOptions(state).selection.isModifying,
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    icons: getIconsWithClassNames(state),
    callNodeMaxDepth: selectedThreadSelectors.getCallNodeMaxDepth(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeExpandedCallNodes,
    expandSingleBranchedDescendants,
    addTransformToStack,
  },
  options: { withRef: true },
  component: CallTreeComponent,
};

export default explicitConnect(options);
