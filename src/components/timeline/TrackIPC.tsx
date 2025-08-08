/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getCommittedRange } from 'firefox-profiler/selectors/profile';
import { TimelineMarkersIPC } from './Markers';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { TRACK_IPC_MARKERS_HEIGHT } from 'firefox-profiler/app-logic/constants';

import type { ThreadIndex, Milliseconds } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackIPC.css';

type OwnProps = {
  readonly threadIndex: ThreadIndex;
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

/**
 * A component for showing IPC messages for a particular thread.
 */
export class TrackIPCImpl extends React.PureComponent<Props, State> {
  _onMarkerSelect = (start: Milliseconds, end: Milliseconds) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  override render() {
    const { rangeStart, rangeEnd, threadIndex } = this.props;
    return (
      <div
        style={
          {
            height: TRACK_IPC_MARKERS_HEIGHT,
            '--markers-height': `${TRACK_IPC_MARKERS_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        <TimelineMarkersIPC
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          threadsKey={threadIndex}
          onSelect={this._onMarkerSelect}
        />
      </div>
    );
  }
}

export const TrackIPC = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const { start, end } = getCommittedRange(state);
    return {
      rangeStart: start,
      rangeEnd: end,
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: TrackIPCImpl,
});
