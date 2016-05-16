import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import { getFuncStackInfo, getTimeRangeIncludingAllThreads, filterThreadToJSOnly, getFuncStackFromFuncArray, getStackAsFuncArray, invertCallstack } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import ProfileViewSidebar from '../components/ProfileViewSidebar';
import Reorderable from '../components/Reorderable';
import * as Actions from '../actions';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._cachedFuncStackInfos = [];
    this._cachedJSOnly = null;
    this._onProfileTitleClick = this._onProfileTitleClick.bind(this);
    this._onSelectedFuncStackChange = this._onSelectedFuncStackChange.bind(this);
    this._onExpandedFuncStacksChange = this._onExpandedFuncStacksChange.bind(this);
    this._onChangeThreadOrder = this._onChangeThreadOrder.bind(this);
  }

  _onChangeThreadOrder(newThreadOrder) {
    this.props.dispatch(Actions.changeThreadOrder(newThreadOrder));
  }

  _filterToJSOnly(thread) {
    const key = { thread };
    if (this._cachedJSOnly) {
      const { cacheKey, jsOnlyThread } = this._cachedJSOnly;
      if (shallowequal(cacheKey, key)) {
        return jsOnlyThread;
      }
    }
    const jsOnlyThread = filterThreadToJSOnly(thread);
    this._cachedJSOnly = { cacheKey: key, jsOnlyThread };
    return jsOnlyThread;
  }

  _invertCallStack(thread) {
    const key = { thread };
    if (this._cachedInvertedCallstack) {
      const { cacheKey, invertedCallstackThread } = this._cachedInvertedCallstack;
      if (shallowequal(cacheKey, key)) {
        return invertedCallstackThread;
      }
    }
    const invertedCallstackThread = invertCallstack(thread);
    this._cachedInvertedCallstack = { cacheKey: key, invertedCallstackThread };
    return invertedCallstackThread;
  }

  _getFuncStackInfo(threadIndex, thread) {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const key = { stackTable, frameTable, funcTable, samples };
    if (this._cachedFuncStackInfos[threadIndex]) {
      const { cacheKey, funcStackInfo } = this._cachedFuncStackInfos[threadIndex];
      if (shallowequal(cacheKey, key)) {
        return funcStackInfo;
      }
    }
    const funcStackInfo = getFuncStackInfo(stackTable, frameTable, funcTable, samples);
    this._cachedFuncStackInfos[threadIndex] = {
      cacheKey: key, funcStackInfo,
    };
    return funcStackInfo;
  }

  _onProfileTitleClick(threadIndex) {
    this.props.dispatch(Actions.changeSelectedThread(threadIndex));
  }

  _onSelectedFuncStackChange(newSelectedFuncStack) {
    const { dispatch, viewOptions, profile } = this.props;
    const { selectedThread, jsOnly, invertCallstack } = viewOptions;
    let thread = profile.threads[selectedThread];
    if (jsOnly) {
      thread = this._filterToJSOnly(thread);
    }
    if (invertCallstack) {
      thread = this._invertCallStack(thread);
    }
    const funcStackInfo = this._getFuncStackInfo(selectedThread, thread);
    dispatch(Actions.changeSelectedFuncStack(selectedThread,
      getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable)));
  }

  _onExpandedFuncStacksChange(newExpandedFuncStacks) {
    const { dispatch, viewOptions, profile } = this.props;
    const { selectedThread, jsOnly, invertCallstack } = viewOptions;
    let thread = profile.threads[selectedThread];
    if (jsOnly) {
      thread = this._filterToJSOnly(thread);
    }
    if (invertCallstack) {
      thread = this._invertCallStack(thread);
    }
    const funcStackInfo = this._getFuncStackInfo(selectedThread, thread);
    dispatch(Actions.changeExpandedFuncStacks(selectedThread,
      newExpandedFuncStacks.map(funcStackIndex => getStackAsFuncArray(funcStackIndex, funcStackInfo.funcStackTable))));
  }

  componentDidMount() {
    console.log(this.refs.treeView);
    this.refs.treeView.focus();
    this.refs.treeView.procureInterestingInitialSelection();
  }

  render() {
    const { profile, viewOptions, className } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const { selectedThread, jsOnly, invertCallstack } = viewOptions;
    const threads = profile.threads.slice(0);
    if (jsOnly) {
      threads[selectedThread] = this._filterToJSOnly(threads[selectedThread]);
    }
    if (invertCallstack) {
      threads[selectedThread] = this._invertCallStack(threads[selectedThread]);
    }

    const funcStackInfos = threads.map((thread, threadIndex) => this._getFuncStackInfo(threadIndex, thread));
    const selectedFuncStacks = viewOptions.threads.map((thread, threadIndex) => {
      return getFuncStackFromFuncArray(thread.selectedFuncStack, funcStackInfos[threadIndex].funcStackTable);
    });
    const expandedFuncStacks = viewOptions.threads[selectedThread].expandedFuncStacks.map(funcArray => {
      return getFuncStackFromFuncArray(funcArray, funcStackInfos[selectedThread].funcStackTable);
    });

    return (
      <div className={className}>
        <Reorderable tagName='ol' className={`${className}Header`} order={viewOptions.threadOrder} orient='vertical' onChangeOrder={this._onChangeThreadOrder}>
        {
          threads.map((thread, threadIndex) =>
            <ProfileThreadHeaderBar key={threadIndex}
                                    index={threadIndex}
                                    interval={profile.meta.interval}
                                    thread={thread}
                                    rangeStart={timeRange.start}
                                    rangeEnd={timeRange.end}
                                    funcStackInfo={funcStackInfos[threadIndex]}
                                    selectedFuncStack={threadIndex === selectedThread ? selectedFuncStacks[selectedThread] : -1 }
                                    isSelected={threadIndex === selectedThread}
                                    onClick={this._onProfileTitleClick}/>
          )
        }
        </Reorderable>
        <div className='treeAndSidebarWrapper'>
          <ProfileViewSidebar />
          <ProfileTreeView thread={threads[selectedThread]}
                           threadIndex={selectedThread}
                           interval={profile.meta.interval}
                           funcStackInfo={funcStackInfos[selectedThread]}
                           selectedFuncStack={selectedFuncStacks[selectedThread]}
                           expandedFuncStacks={expandedFuncStacks}
                           onSelectedFuncStackChange={this._onSelectedFuncStackChange}
                           onExpandedFuncStacksChange={this._onExpandedFuncStacksChange}
                           ref='treeView'/>
         </div>
      </div>
    );
  }
}

ProfileViewer.propTypes = {
  profile: PropTypes.object.isRequired,
  viewOptions: PropTypes.object.isRequired,
  className: PropTypes.string,
  dispatch: PropTypes.func.isRequired,
};

export default connect()(ProfileViewer);
