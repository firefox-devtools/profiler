/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_RIGHT,
  TIMELINE_MARGIN_LEFT,
} from 'firefox-profiler/app-logic/constants';
import explicitConnect from 'firefox-profiler/utils/connect';
import { MarkerChartCanvas } from './Canvas';
import { MarkerChartEmptyReasons } from './MarkerChartEmptyReasons';
import { MarkerSettings } from 'firefox-profiler/components/shared/MarkerSettings';

import {
  getCommittedRange,
  getPreviewSelection,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedThreadsKey } from 'firefox-profiler/selectors/url-state';
import {
  updatePreviewSelection,
  changeRightClickedMarker,
  changeMouseTimePosition,
  changeSelectedMarker,
} from 'firefox-profiler/actions/profile-view';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';

import type {
  Marker,
  MarkerIndex,
  MarkerTimingAndBuckets,
  UnitIntervalOfProfileRange,
  StartEndRange,
  PreviewSelection,
  ThreadsKey,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './index.css';

const ROW_HEIGHT = 16;

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeRightClickedMarker: typeof changeRightClickedMarker,
  +changeMouseTimePosition: typeof changeMouseTimePosition,
  +changeSelectedMarker: typeof changeSelectedMarker,
|};

type StateProps = {|
  +getMarker: (MarkerIndex) => Marker,
  +getMarkerLabel: (MarkerIndex) => string,
  +markerTimingAndBuckets: MarkerTimingAndBuckets,
  +maxMarkerRows: number,
  +markerListLength: number,
  +timeRange: StartEndRange,
  +threadsKey: ThreadsKey,
  +previewSelection: PreviewSelection,
  +rightClickedMarkerIndex: MarkerIndex | null,
  +selectedMarkerIndex: MarkerIndex | null,
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
      markerListLength,
      timeRange,
      threadsKey,
      markerTimingAndBuckets,
      getMarker,
      getMarkerLabel,
      previewSelection,
      updatePreviewSelection,
      changeMouseTimePosition,
      changeRightClickedMarker,
      rightClickedMarkerIndex,
      selectedMarkerIndex,
      changeSelectedMarker,
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
                marginLeft: TIMELINE_MARGIN_LEFT,
                marginRight: TIMELINE_MARGIN_RIGHT,
                containerRef: this._takeViewportRef,
              }}
              chartProps={{
                markerTimingAndBuckets,
                getMarker,
                getMarkerLabel,
                markerListLength,
                // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
                updatePreviewSelection,
                changeMouseTimePosition,
                changeRightClickedMarker,
                rangeStart: timeRange.start,
                rangeEnd: timeRange.end,
                rowHeight: ROW_HEIGHT,
                threadsKey,
                marginLeft: TIMELINE_MARGIN_LEFT,
                marginRight: TIMELINE_MARGIN_RIGHT,
                changeSelectedMarker,
                selectedMarkerIndex,
                rightClickedMarkerIndex,
                shouldDisplayTooltips: this._shouldDisplayTooltips,
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
  mapStateToProps: (state) => {
    const markerTimingAndBuckets =
      selectedThreadSelectors.getMarkerChartTimingAndBuckets(state);
    return {
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      getMarkerLabel: selectedThreadSelectors.getMarkerChartLabelGetter(state),
      markerTimingAndBuckets,
      maxMarkerRows: markerTimingAndBuckets.length,
      markerListLength: selectedThreadSelectors.getMarkerListLength(state),
      timeRange: getCommittedRange(state),
      threadsKey: getSelectedThreadsKey(state),
      previewSelection: getPreviewSelection(state),
      rightClickedMarkerIndex:
        selectedThreadSelectors.getRightClickedMarkerIndex(state),
      selectedMarkerIndex:
        selectedThreadSelectors.getSelectedMarkerIndex(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    changeMouseTimePosition,
    changeRightClickedMarker,
    changeSelectedMarker,
  },
  component: MarkerChartImpl,
});
