// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import FlameChartViewport from '../components/FlameChartViewport';
import { selectedThreadSelectors, getDisplayRange, getProfileInterval } from '../reducers/profile-view';
import { getSelectedThreadIndex } from '../reducers/url-state';
import * as actions from '../actions';
import FlameChartSettings from '../components/FlameChartSettings';

import type { Thread } from '../../common/types/profile';
import type { Milliseconds } from '../../common/types/units';
import type { StackTimingByDepth } from '../stack-timing';

require('./FlameChartView.css');

const ROW_HEIGHT = 16;

type Props = {
  thread: Thread,
  maxStackDepth: number,
  stackTimingByDepth: StackTimingByDepth,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
};

class FlameChartView extends Component {

  props: Props

  render() {
    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const {
      thread, maxStackDepth, stackTimingByDepth, isSelected, timeRange, threadIndex, interval,
    } = this.props;
    const maxViewportHeight = (maxStackDepth + 1) * ROW_HEIGHT;

    return (
      <div className='flameChartView'>
        <FlameChartSettings />
        <FlameChartViewport thread={thread}
                            maxStackDepth={maxStackDepth}
                            stackTimingByDepth={stackTimingByDepth}
                            isSelected={isSelected}
                            timeRange={timeRange}
                            threadIndex={threadIndex}
                            interval={interval}
                            maxViewportHeight={maxViewportHeight}
                            rowHeight={ROW_HEIGHT} />
      </div>
    );
  }
}

export default connect(state => {
  return {
    thread: selectedThreadSelectors.getFilteredThreadForFlameChart(state),
    maxStackDepth: selectedThreadSelectors.getFuncStackMaxDepthForFlameChart(state),
    stackTimingByDepth: selectedThreadSelectors.getStackTimingByDepthForFlameChart(state),
    isSelected: true,
    timeRange: getDisplayRange(state),
    threadIndex: getSelectedThreadIndex(state),
    interval: getProfileInterval(state),
  };
}, actions)(FlameChartView);
