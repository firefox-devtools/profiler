/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { TrackCustomMarkerGraph } from './TrackCustomMarkerGraph';
import {
  TRACK_MARKER_HEIGHT,
  TRACK_LOCAL_HEIGHT_WITHOUT_ACTIVITYGRAPH,
} from 'firefox-profiler/app-logic/constants';

import type { ThreadIndex, Milliseconds } from 'firefox-profiler/types';
import type { MarkerSchema } from 'firefox-profiler/types/markers';
import type { IndexIntoStringTable } from 'firefox-profiler/types/profile';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackCustomMarker.css';

type OwnProps = {
  readonly markerSchema: MarkerSchema;
  readonly markerName: IndexIntoStringTable;
  readonly threadIndex: ThreadIndex;
  readonly shouldUseEnlargedHeight: boolean;
};

type StateProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
};

type DispatchProps = {};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

export class TrackCustomMarkerImpl extends React.PureComponent<Props> {
  override render() {
    const { markerSchema, markerName, threadIndex, shouldUseEnlargedHeight } =
      this.props;
    const height = shouldUseEnlargedHeight
      ? TRACK_LOCAL_HEIGHT_WITHOUT_ACTIVITYGRAPH
      : TRACK_MARKER_HEIGHT;
    return (
      <div
        className="timelineTrackCustomMarker"
        style={
          {
            height,
            '--graph-height': `${height}px`,
          } as React.CSSProperties
        }
      >
        <TrackCustomMarkerGraph
          threadIndex={threadIndex}
          markerSchema={markerSchema}
          markerName={markerName}
          graphHeight={height}
        />
      </div>
    );
  }
}

export const TrackCustomMarker = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
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
