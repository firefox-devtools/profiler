import React, { Component, PropTypes } from 'react';
import TreeView from './TreeView';
import { getCallTree } from '../profile-tree';

class ProfileTreeView extends Component{
  constructor(props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
    ];
    this._mainColumn = { propName:'name', title: '' };
  }

  componentWillMount() {
    const { thread, interval, funcStackInfo } = this.props;
    this._tree = getCallTree(thread, interval, funcStackInfo);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.funcStackInfo !== this.props.funcStackInfo) {
      const { thread, interval, funcStackInfo } = nextProps;
      this._tree = getCallTree(thread, interval, funcStackInfo);
    }
  }

  focus() {
    this.refs.treeView.focus();
  }

  procureInterestingInitialSelection() {

  }

  render() {
    return (
      <TreeView tree={this._tree}
                fixedColumns={this._fixedColumns}
                mainColumn={this._mainColumn}
                onSelectionChange={this.props.onSelectedFuncStackChange}
                onExpandedNodesChange={this.props.onExpandedFuncStacksChange}
                selectedNodeId={this.props.selectedFuncStack}
                expandedNodeIds={this.props.expandedFuncStacks}
                ref='treeView'/>
    );

  }
}

ProfileTreeView.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  threadIndex: PropTypes.number.isRequired,
  interval: PropTypes.number.isRequired,
  funcStackInfo: PropTypes.shape({
    funcStackTable: PropTypes.object.isRequired,
    sampleFuncStacks: PropTypes.array.isRequired,
  }).isRequired,
  selectedFuncStack: PropTypes.number,
  expandedFuncStacks: PropTypes.array.isRequired,
  onSelectedFuncStackChange: PropTypes.func.isRequired,
  onExpandedFuncStacksChange: PropTypes.func.isRequired,
};

export default ProfileTreeView;
