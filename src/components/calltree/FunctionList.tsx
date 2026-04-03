/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  TreeView,
  ColumnSortState,
} from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import {
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
  getFunctionListSort,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getCurrentTableViewOptions,
  getPreviewSelectionIsBeingModified,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeRightClickedFunctionIndex,
  changeSelectedFunctionIndex,
  addTransformToStack,
  changeTableViewOptions,
  updateBottomBoxContentsAndMaybeOpen,
  changeFunctionListSort,
  handleFunctionTransformShortcut,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import {
  functionListColumnsForTracingMs,
  functionListColumnsForSamples,
  functionListColumnsForBytes,
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
import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';

import type {
  Column,
  MaybeResizableColumn,
  SingleColumnSortState,
} from 'firefox-profiler/components/shared/TreeView';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallTree.css';

const DEFAULT_FUNCTION_LIST_SORT: SingleColumnSortState[] = [
  { column: 'total', ascending: false },
];

type StateProps = {
  readonly threadsKey: ThreadsKey;
  readonly scrollToSelectionGeneration: number;
  readonly focusCallTreeGeneration: number;
  readonly tree: CallTree;
  readonly selectedFunctionIndex: IndexIntoFuncTable | null;
  readonly rightClickedFunctionIndex: IndexIntoFuncTable | null;
  readonly searchStringsRegExp: RegExp | null;
  readonly disableOverscan: boolean;
  readonly weightType: WeightType;
  readonly tableViewOptions: TableViewOptions;
  readonly sort: SingleColumnSortState[];
};

type DispatchProps = {
  readonly changeSelectedFunctionIndex: typeof changeSelectedFunctionIndex;
  readonly changeRightClickedFunctionIndex: typeof changeRightClickedFunctionIndex;
  readonly addTransformToStack: typeof addTransformToStack;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly handleFunctionTransformShortcut: typeof handleFunctionTransformShortcut;
  readonly onTableViewOptionsChange: (opts: TableViewOptions) => any;
  readonly changeFunctionListSort: typeof changeFunctionListSort;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

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
  _takeTreeViewRef = (treeView: TreeView<CallNodeDisplayData>) =>
    (this._treeView = treeView);

  _expandedIndexes: Array<IndexIntoFuncTable | null> = [];

  _getSortedColumns = memoize(
    (sort: SingleColumnSortState[]) =>
      new ColumnSortState(sort.length > 0 ? sort : DEFAULT_FUNCTION_LIST_SORT)
  );

  _onColumnSortChange = (sortedColumns: ColumnSortState) => {
    this.props.changeFunctionListSort(sortedColumns.sortedColumns);
  };

  /**
   * Call Trees can have different types of "weights" for the data. Choose the
   * appropriate labels for the call tree based on this weight.
   */
  _weightTypeToColumns = memoize(
    (weightType: WeightType): MaybeResizableColumn<CallNodeDisplayData>[] => {
      switch (weightType) {
        case 'tracing-ms':
          return functionListColumnsForTracingMs;
        case 'samples':
          return functionListColumnsForSamples;
        case 'bytes':
          return functionListColumnsForBytes;
        default:
          throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
      }
    },
    // Use a Map cache, as the function only takes one argument, which is a simple string.
    { cache: new Map() }
  );

  override componentDidMount() {
    this.focus();

    if (this.props.selectedFunctionIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  override componentDidUpdate(prevProps: Props) {
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

  _onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const {
      selectedFunctionIndex,
      rightClickedFunctionIndex,
      threadsKey,
      handleFunctionTransformShortcut,
    } = this.props;
    const funcIndex =
      rightClickedFunctionIndex !== null
        ? rightClickedFunctionIndex
        : selectedFunctionIndex;
    if (funcIndex === null) {
      return;
    }
    handleFunctionTransformShortcut(event, threadsKey, funcIndex);
  };

  _onEnterOrDoubleClick = (_nodeId: IndexIntoFuncTable) => {
    // const { tree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    // const bottomBoxInfo = tree.getBottomBoxInfoForCallNode(nodeId);
    // updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo);
  };

  override render() {
    const {
      tree,
      selectedFunctionIndex,
      rightClickedFunctionIndex,
      searchStringsRegExp,
      disableOverscan,
      weightType,
      tableViewOptions,
      onTableViewOptionsChange,
      sort,
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
        sortedColumns={this._getSortedColumns(sort)}
        onColumnSortChange={this._onColumnSortChange}
      />
    );
  }
}

export const FunctionList = explicitConnect<{}, StateProps, DispatchProps>({
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
    disableOverscan: getPreviewSelectionIsBeingModified(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
    sort: getFunctionListSort(state),
  }),
  mapDispatchToProps: {
    changeSelectedFunctionIndex,
    changeRightClickedFunctionIndex,
    addTransformToStack,
    updateBottomBoxContentsAndMaybeOpen,
    handleFunctionTransformShortcut,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('calltree', options),
    changeFunctionListSort,
  },
  component: FunctionListImpl,
});
