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
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackPowerGraph } from './TrackPowerGraph';
import {
  TRACK_POWER_HEIGHT,
  TRACK_POWER_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  ThreadIndex,
  Milliseconds,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackPower.css';

type OwnProps = {
  +counterIndex: CounterIndex,
};

type StateProps = {
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
};

type DispatchProps = {
  updatePreviewSelection: typeof updatePreviewSelection,
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {};

export class TrackPowerImpl extends React.PureComponent<Props, State> {
  render() {
    const { counterIndex } = this.props;
    return (
      <div
        className="timelineTrackPower"
        style={{
          height: TRACK_POWER_HEIGHT,
          '--graph-height': `${TRACK_POWER_HEIGHT}px`,
        }}
      >
        <TrackPowerGraph
          counterIndex={counterIndex}
          lineWidth={TRACK_POWER_LINE_WIDTH}
          graphHeight={TRACK_POWER_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackPower = explicitConnect<OwnProps, StateProps, DispatchProps>({
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
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackPowerImpl,
});
