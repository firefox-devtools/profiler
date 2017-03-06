// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import FlameChartViewport from '../components/FlameChartViewport';
import { selectorsForThread, getDisplayRange, getProfileInterval } from '../reducers/profile-view';
import { getCategoryColorStrategy, getLabelingStrategy } from '../reducers/flame-chart';
import { getIsThreadExpanded } from '../reducers/timeline-view';
import * as actions from '../actions';
import { getImplementationName } from '../labeling-strategies';
import classNames from 'classnames';

import type { Thread } from '../../common/types/profile';
import type { Milliseconds, CssPixels, HorizontalViewport, UnitIntervalOfProfileRange } from '../../common/types/units';
import type { StackTimingByDepth } from '../stack-timing';
import type { GetCategory } from '../color-categories';
import type { GetLabel } from '../labeling-strategies';
import type { ChangeTimelineHorizontalViewport } from '../actions';

require('./TimelineFlameChart.css');

const STACK_FRAME_HEIGHT = 16;
const TIMELINE_ROW_HEIGHT = 34;

type Props = {
  thread: Thread,
  isThreadExpanded: boolean,
  maxStackDepth: number,
  stackTimingByDepth: StackTimingByDepth,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  getCategory: GetCategory,
  getLabel: GetLabel,
  changeTimelineExpandedThread: (number, boolean) => {},
  changeTimelineHorizontalViewport: ChangeTimelineHorizontalViewport,
  horizontalViewport: HorizontalViewport,
  viewHeight: CssPixels,
};

class TimelineFlameChart extends Component {

  props: Props

  constructor(props) {
    super(props);
    (this: any).toggleThreadCollapse = this.toggleThreadCollapse.bind(this);
  }

  toggleThreadCollapse() {
    const { changeTimelineExpandedThread, threadIndex, isThreadExpanded } = this.props;
    changeTimelineExpandedThread(threadIndex, !isThreadExpanded);
  }

  /**
   * Expanding view sizing strategy:
   *
   * EXACT SIZE:  Try and set it exactly to the size of the flame chart.
   * SMALL GRAPH: The smallest it can be is 1.5 times the row height, giving a visual cue
   *              to the user that this row is expanded, even if it's super shallow.
   * LARGE GRAPH: If the flame chart is too large, only expand out to most of the
   *              available space, leaving some margin to show the other rows.
   */
  getViewHeight(maxViewportHeight: number): number {
    const { viewHeight, isThreadExpanded } = this.props;
    const exactSize = isThreadExpanded ? maxViewportHeight * 1.5 : maxViewportHeight;
    const largeGraph = viewHeight - TIMELINE_ROW_HEIGHT * 2;
    const smallGraph = TIMELINE_ROW_HEIGHT;
    return Math.max(smallGraph, Math.min(exactSize, largeGraph));
  }

  /**
   * Determine
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const {
      timeRange: { start, end },
      interval,
    } = this.props;
    return interval / (end - start);
  }

  render() {
    const {
      thread, isThreadExpanded, maxStackDepth, stackTimingByDepth, isSelected, timeRange,
      threadIndex, interval, getCategory, getLabel, horizontalViewport,
      changeTimelineHorizontalViewport,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxStackDepth * STACK_FRAME_HEIGHT;
    const title = thread.processType ? `${thread.name} [${thread.processType}]` : thread.name;
    const height = this.getViewHeight(maxViewportHeight);
    const buttonClass = classNames('timelineFlameChartCollapseButton', {
      expanded: isThreadExpanded,
      collapsed: !isThreadExpanded,
    });

    return (
      <div className='timelineFlameChart' style={{ height }}>
        <div className='timelineFlameChartLabels grippy'>
          <span>{title}</span>
          <button className={buttonClass} onClick={this.toggleThreadCollapse} />
        </div>
        <FlameChartViewport key={threadIndex}
                            thread={thread}
                            maxStackDepth={maxStackDepth}
                            isThreadExpanded={isThreadExpanded}
                            stackTimingByDepth={stackTimingByDepth}
                            isSelected={isSelected}
                            timeRange={timeRange}
                            threadIndex={threadIndex}
                            interval={interval}
                            maxViewportHeight={maxViewportHeight}
                            stackFrameHeight={STACK_FRAME_HEIGHT}
                            getCategory={getCategory}
                            getLabel={getLabel}
                            maximumZoom={this.getMaximumZoom()}
                            horizontalViewport={horizontalViewport}
                            changeTimelineHorizontalViewport={changeTimelineHorizontalViewport }/>
      </div>
    );
  }
}

export default connect((state, ownProps) => {
  const { threadIndex } = ownProps;
  const threadSelectors = selectorsForThread(threadIndex);
  const isThreadExpanded = getIsThreadExpanded(state, threadIndex);
  const stackTimingByDepth = isThreadExpanded
    ? threadSelectors.getStackTimingByDepthForFlameChart(state)
    : threadSelectors.getLeafCategoryStackTimingForFlameChart(state);

  return {
    thread: threadSelectors.getFilteredThreadForFlameChart(state),
    isThreadExpanded,
    maxStackDepth: isThreadExpanded ? threadSelectors.getFuncStackMaxDepthForFlameChart(state) : 1,
    stackTimingByDepth,
    isSelected: true,
    timeRange: getDisplayRange(state),
    interval: getProfileInterval(state),
    getCategory: getCategoryColorStrategy(state),
    getLabel: isThreadExpanded ? getLabelingStrategy(state) : getImplementationName,
    threadIndex,
  };
}, actions)(TimelineFlameChart);
