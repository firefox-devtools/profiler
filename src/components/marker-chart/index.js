/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import MarkerChartCanvas from './Canvas';
import MarkerChartEmptyReasons from './MarkerChartEmptyReasons';
import MarkerSettings from '../shared/MarkerSettings';

import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
} from '../../reducers/profile-view';
import {
  getSelectedThreadIndex,
  getSelectedTab,
} from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { PreviewSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const ROW_HEIGHT = 16;

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type StateProps = {|
  +markers: TracingMarker[],
  +markerTimingRows: MarkerTimingRows,
  +maxMarkerRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
  +previewSelection: PreviewSelection,
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
      previewSelection,
      updatePreviewSelection,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;

    return (
      <div className="markerChart">
        <MarkerSettings />
        {markers.length === 0 ? (
          <MarkerChartEmptyReasons />
        ) : (
          <MarkerChartCanvas
            key={threadIndex}
            viewportProps={{
              timeRange,
              previewSelection,
              maxViewportHeight,
              viewportNeedsUpdate,
              maximumZoom: this.getMaximumZoom(),
            }}
            chartProps={{
              markerTimingRows,
              markers,
              updatePreviewSelection,
              rangeStart: timeRange.start,
              rangeEnd: timeRange.end,
              rowHeight: ROW_HEIGHT,
              threadIndex,
            }}
          />
        )}
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
    const isNetworkChart = getSelectedTab(state) === 'network-chart';
    const markers = isNetworkChart
      ? selectedThreadSelectors.getNetworkChartTracingMarkers(state)
      : selectedThreadSelectors.getMarkerChartTracingMarkers(state);
    const markerTimingRows = isNetworkChart
      ? selectedThreadSelectors.getNetworkChartTiming(state)
      : selectedThreadSelectors.getMarkerChartTiming(state);

    return {
      markers,
      markerTimingRows,
      maxMarkerRows: markerTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: MarkerChart,
};
export default explicitConnect(options);
