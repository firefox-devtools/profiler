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
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelection,
  getCurrentTableViewOptions,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeRightClickedFunctionIndex,
  changeSelectedFunctionIndex,
  addTransformToStack,
  changeTableViewOptions,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import {
  treeColumnsForTracingMs,
  treeColumnsForSamples,
  treeColumnsForBytes,
} from './columns';

import type {
  State,
  ThreadsKey,
  IndexIntoFuncTable,
  CallNodeDisplayData,
  WeightType,
  TableViewOptions,
  SelectionContext,
} from 'firefox-profiler/types';
import type { FunctionListTree } from 'firefox-profiler/profile-logic/call-tree';

import type {
  Column,
  MaybeResizableColumn,
} from 'firefox-profiler/components/shared/TreeView';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallTree.css';

type StateProps = {|
  +threadsKey: ThreadsKey,
  +scrollToSelectionGeneration: number,
  +focusCallTreeGeneration: number,
  +tree: FunctionListTree,
  +selectedFunctionIndex: IndexIntoFuncTable | null,
  +rightClickedFunctionIndex: IndexIntoFuncTable | null,
  +searchStringsRegExp: RegExp | null,
  +disableOverscan: boolean,
  +weightType: WeightType,
  +tableViewOptions: TableViewOptions,
|};

type DispatchProps = {|
  +changeSelectedFunctionIndex: typeof changeSelectedFunctionIndex,
  +changeRightClickedFunctionIndex: typeof changeRightClickedFunctionIndex,
  +addTransformToStack: typeof addTransformToStack,
  +updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen,
  +onTableViewOptionsChange: (TableViewOptions) => any,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class FunctionListImpl extends PureComponent<Props> {
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

  _expandedIndexes: Array<IndexIntoFuncTable | null> = [];

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

    if (this.props.selectedFunctionIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.focusCallTreeGeneration > prevProps.focusCallTreeGeneration
    ) {
      this.focus();
    }

    if (
      this.props.selectedFunctionIndex !== null &&
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

  _onSelectionChange = (
    newSelectedFunction: IndexIntoFuncTable,
    context: SelectionContext
  ) => {
    const { threadsKey, changeSelectedFunctionIndex } = this.props;
    changeSelectedFunctionIndex(threadsKey, newSelectedFunction, context);
  };

  _onRightClickSelection = (newSelectedFunction: IndexIntoFuncTable) => {
    const { threadsKey, changeRightClickedFunctionIndex } = this.props;
    changeRightClickedFunctionIndex(threadsKey, newSelectedFunction);
  };

  _onExpandedCallNodesChange = (
    _newExpandedCallNodeIndexes: Array<IndexIntoFuncTable | null>
  ) => {};

  _onKeyDown = (_event: SyntheticKeyboardEvent<>) => {
    // const {
    //   selectedFunctionIndex,
    //   rightClickedFunctionIndex,
    //   threadsKey,
    // } = this.props;
    // const nodeIndex =
    //   rightClickedFunctionIndex !== null
    //     ? rightClickedFunctionIndex
    //     : selectedFunctionIndex;
    // if (nodeIndex === null) {
    //   return;
    // }
    // handleCallNodeTransformShortcut(event, threadsKey, nodeIndex);
  };

  _onEnterOrDoubleClick = (_nodeId: IndexIntoFuncTable) => {
    // const { tree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    // const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(nodeId);
    // updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo);
  };

  render() {
    const {
      tree,
      selectedFunctionIndex,
      rightClickedFunctionIndex,
      searchStringsRegExp,
      disableOverscan,
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
        onSelectionChange={this._onSelectionChange}
        onRightClickSelection={this._onRightClickSelection}
        onExpandedNodesChange={this._onExpandedCallNodesChange}
        selectedNodeId={selectedFunctionIndex}
        rightClickedNodeId={rightClickedFunctionIndex}
        expandedNodeIds={this._expandedIndexes}
        highlightRegExp={searchStringsRegExp}
        disableOverscan={disableOverscan}
        ref={this._takeTreeViewRef}
        contextMenuId="FunctionListContextMenu"
        maxNodeDepth={1}
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

export const FunctionList = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    focusCallTreeGeneration: getFocusCallTreeGeneration(state),
    tree: selectedThreadSelectors.getFunctionListTree(state),
    selectedFunctionIndex:
      selectedThreadSelectors.getSelectedFunctionIndex(state),
    rightClickedFunctionIndex:
      selectedThreadSelectors.getRightClickedFunctionIndex(state),
    searchStringsRegExp: getSearchStringsAsRegExp(state),
    disableOverscan: getPreviewSelection(state).isModifying,
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
  }),
  mapDispatchToProps: {
    changeSelectedFunctionIndex,
    changeRightClickedFunctionIndex,
    addTransformToStack,
    updateBottomBoxContentsAndMaybeOpen,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('function-list', options),
  },
  component: FunctionListImpl,
});
