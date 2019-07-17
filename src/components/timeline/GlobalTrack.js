/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import {
  changeRightClickedTrack,
  changeLocalTrackOrder,
  selectTrack,
} from '../../actions/profile-view';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import {
  getSelectedThreadIndex,
  getHiddenGlobalTracks,
  getLocalTrackOrder,
  getSelectedTab,
} from '../../selectors/url-state';
import explicitConnect from '../../utils/connect';
import {
  getGlobalTracks,
  getLocalTracks,
  getGlobalTrackName,
  getProcessesWithMemoryTrack,
  getVisualProgress,
  getPerceptualSpeedIndexProgress,
  getContentfulSpeedIndexProgress,
} from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';
import './Track.css';
import TimelineTrackThread from './TrackThread';
import TimelineTrackScreenshots from './TrackScreenshots';
import TimelineLocalTrack from './LocalTrack';
import { TrackVisualProgress } from './TrackVisualProgress';
import Reorderable from '../shared/Reorderable';
import { TRACK_PROCESS_BLANK_HEIGHT } from '../../app-logic/constants';
import {
  BLUE_50,
  BLUE_60,
  GREEN_50,
  GREEN_60,
  RED_50,
  RED_60,
} from 'photon-colors';

import type { TabSlug } from '../../app-logic/tabs-handling';
import type { GlobalTrackReference } from '../../types/actions';
import type { Pid, ProgressGraphData } from '../../types/profile';
import type {
  TrackIndex,
  GlobalTrack,
  LocalTrack,
} from '../../types/profile-derived';
import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  +trackReference: GlobalTrackReference,
  +trackIndex: TrackIndex,
  +style?: Object /* This is used by Reorderable */,
|};

type StateProps = {|
  +trackName: string,
  +globalTrack: GlobalTrack,
  +isSelected: boolean,
  +isHidden: boolean,
  +titleText: string | null,
  +localTrackOrder: TrackIndex[],
  +localTracks: LocalTrack[],
  +pid: Pid | null,
  +selectedTab: TabSlug,
  +processesWithMemoryTrack: Set<Pid>,
  +progressGraphData: ProgressGraphData[] | null,
|};

type DispatchProps = {|
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +changeLocalTrackOrder: typeof changeLocalTrackOrder,
  +selectTrack: typeof selectTrack,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class GlobalTrackComponent extends PureComponent<Props> {
  _onLabelMouseDown = (event: MouseEvent) => {
    const { changeRightClickedTrack, trackReference } = this.props;

    if (event.button === 0) {
      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
      this._selectCurrentTrack();
    } else if (event.button === 2) {
      // This is needed to allow the context menu to know what was right clicked without
      // actually changing the current selection.
      changeRightClickedTrack(trackReference);
    }
  };

  _selectCurrentTrack = () => {
    const { selectTrack, trackReference } = this.props;
    selectTrack(trackReference);
  };

  renderTrack() {
    const {
      globalTrack,
      processesWithMemoryTrack,
      progressGraphData,
    } = this.props;
    switch (globalTrack.type) {
      case 'process': {
        const { mainThreadIndex } = globalTrack;
        if (mainThreadIndex === null) {
          return (
            <div
              className="timelineTrackThreadBlank"
              style={{
                '--timeline-track-thread-blank-height': `${TRACK_PROCESS_BLANK_HEIGHT}px`,
              }}
            />
          );
        }
        return (
          <TimelineTrackThread
            threadIndex={mainThreadIndex}
            showMemoryMarkers={!processesWithMemoryTrack.has(globalTrack.pid)}
          />
        );
      }
      case 'screenshots': {
        const { threadIndex, id } = globalTrack;
        return (
          <TimelineTrackScreenshots threadIndex={threadIndex} windowId={id} />
        );
      }
      case 'visual-progress': {
        if (!progressGraphData) {
          throw new Error('Progress Graph Data is null');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphStrokeColor={BLUE_50}
            graphFillColor="#0a84ff88" // Blue 50 with transparency.
            graphDotColor={BLUE_60}
            graphDotTooltipText=" visual completeness at this time"
            windowId={globalTrack.id}
          />
        );
      }
      case 'perceptual-visual-progress': {
        if (!progressGraphData) {
          throw new Error('Progress Graph Data is null');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphStrokeColor={GREEN_50}
            graphFillColor="#30e60b88" // Green 50 with transparency.
            graphDotColor={GREEN_60}
            graphDotTooltipText=" perceptual visual completeness at this time"
            windowId={globalTrack.id}
          />
        );
      }
      case 'contentful-visual-progress': {
        if (!progressGraphData) {
          throw new Error('Progress Graph Data is null');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphStrokeColor={RED_50}
            graphFillColor="#ff003988" // Red 50 with transparency.
            graphDotColor={RED_60}
            graphDotTooltipText=" contentful visual completeness at this time"
            windowId={globalTrack.id}
          />
        );
      }
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
      globalTrack,
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
          onClick={this._selectCurrentTrack}
        >
          <ContextMenuTrigger
            id="TimelineTrackContextMenu"
            renderTag="div"
            attributes={{
              title: titleText,
              className: 'timelineTrackLabel timelineTrackGlobalGrippy',
              onMouseDown: this._onLabelMouseDown,
            }}
          >
            <button type="button" className="timelineTrackNameButton">
              {trackName}
              {
                // Only show the PID if:
                //   1. It is a real number. A string PID is an artificially generated
                //      value that is not useful, and a null value does not exist.
                //   2. The global track actually points to a real thread. A stub
                //      process track is created
              }
              {typeof pid === 'number' &&
              globalTrack.mainThreadIndex !== null ? (
                <div className="timelineTrackNameButtonAdditionalDetails">
                  PID: {pid}
                </div>
              ) : null}
            </button>
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

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, { trackIndex }) => {
    const globalTracks = getGlobalTracks(state);
    const globalTrack = globalTracks[trackIndex];
    const selectedTab = getSelectedTab(state);

    // These get assigned based on the track type.
    let threadIndex = null;
    let isSelected = false;
    let titleText = null;

    let localTrackOrder = EMPTY_TRACK_ORDER;
    let localTracks = EMPTY_LOCAL_TRACKS;
    let pid = null;
    let progressGraphData = null;

    // Run different selectors based on the track type.
    switch (globalTrack.type) {
      case 'process': {
        // Look up the thread information for the process if it exists.
        if (globalTrack.mainThreadIndex !== null) {
          threadIndex = globalTrack.mainThreadIndex;
          const selectors = getThreadSelectors(threadIndex);
          isSelected =
            threadIndex === getSelectedThreadIndex(state) &&
            selectedTab !== 'network-chart';
          titleText = selectors.getThreadProcessDetails(state);
        }
        pid = globalTrack.pid;
        localTrackOrder = getLocalTrackOrder(state, pid);
        localTracks = getLocalTracks(state, pid);
        break;
      }
      case 'screenshots':
        break;
      case 'visual-progress':
        progressGraphData = getVisualProgress(state);
        break;
      case 'perceptual-visual-progress':
        progressGraphData = getPerceptualSpeedIndexProgress(state);
        break;
      case 'contentful-visual-progress':
        progressGraphData = getContentfulSpeedIndexProgress(state);
        break;
      default:
        throw new Error(`Unhandled GlobalTrack type ${(globalTrack: empty)}`);
    }

    return {
      trackName: getGlobalTrackName(state, trackIndex),
      titleText,
      globalTrack,
      isSelected,
      localTrackOrder,
      localTracks,
      pid,
      isHidden: getHiddenGlobalTracks(state).has(trackIndex),
      selectedTab,
      processesWithMemoryTrack: getProcessesWithMemoryTrack(state),
      progressGraphData,
    };
  },
  mapDispatchToProps: {
    changeRightClickedTrack,
    changeLocalTrackOrder,
    selectTrack,
  },
  component: GlobalTrackComponent,
});
