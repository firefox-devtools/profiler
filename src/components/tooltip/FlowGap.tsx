/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getThreadSelectorsFromThreadsKey } from 'firefox-profiler/selectors';
import { formatTimestamp } from 'firefox-profiler/utils/format-numbers';

import { TooltipDetails, TooltipDetail } from './TooltipDetails';

import type { Marker, MarkerIndex } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import './Marker.css';

type OwnProps = {
  beforeGapMarkerIndex: MarkerIndex;
  beforeGapMarker: Marker;
  beforeGapThreadIndex: number;
  afterGapMarkerIndex: MarkerIndex;
  afterGapMarker: Marker;
  afterGapThreadIndex: number;
  className?: string;
};

type StateProps = {
  beforeGapThreadName?: string;
  afterGapThreadName?: string;
  beforeGapGetMarkerLabel: (marker: MarkerIndex) => string;
  afterGapGetMarkerLabel: (marker: MarkerIndex) => string;
};

type Props = ConnectedProps<OwnProps, StateProps, {}>;

/**
 * This component combines Marker Schema, and custom handling to generate tooltips
 * for markers.
 */
class FlowGapTooltipContents extends React.PureComponent<Props> {
  _maybeRenderMarkerDuration() {
    const { beforeGapMarker, afterGapMarker } = this.props;
    const gapStart = beforeGapMarker.end ?? beforeGapMarker.start;
    const gapEnd = afterGapMarker.start;
    const duration = formatTimestamp(gapEnd - gapStart, 3, 1);
    return <div className="tooltipTiming">{duration}</div>;
  }

  override render() {
    const { className } = this.props;
    const {
      beforeGapMarkerIndex,
      beforeGapGetMarkerLabel,
      afterGapMarkerIndex,
      afterGapGetMarkerLabel,
      beforeGapThreadName,
      afterGapThreadName,
    } = this.props;
    const beforeLabel = beforeGapGetMarkerLabel(beforeGapMarkerIndex);
    const afterLabel = afterGapGetMarkerLabel(afterGapMarkerIndex);

    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className="tooltipHeader">
          <div className="tooltipOneLine">
            {this._maybeRenderMarkerDuration()}
            <div className="tooltipTitle">Gap</div>
          </div>
        </div>
        <TooltipDetails>
          <TooltipDetail label="Previous marker" key="previousMarker">
            {beforeLabel}
          </TooltipDetail>
          <TooltipDetail label="Previous thread" key="previousThread">
            {beforeGapThreadName}
          </TooltipDetail>
          <TooltipDetail label="Next marker" key="nextMarker">
            {afterLabel}
          </TooltipDetail>
          <TooltipDetail label="Next thread" key="nextThread">
            {afterGapThreadName}
          </TooltipDetail>
        </TooltipDetails>
      </div>
    );
  }
}

export const FlowGapTooltip = explicitConnect<OwnProps, StateProps, {}>({
  mapStateToProps: (state, props) => {
    const beforeGapSelectors = getThreadSelectorsFromThreadsKey(
      props.beforeGapThreadIndex
    );
    const afterGapSelectors = getThreadSelectorsFromThreadsKey(
      props.afterGapThreadIndex
    );
    return {
      beforeGapThreadName: beforeGapSelectors.getFriendlyThreadName(state),
      afterGapThreadName: afterGapSelectors.getFriendlyThreadName(state),
      beforeGapGetMarkerLabel:
        beforeGapSelectors.getMarkerTooltipLabelGetter(state),
      afterGapGetMarkerLabel:
        afterGapSelectors.getMarkerTooltipLabelGetter(state),
    };
  },
  component: FlowGapTooltipContents,
});
