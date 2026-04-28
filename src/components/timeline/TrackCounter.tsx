/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getCounterSelectors,
} from 'firefox-profiler/selectors/profile';
import { TimelineMarkersCounter } from './Markers';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackCounterGraph } from './TrackCounterGraph';
import {
  TRACK_COUNTER_GRAPH_HEIGHT,
  TRACK_COUNTER_MARKERS_HEIGHT,
  TRACK_COUNTER_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  ThreadIndex,
  Milliseconds,
  MarkerDisplayLocation,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackCounter.css';

type OwnProps = {
  readonly counterIndex: CounterIndex;
};

type StateProps = {
  readonly threadIndex: ThreadIndex;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly markerSchemaLocation: MarkerDisplayLocation | null;
};

type DispatchProps = {
  updatePreviewSelection: typeof updatePreviewSelection;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

export class TrackCounterImpl extends React.PureComponent<Props> {
  _onMarkerSelect = (start: Milliseconds, end: Milliseconds) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  override render() {
    const {
      counterIndex,
      rangeStart,
      rangeEnd,
      threadIndex,
      markerSchemaLocation,
    } = this.props;

    return (
      <div
        className="timelineTrackCounter"
        style={
          {
            '--graph-height': `${TRACK_COUNTER_GRAPH_HEIGHT}px`,
            '--markers-height': `${TRACK_COUNTER_MARKERS_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        {markerSchemaLocation !== null ? (
          <TimelineMarkersCounter
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadsKey={threadIndex}
            markerSchemaLocation={markerSchemaLocation}
            onSelect={this._onMarkerSelect}
          />
        ) : null}
        <TrackCounterGraph
          counterIndex={counterIndex}
          lineWidth={TRACK_COUNTER_LINE_WIDTH}
          graphHeight={TRACK_COUNTER_GRAPH_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackCounter = explicitConnect<
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
      markerSchemaLocation: counter.display.markerSchemaLocation,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackCounterImpl,
});
