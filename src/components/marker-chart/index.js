/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
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
import { viewTooltip, dismissTooltip } from '../../actions/app';

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
  +viewTooltip: typeof viewTooltip,
  +dismissTooltip: typeof dismissTooltip,
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
      viewTooltip,
      dismissTooltip,
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
              marginLeft: TIMELINE_MARGIN_LEFT,
              marginRight: TIMELINE_MARGIN_RIGHT,
            }}
            chartProps={{
              markerTimingRows,
              markers,
              updatePreviewSelection,
              rangeStart: timeRange.start,
              rangeEnd: timeRange.end,
              rowHeight: ROW_HEIGHT,
              threadIndex,
              marginLeft: TIMELINE_MARGIN_LEFT,
              marginRight: TIMELINE_MARGIN_RIGHT,
              viewTooltip,
              dismissTooltip,
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
    const markerTimingRows = selectedThreadSelectors.getMarkerChartTiming(
      state
    );
    return {
      markers: selectedThreadSelectors.getMarkerChartTracingMarkers(state),
      markerTimingRows,
      maxMarkerRows: markerTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    viewTooltip,
    dismissTooltip,
  },
  component: MarkerChart,
};
export default explicitConnect(options);
