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
    this._onExpandedNodesChange = this._onExpandedNodesChange.bind(this);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
    ];
    this._mainColumn = { propName:'name', title: '' };
  }

  _onSelectionChange(newSelectedNodeId) {
    const { dispatch } = this.props;
    dispatch(Actions.changeSelectedFuncStack(this.props.threadIndex,
      getStackAsFuncArray(newSelectedNodeId, this.props.funcStackInfo.funcStackTable)));
  }

  _onExpandedNodesChange(newExpandedNodeIds) {
    const { dispatch } = this.props;
    const newExpandedFuncStacks =
      newExpandedNodeIds.map(nodeId => getStackAsFuncArray(nodeId, this.props.funcStackInfo.funcStackTable));
    dispatch(Actions.changeExpandedFuncStacks(this.props.threadIndex,
      newExpandedFuncStacks));
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
                fixedColumns={this._fixedColumns}
                mainColumn={this._mainColumn}
                onSelectionChange={this._onSelectionChange}
                onExpandedNodesChange={this._onExpandedNodesChange}
                selectedNodeId={this.props.selectedFuncStack}
                expandedNodeIds={this.props.expandedFuncStacks} />
    );

  }
}
export default connect()(ProfileTreeView);
