/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import { getCallNodePathFromIndex } from 'firefox-profiler/profile-logic/profile-data';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelection,
  getCategories,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  addTransformToStack,
  handleCallNodeTransformShortcut,
  openSourceView,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  State,
  ImplementationFilter,
  ThreadsKey,
  CallNodeInfo,
  CategoryList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  WeightType,
} from 'firefox-profiler/types';
import type { CallTree as CallTreeType } from 'firefox-profiler/profile-logic/call-tree';

import type { Column } from 'firefox-profiler/components/shared/TreeView';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallTree.css';

type StateProps = {|
  +threadsKey: ThreadsKey,
  +scrollToSelectionGeneration: number,
  +focusCallTreeGeneration: number,
  +tree: CallTreeType,
  +callNodeInfo: CallNodeInfo,
  +categories: CategoryList,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>,
  +searchStringsRegExp: RegExp | null,
  +disableOverscan: boolean,
  +invertCallstack: boolean,
  +implementationFilter: ImplementationFilter,
  +callNodeMaxDepth: number,
  +weightType: WeightType,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +changeRightClickedCallNode: typeof changeRightClickedCallNode,
  +changeExpandedCallNodes: typeof changeExpandedCallNodes,
  +addTransformToStack: typeof addTransformToStack,
  +handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut,
  +openSourceView: typeof openSourceView,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CallTreeImpl extends PureComponent<Props> {
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
    (weightType: WeightType): Column<CallNodeDisplayData>[] => {
      switch (weightType) {
        case 'tracing-ms':
          return [
            { propName: 'totalPercent', titleL10nId: '' },
            {
              propName: 'total',
              titleL10nId: 'CallTree--tracing-ms-total',
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--tracing-ms-self',
            },
            { propName: 'icon', titleL10nId: '', component: Icon },
          ];
        case 'samples':
          return [
            { propName: 'totalPercent', titleL10nId: '' },
            {
              propName: 'total',
              titleL10nId: 'CallTree--samples-total',
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--samples-self',
            },
            { propName: 'icon', titleL10nId: '', component: Icon },
          ];
        case 'bytes':
          return [
            { propName: 'totalPercent', titleL10nId: '' },
            {
              propName: 'total',
              titleL10nId: 'CallTree--bytes-total',
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--bytes-self',
            },
            { propName: 'icon', titleL10nId: '', component: Icon },
          ];
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

    if (this.props.selectedCallNodeIndex === null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.focusCallTreeGeneration > prevProps.focusCallTreeGeneration
    ) {
      this.focus();
    }

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

  _onSelectedCallNodeChange = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadsKey, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadsKey,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
  };

  _onRightClickSelection = (newSelectedCallNode: IndexIntoCallNodeTable) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(
      threadsKey,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
  };

  _onExpandedCallNodesChange = (
    newExpandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>
  ) => {
    const { callNodeInfo, threadsKey, changeExpandedCallNodes } = this.props;
    changeExpandedCallNodes(
      threadsKey,
      newExpandedCallNodeIndexes.map((callNodeIndex) =>
        getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
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
    const { tree, openSourceView } = this.props;
    const file = tree.getRawFileNameForCallNode(nodeId);
    if (file === null) {
      return;
    }
    openSourceView(file, 'calltree');
  };

  maybeProcureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const {
      tree,
      expandedCallNodeIndexes,
      selectedCallNodeIndex,
      callNodeInfo: { callNodeTable },
      categories,
    } = this.props;

    if (selectedCallNodeIndex !== null || expandedCallNodeIndexes.length > 0) {
      // Let's not change some existing state.
      return;
    }

    const newExpandedCallNodeIndexes = [];
    // This value is completely arbitrary and looked good on Julien's machine
    // when this was implemented. In the future we may want to look at the
    // available space instead.
    const maxVisibleLines = 70;

    const idleCategoryIndex = categories.findIndex(
      (category) => category.name === 'Idle'
    );

    let children = tree.getRoots();
    let nodeToSelect = null;
    let visibleLinesCount = children.length;

    while (true) {
      const firstNonIdleNode = children.find(
        (nodeIndex) => callNodeTable.category[nodeIndex] !== idleCategoryIndex
      );

      if (firstNonIdleNode === undefined) {
        break;
      }

      nodeToSelect = firstNonIdleNode;

      children = tree.getChildren(firstNonIdleNode);

      if (visibleLinesCount + children.length > maxVisibleLines) {
        // Expanding this node would exceed our budget.
        break;
      }

      newExpandedCallNodeIndexes.push(firstNonIdleNode);
      visibleLinesCount += children.length;
    }

    if (newExpandedCallNodeIndexes.length > 0) {
      // Take care to not trigger a state change if there's nothing to change,
      // to avoid infinite render loop.
      this._onExpandedCallNodesChange(newExpandedCallNodeIndexes);
    }

    if (nodeToSelect !== null) {
      this._onSelectedCallNodeChange(nodeToSelect);
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
      weightType,
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
        maxNodeDepth={callNodeMaxDepth}
        rowHeight={16}
        indentWidth={10}
        onKeyDown={this._onKeyDown}
        onEnterKey={this._onEnterOrDoubleClick}
        onDoubleClick={this._onEnterOrDoubleClick}
      />
    );
  }
}

export const CallTree = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    focusCallTreeGeneration: getFocusCallTreeGeneration(state),
    tree: selectedThreadSelectors.getCallTree(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    categories: getCategories(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getRightClickedCallNodeIndex(state),
    expandedCallNodeIndexes:
      selectedThreadSelectors.getExpandedCallNodeIndexes(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelection(state).isModifying,
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    // Use the filtered call node max depth, rather than the preview filtered call node
    // max depth so that the width of the TreeView component is stable across preview
    // selections.
    callNodeMaxDepth:
      selectedThreadSelectors.getFilteredCallNodeMaxDepth(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    addTransformToStack,
    handleCallNodeTransformShortcut,
    openSourceView,
  },
  component: CallTreeImpl,
});
