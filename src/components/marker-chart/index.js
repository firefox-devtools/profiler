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
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type { TracingMarker, MarkerTiming } from '../../types/profile-derived';
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
  +markerTimingAndBuckets: Array<string | MarkerTiming>,
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
      markerTimingAndBuckets,
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
              markerTimingAndBuckets,
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
  prevProps: { +markerTimingAndBuckets: Array<string | MarkerTiming> },
  newProps: { +markerTimingAndBuckets: Array<string | MarkerTiming> }
) {
  return prevProps.markerTimingAndBuckets !== newProps.markerTimingAndBuckets;
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const markerTimingAndBuckets = selectedThreadSelectors.getMarkerChartTimingAndBuckets(
      state
    );
    return {
      markers: selectedThreadSelectors.getMarkerChartTracingMarkers(state),
      markerTimingAndBuckets,
      maxMarkerRows: markerTimingAndBuckets.length,
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
