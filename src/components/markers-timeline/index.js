// @flow
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import MarkersTimelineCanvas from './Canvas';
import {
  selectedThreadSelectors,
  getDisplayRange,
  getProfileInterval,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import { updateProfileSelection } from '../../actions/profile-view';

import type { Thread } from '../../types/profile';
import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { ProfileSelection } from '../../types/actions';

require('./style.css');

const ROW_HEIGHT = 16;

type Props = {
  thread: Thread,
  isRowExpanded: boolean,
  maxMarkerRows: number,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  updateProfileSelection: typeof updateProfileSelection,
  selection: ProfileSelection,
  threadName: string,
  processDetails: string,
  markerTimingRows: MarkerTimingRows,
  markers: TracingMarker[],
};

class TimelineMarkers extends PureComponent {
  props: Props;

  /**
   * Determine the maximum zoom of the viewport.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const { timeRange: { start, end }, interval } = this.props;
    return interval / (end - start);
  }

  render() {
    const {
      isRowExpanded,
      maxMarkerRows,
      isSelected,
      timeRange,
      threadIndex,
      interval,
      markerTimingRows,
      markers,
      updateProfileSelection,
      selection,
      threadName,
      processDetails,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;

    return (
      <div className="markersTimeline">
        <div className="markersTimelineLabels grippy" title={processDetails}>
          <span className="markersTimelineLabelsName">
            {threadName}
          </span>
        </div>
        <MarkersTimelineCanvas
          key={threadIndex}
          // TimelineViewport props
          isRowExpanded={isRowExpanded}
          isSelected={isSelected}
          timeRange={timeRange}
          maxViewportHeight={maxViewportHeight}
          maximumZoom={this.getMaximumZoom()}
          selection={selection}
          updateProfileSelection={updateProfileSelection}
          viewportNeedsUpdate={viewportNeedsUpdate}
          // MarkersTimelineCanvas props
          interval={interval}
          rangeStart={timeRange.start}
          rangeEnd={timeRange.end}
          markerTimingRows={markerTimingRows}
          maxMarkerRows={maxMarkerRows}
          markers={markers}
          rowHeight={ROW_HEIGHT}
        />
      </div>
    );
  }
}

function viewportNeedsUpdate(prevProps, newProps) {
  return prevProps.markerTimingRows !== newProps.markerTimingRows;
}

export default connect(
  (state, ownProps) => {
    const { threadIndex } = ownProps;
    const markers = selectedThreadSelectors.getTracingMarkers(state);
    const markerTimingRows = selectedThreadSelectors.getMarkerTiming(state);

    return {
      thread: selectedThreadSelectors.getFilteredThreadForFlameChart(state),
      markers,
      markerTimingRows,
      maxMarkerRows: markerTimingRows.length,
      timeRange: getDisplayRange(state),
      interval: getProfileInterval(state),
      threadIndex,
      selection: getProfileViewOptions(state).selection,
      threadName: selectedThreadSelectors.getFriendlyThreadName(state),
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
    };
  },
  { updateProfileSelection }
)(TimelineMarkers);
