/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import TreeView from '../shared/TreeView';
import NodeIcon from './NodeIcon';
import { getStackAsFuncArray } from '../../profile-logic/profile-data';
import {
  getInvertCallstack,
  getImplementationFilter,
  getSearchString,
  getSelectedThreadIndex,
} from '../../reducers/url-state';
import {
  getProfile,
  selectedThreadSelectors,
  getScrollToSelectionGeneration,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import { getIconsWithClassNames } from '../../reducers/icons';

import {
  changeSelectedStack,
  changeExpandedStacks,
  addCallTreeFilter,
} from '../../actions/profile-view';

import type { IconWithClassName, State } from '../../types/reducers';
import type { ProfileTreeClass } from '../../profile-logic/profile-tree';
import type {
  Thread,
  ThreadIndex,
  IndexIntoStackTable,
} from '../../types/profile';
import type { Column } from '../shared/TreeView';

type Props = {
  thread: Thread,
  threadIndex: ThreadIndex,
  scrollToSelectionGeneration: number,
  interval: number,
  tree: ProfileTreeClass,
  selectedStack: IndexIntoStackTable | null,
  expandedStacks: Array<IndexIntoStackTable | null>,
  searchString: string,
  disableOverscan: boolean,
  implementationFilter: string,
  invertCallstack: boolean,
  icons: IconWithClassName[],
  changeSelectedStack: typeof changeSelectedStack,
  changeExpandedStacks: typeof changeExpandedStacks,
  addCallTreeFilter: typeof addCallTreeFilter,
};

class ProfileTreeView extends PureComponent {
  props: Props;
  _fixedColumns: Column[];
  _mainColumn: Column;
  _appendageColumn: Column;
  _appendageButtons: string[];
  _treeView: TreeView | null;

  constructor(props: Props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
      { propName: 'icon', title: '', component: NodeIcon },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._appendageColumn = { propName: 'lib', title: '' };
    this._appendageButtons = ['focusCallstackButton'];
    this._treeView = null;
    (this: any)._onSelectedStackChange = this._onSelectedStackChange.bind(this);
    (this: any)._onExpandedStacksChange = this._onExpandedStacksChange.bind(
      this
    );
    (this: any)._onAppendageButtonClick = this._onAppendageButtonClick.bind(
      this
    );
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
  }

  focus() {
    if (this._treeView) {
      this._treeView.focus();
    }
  }

  _onSelectedStackChange(stackIndex: IndexIntoStackTable) {
    const { threadIndex, changeSelectedStack, thread } = this.props;
    changeSelectedStack(threadIndex, getStackAsFuncArray(stackIndex, thread));
  }

  _onExpandedStacksChange(
    newExpandedStacks: Array<IndexIntoStackTable | null>
  ) {
    const { threadIndex, changeExpandedStacks, thread } = this.props;
    changeExpandedStacks(
      threadIndex,
      newExpandedStacks.map(stackIndex =>
        getStackAsFuncArray(stackIndex, thread)
      )
    );
  }

  _onAppendageButtonClick(stackIndex: IndexIntoStackTable | null) {
    const {
      threadIndex,
      addCallTreeFilter,
      implementationFilter,
      invertCallstack,
      thread,
    } = this.props;
    const jsOnly = implementationFilter === 'js';
    if (invertCallstack) {
      addCallTreeFilter(threadIndex, {
        type: 'postfix',
        postfixFuncs: getStackAsFuncArray(stackIndex, thread),
        matchJSOnly: jsOnly,
      });
    } else {
      addCallTreeFilter(threadIndex, {
        type: 'prefix',
        prefixFuncs: getStackAsFuncArray(stackIndex, thread),
        matchJSOnly: jsOnly,
      });
    }
  }

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedStacks } = this.props;
    const newExpandedStacks = expandedStacks.slice();
    const maxInterestingDepth = 17; // scientifically determined
    let currentStack = tree.getRoots()[0];
    newExpandedStacks.push(currentStack);
    for (let i = 0; i < maxInterestingDepth; i++) {
      const children = tree.getChildren(currentStack);
      if (children.length === 0) {
        break;
      }
      currentStack = children[0];
      newExpandedStacks.push(currentStack);
    }
    this._onExpandedStacksChange(newExpandedStacks);
    this._onSelectedStackChange(currentStack);
  }

  render() {
    const {
      tree,
      selectedStack,
      expandedStacks,
      searchString,
      disableOverscan,
    } = this.props;
    return (
      <TreeView
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        appendageColumn={this._appendageColumn}
        onSelectionChange={this._onSelectedStackChange}
        onExpandedNodesChange={this._onExpandedStacksChange}
        selectedNodeId={selectedStack}
        expandedNodeIds={expandedStacks}
        highlightString={searchString.toLowerCase()}
        disableOverscan={disableOverscan}
        appendageButtons={this._appendageButtons}
        onAppendageButtonClick={this._onAppendageButtonClick}
        ref={ref => {
          this._treeView = ref;
        }}
        contextMenuId={'ProfileCallTreeContextMenu'}
        icons={this.props.icons}
      />
    );
  }
}

export default connect(
  (state: State) => ({
    thread: selectedThreadSelectors.getFilteredThread(state),
    threadIndex: getSelectedThreadIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    interval: getProfile(state).meta.interval,
    tree: selectedThreadSelectors.getCallTree(state),
    selectedStack: selectedThreadSelectors.getSelectedStack(state),
    expandedStacks: selectedThreadSelectors.getExpandedStacks(state),
    searchString: getSearchString(state),
    disableOverscan: getProfileViewOptions(state).selection.isModifying,
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    icons: getIconsWithClassNames(state),
  }),
  {
    changeSelectedStack,
    changeExpandedStacks,
    addCallTreeFilter,
  },
  null,
  { withRef: true }
)(ProfileTreeView);
