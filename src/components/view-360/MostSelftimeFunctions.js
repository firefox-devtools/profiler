/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../reducers/profile-view';
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

type FuncIndexWithCount = {|
  +funcIndex: IndexIntoFuncTable,
  +count: number,
|};

type DisplayData = {|
  +funcName: string,
  +count: string,
|};

class Tree extends BasicTree<FuncIndexWithCount, DisplayData> {
  _funcTable: FuncTable;
  _stringTable: UniqueStringArray;

  constructor(
    funcList: FuncIndexWithCount[],
    { funcTable, stringTable }: Thread
  ) {
    super(funcList);
    this._funcTable = funcTable;
    this._stringTable = stringTable;
  }

  getDisplayData(index: IndexIntoFuncTable): DisplayData {
    let displayData = this._displayDataByIndex.get(index);
    if (displayData === undefined) {
      const funcInfo = this._data[index];
      const funcName = this._stringTable.getString(
        this._funcTable.name[funcInfo.funcIndex]
      );

      displayData = {
        funcName,
        count: funcInfo.count + 'ms',
      };
      this._displayDataByIndex.set(index, displayData);
    }
    return displayData;
  }
}

type StateProps = {|
  +selfTimeByFunc: Array<FuncIndexWithCount>,
  +thread: Thread,
|};

type DispatchProps = {||};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  selectedFunc: number | null,
|};

class SelftimeByFunc extends React.PureComponent<Props, State> {
  state = { selectedFunc: null };
  _fixedColumns = [{ propName: 'count', title: 'Count' }];
  _mainColumn = { propName: 'funcName', title: '' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _onSelectionChange = (selectedFunc: number) => {
    this.setState({ selectedFunc });
  };

  render() {
    const { selfTimeByFunc, thread } = this.props;
    const { selectedFunc } = this.state;

    const tree = new Tree(selfTimeByFunc, thread);

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
        contextMenuId="MarkersContextMenu"
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    selfTimeByFunc: selectedThreadSelectors.getSelftimeByFuncOrdered(state),
    thread: selectedThreadSelectors.getImplementationFilteredThread(state),
  }),
  component: SelftimeByFunc,
};
export default explicitConnect(options);
