import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { getFuncStackInfo, filterThreadToJSOnly } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import Histogram from '../components/Histogram';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._cachedFuncStackInfos = [];
    this._cachedJSOnly = null;
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

  render() {
    const { profile, viewOptions, className } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const showContentProcess = true;
    const treeThreadIndex = showContentProcess ? viewOptions.threadOrder[Math.max(0, profile.threads.length - 2)] : viewOptions.threadOrder[0];
    const threads = profile.threads.slice(0);
    const jsOnly = true;
    if (jsOnly) {
      threads[treeThreadIndex] = this._filterToJSOnly(threads[treeThreadIndex]);
    }

    const funcStackInfos = threads.map((thread, threadIndex) => this._getFuncStackInfo(threadIndex, thread));

    return (
      <div className={className}>
        {
          viewOptions.threadOrder.map(threadIndex =>
            <Histogram key={threadIndex}
                       interval={profile.meta.interval}
                       thread={threads[threadIndex]}
                       className='histogram'
                       rangeStart={timeRange.start}
                       rangeEnd={timeRange.end}
                       funcStackInfo={funcStackInfos[threadIndex]}
                       selectedFuncStack={threadIndex === treeThreadIndex ? viewOptions.selectedFuncStack : -1 }/>
          )
        }
        <ProfileTreeView thread={threads[treeThreadIndex]}
                         interval={profile.meta.interval}
                         funcStackInfo={funcStackInfos[treeThreadIndex]}
                         selectedFuncStack={viewOptions.selectedFuncStack}/>
      </div>
    );
  }
};
export default ProfileViewer;
