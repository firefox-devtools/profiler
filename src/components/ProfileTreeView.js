import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import { getStackAsFuncArray } from '../profile-data';
import { getCallTree } from '../profile-tree';
import * as Actions from '../actions';

class ProfileTreeView extends Component{
  constructor(props) {
    super(props);
    this._onSelectionChange = this._onSelectionChange.bind(this);
  }

  _onSelectionChange(newSelectedNodeId) {
    const { dispatch } = this.props;
    dispatch(Actions.changeSelectedFuncStack(this.props.threadIndex, getStackAsFuncArray(newSelectedNodeId, this.props.funcStackInfo.funcStackTable)));
  }

  componentWillMount() {
    const { thread, interval, funcStackInfo, selectedFuncStack } = this.props;
    this._tree = getCallTree(thread, interval, funcStackInfo);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.funcStackInfo !== this.props.funcStackInfo) {
      const { thread, interval, funcStackInfo } = nextProps;
      this._tree = getCallTree(thread, interval, funcStackInfo);
    }
  }

  render() {
    return (
      <TreeView tree={this._tree}
                fixedColumns={[
                  { propName: 'totalTime', title: 'Running Time' },
                  { propName: 'totalTimePercent', title: '' },
                  { propName: 'selfTime', title: 'Self' },
                ]}
                mainColumn={{propName:'name', title: ''}}
                onSelectionChange={this._onSelectionChange}
                selectedNodeId={this.props.selectedFuncStack} />
    );

  }
}
export default connect()(ProfileTreeView);
