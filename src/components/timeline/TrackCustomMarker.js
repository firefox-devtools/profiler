/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { TrackCustomMarkerGraph } from './TrackCustomMarkerGraph';
import { TRACK_MARKER_HEIGHT } from 'firefox-profiler/app-logic/constants';

import type { ThreadIndex, Milliseconds } from 'firefox-profiler/types';
import type { MarkerSchema } from 'firefox-profiler/types/markers';
import type { IndexIntoStringTable } from 'firefox-profiler/types/profile';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackCustomMarker.css';

type OwnProps = {
  readonly markerSchema: MarkerSchema,
  readonly markerName: IndexIntoStringTable,
  readonly threadIndex: ThreadIndex,
};

type StateProps = {
  readonly rangeStart: Milliseconds,
  readonly rangeEnd: Milliseconds,
};

type DispatchProps = {};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

export class TrackCustomMarkerImpl extends React.PureComponent<Props> {
  render() {
    const { markerSchema, markerName, threadIndex } = this.props;
    return (
      <div
        className="timelineTrackCustomMarker"
        style={{
          height: TRACK_MARKER_HEIGHT,
          '--graph-height': `${TRACK_MARKER_HEIGHT}px`,
        }}
      >
        <TrackCustomMarkerGraph
          threadIndex={threadIndex}
          markerSchema={markerSchema}
          markerName={markerName}
          graphHeight={TRACK_MARKER_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackCustomMarker = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, _ownProps) => {
    const { start, end } = getCommittedRange(state);
    return {
      rangeStart: start,
      rangeEnd: end,
    };
  },
  component: TrackCustomMarkerImpl,
});
