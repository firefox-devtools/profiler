import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import { getStackAsFuncArray } from '../profile-data';
import { getProfile, selectedThreadSelectors, getSelectedThreadIndex, getScrollToSelectionGeneration, getSearchString } from '../selectors/';
import * as actions from '../actions';

class ProfileTreeView extends Component {
  constructor(props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._appendageColumn = { propName: 'lib', title: '' };
    this._onSelectedFuncStackChange = this._onSelectedFuncStackChange.bind(this);
    this._onExpandedFuncStacksChange = this._onExpandedFuncStacksChange.bind(this);
  }

  componentDidMount() {
    this.focus();
    this.procureInterestingInitialSelection();
  }

  componentDidUpdate(prevProps) {
    if (this.props.scrollToSelectionGeneration > prevProps.scrollToSelectionGeneration) {
      if (this.refs.treeView) {
        this.refs.treeView.scrollSelectionIntoView();
      }
    }
  }

  focus() {
    this.refs.treeView.focus();
  }

  _onSelectedFuncStackChange(newSelectedFuncStack) {
    const { funcStackInfo, threadIndex, changeSelectedFuncStack } = this.props;
    changeSelectedFuncStack(threadIndex,
      getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable));
  }

  _onExpandedFuncStacksChange(newExpandedFuncStacks) {
    const { funcStackInfo, threadIndex, changeExpandedFuncStacks } = this.props;
    changeExpandedFuncStacks(threadIndex,
      newExpandedFuncStacks.map(funcStackIndex => getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable)));
  }

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedFuncStacks, searchString } = this.props;
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
    const { tree, selectedFuncStack, expandedFuncStacks, searchString } = this.props;
    return (
      <TreeView tree={tree}
                fixedColumns={this._fixedColumns}
                mainColumn={this._mainColumn}
                appendageColumn={this._appendageColumn}
                onSelectionChange={this._onSelectedFuncStackChange}
                onExpandedNodesChange={this._onExpandedFuncStacksChange}
                selectedNodeId={selectedFuncStack}
                expandedNodeIds={expandedFuncStacks}
                highlightString={searchString.toLowerCase()}
                ref='treeView'/>
    );

  }
}

ProfileTreeView.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  threadIndex: PropTypes.number.isRequired,
  scrollToSelectionGeneration: PropTypes.number.isRequired,
  interval: PropTypes.number.isRequired,
  tree: PropTypes.object.isRequired,
  funcStackInfo: PropTypes.shape({
    funcStackTable: PropTypes.object.isRequired,
    stackIndexToFuncStackIndex: PropTypes.any.isRequired,
  }).isRequired,
  selectedFuncStack: PropTypes.number,
  expandedFuncStacks: PropTypes.array.isRequired,
  changeSelectedFuncStack: PropTypes.func.isRequired,
  changeExpandedFuncStacks: PropTypes.func.isRequired,
  searchString: PropTypes.string,
};

export default connect((state, props) => {
  return {
    thread: selectedThreadSelectors.getFilteredThread(state, props),
    threadIndex: getSelectedThreadIndex(state, props),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state, props),
    interval: getProfile(state, props).meta.interval,
    tree: selectedThreadSelectors.getCallTree(state, props),
    funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state, props),
    selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state, props),
    expandedFuncStacks: selectedThreadSelectors.getExpandedFuncStacks(state, props),
    searchString: getSearchString(state, props),
  };
}, actions, null, { withRef: true })(ProfileTreeView);
