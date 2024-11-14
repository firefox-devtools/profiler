/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from 'firefox-profiler/app-logic/constants';
import explicitConnect from 'firefox-profiler/utils/connect';
import { FlowPanelCanvas } from './Canvas';

import {
  getCommittedRange,
  getPreviewSelection,
} from 'firefox-profiler/selectors/profile';
import {
  getFullMarkerListPerThread,
  getMarkerChartLabelGetterPerThread,
  getFlowTiming,
} from 'firefox-profiler/selectors/flow';
import {
  updatePreviewSelection,
  changeMouseTimePosition,
  changeActiveFlows,
} from 'firefox-profiler/actions/profile-view';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';

import type {
  Marker,
  MarkerIndex,
  FlowTiming,
  UnitIntervalOfProfileRange,
  StartEndRange,
  PreviewSelection,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './index.css';

const ROW_HEIGHT = 16;

type DispatchProps = {
  updatePreviewSelection: typeof updatePreviewSelection;
  changeMouseTimePosition: typeof changeMouseTimePosition;
  changeActiveFlows: typeof changeActiveFlows;
};

type StateProps = {
  fullMarkerListPerThread: Marker[][];
  markerLabelGetterPerThread: Array<(marker: MarkerIndex) => string>;
  flowTiming: FlowTiming;
  timeRange: StartEndRange;
  previewSelection: PreviewSelection;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class FlowPanelImpl extends React.PureComponent<Props> {
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

  _shouldDisplayTooltips = () => true;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  _focusViewport = () => {
    if (this._viewport) {
      this._viewport.focus();
    }
  };

  override componentDidMount() {
    this._focusViewport();
  }

  override render() {
    const {
      timeRange,
      flowTiming,
      fullMarkerListPerThread,
      markerLabelGetterPerThread,
      previewSelection,
      updatePreviewSelection,
      changeMouseTimePosition,
      changeActiveFlows,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const rowCount = flowTiming.rows.length;
    const maxViewportHeight = rowCount * ROW_HEIGHT;

    return (
      <div className="flowPanel">
        {rowCount === 0 ? null : (
          <ContextMenuTrigger
            id="MarkerContextMenu"
            attributes={{
              className: 'treeViewContextMenu',
            }}
          >
            <FlowPanelCanvas
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
                flowTiming,
                fullMarkerListPerThread,
                markerLabelGetterPerThread,
                updatePreviewSelection,
                changeMouseTimePosition,
                changeActiveFlows,
                rangeStart: timeRange.start,
                rangeEnd: timeRange.end,
                rowHeight: ROW_HEIGHT,
                marginLeft: TIMELINE_MARGIN_LEFT,
                marginRight: TIMELINE_MARGIN_RIGHT,
                shouldDisplayTooltips: this._shouldDisplayTooltips,
              }}
            />
          </ContextMenuTrigger>
        )}
      </div>
    );
  }
}

// This function is given the FlowPanelCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { flowTiming: FlowTiming },
  newProps: { flowTiming: FlowTiming }
) {
  return prevProps.flowTiming !== newProps.flowTiming;
}

export const FlowPanel = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const flowTiming = getFlowTiming(state);
    return {
      fullMarkerListPerThread: getFullMarkerListPerThread(state),
      markerLabelGetterPerThread: getMarkerChartLabelGetterPerThread(state),
      flowTiming,
      timeRange: getCommittedRange(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    changeMouseTimePosition,
    changeActiveFlows,
  },
  component: FlowPanelImpl,
});
