/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { CallTreeEmptyReasons } from './CallTreeEmptyReasons';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchStringsAsRegExp,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import {
  getScrollToSelectionGeneration,
  getFocusCallTreeGeneration,
  getPreviewSelectionIsBeingModified,
  getCategories,
  getCurrentTableViewOptions,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeExpandedCallNodes,
  addTransformToStack,
  handleCallNodeTransformShortcut,
  changeTableViewOptions,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type {
  State,
  ImplementationFilter,
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

type StateProps = {
  readonly threadsKey: ThreadsKey;
  readonly scrollToSelectionGeneration: number;
  readonly focusCallTreeGeneration: number;
  readonly tree: CallTreeType;
  readonly callNodeInfo: CallNodeInfo;
  readonly categories: CategoryList;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>;
  readonly searchStringsRegExp: RegExp | null;
  readonly disableOverscan: boolean;
  readonly invertCallstack: boolean;
  readonly implementationFilter: ImplementationFilter;
  readonly callNodeMaxDepthPlusOne: number;
  readonly weightType: WeightType;
  readonly tableViewOptions: TableViewOptions;
};

type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly changeExpandedCallNodes: typeof changeExpandedCallNodes;
  readonly addTransformToStack: typeof addTransformToStack;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly onTableViewOptionsChange: (param: TableViewOptions) => any;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

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
  _takeTreeViewRef = (treeView: TreeView<CallNodeDisplayData> | null) =>
    (this._treeView = treeView);

  /**
   * Call Trees can have different types of "weights" for the data. Choose the
   * appropriate labels for the call tree based on this weight.
   */
  _weightTypeToColumns = memoize(
    (weightType: WeightType): MaybeResizableColumn<CallNodeDisplayData>[] => {
      switch (weightType) {
        case 'tracing-ms':
          return [
            {
              propName: 'totalPercent',
              titleL10nId: '',
              initialWidth: 50,
              hideDividerAfter: true,
            },
            {
              propName: 'total',
              titleL10nId: 'CallTree--tracing-ms-total',
              minWidth: 30,
              initialWidth: 70,
              resizable: true,
              headerWidthAdjustment: 50,
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--tracing-ms-self',
              minWidth: 30,
              initialWidth: 70,
              resizable: true,
            },
            {
              propName: 'icon',
              titleL10nId: '',
              component: Icon as any,
              initialWidth: 10,
            },
          ];
        case 'samples':
          return [
            {
              propName: 'totalPercent',
              titleL10nId: '',
              initialWidth: 50,
              hideDividerAfter: true,
            },
            {
              propName: 'total',
              titleL10nId: 'CallTree--samples-total',
              minWidth: 30,
              initialWidth: 70,
              resizable: true,
              headerWidthAdjustment: 50,
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--samples-self',
              minWidth: 30,
              initialWidth: 70,
              resizable: true,
            },
            {
              propName: 'icon',
              titleL10nId: '',
              component: Icon as any,
              initialWidth: 10,
            },
          ];
        case 'bytes':
          return [
            {
              propName: 'totalPercent',
              titleL10nId: '',
              initialWidth: 50,
              hideDividerAfter: true,
            },
            {
              propName: 'total',
              titleL10nId: 'CallTree--bytes-total',
              minWidth: 30,
              initialWidth: 140,
              resizable: true,
              headerWidthAdjustment: 50,
            },
            {
              propName: 'self',
              titleL10nId: 'CallTree--bytes-self',
              minWidth: 30,
              initialWidth: 90,
              resizable: true,
            },
            {
              propName: 'icon',
              titleL10nId: '',
              component: Icon as any,
              initialWidth: 10,
            },
          ];
        default:
          throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
      }
    },
    // Use a Map cache, as the function only takes one argument, which is a simple string.
    { cache: new Map() }
  );

  override componentDidMount() {
    this.focus();
    this.maybeProcureInterestingInitialSelection();

    if (this.props.selectedCallNodeIndex !== null && this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  override componentDidUpdate(prevProps: Props) {
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

  override render() {
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

export const CallTree = explicitConnect<{}, StateProps, DispatchProps>({
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
    disableOverscan: getPreviewSelectionIsBeingModified(state),
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    // Use the filtered call node max depth, rather than the preview filtered call node
    // max depth so that the width of the TreeView component is stable across preview
    // selections.
    callNodeMaxDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tableViewOptions: getCurrentTableViewOptions(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeExpandedCallNodes,
    addTransformToStack,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
    onTableViewOptionsChange: (options: TableViewOptions) =>
      changeTableViewOptions('calltree', options),
  },
  component: CallTreeImpl,
});
