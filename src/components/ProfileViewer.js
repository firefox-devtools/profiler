import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import Histogram from '../components/Histogram';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { profile, viewOptions, className } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const treeThread = profile.threads[viewOptions.threadOrder[Math.max(0, profile.threads.length - 2)]];
    return (
      <div className={className}>
        {
          viewOptions.threadOrder.map(threadIndex =>
            <Histogram key={threadIndex}
                       interval={profile.meta.interval}
                       thread={profile.threads[threadIndex]}
                       className='histogram'
                       rangeStart={timeRange.start}
                       rangeEnd={timeRange.end}/>
          )
        }
        <ProfileTreeView thread={treeThread}
                         interval={profile.meta.interval} />
      </div>
    );
  }
};
export default ProfileViewer;
