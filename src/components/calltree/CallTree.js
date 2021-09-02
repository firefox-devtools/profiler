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
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  addTransformToStack,
  handleCallNodeTransformShortcut,
  createSourceTabIfNeededAndSelect,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  State,
  ImplementationFilter,
  ThreadsKey,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  WeightType,
} from 'firefox-profiler/types';
import type { CallTree as CallTreeType } from 'firefox-profiler/profile-logic/call-tree';

import type { Column } from 'firefox-profiler/components/shared/TreeView';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +threadsKey: ThreadsKey,
  +scrollToSelectionGeneration: number,
  +focusCallTreeGeneration: number,
  +tree: CallTreeType,
  +callNodeInfo: CallNodeInfo,
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
  +createSourceTabIfNeededAndSelect: typeof createSourceTabIfNeededAndSelect,
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
  _takeTreeViewRef = treeView => (this._treeView = treeView);

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
      newExpandedCallNodeIndexes.map(callNodeIndex =>
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
    const { tree, createSourceTabIfNeededAndSelect } = this.props;
    const file = tree.getRawFileNameForCallNode(nodeId);
    if (file === null) {
      return;
    }
    createSourceTabIfNeededAndSelect(file);
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
    // Use the filtered call node max depth, rather than the preview filtered call node
    // max depth so that the width of the TreeView component is stable across preview
    // selections.
    callNodeMaxDepth: selectedThreadSelectors.getFilteredCallNodeMaxDepth(
      state
    ),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    addTransformToStack,
    handleCallNodeTransformShortcut,
    createSourceTabIfNeededAndSelect,
  },
  component: CallTreeImpl,
});
