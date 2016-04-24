import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import memoizeSync from 'memoizesync';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { getFuncStackInfo } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import Histogram from '../components/Histogram';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._memoizedGetFuncStackInfo = [];
  }

  render() {
    const { profile, viewOptions, className } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const treeThreadIndex = viewOptions.threadOrder[Math.max(0, profile.threads.length - 2)];
    const funcStackInfos = profile.threads.map((thread, threadIndex) => {
      if (!this._memoizedGetFuncStackInfo[threadIndex]) {
        this._memoizedGetFuncStackInfo[threadIndex] = memoizeSync(getFuncStackInfo, { max: 1 });
      }
      return this._memoizedGetFuncStackInfo[threadIndex](thread.stackTable, thread.frameTable, thread.funcTable, thread.samples)
    });
    return (
      <div className={className}>
        {
          viewOptions.threadOrder.map(threadIndex =>
            <Histogram key={threadIndex}
                       interval={profile.meta.interval}
                       thread={profile.threads[threadIndex]}
                       className='histogram'
                       rangeStart={timeRange.start}
                       rangeEnd={timeRange.end}
                       funcStackInfo={funcStackInfos[threadIndex]}/>
          )
        }
        <ProfileTreeView thread={profile.threads[treeThreadIndex]}
                         interval={profile.meta.interval}
                         funcStackInfo={funcStackInfos[treeThreadIndex]}/>
      </div>
    );
  }
};
export default ProfileViewer;
