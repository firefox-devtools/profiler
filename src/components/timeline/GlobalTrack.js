/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import {
  changeSelectedThread,
  changeRightClickedTrack,
  changeLocalTrackOrder,
} from '../../actions/profile-view';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import {
  getSelectedThreadIndex,
  getHiddenGlobalTracks,
  getLocalTrackOrder,
} from '../../reducers/url-state';
import explicitConnect from '../../utils/connect';
import {
  getGlobalTracks,
  selectorsForThread,
  getLocalTracks,
  getGlobalTrackName,
} from '../../reducers/profile-view';
import './Track.css';
import TimelineTrackThread from './TrackThread';
import TimelineLocalTrack from './LocalTrack';
import Reorderable from '../shared/Reorderable';
import type { TrackReference } from '../../types/actions';
import type { ThreadIndex, Pid } from '../../types/profile';
import type {
  TrackIndex,
  GlobalTrack,
  LocalTrack,
} from '../../types/profile-derived';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  +trackReference: TrackReference,
  +trackIndex: TrackIndex,
  +style?: Object /* This is used by Reorderable */,
|};

type StateProps = {|
  +threadIndex: null | ThreadIndex,
  +trackName: string,
  +globalTrack: GlobalTrack,
  +isSelected: boolean,
  +isHidden: boolean,
  +titleText: string | null,
  +localTrackOrder: TrackIndex[],
  +localTracks: LocalTrack[],
  +pid: Pid | null,
|};

type DispatchProps = {|
  +changeSelectedThread: typeof changeSelectedThread,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +changeLocalTrackOrder: typeof changeLocalTrackOrder,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class GlobalTrackComponent extends PureComponent<Props> {
  _onLabelMouseDown = (event: MouseEvent) => {
    const {
      changeSelectedThread,
      changeRightClickedTrack,
      threadIndex,
      trackReference,
    } = this.props;

    if (event.button === 0) {
      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
      if (threadIndex !== null) {
        changeSelectedThread(threadIndex);
      }
    } else if (event.button === 2) {
      // This is needed to allow the context menu to know what was right clicked without
      // actually changing the current selection.
      changeRightClickedTrack(trackReference);
    }
  };

  _onLineClick = () => {
    const { threadIndex, changeSelectedThread } = this.props;
    if (threadIndex !== null) {
      changeSelectedThread(threadIndex);
    }
  };

  renderTrack() {
    const { globalTrack } = this.props;
    switch (globalTrack.type) {
      case 'process': {
        const { mainThreadIndex } = globalTrack;
        if (mainThreadIndex === null) {
          return <div className="timelineTrackThreadBlank" />;
        }
        return <TimelineTrackThread threadIndex={mainThreadIndex} />;
      }
      case 'screenshots':
        // TODO: Add support for screenshots.
        return <div />;
      default:
        console.error('Unhandled globalTrack type', (globalTrack: empty));
        return null;
    }
  }

  _changeLocalTrackOrder = (trackOrder: TrackIndex[]) => {
    const { globalTrack, changeLocalTrackOrder } = this.props;
    if (globalTrack.type === 'process') {
      // Only process tracks have local tracks.
      changeLocalTrackOrder(globalTrack.pid, trackOrder);
    }
  };

  renderLocalTracks(pid: Pid) {
    const { localTracks, localTrackOrder } = this.props;
    return (
      <Reorderable
        tagName="ol"
        className="timelineTrackLocalTracks"
        order={localTrackOrder}
        orient="vertical"
        grippyClassName="timelineTrackLocalGrippy"
        onChangeOrder={this._changeLocalTrackOrder}
      >
        {localTracks.map((localTrack, trackIndex) => (
          <TimelineLocalTrack
            key={trackIndex}
            pid={pid}
            localTrack={localTrack}
            trackIndex={trackIndex}
          />
        ))}
      </Reorderable>
    );
  }

  render() {
    const {
      isSelected,
      isHidden,
      titleText,
      trackName,
      style,
      localTracks,
      pid,
    } = this.props;

    if (isHidden) {
      // If this global track is hidden, render out a stub element so that the
      // Reorderable Component still works across all the tracks.
      return <li className="timelineTrackHidden" />;
    }

    return (
      <li className="timelineTrack" style={style}>
        <div
          className={classNames('timelineTrackRow timelineTrackGlobalRow', {
            selected: isSelected,
          })}
          onClick={this._onLineClick}
        >
          <ContextMenuTrigger
            id={'TimelineTrackContextMenu'}
            renderTag="div"
            attributes={{
              title: titleText,
              className: 'timelineTrackLabel timelineTrackGlobalGrippy',
              onMouseDown: this._onLabelMouseDown,
            }}
          >
            <h1 className="timelineTrackName">{trackName}</h1>
          </ContextMenuTrigger>
          <div className="timelineTrackTrack">{this.renderTrack()}</div>
        </div>
        {localTracks.length > 0 && pid !== null
          ? this.renderLocalTracks(pid)
          : null}
      </li>
    );
  }
}

// Provide some empty lists, so that strict equality checks work for component updates.
const EMPTY_TRACK_ORDER = [];
const EMPTY_LOCAL_TRACKS = [];

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, { trackIndex }) => {
    const globalTracks = getGlobalTracks(state);
    const globalTrack = globalTracks[trackIndex];

    // These get assigned based on the track type.
    let threadIndex = null;
    let isSelected = false;
    let titleText = null;

    let localTrackOrder = EMPTY_TRACK_ORDER;
    let localTracks = EMPTY_LOCAL_TRACKS;
    let pid = null;

    // Run different selectors based on the track type.
    switch (globalTrack.type) {
      case 'process': {
        // Look up the thread information for the process if it exists.
        if (globalTrack.mainThreadIndex !== null) {
          threadIndex = globalTrack.mainThreadIndex;
          const selectors = selectorsForThread(threadIndex);
          isSelected = threadIndex === getSelectedThreadIndex(state);
          titleText = selectors.getThreadProcessDetails(state);
        }
        pid = globalTrack.pid;
        localTrackOrder = getLocalTrackOrder(state, pid);
        localTracks = getLocalTracks(state, pid);
        break;
      }
      case 'screenshots':
        break;
      default:
        throw new Error(`Unhandled GlobalTrack type ${(globalTrack: empty)}`);
    }

    return {
      threadIndex,
      trackName: getGlobalTrackName(state, trackIndex),
      titleText,
      globalTrack,
      isSelected,
      localTrackOrder,
      localTracks,
      pid,
      isHidden: getHiddenGlobalTracks(state).has(trackIndex),
    };
  },
  mapDispatchToProps: {
    changeSelectedThread,
    changeRightClickedTrack,
    changeLocalTrackOrder,
  },
  component: GlobalTrackComponent,
};

export default explicitConnect(options);
