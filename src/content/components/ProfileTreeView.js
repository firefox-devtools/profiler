/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import NodeIcon from './NodeIcon';
import { getStackAsFuncArray } from '../profile-data';
import { getInvertCallstack, getImplementationFilter, getSelectedThreadIndex, getUserFilters } from '../reducers/url-state';
import {
  getProfile, selectedThreadSelectors, getScrollToSelectionGeneration, getProfileViewOptions,
} from '../reducers/profile-view';
import { getIconsWithClassNames } from '../reducers/icons';

import { changeSelectedFuncStack, changeExpandedFuncStacks, addCallTreeFilter } from '../actions/profile-view';

import type { IconWithClassName, State } from '../reducers/types';
import type { ProfileTreeClass } from '../profile-tree';
import type { Thread, ThreadIndex } from '../../common/types/profile';
import type { FuncStackInfo, IndexIntoFuncStackTable } from '../../common/types/profile-derived';
import type { Column } from './TreeView';
import type { Filter } from '../filtering-string';

type Props = {
  thread: Thread,
  threadIndex: ThreadIndex,
  scrollToSelectionGeneration: number,
  interval: number,
  tree: ProfileTreeClass,
  funcStackInfo: FuncStackInfo,
  selectedFuncStack: IndexIntoFuncStackTable | null,
  expandedFuncStacks: Array<IndexIntoFuncStackTable | null>;
  userFilters: Filter | null,
  disableOverscan: boolean,
  implementationFilter: string,
  invertCallstack: boolean,
  icons: IconWithClassName[],
  changeSelectedFuncStack: typeof changeSelectedFuncStack,
  changeExpandedFuncStacks: typeof changeExpandedFuncStacks,
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
    (this: any)._onSelectedFuncStackChange = this._onSelectedFuncStackChange.bind(this);
    (this: any)._onExpandedFuncStacksChange = this._onExpandedFuncStacksChange.bind(this);
    (this: any)._onAppendageButtonClick = this._onAppendageButtonClick.bind(this);
  }

  componentDidMount() {
    this.focus();
    this.procureInterestingInitialSelection();
  }

  componentDidUpdate(prevProps) {
    if (this.props.scrollToSelectionGeneration > prevProps.scrollToSelectionGeneration) {
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

  _onSelectedFuncStackChange(newSelectedFuncStack: IndexIntoFuncStackTable) {
    const { funcStackInfo, threadIndex, changeSelectedFuncStack } = this.props;
    changeSelectedFuncStack(threadIndex,
      getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable));
  }

  _onExpandedFuncStacksChange(newExpandedFuncStacks: Array<IndexIntoFuncStackTable | null>) {
    const { funcStackInfo, threadIndex, changeExpandedFuncStacks } = this.props;
    changeExpandedFuncStacks(threadIndex,
      newExpandedFuncStacks.map(funcStackIndex => getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable)));
  }

  _onAppendageButtonClick(funcStackIndex: IndexIntoFuncStackTable | null) {
    const {
      funcStackInfo, threadIndex, addCallTreeFilter, implementationFilter,
      invertCallstack,
    } = this.props;
    const jsOnly = implementationFilter === 'js';
    if (invertCallstack) {
      addCallTreeFilter(threadIndex, {
        type: 'postfix',
        postfixFuncs: getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable),
        matchJSOnly: jsOnly,
      });
    } else {
      addCallTreeFilter(threadIndex, {
        type: 'prefix',
        prefixFuncs: getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable),
        matchJSOnly: jsOnly,
      });
    }
  }

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedFuncStacks } = this.props;
    const newExpandedFuncStacks = expandedFuncStacks.slice();
    const maxInterestingDepth = 17; // scientifically determined
    let currentFuncStack = tree.getRoots()[0];
    newExpandedFuncStacks.push(currentFuncStack);
    for (let i = 0; i < maxInterestingDepth; i++) {
      const children = tree.getChildren(currentFuncStack);
      if (children.length === 0) {
        break;
      }
      currentFuncStack = children[0];
      newExpandedFuncStacks.push(currentFuncStack);
    }
    this._onExpandedFuncStacksChange(newExpandedFuncStacks);
    this._onSelectedFuncStackChange(currentFuncStack);
  }

  render() {
    const { tree, selectedFuncStack, expandedFuncStacks, userFilters, disableOverscan } = this.props;
    const highlightString = // TODO properly highlight the full filter
      userFilters.include && userFilters.include.substrings.join(' ').toLowerCase();
    return (
      <TreeView tree={tree}
                fixedColumns={this._fixedColumns}
                mainColumn={this._mainColumn}
                appendageColumn={this._appendageColumn}
                onSelectionChange={this._onSelectedFuncStackChange}
                onExpandedNodesChange={this._onExpandedFuncStacksChange}
                selectedNodeId={selectedFuncStack}
                expandedNodeIds={expandedFuncStacks}
                highlightString={highlightString}
                disableOverscan={disableOverscan}
                appendageButtons={this._appendageButtons}
                onAppendageButtonClick={this._onAppendageButtonClick}
                ref={ ref => { this._treeView = ref; }}
                contextMenuId={'ProfileCallTreeContextMenu'}
                icons={this.props.icons} />
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
    funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state),
    selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state),
    expandedFuncStacks: selectedThreadSelectors.getExpandedFuncStacks(state),
    userFilters: getUserFilters(state),
    disableOverscan: getProfileViewOptions(state).selection.isModifying,
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    icons: getIconsWithClassNames(state),
  }),
  { changeSelectedFuncStack, changeExpandedFuncStacks, addCallTreeFilter },
  null, { withRef: true }
)(ProfileTreeView);
