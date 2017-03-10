// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { getThreads, getThreadOrder } from '../reducers/profile-view';
import { getTimelineHorizontalViewport } from '../reducers/timeline-view';
import * as actions from '../actions';
import FlameChartSettings from '../components/FlameChartSettings';
import TimelineFlameChart from './TimelineFlameChart';
import Reorderable from '../components/Reorderable';
import { withSize } from '../with-size';

import type { HorizontalViewport } from '../../common/types/units';
import type { Thread } from '../../common/types/profile';
import type { ChangeTimelineHorizontalViewport } from '../actions';

require('./TimelineView.css');

class TimlineViewTimelinesImpl extends Component {

  props: {
    threads: Thread[],
    threadOrder: number[],
    height: number,
    horizontalViewport: HorizontalViewport,
    changeTimelineHorizontalViewport: ChangeTimelineHorizontalViewport,
    changeThreadOrder: any => any,
  }

  render() {
    const {
      threads, threadOrder, changeThreadOrder, height, horizontalViewport,
      changeTimelineHorizontalViewport,
    } = this.props;

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
                                    viewHeight={height}
                                    horizontalViewport={horizontalViewport}
                                    changeTimelineHorizontalViewport={changeTimelineHorizontalViewport} />
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
    horizontalViewport: HorizontalViewport,
    changeTimelineHorizontalViewport: ChangeTimelineHorizontalViewport,
    changeThreadOrder: number[] => any,
  }

  render() {
    const {
      threads, threadOrder, horizontalViewport, changeTimelineHorizontalViewport,
      changeThreadOrder,
    } = this.props;
    return (
      <div className='timelineView'>
        <FlameChartSettings />
        <TimelineViewTimelines threads={threads}
                               threadOrder={threadOrder}
                               horizontalViewport={horizontalViewport}
                               changeTimelineHorizontalViewport={changeTimelineHorizontalViewport}
                               changeThreadOrder={changeThreadOrder} />
      </div>
    );
  }
}

export default connect(state => {
  return {
    threads: getThreads(state),
    threadOrder: getThreadOrder(state),
    horizontalViewport: getTimelineHorizontalViewport(state),
  };
}, (actions: Object))(TimelineView);
