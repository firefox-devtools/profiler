/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import MarkerChartCanvas from './Canvas';
import MarkerSettings from '../shared/MarkerSettings';
import NetworkChartEmptyReasons from './NetworkChartEmptyReasons';

import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
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
  +networkTimingRows: MarkerTimingRows,
  +maxNetworkRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
  +previewSelection: PreviewSelection,
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

  render() {
    const {
      maxNetworkRows,
      timeRange,
      threadIndex,
      networkTimingRows,
      markers,
      previewSelection,
      updatePreviewSelection,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxNetworkRows * ROW_HEIGHT;

    return (
      <div className="networkChart">
        <MarkerSettings />
        {markers.length === 0 ? (
          <NetworkChartEmptyReasons />
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
              networkTimingRows,
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

// This function is given the NetworkChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +networkTimingRows: MarkerTimingRows },
  newProps: { +networkTimingRows: MarkerTimingRows }
) {
  return prevProps.networkTimingRows !== newProps.networkTimingRows;
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const markers = selectedThreadSelectors.getNetworkChartTracingMarkers(
      state
    );
    const networkTimingRows = selectedThreadSelectors.getNetworkChartTiming(
      state
    );

    return {
      markers,
      networkTimingRows,
      maxNetworkRows: networkTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: NetworkChart,
};
export default explicitConnect(options);
