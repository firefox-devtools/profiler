// @flow
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { getThreads, getThreadOrder } from '../reducers/profile-view';
import actions from '../actions';
import FlameChartSettings from '../components/FlameChartSettings';
import TimelineFlameChart from './TimelineFlameChart';
import TimelineMarkers from './TimelineMarkers';
import Reorderable from '../components/Reorderable';
import { withSize } from '../with-size';

import type { Thread } from '../../common/types/profile';

require('./TimelineView.css');

type Props = {
  threads: Thread[],
  threadOrder: number[],
  height: number,
  changeThreadOrder: any => any,
};

class TimlineViewTimelinesImpl extends PureComponent {

  props: Props

  getScrollElement: () => ?HTMLElement
  scrollElement: ?HTMLElement

  constructor(props: Props) {
    super(props);
    this.getScrollElement = () => this.scrollElement;
  }

  render() {
    const { threads, threadOrder, changeThreadOrder, height } = this.props;

    return (
      <div className='timelineViewTimelines'>
        <div className='timelineViewTimelinesScroller'
             ref={element => {
               this.scrollElement = element;
             }}>
          <div className='timelineViewDivider'>
            Sample based callstacks
          </div>
          <Reorderable tagName='div'
                       className='timelineViewTimelinesThreadList'
                       order={threadOrder}
                       orient='vertical'
                       onChangeOrder={changeThreadOrder}>
            {threads.map((thread, threadIndex) => (
              <div className='timelineViewRow' key={threadIndex}>
                <TimelineFlameChart threadIndex={threadIndex}
                                    viewHeight={height}
                                    getScrollElement={this.getScrollElement} />
              </div>
            ))}
          </Reorderable>
          <div className='timelineViewDivider'>
            Marker Events
          </div>
          <div className='timelineViewTimelinesThreadList'>
            {threads.map((thread, threadIndex) => (
              <div className='timelineViewRow' key={threadIndex}>
                <TimelineMarkers threadIndex={threadIndex}
                                 viewHeight={height}
                                 getScrollElement={this.getScrollElement} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

const TimelineViewTimelines = withSize(TimlineViewTimelinesImpl);

class TimelineView extends PureComponent {

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
