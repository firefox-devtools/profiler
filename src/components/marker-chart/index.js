/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { TIMELINE_MARGIN_RIGHT } from '../../app-logic/constants';
import explicitConnect from '../../utils/connect';
import { MarkerChartCanvas } from './Canvas';
import { MarkerChartEmptyReasons } from './MarkerChartEmptyReasons';
import MarkerSettings from '../shared/MarkerSettings';

import {
  getCommittedRange,
  getPreviewSelection,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getSelectedThreadsKey,
  getTimelineTrackOrganization,
} from '../../selectors/url-state';
import { getTimelineMarginLeft } from '../../selectors/app';
import {
  updatePreviewSelection,
  changeRightClickedMarker,
} from '../../actions/profile-view';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';

import type {
  Marker,
  MarkerIndex,
  MarkerTimingAndBuckets,
  UnitIntervalOfProfileRange,
  StartEndRange,
  PreviewSelection,
  ThreadsKey,
  CssPixels,
  TimelineTrackOrganization,
} from 'firefox-profiler/types';

import type { ConnectedProps } from '../../utils/connect';

require('./index.css');

const ROW_HEIGHT = 16;

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeRightClickedMarker: typeof changeRightClickedMarker,
|};

type StateProps = {|
  +getMarker: MarkerIndex => Marker,
  +markerTimingAndBuckets: MarkerTimingAndBuckets,
  +maxMarkerRows: number,
  +timeRange: StartEndRange,
  +threadsKey: ThreadsKey,
  +previewSelection: PreviewSelection,
  +rightClickedMarkerIndex: MarkerIndex | null,
  +timelineMarginLeft: CssPixels,
  +timelineTrackOrganization: TimelineTrackOrganization,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerChartImpl extends React.PureComponent<Props> {
  _viewport: HTMLDivElement | null = null;

  /**
   * Determine the maximum zoom of the viewport.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const {
      timeRange: { start, end },
    } = this.props;

    // This is set to a very small value, that represents 1ns. We can't set it
    // to zero unless we revamp how ranges are handled in the app to prevent
    // less-than-1ns ranges, otherwise we can get stuck at a "0" zoom.
    const ONE_NS = 1e-6;
    return ONE_NS / (end - start);
  }

  _shouldDisplayTooltips = () => this.props.rightClickedMarkerIndex === null;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  _focusViewport = () => {
    if (this._viewport) {
      this._viewport.focus();
    }
  };

  componentDidMount() {
    this._focusViewport();
  }

  render() {
    const {
      maxMarkerRows,
      timeRange,
      threadsKey,
      markerTimingAndBuckets,
      getMarker,
      previewSelection,
      updatePreviewSelection,
      changeRightClickedMarker,
      rightClickedMarkerIndex,
      timelineMarginLeft,
      timelineTrackOrganization,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;

    return (
      <div
        className="markerChart"
        id="marker-chart-tab"
        role="tabpanel"
        aria-labelledby="marker-chart-tab-button"
      >
        <MarkerSettings />
        {maxMarkerRows === 0 ? (
          <MarkerChartEmptyReasons />
        ) : (
          <ContextMenuTrigger
            id="MarkerContextMenu"
            attributes={{
              className: 'treeViewContextMenu',
            }}
          >
            <MarkerChartCanvas
              key={threadsKey}
              viewportProps={{
                timeRange,
                previewSelection,
                maxViewportHeight,
                viewportNeedsUpdate,
                maximumZoom: this.getMaximumZoom(),
                marginLeft: timelineMarginLeft,
                marginRight: TIMELINE_MARGIN_RIGHT,
                containerRef: this._takeViewportRef,
              }}
              chartProps={{
                markerTimingAndBuckets,
                getMarker,
                // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
                updatePreviewSelection,
                changeRightClickedMarker,
                rangeStart: timeRange.start,
                rangeEnd: timeRange.end,
                rowHeight: ROW_HEIGHT,
                threadsKey,
                marginLeft: timelineMarginLeft,
                marginRight: TIMELINE_MARGIN_RIGHT,
                rightClickedMarkerIndex,
                shouldDisplayTooltips: this._shouldDisplayTooltips,
                timelineTrackOrganization,
              }}
            />
          </ContextMenuTrigger>
        )}
      </div>
    );
  }
}

// This function is given the MarkerChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +markerTimingAndBuckets: MarkerTimingAndBuckets },
  newProps: { +markerTimingAndBuckets: MarkerTimingAndBuckets }
) {
  return prevProps.markerTimingAndBuckets !== newProps.markerTimingAndBuckets;
}

export const MarkerChart = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    const markerTimingAndBuckets = selectedThreadSelectors.getMarkerChartTimingAndBuckets(
      state
    );
    return {
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      markerTimingAndBuckets,
      maxMarkerRows: markerTimingAndBuckets.length,
      timeRange: getCommittedRange(state),
      threadsKey: getSelectedThreadsKey(state),
      previewSelection: getPreviewSelection(state),
      rightClickedMarkerIndex: selectedThreadSelectors.getRightClickedMarkerIndex(
        state
      ),
      timelineMarginLeft: getTimelineMarginLeft(state),
      timelineTrackOrganization: getTimelineTrackOrganization(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection, changeRightClickedMarker },
  component: MarkerChartImpl,
});
