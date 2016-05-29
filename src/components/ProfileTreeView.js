import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import { getStackAsFuncArray } from '../profile-data';
import { getProfile, selectedThreadSelectors, getSelectedThreadIndex } from '../selectors/';
import * as Actions from '../actions';

class ProfileTreeView extends Component{
  constructor(props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
    ];
    this._mainColumn = { propName: 'name', title: '' };
  }

  focus() {
    this.refs.treeView.focus();
  }

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const newExpandedFuncStacks = this.props.expandedFuncStacks.slice();
    const maxInterestingDepth = 17; // scientifically determined
    let currentFuncStack = this.props.tree.getRoots()[0];
    newExpandedFuncStacks.push(currentFuncStack);
    for (let i = 0; i < maxInterestingDepth; i++) {
      const children = this.props.tree.getChildren(currentFuncStack);
      if (children.length === 0) {
        break;
      }
      currentFuncStack = children[0];
      newExpandedFuncStacks.push(currentFuncStack);
    }
    this.props.onExpandedFuncStacksChange(newExpandedFuncStacks);
    this.props.onSelectedFuncStackChange(currentFuncStack);
  }

  render() {
    return (
      <TreeView tree={this.props.tree}
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
  tree: PropTypes.object.isRequired,
  funcStackInfo: PropTypes.shape({
    funcStackTable: PropTypes.object.isRequired,
    sampleFuncStacks: PropTypes.array.isRequired,
  }).isRequired,
  selectedFuncStack: PropTypes.number,
  expandedFuncStacks: PropTypes.array.isRequired,
  onSelectedFuncStackChange: PropTypes.func.isRequired,
  onExpandedFuncStacksChange: PropTypes.func.isRequired,
};

export default connect(state => {
  return {
    thread: selectedThreadSelectors.getFilteredThread(state),
    threadIndex: getSelectedThreadIndex(state),
    interval: getProfile(state).meta.interval,
    tree: selectedThreadSelectors.getCallTree(state),
    funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state),
    selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state),
    expandedFuncStacks: selectedThreadSelectors.getExpandedFuncStacks(state),
  };
}, null, (stateProps, dispatchProps, ownProps) => {
  const { funcStackInfo, threadIndex } = stateProps;
  const { dispatch } = dispatchProps;
  return Object.assign({}, stateProps, ownProps, {
    onSelectedFuncStackChange: newSelectedFuncStack => {
      dispatch(Actions.changeSelectedFuncStack(threadIndex,
        getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable)));
    },
    onExpandedFuncStacksChange: newExpandedFuncStacks => {
      dispatch(Actions.changeExpandedFuncStacks(threadIndex,
        newExpandedFuncStacks.map(funcStackIndex => getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable))));
    },
  });
}, { withRef: true })(ProfileTreeView);
