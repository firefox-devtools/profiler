/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import {
  changeSelectedThread,
  changeRightClickedTrack,
} from '../../actions/profile-view';
import { assertExhaustiveCheck } from '../../utils/flow';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import {
  getSelectedThreadIndex,
  getHiddenLocalTracks,
} from '../../reducers/url-state';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getLocalTrackName,
} from '../../reducers/profile-view';
import TrackThread from './TrackThread';
import type { TrackReference } from '../../types/actions';
import type { ThreadIndex, Pid } from '../../types/profile';
import type { TrackIndex, LocalTrack } from '../../types/profile-derived';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  +pid: Pid,
  +localTrack: LocalTrack,
  +trackIndex: TrackIndex,
  +trackReference?: TrackReference,
  +style?: Object /* This is used by Reorderable */,
|};

type StateProps = {|
  +threadIndex: null | ThreadIndex,
  +trackName: string,
  +isSelected: boolean,
  +isHidden: boolean,
  +titleText: string | null,
|};

type DispatchProps = {|
  +changeSelectedThread: typeof changeSelectedThread,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class LocalTrackComponent extends PureComponent<Props> {
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
      if (trackReference) {
        changeRightClickedTrack(trackReference);
      }
    }
  };

  _onLineClick = () => {
    const { threadIndex, changeSelectedThread } = this.props;
    if (threadIndex !== null) {
      changeSelectedThread(threadIndex);
    }
  };

  renderTrack() {
    const { localTrack } = this.props;
    switch (localTrack.type) {
      case 'thread':
        return <TrackThread threadIndex={localTrack.threadIndex} />;
      case 'network':
      case 'memory':
        // TODO: Add support for these track types.
        return null;
      default:
        console.error('Unhandled localTrack type', (localTrack: empty));
        return null;
    }
  }

  render() {
    const { isSelected, isHidden, titleText, trackName, style } = this.props;

    if (isHidden) {
      // If this global track is hidden, render out a stub element so that the
      // Reorderable Component still works across all the tracks.
      return <li className="timelineTrackHidden" />;
    }

    return (
      <li className="timelineTrack timelineTrackLocal" style={style}>
        {/* This next div is used to mirror the structure of the TimelineGlobalTrack */}
        <div
          className={classNames('timelineTrackRow timelineTrackLocalRow', {
            selected: isSelected,
          })}
          onClick={this._onLineClick}
        >
          <ContextMenuTrigger
            id={'TimelineTrackContextMenu'}
            renderTag="div"
            attributes={{
              title: titleText,
              className:
                'timelineTrackLabel timelineTrackLocalLabel timelineTrackLocalGrippy',
              onMouseDown: this._onLabelMouseDown,
            }}
          >
            <h1 className="timelineTrackName">{trackName}</h1>
          </ContextMenuTrigger>
          <div className="timelineTrackTrack">{this.renderTrack()}</div>
        </div>
      </li>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, { pid, localTrack, trackIndex }) => {
    // These get assigned based on the track type.
    let threadIndex = null;
    let isSelected = false;
    let titleText = null;

    // Run different selectors based on the track type.
    switch (localTrack.type) {
      case 'thread': {
        // Look up the thread information for the process if it exists.
        threadIndex = localTrack.threadIndex;
        const selectors = selectorsForThread(threadIndex);
        isSelected = threadIndex === getSelectedThreadIndex(state);
        titleText = selectors.getThreadProcessDetails(state);
        break;
      }
      case 'memory':
      case 'network':
        break;
      default:
        throw assertExhaustiveCheck(localTrack, `Unhandled LocalTrack type.`);
    }

    return {
      threadIndex,
      trackName: getLocalTrackName(state, pid, trackIndex),
      titleText,
      isSelected,
      isHidden: getHiddenLocalTracks(state, pid).has(trackIndex),
    };
  },
  mapDispatchToProps: {
    changeSelectedThread,
    changeRightClickedTrack,
  },
  component: LocalTrackComponent,
};

export default explicitConnect(options);
