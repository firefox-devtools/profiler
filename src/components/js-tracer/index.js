/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import JsTracerCanvas from './Canvas';
import EmptyReasons from './EmptyReasons';

import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type { JsTracerTable } from '../../types/profile';
import type { JsTracerTiming } from '../../types/profile-derived';
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
  +jsTracerTable: JsTracerTable | null,
  +jsTracerTimingRows: JsTracerTiming[] | null,
  +maxMarkerRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
  +previewSelection: PreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class JsTracerChart extends React.PureComponent<Props> {
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
      jsTracerTimingRows,
      jsTracerTable,
      previewSelection,
      updatePreviewSelection,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = maxMarkerRows * ROW_HEIGHT;

    return (
      <div className="markerChart">
        {jsTracerTable === null || jsTracerTimingRows === null ? (
          <EmptyReasons />
        ) : (
          <JsTracerCanvas
            key={threadIndex}
            viewportProps={{
              timeRange,
              previewSelection,
              maxViewportHeight,
              viewportNeedsUpdate,
              maximumZoom: this.getMaximumZoom(),
            }}
            chartProps={{
              jsTracerTimingRows,
              jsTracerTable,
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

// This function is given the JsTracerCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +jsTracerTimingRows: JsTracerTiming[] },
  newProps: { +jsTracerTimingRows: JsTracerTiming[] }
) {
  return prevProps.jsTracerTimingRows !== newProps.jsTracerTimingRows;
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const jsTracerTimingRows = selectedThreadSelectors.getJsTracerTiming(state);
    return {
      jsTracerTable: selectedThreadSelectors.getJsTracerTable(state),
      jsTracerTimingRows,
      maxMarkerRows:
        jsTracerTimingRows === null ? 0 : jsTracerTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracerChart,
};
export default explicitConnect(options);
