/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import {
  hideGlobalTrack,
  showGlobalTrack,
  isolateGlobalTrack,
  isolateLocalTrack,
  hideLocalTrack,
  showLocalTrack,
} from '../../actions/profile-view';
import {
  getGlobalTrackName,
  getLocalTrackName,
} from '../../profile-logic/tracks';
import explicitConnect from '../../utils/connect';
import { ensureExists } from '../../utils/flow';
import {
  getThreads,
  getRightClickedTrack,
  getGlobalTracks,
  getLocalTracksByPid,
} from '../../reducers/profile-view';
import {
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
} from '../../reducers/url-state';
import { getFriendlyThreadName } from '../../profile-logic/profile-data';
import classNames from 'classnames';

import type { Thread, ThreadIndex, Pid } from '../../types/profile';
import type {
  TrackIndex,
  GlobalTrack,
  LocalTrack,
} from '../../types/profile-derived';
import type { State } from '../../types/reducers';
import type { TrackReference } from '../../types/actions';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +threads: Thread[],
  +globalTrackOrder: TrackIndex[],
  +hiddenGlobalTracks: Set<TrackIndex>,
  +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
  +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
  +rightClickedTrack: TrackReference,
  +globalTracks: GlobalTrack[],
  +localTracksByPid: Map<Pid, LocalTrack[]>,
|};

type DispatchProps = {|
  +hideGlobalTrack: typeof hideGlobalTrack,
  +showGlobalTrack: typeof showGlobalTrack,
  +isolateGlobalTrack: typeof isolateGlobalTrack,
  +hideLocalTrack: typeof hideLocalTrack,
  +showLocalTrack: typeof showLocalTrack,
  +isolateLocalTrack: typeof isolateLocalTrack,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class TimelineTrackContextMenu extends PureComponent<Props> {
  _toggleGlobalTrackVisibility = (
    _,
    data: { trackIndex: TrackIndex }
  ): void => {
    const { trackIndex } = data;
    const { hiddenGlobalTracks, hideGlobalTrack, showGlobalTrack } = this.props;
    if (hiddenGlobalTracks.has(trackIndex)) {
      showGlobalTrack(trackIndex);
    } else {
      hideGlobalTrack(trackIndex);
    }
  };

  _toggleLocalTrackVisibility = (
    _,
    data: { pid: Pid, trackIndex: TrackIndex }
  ): void => {
    const { trackIndex, pid } = data;
    const {
      hiddenLocalTracksByPid,
      hideLocalTrack,
      showLocalTrack,
    } = this.props;
    const hiddenLocalTracks = ensureExists(
      hiddenLocalTracksByPid.get(pid),
      'Expected to find hidden local tracks for the given pid'
    );
    if (hiddenLocalTracks.has(trackIndex)) {
      showLocalTrack(pid, trackIndex);
    } else {
      hideLocalTrack(pid, trackIndex);
    }
  };

  _isolateTrack = () => {
    const {
      isolateGlobalTrack,
      isolateLocalTrack,
      rightClickedTrack,
    } = this.props;
    if (rightClickedTrack.type === 'global') {
      isolateGlobalTrack(rightClickedTrack.trackIndex);
    } else {
      const { pid, trackIndex } = rightClickedTrack;
      isolateLocalTrack(pid, trackIndex);
    }
  };

  getRightClickedThreadIndex(): ThreadIndex | null {
    const { rightClickedTrack, globalTracks, localTracksByPid } = this.props;
    if (rightClickedTrack.type === 'global') {
      const track = globalTracks[rightClickedTrack.trackIndex];
      return track.type === 'process' ? track.mainThreadIndex : null;
    } else {
      const { pid, trackIndex } = rightClickedTrack;
      const localTracks = ensureExists(
        localTracksByPid.get(pid),
        'No local tracks found at that pid.'
      );
      const track = localTracks[trackIndex];

      return track.type === 'thread' ? track.threadIndex : null;
    }
  }

  renderGlobalTrack(trackIndex: TrackIndex) {
    const { hiddenGlobalTracks, globalTracks, threads } = this.props;
    const isHidden = hiddenGlobalTracks.has(trackIndex);
    const globalTrack = globalTracks[trackIndex];

    return (
      <MenuItem
        key={trackIndex}
        preventClose={true}
        data={{ trackIndex }}
        onClick={this._toggleGlobalTrackVisibility}
        attributes={{
          className: classNames({ checkable: true, checked: !isHidden }),
        }}
      >
        {getGlobalTrackName(globalTrack, threads)}
      </MenuItem>
    );
  }

  renderLocalTracks(globalTrackIndex: TrackIndex, pid: Pid) {
    const {
      localTracksByPid,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
      threads,
      hiddenGlobalTracks,
    } = this.props;

    const isGlobalTrackHidden = hiddenGlobalTracks.has(globalTrackIndex);
    const localTracks = localTracksByPid.get(pid);
    const localTrackOrder = localTrackOrderByPid.get(pid);
    const hiddenLocalTracks = hiddenLocalTracksByPid.get(pid);

    if (
      localTracks === undefined ||
      localTrackOrder === undefined ||
      hiddenLocalTracks === undefined
    ) {
      console.error(
        'Unable to find local track information for the given pid:',
        pid
      );
      return null;
    }

    return localTrackOrder.map(trackIndex => {
      const isHidden = hiddenLocalTracks.has(trackIndex);
      const localTrack = localTracks[trackIndex];

      return (
        <MenuItem
          disabled={isGlobalTrackHidden}
          key={trackIndex}
          preventClose={true}
          data={{ pid, trackIndex }}
          onClick={this._toggleLocalTrackVisibility}
          attributes={{
            className: classNames('checkable indented', { checked: !isHidden }),
          }}
        >
          {getLocalTrackName(localTrack, threads)}
        </MenuItem>
      );
    });
  }

  render() {
    const {
      threads,
      globalTrackOrder,
      hiddenGlobalTracks,
      globalTracks,
    } = this.props;

    const rightClickedThreadIndex = this.getRightClickedThreadIndex();
    const clickedThreadName =
      rightClickedThreadIndex === null
        ? null
        : getFriendlyThreadName(threads, threads[rightClickedThreadIndex]);

    return (
      <ContextMenu id="TimelineTrackContextMenu">
        {threads.length > 1 && clickedThreadName !== null ? (
          <div>
            <MenuItem
              onClick={this._isolateTrack}
              disabled={hiddenGlobalTracks.size === globalTrackOrder.length - 1}
            >
              Only show: {`"${clickedThreadName}"`}
            </MenuItem>
            <div className="react-contextmenu-separator" />
          </div>
        ) : null}
        {globalTrackOrder.map(globalTrackIndex => {
          const globalTrack = globalTracks[globalTrackIndex];
          return (
            <div key={globalTrackIndex}>
              {this.renderGlobalTrack(globalTrackIndex)}
              {globalTrack.type === 'process'
                ? this.renderLocalTracks(globalTrackIndex, globalTrack.pid)
                : null}
            </div>
          );
        })}
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: (state: State) => ({
    threads: getThreads(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    hiddenGlobalTracks: getHiddenGlobalTracks(state),
    rightClickedTrack: getRightClickedTrack(state),
    globalTracks: getGlobalTracks(state),
    localTracksByPid: getLocalTracksByPid(state),
    hiddenLocalTracksByPid: getHiddenLocalTracksByPid(state),
    localTrackOrderByPid: getLocalTrackOrderByPid(state),
  }),
  mapDispatchToProps: {
    hideGlobalTrack,
    showGlobalTrack,
    isolateGlobalTrack,
    hideLocalTrack,
    showLocalTrack,
    isolateLocalTrack,
  },
  component: TimelineTrackContextMenu,
};
export default explicitConnect(options);
