import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import { getCallTree } from '../profile-tree';
import * as Actions from '../actions';

class ProfileTreeView extends Component{
  constructor(props) {
    super(props);
    this._onSelectionChange = this._onSelectionChange.bind(this);
  }

  _onSelectionChange(newSelectedNodeId) {
    const { dispatch } = this.props;
    dispatch(Actions.changeSelectedFuncStack(newSelectedNodeId));
  }

  render() {
    const { thread, interval, funcStackInfo, selectedFuncStack } = this.props;
    return (
      <TreeView tree={getCallTree(thread, interval, funcStackInfo)}
                fixedColumns={[
                  { propName: 'totalTime', title: 'Running Time' },
                  { propName: 'totalTimePercent', title: '' },
                  { propName: 'selfTime', title: 'Self' },
                ]}
                mainColumn={{propName:'name', title: ''}}
                onSelectionChange={this._onSelectionChange}
                selectedNodeId={selectedFuncStack} />
    );

  }
}
export default connect()(ProfileTreeView);
