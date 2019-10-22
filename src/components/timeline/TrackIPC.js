/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { getCommittedRange } from '../../selectors/profile';
import { TimelineMarkersIPC } from './Markers';
import { updatePreviewSelection } from '../../actions/profile-view';
import { TRACK_IPC_MARKERS_HEIGHT } from '../../app-logic/constants';

import type { ThreadIndex } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { ConnectedProps } from '../../utils/connect';

import './TrackIPC.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
|};

type StateProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
|};

type DispatchProps = {|
  updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {||};

/**
 * A component for showing IPC messages for a particular thread.
 */
export class TrackIPCImpl extends React.PureComponent<Props, State> {
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
    const { rangeStart, rangeEnd, threadIndex } = this.props;
    return (
      <div
        style={{
          height: TRACK_IPC_MARKERS_HEIGHT,
          '--markers-height': `${TRACK_IPC_MARKERS_HEIGHT}px`,
        }}
      >
        <TimelineMarkersIPC
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          threadIndex={threadIndex}
          onSelect={this._onMarkerSelect}
        />
      </div>
    );
  }
}

export const TrackIPC = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => {
    const { start, end } = getCommittedRange(state);
    return {
      rangeStart: start,
      rangeEnd: end,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackIPCImpl,
});
