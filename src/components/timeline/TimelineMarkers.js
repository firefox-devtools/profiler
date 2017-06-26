// @flow
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import TimelineMarkerCanvas from './TimelineMarkerCanvas';
import { selectorsForThread, getDisplayRange, getProfileInterval, getProfileViewOptions } from '../../reducers/profile-view';
import { getCategoryColorStrategy, getLabelingStrategy } from '../../reducers/flame-chart';
import { getAreMarkersExpanded } from '../../reducers/timeline-view';
import actions from '../../actions';
import { getImplementationName } from '../../profile-logic/labeling-strategies';
import classNames from 'classnames';

import type { Thread } from '../../types/profile';
import type { TracingMarker, MarkerTimingRows } from '../../types/profile-derived';
import type { Milliseconds, CssPixels, UnitIntervalOfProfileRange } from '../../types/units';
import type { GetCategory } from '../../profile-logic/color-categories';
import type { GetLabel } from '../../profile-logic/labeling-strategies';
import type { UpdateProfileSelection } from '../../actions/profile-view';
import type { ProfileSelection } from '../../types/actions';


require('./TimelineMarkers.css');

const ROW_HEIGHT = 16;
const TIMELINE_ROW_HEIGHT = 34;

type Props = {
  thread: Thread,
  isRowExpanded: boolean,
  maxMarkerRows: number,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  getCategory: GetCategory,
  getLabel: GetLabel,
  changeTimelineMarkersExpandedThread: (number, boolean) => {},
  updateProfileSelection: UpdateProfileSelection,
  viewHeight: CssPixels,
  getScrollElement: () => HTMLElement,
  selection: ProfileSelection,
  threadName: string,
  processDetails: string,
  markerTimingRows: MarkerTimingRows,
  markers: TracingMarker[],
};

class TimelineMarkers extends PureComponent {

  props: Props;

  constructor(props) {
    super(props);
    (this: any)._toggleThreadCollapse = this._toggleThreadCollapse.bind(this);
  }

  _toggleThreadCollapse() {
    const { changeTimelineMarkersExpandedThread, threadIndex, isRowExpanded } = this.props;
    changeTimelineMarkersExpandedThread(threadIndex, !isRowExpanded);
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
    const { viewHeight, isRowExpanded } = this.props;
    const exactSize = isRowExpanded ? maxViewportHeight * 1.5 : maxViewportHeight;
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
      thread, isRowExpanded, maxMarkerRows, isSelected, timeRange,
      threadIndex, interval, getCategory, getLabel, markerTimingRows, markers,
      updateProfileSelection, selection, threadName, processDetails, getScrollElement,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;
    const height = this.getViewHeight(maxViewportHeight);
    const buttonClass = classNames('timelineMarkersCollapseButton', {
      expanded: isRowExpanded,
      collapsed: !isRowExpanded,
    });

    return (
      <div className='timelineMarkers' style={{ height }}>
        <div className='timelineMarkersLabels grippy' title={processDetails}>
          <span className='timelineMarkersLabelsName'>{threadName}</span>
          <button className={buttonClass} onClick={this._toggleThreadCollapse} />
        </div>
        <TimelineMarkerCanvas key={threadIndex}
                            // TimelineViewport props
                            isRowExpanded={isRowExpanded}
                            isSelected={isSelected}
                            timeRange={timeRange}
                            maxViewportHeight={maxViewportHeight}
                            getScrollElement={getScrollElement}
                            maximumZoom={this.getMaximumZoom()}
                            selection={selection}
                            updateProfileSelection={updateProfileSelection}
                            viewportNeedsUpdate={viewportNeedsUpdate}
                            // TimelineMarkerCanvas props
                            interval={interval}
                            thread={thread}
                            rangeStart={timeRange.start}
                            rangeEnd={timeRange.end}
                            markerTimingRows={markerTimingRows}
                            getCategory={getCategory}
                            getLabel={getLabel}
                            maxMarkerRows={maxMarkerRows}
                            markers={markers}
                            rowHeight={ROW_HEIGHT} />
      </div>
    );
  }
}

function viewportNeedsUpdate(prevProps, newProps) {
  return prevProps.markerTimingRows !== newProps.markerTimingRows;
}


export default connect((state, ownProps) => {
  const { threadIndex } = ownProps;
  const threadSelectors = selectorsForThread(threadIndex);
  const isRowExpanded = getAreMarkersExpanded(state, threadIndex);

  const markers = threadSelectors.getTracingMarkers(state);
  const markerTimingRows = isRowExpanded
    ? threadSelectors.getMarkerTiming(state)
    : [];

  return {
    thread: threadSelectors.getFilteredThreadForFlameChart(state),
    isRowExpanded,
    markers,
    markerTimingRows,
    maxMarkerRows: markerTimingRows.length,
    isSelected: true,
    timeRange: getDisplayRange(state),
    interval: getProfileInterval(state),
    getCategory: getCategoryColorStrategy(state),
    getLabel: isRowExpanded ? getLabelingStrategy(state) : getImplementationName,
    threadIndex,
    selection: getProfileViewOptions(state).selection,
    threadName: threadSelectors.getFriendlyThreadName(state),
    processDetails: threadSelectors.getThreadProcessDetails(state),
  };
}, (actions: Object))(TimelineMarkers);
