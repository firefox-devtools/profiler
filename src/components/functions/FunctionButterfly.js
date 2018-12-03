/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import {
  getCallersForFunction,
  getCalleesForFunction,
} from '../../reducers/functions-butterfly';
import { BasicTree } from '../../profile-logic/basic-tree';
import explicitConnect from '../../utils/connect';

import type {
  IndexIntoFuncTable,
  Thread,
  FuncTable,
} from '../../types/profile';
import type { UniqueStringArray } from '../../utils/unique-string-array';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type DisplayData = {|
  +funcName: string,
|};

class Tree extends BasicTree<number, DisplayData> {
  _funcTable: FuncTable;
  _stringTable: UniqueStringArray;

  constructor(
    funcList: IndexIntoFuncTable[],
    { funcTable, stringTable }: Thread
  ) {
    super(funcList);
    this._funcTable = funcTable;
    this._stringTable = stringTable;
  }

  getDisplayData(index: number): DisplayData {
    let displayData = this._displayDataByIndex.get(index);
    if (displayData === undefined) {
      const funcIndex = this._data[index];
      const funcName = this._stringTable.getString(
        this._funcTable.name[funcIndex]
      );

      displayData = {
        funcName,
      };
      this._displayDataByIndex.set(index, displayData);
    }
    return displayData;
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

  render() {
    const { funcIndexList, thread } = this.props;
    const { selectedFunc } = this.state;

    const tree = new Tree(funcIndexList, thread);

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

const calleeOptions: ExplicitConnectOptions<
  OwnProps,
  StateProps,
  DispatchProps
> = {
  mapStateToProps: (state, ownProps) => ({
    funcIndexList: getCalleesForFunction(state, ownProps.funcIndex),
    thread: selectedThreadSelectors.getImplementationFilteredThread(state),
  }),
  component: FuncSimpleList,
};
export const FunctionCallees = explicitConnect(calleeOptions);

const callerOptions: ExplicitConnectOptions<
  OwnProps,
  StateProps,
  DispatchProps
> = {
  mapStateToProps: (state, ownProps) => ({
    funcIndexList: getCallersForFunction(state, ownProps.funcIndex),
    thread: selectedThreadSelectors.getImplementationFilteredThread(state),
  }),
  component: FuncSimpleList,
};
export const FunctionCallers = explicitConnect(callerOptions);
