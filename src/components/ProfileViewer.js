import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { getFuncStackInfo, filterThreadToJSOnly, getFuncStackFromFuncArray, getStackAsFuncArray } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import * as Actions from '../actions';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._cachedFuncStackInfos = [];
    this._cachedJSOnly = null;
    this._onProfileTitleClick = this._onProfileTitleClick.bind(this);
  }

  _filterToJSOnly(thread) {
    const key = { thread }
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
      cacheKey: key, funcStackInfo
    };
    return funcStackInfo;
  }

  _onProfileTitleClick(threadIndex, event) {
    this.props.dispatch(Actions.changeSelectedThread(threadIndex));
  }

  render() {
    const { profile, viewOptions, className } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const treeThreadIndex = viewOptions.selectedThread;
    const threads = profile.threads.slice(0);
    const jsOnly = false;
    if (jsOnly) {
      threads[treeThreadIndex] = this._filterToJSOnly(threads[treeThreadIndex]);
    }

    const funcStackInfos = threads.map((thread, threadIndex) => this._getFuncStackInfo(threadIndex, thread));
    const selectedFuncStacks = viewOptions.selectedFuncStacks.map((sf, threadIndex) => getFuncStackFromFuncArray(sf, funcStackInfos[threadIndex].funcStackTable));

    return (
      <div className={className}>
        <ol className={`${className}Header`}>
        {
          viewOptions.threadOrder.map(threadIndex =>
            <ProfileThreadHeaderBar key={threadIndex}
                                    index={threadIndex}
                                    interval={profile.meta.interval}
                                    thread={threads[threadIndex]}
                                    rangeStart={timeRange.start}
                                    rangeEnd={timeRange.end}
                                    funcStackInfo={funcStackInfos[threadIndex]}
                                    selectedFuncStack={threadIndex === treeThreadIndex ? selectedFuncStacks[treeThreadIndex] : -1 }
                                    onClick={this._onProfileTitleClick}/>
          )
        }
        </ol>
        <ProfileTreeView thread={threads[treeThreadIndex]}
                         threadIndex={treeThreadIndex}
                         interval={profile.meta.interval}
                         funcStackInfo={funcStackInfos[treeThreadIndex]}
                         selectedFuncStack={selectedFuncStacks[treeThreadIndex]}/>
      </div>
    );
  }
};
export default connect()(ProfileViewer);
