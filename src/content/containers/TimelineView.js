// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { getThreads } from '../reducers/profile-view';
import * as actions from '../actions';
import ProfileCallTreeSettings from '../components/ProfileCallTreeSettings';
import FlameChartView from './FlameChartView';
import { withSize } from '../with-size';

require('./TimelineView.css');

class TimlineViewTimelinesImpl extends Component {

  props: {
    threadIndices: number[],
    height: number,
  }

  render() {
    const { threadIndices, height } = this.props;
    return (
      <div className='timelineViewTimelines'>
        <div className='timelineViewTimelinesScroller'>
          {threadIndices.map(threadIndex => (
            <div className='timelineViewRow' key={threadIndex}>
              <FlameChartView threadIndex={threadIndex} viewHeight={height} />
            </div>
          ))}
        </div>
      </div>
    );
  }
}

const TimelineViewTimelines = withSize(TimlineViewTimelinesImpl);

class TimelineView extends Component {

  props: {
    threadIndices: number[],
  }

  render() {
    const { threadIndices } = this.props;
    return (
      <div className='timelineView'>
        <ProfileCallTreeSettings />
        <TimelineViewTimelines threadIndices={threadIndices} />
      </div>
    );
  }
}
export default connect(state => {
  return {
    threadIndices: getThreads(state).map((_, i) => i),
  };
}, actions)(withSize(TimelineView));
