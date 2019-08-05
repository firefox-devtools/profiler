/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import {
  getCommittedRange,
  getOverheadSelectors,
} from '../../selectors/profile';
import { updatePreviewSelection } from '../../actions/profile-view';
import { TrackOverheadGraph } from './TrackOverheadGraph';
import {
  TRACK_MEMORY_GRAPH_HEIGHT,
  TRACK_MEMORY_LINE_WIDTH,
} from '../../app-logic/constants';

import type { ThreadIndex } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { ConnectedProps } from '../../utils/connect';

import './TrackMemory.css';

type OwnProps = {|
  +overheadIndex: number,
  +overheadType: string,
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

export class TrackOverheadImpl extends React.PureComponent<Props, State> {
  _onMarkerSelect = (
    threadIndex: ThreadIndex,
    start: Milliseconds,
    end: Milliseconds
  ) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  render() {
    const { overheadIndex, overheadType } = this.props;
    const graphHeight = TRACK_MEMORY_GRAPH_HEIGHT + 15;
    return (
      <div
        className="timelineTrackMemory"
        style={{
          height: graphHeight,
          '--graph-height': `${graphHeight}px`,
          '--markers-height': `${0}px`,
        }}
      >
        <TrackOverheadGraph
          overheadIndex={overheadIndex}
          overheadType={overheadType}
          lineWidth={TRACK_MEMORY_LINE_WIDTH}
          graphHeight={graphHeight}
        />
      </div>
    );
  }
}

export const TrackOverhead = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { overheadIndex } = ownProps;
    const overheadSelectors = getOverheadSelectors(overheadIndex);
    const overhead = overheadSelectors.getOverhead(state);
    const { start, end } = getCommittedRange(state);
    return {
      threadIndex: overhead.mainThreadIndex,
      rangeStart: start,
      rangeEnd: end,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackOverheadImpl,
});
