// @flow
import * as React from 'react';
import { connect } from 'react-redux';
import MarkerChartCanvas from './Canvas';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import {
  selectedThreadSelectors,
  getDisplayRange,
  getProfileInterval,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import { updateProfileSelection } from '../../actions/profile-view';
import { getImplementationFilter } from '../../reducers/url-state';

import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { ProfileSelection } from '../../types/actions';

require('./index.css');

const ROW_HEIGHT = 16;

type Props = {
  isRowExpanded: boolean,
  maxMarkerRows: number,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  updateProfileSelection: typeof updateProfileSelection,
  selection: ProfileSelection,
  threadName: string,
  getTooltipContents: TracingMarker => React.Node,
  processDetails: string,
  markerTimingRows: MarkerTimingRows,
  markers: TracingMarker[],
};

class MarkerChart extends React.PureComponent<Props> {
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
      markerTimingRows,
      markers,
      updateProfileSelection,
      selection,
      threadName,
      processDetails,
      getTooltipContents,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;

    return (
      <div className="markerChart">
        <div className="markerChartLabels grippy" title={processDetails}>
          <span className="markerChartLabelsName">
            {threadName}
          </span>
        </div>
        <MarkerChartCanvas
          key={threadIndex}
          // ChartViewport props
          isRowExpanded={isRowExpanded}
          isSelected={isSelected}
          timeRange={timeRange}
          maxViewportHeight={maxViewportHeight}
          maximumZoom={this.getMaximumZoom()}
          selection={selection}
          updateProfileSelection={updateProfileSelection}
          viewportNeedsUpdate={viewportNeedsUpdate}
          // MarkerChartCanvas props
          rangeStart={timeRange.start}
          rangeEnd={timeRange.end}
          markerTimingRows={markerTimingRows}
          maxMarkerRows={maxMarkerRows}
          markers={markers}
          getTooltipContents={getTooltipContents}
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
    const threadName = selectedThreadSelectors.getFriendlyThreadName(state);
    const thread = selectedThreadSelectors.getThread(state);
    const implementationFilter = getImplementationFilter(state);
    const getTooltipContents = item => {
      return (
        <MarkerTooltipContents
          marker={item}
          threadName={threadName}
          thread={thread}
          implementationFilter={implementationFilter}
        />
      );
    };

    return {
      markers,
      markerTimingRows,
      maxMarkerRows: markerTimingRows.length,
      timeRange: getDisplayRange(state),
      interval: getProfileInterval(state),
      selection: getProfileViewOptions(state).selection,
      threadName,
      threadIndex,
      getTooltipContents,
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
    };
  },
  { updateProfileSelection }
)(MarkerChart);
