// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { getThreads, getThreadOrder } from '../reducers/profile-view';
import actions from '../actions';
import FlameChartSettings from '../components/FlameChartSettings';
import TimelineFlameChart from './TimelineFlameChart';
import Reorderable from '../components/Reorderable';
import { withSize } from '../with-size';

import type { Thread } from '../../common/types/profile';

require('./TimelineView.css');

class TimlineViewTimelinesImpl extends Component {

  props: {
    threads: Thread[],
    threadOrder: number[],
    height: number,
    changeThreadOrder: any => any,
  }

  render() {
    const { threads, threadOrder, changeThreadOrder, height } = this.props;

    const className = 'timelineViewTimelines';

    return (
      <div className='timelineViewTimelines'>
        <div className='timelineViewTimelinesScroller'>
          <Reorderable tagName='div'
                       className={`${className}ThreadList`}
                       order={threadOrder}
                       orient='vertical'
                       onChangeOrder={changeThreadOrder}>
            {threads.map((thread, threadIndex) => (
              <div className='timelineViewRow' key={threadIndex}>
                <TimelineFlameChart threadIndex={threadIndex}
                                    viewHeight={height} />
              </div>
            ))}
          </Reorderable>
        </div>
      </div>
    );
  }
}

const TimelineViewTimelines = withSize(TimlineViewTimelinesImpl);

class TimelineView extends Component {

  props: {
    threads: Thread[],
    threadOrder: number[],
    changeThreadOrder: number[] => any,
  }

  render() {
    const { threads, threadOrder, changeThreadOrder } = this.props;
    return (
      <div className='timelineView'>
        <FlameChartSettings />
        <TimelineViewTimelines threads={threads}
                               threadOrder={threadOrder}
                               changeThreadOrder={changeThreadOrder} />
      </div>
    );
  }
}

export default connect(state => {
  return {
    threads: getThreads(state),
    threadOrder: getThreadOrder(state),
  };
}, (actions: Object))(TimelineView);
