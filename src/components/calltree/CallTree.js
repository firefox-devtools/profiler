/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import { oneLine } from 'common-tags';
import explicitConnect from '../../utils/connect';
import TreeView from '../shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import Icon from '../shared/Icon';
import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
} from '../../selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelection,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  addTransformToStack,
} from '../../actions/profile-view';
import { assertExhaustiveCheck } from '../../utils/flow';

import type {
  State,
  ImplementationFilter,
  ThreadsKey,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  WeightType,
} from 'firefox-profiler/types';
import type { CallTree as CallTreeType } from '../../profile-logic/call-tree';

import type { Column } from '../shared/TreeView';
import type { ConnectedProps } from '../../utils/connect';

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
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CallTreeImpl extends PureComponent<Props> {
  _mainColumn: Column = { propName: 'name', title: '' };
  _appendageColumn: Column = { propName: 'lib', title: '' };
  _treeView: TreeView<CallNodeDisplayData> | null = null;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  /**
   * Call Trees can have different types of "weights" for the data. Choose the
   * appropriate labels for the call tree based on this weight.
   */
  _weightTypeToColumns = memoize(
    (weightType: WeightType): Column[] => {
      switch (weightType) {
        case 'tracing-ms':
          return [
            { propName: 'totalPercent', title: '' },
            {
              propName: 'total',
              title: 'Running Time (ms)',
              tooltip: oneLine`
                The "total" running time includes a summary of all the time where this
                function was observed to be on the stack. This includes the time where
                the function was actually running, and the time spent in the callers from
                this function.
            `,
            },
            {
              propName: 'self',
              title: 'Self (ms)',
              tooltip: oneLine`
                The "self" time only includes the time where the function was
                the leaf-most one on the stack. If this function called into other functions,
                then the "other" functions' time is not included. The "self" time is useful
                for understanding where time was actually spent in a program.
            `,
            },
            { propName: 'icon', title: '', component: Icon },
          ];
        case 'samples':
          return [
            { propName: 'totalPercent', title: '' },
            {
              propName: 'total',
              title: 'Total (samples)',
              tooltip: oneLine`
                The "total" sample count includes a summary of every sample where this
                function was observed to be on the stack. This includes the time where the
                function was actually running, and the time spent in the callers from this
                function.
            `,
            },
            {
              propName: 'self',
              title: 'Self',
              tooltip: oneLine`
                The "self" sample count only includes the samples where the function was
                the leaf-most one on the stack. If this function called into other functions,
                then the "other" functions' counts are not included. The "self" count is useful
                for understanding where time was actually spent in a program.
            `,
            },
            { propName: 'icon', title: '', component: Icon },
          ];
        case 'bytes':
          return [
            { propName: 'totalPercent', title: '' },
            {
              propName: 'total',
              title: 'Total Size (bytes)',
              tooltip: oneLine`
                The "total size" includes a summary of all of the bytes allocated or
                deallocated while this function was observed to be on the stack. This
                includes both the bytes where the function was actually running, and the
                bytes of the callers from this function.
            `,
            },
            {
              propName: 'self',
              title: 'Self (bytes)',
              tooltip: oneLine`
                The "self" bytes includes the bytes allocated or deallocated while this
                function was the leaf-most one on the stack. If this function called into
                other functions, then the "other" functions' bytes are not included.
                The "self" bytes are useful for understanding where memory was actually
                allocated or deallocated in the program.
            `,
            },
            { propName: 'icon', title: '', component: Icon },
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
    callNodeMaxDepth: selectedThreadSelectors.getCallNodeMaxDepth(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    addTransformToStack,
  },
  component: CallTreeImpl,
});
