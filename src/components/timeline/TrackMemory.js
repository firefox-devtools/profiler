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
import { TimelineMarkersMemory } from './Markers';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TrackMemoryGraph } from './TrackMemoryGraph';
import {
  TRACK_MEMORY_GRAPH_HEIGHT,
  TRACK_MEMORY_MARKERS_HEIGHT,
  TRACK_MEMORY_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import type {
  CounterIndex,
  ThreadIndex,
  Milliseconds,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackMemory.css';

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

export class TrackMemoryImpl extends React.PureComponent<Props, State> {
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
    const { counterIndex, rangeStart, rangeEnd, threadIndex } = this.props;
    return (
      <div
        className="timelineTrackMemory"
        style={{
          height: TRACK_MEMORY_GRAPH_HEIGHT + TRACK_MEMORY_MARKERS_HEIGHT,
          '--graph-height': `${TRACK_MEMORY_GRAPH_HEIGHT}px`,
          '--markers-height': `${TRACK_MEMORY_MARKERS_HEIGHT}px`,
        }}
      >
        <TimelineMarkersMemory
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          threadsKey={threadIndex}
          onSelect={this._onMarkerSelect}
        />
        <TrackMemoryGraph
          counterIndex={counterIndex}
          lineWidth={TRACK_MEMORY_LINE_WIDTH}
          graphHeight={TRACK_MEMORY_GRAPH_HEIGHT}
        />
      </div>
    );
  }
}

export const TrackMemory = explicitConnect<OwnProps, StateProps, DispatchProps>(
  {
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
    component: TrackMemoryImpl,
  }
);
