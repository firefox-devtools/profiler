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
import JsTracerCanvas from './Canvas';

import {
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';
import * as JsTracer from '../../profile-logic/js-tracer';

import type { JsTracerTable } from '../../types/profile';
import type { JsTracerTiming } from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
  CssPixels,
} from '../../types/units';
import type { PreviewSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const ROW_HEIGHT: CssPixels = 16;

type OwnProps = {|
  // This component can only be mounted if the JsTracerTable exists in the state.
  +jsTracerTable: JsTracerTable,
  +showJsTracerSummary: boolean,
|};

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type StateProps = {|
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
  +previewSelection: PreviewSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * This component uses the timing information for JS tracer events. This information
 * can be quite expensive to compute. This component is responsible for encapsulating
 * the complexity of deferring that calculation until the proper moment in the
 * component life cycle.
 */
class JsTracerExpensiveChart extends React.PureComponent<Props> {
  /**
   * Determine the maximum zoom of the viewport.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const { timeRange: { start, end }, interval } = this.props;
    return interval / (end - start);
  }

  render() {
    const {
      timeRange,
      threadIndex,
      jsTracerTable,
      previewSelection,
      updatePreviewSelection,
      showJsTracerSummary,
    } = this.props;

    const jsTracerTimingRows = _getJsTracerTimingRows(
      jsTracerTable,
      showJsTracerSummary
    );

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = jsTracerTimingRows.length * ROW_HEIGHT;

    return (
      <JsTracerCanvas
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
          jsTracerTimingRows,
          jsTracerTable,
          updatePreviewSelection,
          rangeStart: timeRange.start,
          rangeEnd: timeRange.end,
          rowHeight: ROW_HEIGHT,
          threadIndex,
        }}
      />
    );
  }
}

type JsTracerTimingWeakmap = WeakMap<JsTracerTable, JsTracerTiming[]>;
const _jsTracerTimingWeakmap: JsTracerTimingWeakmap = new WeakMap();
const _jsTracerLeafTimingWeakmap: JsTracerTimingWeakmap = new WeakMap();

/**
 * Don't compute the JS tracer timing information in the selector, as it's very expensive.
 * Defer computation until we actually use it in the render. Sometimes the selector
 * is run, but the component is not actually rendered. Running this code in the selector
 * would jank the browser, without updating the UI with a "loading" notification.
 */
function _getJsTracerTimingRows(
  jsTracerTable: JsTracerTable,
  showJsTracerSummary: boolean
): JsTracerTiming[] {
  if (showJsTracerSummary) {
    let timing = _jsTracerTimingWeakmap.get(jsTracerTable);
    if (!timing) {
      timing = JsTracer.getJsTracerLeafTiming(jsTracerTable);
      _jsTracerTimingWeakmap.set(jsTracerTable, timing);
    }
    return timing;
  }
  let timing = _jsTracerLeafTimingWeakmap.get(jsTracerTable);
  if (!timing) {
    timing = JsTracer.getJsTracerTiming(jsTracerTable);
    _jsTracerLeafTimingWeakmap.set(jsTracerTable, timing);
  }
  return timing;
}

// This function is given the JsTracerCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +jsTracerTimingRows: JsTracerTiming[] },
  newProps: { +jsTracerTimingRows: JsTracerTiming[] }
) {
  return prevProps.jsTracerTimingRows !== newProps.jsTracerTimingRows;
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    timeRange: getCommittedRange(state),
    interval: getProfileInterval(state),
    threadIndex: getSelectedThreadIndex(state),
    previewSelection: getPreviewSelection(state),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracerExpensiveChart,
};
export default explicitConnect(options);
