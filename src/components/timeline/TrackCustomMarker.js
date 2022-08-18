/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import {
  TRACK_MARKER_DEFAULT_HEIGHT,
  TRACK_MARKER_MARKERS_DEFAULT_HEIGHT,
} from 'firefox-profiler/app-logic/constants';
import { TrackCustomMarkerGraph } from './TrackCustomMarkerGraph';
import { getMarkerTrackConfig } from 'firefox-profiler/profile-logic/tracks';

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
  _onMarkerSelect = (start: Milliseconds, end: Milliseconds) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  render() {
    const { markerSchema, rangeStart, rangeEnd, threadIndex } = this.props;
    const trackHeight =
      getMarkerTrackConfig(markerSchema).height || TRACK_MARKER_DEFAULT_HEIGHT;
    return (
      <div
        className="timelineTrackMemory"
        style={{
          height: TRACK_MARKER_MARKERS_DEFAULT_HEIGHT + trackHeight,
          '--graph-height': `${trackHeight}px`,
          '--markers-height': `${TRACK_MARKER_MARKERS_DEFAULT_HEIGHT}px`,
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
