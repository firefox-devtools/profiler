/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackCustomMarkerGraph } from './TrackCustomMarkerGraph';
import { getMarkerTrackHeight } from 'firefox-profiler/profile-logic/tracks';

import type { ThreadIndex, Milliseconds } from 'firefox-profiler/types';
import type { MarkerSchema } from 'firefox-profiler/types/markers';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackMemory.css';

type OwnProps = {|
  +markerSchema: MarkerSchema,
  +threadIndex: ThreadIndex,
|};

type StateProps = {|
  +threadIndex: ThreadIndex,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
|};

type DispatchProps = {|
  updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {||};

export class TrackCustomMarkerImpl extends React.PureComponent<Props, State> {
  render() {
    const { markerSchema, threadIndex } = this.props;
    const trackHeight = getMarkerTrackHeight(markerSchema);
    return (
      <div
        className="timelineTrackMemory"
        style={{
          height: trackHeight,
          '--graph-height': `${trackHeight}px`,
          '--markers-height': `${0}px`,
        }}
      >
        <TrackCustomMarkerGraph
          threadIndex={threadIndex}
          markerSchema={markerSchema}
          graphHeight={trackHeight}
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
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const { start, end } = getCommittedRange(state);
    return {
      threadIndex: threadIndex,
      rangeStart: start,
      rangeEnd: end,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackCustomMarkerImpl,
});
