/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getCounterSelectors,
} from 'firefox-profiler/selectors/profile';
import { TrackBandwidthGraph } from './TrackBandwidthGraph';
import {
  TRACK_BANDWIDTH_HEIGHT,
  TRACK_BANDWIDTH_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  ThreadIndex,
  Milliseconds,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackBandwidth.css';

type OwnProps = {
  +counterIndex: CounterIndex,
};

type StateProps = {
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
};

type DispatchProps = {};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {};

export class TrackBandwidthImpl extends React.PureComponent<Props, State> {
  render() {
    const { counterIndex } = this.props;
    return (
      <div
        className="timelineTrackBandwidth"
        style={{
          height: TRACK_BANDWIDTH_HEIGHT,
          '--graph-height': `${TRACK_BANDWIDTH_HEIGHT}px`,
        }}
      >
        <TrackBandwidthGraph
          counterIndex={counterIndex}
          lineWidth={TRACK_BANDWIDTH_LINE_WIDTH}
          graphHeight={TRACK_BANDWIDTH_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackBandwidth = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, ownProps) => {
    const { counterIndex } = ownProps;
    const counterSelectors = getCounterSelectors(counterIndex);
    const counter = counterSelectors.getCounter(state);
    const { start, end } = getCommittedRange(state);
    return {
      threadIndex: counter.mainThreadIndex,
      rangeStart: start,
      rangeEnd: end,
    };
  },
  component: TrackBandwidthImpl,
});
