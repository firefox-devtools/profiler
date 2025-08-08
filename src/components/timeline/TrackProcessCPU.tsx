/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getCounterSelectors,
} from 'firefox-profiler/selectors/profile';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackProcessCPUGraph } from './TrackProcessCPUGraph';
import {
  TRACK_PROCESS_CPU_HEIGHT,
  TRACK_PROCESS_CPU_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  ThreadIndex,
  Milliseconds,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackProcessCPU.css';

type OwnProps = {
  readonly counterIndex: CounterIndex;
};

type StateProps = {
  readonly threadIndex: ThreadIndex;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
};

type DispatchProps = {
  updatePreviewSelection: typeof updatePreviewSelection;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {};

export class TrackProcessCPUImpl extends React.PureComponent<Props, State> {
  override render() {
    const { counterIndex } = this.props;
    return (
      <div
        className="timelineTrackProcessCPU"
        style={
          {
            height: TRACK_PROCESS_CPU_HEIGHT,
            '--graph-height': `${TRACK_PROCESS_CPU_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        <TrackProcessCPUGraph
          counterIndex={counterIndex}
          lineWidth={TRACK_PROCESS_CPU_LINE_WIDTH}
          graphHeight={TRACK_PROCESS_CPU_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackProcessCPU = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
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
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackProcessCPUImpl,
});
