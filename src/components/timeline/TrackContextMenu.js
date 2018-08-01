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
import explicitConnect from '../../utils/connect';
import { ensureExists } from '../../utils/flow';
import {
  getThreads,
  getRightClickedTrack,
  getGlobalTracks,
  getRightClickedThreadIndex,
  getLocalTrackNamesByPid,
  getGlobalTrackNames,
} from '../../reducers/profile-view';
import {
  getGlobalTrackOrder,
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getLocalTrackOrderByPid,
} from '../../reducers/url-state';
import classNames from 'classnames';

import type { Thread, ThreadIndex, Pid } from '../../types/profile';
import type { TrackIndex, GlobalTrack } from '../../types/profile-derived';
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
  +rightClickedThreadIndex: ThreadIndex | null,
  +globalTrackNames: string[],
  +localTrackNamesByPid: Map<Pid, string[]>,
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

  renderGlobalTrack(trackIndex: TrackIndex) {
    const { hiddenGlobalTracks, globalTrackNames } = this.props;
    const isHidden = hiddenGlobalTracks.has(trackIndex);

    return (
      <MenuItem
        key={trackIndex}
        preventClose={true}
        data={{ trackIndex }}
        onClick={this._toggleGlobalTrackVisibility}
        attributes={{
          // The following id is used to select this item in tests.
          'data-test-id': 'global-track-' + trackIndex,
          className: classNames({ checkable: true, checked: !isHidden }),
        }}
      >
        {globalTrackNames[trackIndex]}
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
        disabled={isGlobalTrackHidden}
        key={trackIndex}
        preventClose={true}
        data={{ pid, trackIndex }}
        onClick={this._toggleLocalTrackVisibility}
        attributes={{
          'data-test-id': `local-track-${pid}-${trackIndex}`,
          className: classNames('checkable indented', {
            checked: !hiddenLocalTracks.has(trackIndex),
          }),
        }}
      >
        {localTrackNames[trackIndex]}
      </MenuItem>
    ));
  }

  getRightClickedTrackName() {
    const {
      globalTrackNames,
      localTrackNamesByPid,
      rightClickedTrack,
    } = this.props;

    if (rightClickedTrack.type === 'global') {
      return globalTrackNames[rightClickedTrack.trackIndex];
    } else {
      const localTrackNames = localTrackNamesByPid.get(rightClickedTrack.pid);
      if (localTrackNames === undefined) {
        console.error('Expected to find a local track name for the given pid.');
        return 'Unknown Track';
      }
      return localTrackNames[rightClickedTrack.trackIndex];
    }
  }

  renderIsolateTrack() {
    const {
      threads,
      rightClickedThreadIndex,
      rightClickedTrack,
      globalTrackOrder,
      hiddenGlobalTracks,
      hiddenLocalTracksByPid,
      localTrackOrderByPid,
    } = this.props;

    if (threads.length === 1 || rightClickedThreadIndex === null) {
      // This is not a valid candidate for hiding the thread. Either there are not
      // enough threads, or the right clicked track didn't have an associated thread
      // index.
      return null;
    }

    let isOnlyOneTrackLeft;
    if (rightClickedTrack.type === 'global') {
      isOnlyOneTrackLeft =
        hiddenGlobalTracks.size === globalTrackOrder.length - 1;
    } else {
      const hiddenLocalTracks = hiddenLocalTracksByPid.get(
        rightClickedTrack.pid
      );
      const localTrackOrder = localTrackOrderByPid.get(rightClickedTrack.pid);
      if (hiddenLocalTracks === undefined || localTrackOrder === undefined) {
        console.error('Expected to find hiddenLocalTracks for the given pid.');
        return null;
      }

      isOnlyOneTrackLeft =
        hiddenLocalTracks.size === localTrackOrder.length - 1;
    }
    return (
      <div>
        <MenuItem
          // This attribute is used to identify this element in tests.
          data-test-id="isolate-track"
          onClick={this._isolateTrack}
          disabled={isOnlyOneTrackLeft}
        >
          Only show: {`"${this.getRightClickedTrackName()}"`}
        </MenuItem>
        <div className="react-contextmenu-separator" />
      </div>
    );
  }

  render() {
    const { globalTrackOrder, globalTracks } = this.props;

    return (
      <ContextMenu id="TimelineTrackContextMenu">
        {// This may or may not render the isolate track options, depending
        // on whether it's actually valid to do so.
        this.renderIsolateTrack()}
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
    hiddenLocalTracksByPid: getHiddenLocalTracksByPid(state),
    localTrackOrderByPid: getLocalTrackOrderByPid(state),
    rightClickedThreadIndex: getRightClickedThreadIndex(state),
    globalTrackNames: getGlobalTrackNames(state),
    localTrackNamesByPid: getLocalTrackNamesByPid(state),
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
