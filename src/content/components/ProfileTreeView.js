import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import NodeIcon from './NodeIcon';
import { getStackAsFuncArray } from '../profile-data';
import { getInvertCallstack, getJSOnly, getSearchString, getSelectedThreadIndex } from '../reducers/url-state';
import {
  getProfile, selectedThreadSelectors, getScrollToSelectionGeneration, getProfileViewOptions,
} from '../reducers/profile-view';
import { getIconsWithClassNames } from '../reducers/icons';

import ProfileCallTreeContextMenu from '../containers/ProfileCallTreeContextMenu';

import actions from '../actions';

const CONTEXT_MENU_ID = 'ProfileTreeView';

class ProfileTreeView extends Component {
  constructor(props) {
    super(props);
    this._fixedColumns = [
      { propName: 'totalTime', title: 'Running Time' },
      { propName: 'totalTimePercent', title: '' },
      { propName: 'selfTime', title: 'Self' },
      { propName: 'icon', title: '', component: NodeIcon },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._appendageColumn = { propName: 'lib', title: '' };
    this._appendageButtons = ['focusCallstackButton'];
    this._onSelectedFuncStackChange = this._onSelectedFuncStackChange.bind(this);
    this._onExpandedFuncStacksChange = this._onExpandedFuncStacksChange.bind(this);
    this._onAppendageButtonClick = this._onAppendageButtonClick.bind(this);
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

  _onAppendageButtonClick(funcStackIndex) {
    const { funcStackInfo, threadIndex, addCallTreeFilter, jsOnly, invertCallstack } = this.props;
    if (invertCallstack) {
      addCallTreeFilter(threadIndex, {
        type: 'postfix',
        postfixFuncs: getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable),
        matchJSOnly: jsOnly,
      });
    } else {
      addCallTreeFilter(threadIndex, {
        type: 'prefix',
        prefixFuncs: getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable),
        matchJSOnly: jsOnly,
      });
    }
  }

  procureInterestingInitialSelection() {
    // Expand the heaviest callstack up to a certain depth and select the frame
    // at that depth.
    const { tree, expandedFuncStacks } = this.props;
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
    const { tree, selectedFuncStack, expandedFuncStacks, searchString, disableOverscan } = this.props;
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
                disableOverscan={disableOverscan}
                appendageButtons={this._appendageButtons}
                onAppendageButtonClick={this._onAppendageButtonClick}
                ref='treeView'
                contextMenu={<ProfileCallTreeContextMenu contextMenuId={CONTEXT_MENU_ID} />}
                contextMenuId={CONTEXT_MENU_ID}
                icons={this.props.icons}/>
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
  disableOverscan: PropTypes.bool,
  addCallTreeFilter: PropTypes.func.isRequired,
  jsOnly: PropTypes.bool.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  icons: PropTypes.array.isRequired,
};

export default connect(state => ({
  thread: selectedThreadSelectors.getFilteredThread(state),
  threadIndex: getSelectedThreadIndex(state),
  scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
  interval: getProfile(state).meta.interval,
  tree: selectedThreadSelectors.getCallTree(state),
  funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state),
  selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state),
  expandedFuncStacks: selectedThreadSelectors.getExpandedFuncStacks(state),
  searchString: getSearchString(state),
  disableOverscan: getProfileViewOptions(state).selection.isModifying,
  invertCallstack: getInvertCallstack(state),
  jsOnly: getJSOnly(state),
  icons: getIconsWithClassNames(state),
}), actions, null, { withRef: true })(ProfileTreeView);
