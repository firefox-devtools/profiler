/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import './TrackContextMenu.css';
import {
  hideGlobalTrack,
  showGlobalTrack,
  isolateProcess,
  isolateLocalTrack,
  isolateProcessMainThread,
  hideLocalTrack,
  showLocalTrack,
} from '../../actions/profile-view';
import explicitConnect from '../../utils/connect';
import { ensureExists } from '../../utils/flow';
import {
  getThreads,
  getRightClickedTrack,
  getGlobalTracks,
  getRightClickedThreadIndex,
  getLocalTrackNamesByPid,
  getGlobalTrackNames,
  getLocalTracksByPid,
} from '../../selectors/profile';
import {
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
} from '../../selectors/url-state';
import classNames from 'classnames';

import type { Thread, ThreadIndex, Pid } from '../../types/profile';
import type {
  TrackIndex,
  GlobalTrack,
  LocalTrack,
} from '../../types/profile-derived';
import type { State } from '../../types/state';
import type { TrackReference } from '../../types/actions';

import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +threads: Thread[],
  +globalTrackOrder: TrackIndex[],
  +hiddenGlobalTracks: Set<TrackIndex>,
  +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
  +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
  +rightClickedTrack: TrackReference | null,
  +globalTracks: GlobalTrack[],
  +rightClickedThreadIndex: ThreadIndex | null,
  +globalTrackNames: string[],
  +localTracksByPid: Map<Pid, LocalTrack[]>,
  +localTrackNamesByPid: Map<Pid, string[]>,
|};

type DispatchProps = {|
  +hideGlobalTrack: typeof hideGlobalTrack,
  +showGlobalTrack: typeof showGlobalTrack,
  +isolateProcess: typeof isolateProcess,
  +hideLocalTrack: typeof hideLocalTrack,
  +showLocalTrack: typeof showLocalTrack,
  +isolateLocalTrack: typeof isolateLocalTrack,
  +isolateProcessMainThread: typeof isolateProcessMainThread,
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
    data: { pid: Pid, trackIndex: TrackIndex, globalTrackIndex: TrackIndex }
  ): void => {
    const { trackIndex, pid, globalTrackIndex } = data;
    const {
      hiddenLocalTracksByPid,
      hideLocalTrack,
      showLocalTrack,
      hiddenGlobalTracks,
      showGlobalTrack,
      localTrackOrderByPid,
    } = this.props;
    const hiddenLocalTracks = ensureExists(
      hiddenLocalTracksByPid.get(pid),
      'Expected to find hidden local tracks for the given pid'
    );

    if (hiddenGlobalTracks.has(globalTrackIndex)) {
      // When the parent global track is hidden, instead of simply
      // toggling, we'll just unhide the global track and this
      // particular local track. Other local tracks should be hidden.
      showGlobalTrack(globalTrackIndex);
      const localTrackOrder = ensureExists(
        localTrackOrderByPid.get(pid),
        'Expected to find local tracks for the given pid'
      );
      localTrackOrder.forEach(index => {
        if (index === trackIndex) {
          showLocalTrack(pid, trackIndex);
        } else {
          hideLocalTrack(pid, index);
        }
      });
    } else {
      // When the global track is not hidden, we'll just go ahead and
      // toggle this local track.
      if (hiddenLocalTracks.has(trackIndex)) {
        showLocalTrack(pid, trackIndex);
      } else {
        hideLocalTrack(pid, trackIndex);
      }
    }
  };

  _isolateProcess = () => {
    const { isolateProcess, rightClickedTrack } = this.props;
    if (rightClickedTrack === null) {
      throw new Error(
        'Attempted to isolate the process with no right clicked track.'
      );
    }
    if (rightClickedTrack.type === 'local') {
      throw new Error(
        'Attempting to isolate a process track with a local track is selected.'
      );
    }
    isolateProcess(rightClickedTrack.trackIndex);
  };

  _isolateProcessMainThread = () => {
    const { isolateProcessMainThread, rightClickedTrack } = this.props;
    if (rightClickedTrack === null) {
      throw new Error(
        'Attempted to isolate the process main thread with no right clicked track.'
      );
    }

    if (rightClickedTrack.type === 'local') {
      throw new Error(
        'Attempting to isolate a process track with a local track is selected.'
      );
    }
    isolateProcessMainThread(rightClickedTrack.trackIndex);
  };

  _isolateLocalTrack = () => {
    const { isolateLocalTrack, rightClickedTrack } = this.props;
    if (rightClickedTrack === null) {
      throw new Error(
        'Attempted to isolate the local track with no right clicked track.'
      );
    }

    if (rightClickedTrack.type === 'global') {
      throw new Error(
        'Attempting to isolate a local track with a global track is selected.'
      );
    }
    const { pid, trackIndex } = rightClickedTrack;
    isolateLocalTrack(pid, trackIndex);
  };

  renderGlobalTrack(trackIndex: TrackIndex) {
    const { hiddenGlobalTracks, globalTrackNames, globalTracks } = this.props;
    const isHidden = hiddenGlobalTracks.has(trackIndex);
    const track = globalTracks[trackIndex];

    let title = `${globalTrackNames[trackIndex]}`;
    if (track.type === 'process') {
      title += ` (Process ID: ${track.pid})`;
    }

    return (
      <MenuItem
        key={trackIndex}
        preventClose={true}
        data={{ trackIndex }}
        onClick={this._toggleGlobalTrackVisibility}
        attributes={{
          className: classNames('timelineTrackContextMenuItem', {
            checkable: true,
            checked: !isHidden,
          }),
          title,
        }}
      >
        <span>{globalTrackNames[trackIndex]}</span>
        <span className="timelineTrackContextMenuSpacer" />
        {track.type === 'process' && (
          <span className="timelineTrackContextMenuPid">({track.pid})</span>
        )}
      </MenuItem>
    );
  }

  renderLocalTracks(globalTrackIndex: TrackIndex, pid: Pid) {
    const {
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
      localTrackNamesByPid,
      hiddenGlobalTracks,
    } = this.props;

    const isGlobalTrackHidden = hiddenGlobalTracks.has(globalTrackIndex);
    const localTrackOrder = localTrackOrderByPid.get(pid);
    const hiddenLocalTracks = hiddenLocalTracksByPid.get(pid);
    const localTrackNames = localTrackNamesByPid.get(pid);

    if (
      localTrackOrder === undefined ||
      hiddenLocalTracks === undefined ||
      localTrackNames === undefined
    ) {
      console.error(
        'Unable to find local track information for the given pid:',
        pid
      );
      return null;
    }

    return localTrackOrder.map(trackIndex => (
      <MenuItem
        key={trackIndex}
        preventClose={true}
        data={{ pid, trackIndex, globalTrackIndex }}
        onClick={this._toggleLocalTrackVisibility}
        attributes={{
          className: classNames('checkable indented', {
            checked: !hiddenLocalTracks.has(trackIndex) && !isGlobalTrackHidden,
          }),
        }}
      >
        {localTrackNames[trackIndex]}
      </MenuItem>
    ));
  }

  getRightClickedTrackName(rightClickedTrack: TrackReference): string {
    const { globalTrackNames, localTrackNamesByPid } = this.props;

    if (rightClickedTrack.type === 'global') {
      return globalTrackNames[rightClickedTrack.trackIndex];
    }
    const localTrackNames = localTrackNamesByPid.get(rightClickedTrack.pid);
    if (localTrackNames === undefined) {
      console.error('Expected to find a local track name for the given pid.');
      return 'Unknown Track';
    }
    return localTrackNames[rightClickedTrack.trackIndex];
  }

  renderIsolateProcess() {
    const {
      rightClickedTrack,
      globalTracks,
      globalTrackOrder,
      hiddenGlobalTracks,
      hiddenLocalTracksByPid,
      localTracksByPid,
    } = this.props;

    if (rightClickedTrack === null) {
      return null;
    }

    if (rightClickedTrack.type !== 'global' || globalTracks.length === 1) {
      // This is not a valid candidate for isolating.
      return null;
    }

    const track = globalTracks[rightClickedTrack.trackIndex];
    if (track.type !== 'process') {
      // Only process tracks can be isolated.
      return null;
    }

    // Disable this option if there is only one left global track left.
    let isDisabled = hiddenGlobalTracks.size === globalTrackOrder.length - 1;

    if (!isDisabled && track.mainThreadIndex === null) {
      // Ensure there is a valid thread index in the local tracks to isolate, otherwise
      // disable this track.
      const localTracks = localTracksByPid.get(track.pid);
      const hiddenLocalTracks = hiddenLocalTracksByPid.get(track.pid);
      if (localTracks === undefined || hiddenLocalTracks === undefined) {
        console.error('Local track information for the given pid.');
        return null;
      }
      let hasVisibleLocalTrackWithMainThread = false;
      for (let trackIndex = 0; trackIndex < localTracks.length; trackIndex++) {
        const localTrack = localTracks[trackIndex];
        if (
          localTrack.type === 'thread' &&
          !hiddenLocalTracks.has(trackIndex)
        ) {
          hasVisibleLocalTrackWithMainThread = true;
          break;
        }
      }
      if (!hasVisibleLocalTrackWithMainThread) {
        // The process has no main thread, and there are no visible local tracks
        // with a thread index, do not offer to isolate in this case, but just disable
        // this button in case some threads become visible while the menu is open.
        isDisabled = true;
      }
    }

    return (
      <MenuItem onClick={this._isolateProcess} disabled={isDisabled}>
        Only show this process group
      </MenuItem>
    );
  }

  renderIsolateProcessMainThread() {
    const {
      rightClickedTrack,
      globalTracks,
      hiddenGlobalTracks,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
    } = this.props;

    if (rightClickedTrack === null) {
      return null;
    }

    if (rightClickedTrack.type !== 'global') {
      // This is not a valid candidate for isolating. Either there are not
      // enough threads, or the right clicked track didn't have an associated thread
      // index.
      return null;
    }

    const track = globalTracks[rightClickedTrack.trackIndex];
    if (track.type !== 'process' || track.mainThreadIndex === null) {
      // Only process tracks with a main thread can be isolated.
      return null;
    }

    // Look up the local track information.
    const hiddenLocalTracks = hiddenLocalTracksByPid.get(track.pid);
    const localTrackOrder = localTrackOrderByPid.get(track.pid);
    if (hiddenLocalTracks === undefined || localTrackOrder === undefined) {
      console.error(
        'Expected to find local track information for the given pid.'
      );
      return null;
    }

    const isDisabled =
      // Does it have no visible local tracks?
      hiddenLocalTracks.size === localTrackOrder.length &&
      // Is there only one visible global track?
      globalTracks.length - hiddenGlobalTracks.size === 1;

    return (
      <MenuItem onClick={this._isolateProcessMainThread} disabled={isDisabled}>
        Only show {`"${this.getRightClickedTrackName(rightClickedTrack)}"`}
      </MenuItem>
    );
  }

  renderIsolateLocalTrack() {
    const {
      rightClickedTrack,
      globalTracks,
      hiddenGlobalTracks,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
    } = this.props;

    if (rightClickedTrack === null) {
      return null;
    }

    if (rightClickedTrack.type === 'global') {
      return null;
    }

    // Select the local track info.
    const hiddenLocalTracks = hiddenLocalTracksByPid.get(rightClickedTrack.pid);
    const localTrackOrder = localTrackOrderByPid.get(rightClickedTrack.pid);
    if (hiddenLocalTracks === undefined || localTrackOrder === undefined) {
      console.error(
        'Expected to find local track information for the given pid.'
      );
      return null;
    }

    const isDisabled =
      // Is there only one global track visible?
      globalTracks.length - hiddenGlobalTracks.size === 1 &&
      // Is there only one local track left?
      localTrackOrder.length - hiddenLocalTracks.size === 1;

    return (
      <MenuItem onClick={this._isolateLocalTrack} disabled={isDisabled}>
        Only show {`"${this.getRightClickedTrackName(rightClickedTrack)}"`}
      </MenuItem>
    );
  }

  render() {
    const { globalTrackOrder, globalTracks } = this.props;

    const isolateProcessMainThread = this.renderIsolateProcessMainThread();
    const isolateProcess = this.renderIsolateProcess();
    const isolateLocalTrack = this.renderIsolateLocalTrack();
    const separator =
      isolateProcessMainThread || isolateProcess || isolateLocalTrack ? (
        <div className="react-contextmenu-separator" />
      ) : null;

    return (
      <ContextMenu
        id="TimelineTrackContextMenu"
        className="timeline-context-menu"
      >
        {
          // The menu items header items to isolate tracks may or may not be
          // visible depending on the current state.
        }
        {isolateProcessMainThread}
        {isolateProcess}
        {isolateLocalTrack}
        {separator}
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

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => ({
    threads: getThreads(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    hiddenGlobalTracks: getHiddenGlobalTracks(state),
    rightClickedTrack: getRightClickedTrack(state),
    globalTracks: getGlobalTracks(state),
    hiddenLocalTracksByPid: getHiddenLocalTracksByPid(state),
    localTrackOrderByPid: getLocalTrackOrderByPid(state),
    rightClickedThreadIndex: getRightClickedThreadIndex(state),
    globalTrackNames: getGlobalTrackNames(state),
    localTracksByPid: getLocalTracksByPid(state),
    localTrackNamesByPid: getLocalTrackNamesByPid(state),
  }),
  mapDispatchToProps: {
    hideGlobalTrack,
    showGlobalTrack,
    isolateProcess,
    isolateLocalTrack,
    isolateProcessMainThread,
    hideLocalTrack,
    showLocalTrack,
  },
  component: TimelineTrackContextMenu,
});
