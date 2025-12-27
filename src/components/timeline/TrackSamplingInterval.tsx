/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackSamplingIntervalGraph } from './TrackSamplingIntervalGraph';
import {
  TRACK_PROCESS_CPU_HEIGHT,
  TRACK_PROCESS_CPU_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type { Pid, Milliseconds } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackSamplingInterval.css';

type OwnProps = {
  readonly pid: Pid;
};

type StateProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
};

type DispatchProps = {
  updatePreviewSelection: typeof updatePreviewSelection;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {};

export class TrackSamplingIntervalImpl extends React.PureComponent<
  Props,
  State
> {
  override render() {
    const { pid } = this.props;
    return (
      <div
        className="timelineTrackSamplingInterval"
        style={
          {
            height: TRACK_PROCESS_CPU_HEIGHT,
            '--graph-height': `${TRACK_PROCESS_CPU_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        <TrackSamplingIntervalGraph
          pid={pid}
          lineWidth={TRACK_PROCESS_CPU_LINE_WIDTH}
          graphHeight={TRACK_PROCESS_CPU_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackSamplingInterval = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => {
    const { start, end } = getCommittedRange(state);
    return {
      rangeStart: start,
      rangeEnd: end,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackSamplingIntervalImpl,
});
