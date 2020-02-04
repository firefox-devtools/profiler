/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import memoize from 'memoize-immutable';

import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ListTree } from '../../profile-logic/list-tree';
import explicitConnect from '../../utils/connect';

import type {
  IndexIntoFuncTable,
  Thread,
  FuncTable,
} from '../../types/profile';
import type { UniqueStringArray } from '../../utils/unique-string-array';
import type { ConnectedProps } from '../../utils/connect';

type FuncIndexWithCount = {|
  +funcIndex: IndexIntoFuncTable,
  +count: number,
|};

type DisplayData = {|
  +funcName: string,
  +count: string,
|};

class Tree extends ListTree<FuncIndexWithCount, DisplayData> {
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

type OwnProps = {|
  +onFunctionSelect?: IndexIntoFuncTable => mixed,
|};

type StateProps = {|
  +runningTimesByFunc: Array<FuncIndexWithCount>,
  +thread: Thread,
|};

type DispatchProps = {||};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  selectedFunc: number | null,
|};

class RunningTimesByFuncImpl extends React.PureComponent<Props, State> {
  state = { selectedFunc: null };
  _fixedColumns = [{ propName: 'count', title: 'Running time (ms)' }];
  _mainColumn = { propName: 'funcName', title: '' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _getTree = memoize((...args) => new Tree(...args), { limit: 1 });

  _onSelectionChange = (selectedFunc: number) => {
    this.setState({ selectedFunc });
    if (this.props.onFunctionSelect) {
      const funcIndex = this.props.runningTimesByFunc[selectedFunc].funcIndex;
      this.props.onFunctionSelect(funcIndex);
    }
  };

  render() {
    const { runningTimesByFunc, thread } = this.props;
    const { selectedFunc } = this.state;

    const tree = this._getTree(runningTimesByFunc, thread);

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

export const RunningTimesByFunc = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: state => ({
    runningTimesByFunc: selectedThreadSelectors.getRunningTimesByFuncOrdered(
      state
    ),
    thread: selectedThreadSelectors.getImplementationFilteredThread(state),
  }),
  component: RunningTimesByFuncImpl,
});
