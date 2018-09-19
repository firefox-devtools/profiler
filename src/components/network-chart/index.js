/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import MarkerSettings from '../shared/MarkerSettings';
import VirtualList from '../shared/VirtualList';
import NetworkChartEmptyReasons from './NetworkChartEmptyReasons';
import NetworkChartRow from './NetworkChartRow';

import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const ROW_HEIGHT = 17.5;
const CONTAINER_WIDTH = 150 / window.screen.width * 100; // this will be replaced by the viewport

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type StateProps = {|
  +markers: TracingMarker[],
  +networkTimingRows: MarkerTimingRows,
  +maxNetworkRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class NetworkChart extends React.PureComponent<Props> {
  /**
   * Determine the maximum zoom of the viewport.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const { timeRange: { start, end }, interval } = this.props;
    return interval / (end - start);
  }

  _getMarkerPosition = markerStart => {
    const timeRange = this.props.timeRange;
    const timeRangeTotal = timeRange.end - timeRange.start;

    let markerPosition =
      (markerStart - timeRange.start) *
      (100 - CONTAINER_WIDTH) /
      timeRangeTotal;

    // the bar shall not overlap the first 150px as this is the thread label area.
    if (markerPosition < 0) {
      markerPosition = 0;
    }

    markerPosition = markerPosition + CONTAINER_WIDTH;

    return markerPosition;
  };

  _getMarkerLength = markerDuration => {
    const timeRange = this.props.timeRange;
    const timeRangeTotal = timeRange.end - timeRange.start;

    let markerLength =
      markerDuration * (100 - CONTAINER_WIDTH) / timeRangeTotal;

    if (markerLength < 0.1) {
      markerLength = 0.1;
    }

    return markerLength;
  };

  _getMarkerStyling = (marker: TracingMarker) => {
    const markerLength = this._getMarkerLength(marker.dur);
    const markerPosition = this._getMarkerPosition(marker.data.startTime);

    const markerStyling = {
      width: markerLength + '%',
      left: markerPosition + '%',
    };
    return markerStyling;
  };

  // Create row with correct details
  _renderRow = (nodeId: any, index: number) => {
    const marker = this.props.markers;

    return (
      <NetworkChartRow
        marker={marker[index]}
        index={index}
        markerStyle={this._getMarkerStyling(marker[index])}
        threadIndex={this.props.threadIndex}
      />
    );
  };

  render() {
    const { markers } = this.props;

    return (
      <div className="networkChart">
        <MarkerSettings />
        {markers.length === 0 ? (
          <NetworkChartEmptyReasons />
        ) : (
          <VirtualList
            className="treeViewBody"
            items={markers}
            renderItem={this._renderRow}
            itemHeight={ROW_HEIGHT}
            columnCount={1}
            focusable={true}
            specialItems={[]}
            containerWidth={3000}
            disableOverscan={true}
          />
        )}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const networkTimingRows = selectedThreadSelectors.getNetworkChartTiming(
      state
    );
    return {
      markers: selectedThreadSelectors.getNetworkChartTracingMarkers(state),
      networkTimingRows,
      maxNetworkRows: networkTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
    };
  },
  component: NetworkChart,
};
export default explicitConnect(options);
