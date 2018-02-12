/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import MarkerChartCanvas from './Canvas';
import {
  selectedThreadSelectors,
  getDisplayRange,
  getProfileInterval,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updateProfileSelection } from '../../actions/profile-view';

import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { ProfileSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const ROW_HEIGHT = 16;

type DispatchProps = {|
  +updateProfileSelection: typeof updateProfileSelection,
|};

type StateProps = {|
  +markers: TracingMarker[],
  +markerTimingRows: MarkerTimingRows,
  +maxMarkerRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
  +selection: ProfileSelection,
  +threadName: string,
  +processDetails: string,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

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
      maxMarkerRows,
      timeRange,
      threadIndex,
      markerTimingRows,
      markers,
      selection,
      threadName,
      processDetails,
      updateProfileSelection,
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
          viewportProps={{
            timeRange,
            selection,
            maxViewportHeight,
            viewportNeedsUpdate,
            maximumZoom: this.getMaximumZoom(),
          }}
          chartProps={{
            markerTimingRows,
            markers,
            updateProfileSelection,
            rangeStart: timeRange.start,
            rangeEnd: timeRange.end,
            rowHeight: ROW_HEIGHT,
            threadIndex,
          }}
        />
      </div>
    );
  }
}

// This function is given the MarkerChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +markerTimingRows: MarkerTimingRows },
  newProps: { +markerTimingRows: MarkerTimingRows }
) {
  return prevProps.markerTimingRows !== newProps.markerTimingRows;
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const markers = selectedThreadSelectors.getTracingMarkers(state);
    const markerTimingRows = selectedThreadSelectors.getMarkerTiming(state);
    const threadName = selectedThreadSelectors.getFriendlyThreadName(state);

    return {
      markers,
      markerTimingRows,
      maxMarkerRows: markerTimingRows.length,
      timeRange: getDisplayRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
      selection: getProfileViewOptions(state).selection,
      threadName,
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
    };
  },
  mapDispatchToProps: { updateProfileSelection },
  component: MarkerChart,
};
export default explicitConnect(options);
