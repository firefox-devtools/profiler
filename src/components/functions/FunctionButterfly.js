/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import memoize from 'memoize-immutable';

import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getCallersForFunction,
  getCalleesForFunction,
} from '../../selectors/functions-butterfly';
import { ListOfNumbersTree } from '../../profile-logic/list-tree';
import explicitConnect from '../../utils/connect';

import type {
  IndexIntoFuncTable,
  Thread,
  FuncTable,
} from '../../types/profile';
import type { UniqueStringArray } from '../../utils/unique-string-array';
import type { ConnectedProps } from '../../utils/connect';

type DisplayData = {|
  +funcName: string,
|};

class Tree extends ListOfNumbersTree<DisplayData> {
  _funcTable: FuncTable;
  _stringTable: UniqueStringArray;

  constructor(
    funcIndices: IndexIntoFuncTable[],
    { funcTable, stringTable }: Thread
  ) {
    super(funcIndices);
    this._funcTable = funcTable;
    this._stringTable = stringTable;
  }

  _getDisplayData(funcIndex: number): DisplayData {
    const funcName = this._stringTable.getString(
      this._funcTable.name[funcIndex]
    );

    return { funcName };
  }
}

type OwnProps = {|
  +funcIndex: IndexIntoFuncTable | null,
|};

type StateProps = {|
  +funcIndexList: Array<IndexIntoFuncTable>,
  +thread: Thread,
|};

type DispatchProps = {||};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  selectedFunc: number | null,
|};

class FuncSimpleList extends React.PureComponent<Props, State> {
  state = { selectedFunc: null };
  _fixedColumns = [];
  _mainColumn = { propName: 'funcName', title: '' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _onSelectionChange = (selectedFunc: number) => {
    this.setState({ selectedFunc });
  };

  _getTree = memoize((...args) => new Tree(...args), { limit: 1 });

  render() {
    const { funcIndexList, thread } = this.props;
    const { selectedFunc } = this.state;

    const tree = this._getTree(funcIndexList, thread);

    return (
      <TreeView
        maxNodeDepth={0}
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        onSelectionChange={this._onSelectionChange}
        onExpandedNodesChange={this._onExpandedNodeIdsChange}
        selectedNodeId={selectedFunc}
        expandedNodeIds={this._expandedNodeIds}
        contextMenuId=""
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

export const FunctionCallees = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => ({
    funcIndexList: getCalleesForFunction(state, ownProps.funcIndex),
    thread: selectedThreadSelectors.getThread(state),
  }),
  component: FuncSimpleList,
});

export const FunctionCallers = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => ({
    funcIndexList: getCallersForFunction(state, ownProps.funcIndex),
    thread: selectedThreadSelectors.getThread(state),
  }),
  component: FuncSimpleList,
});
