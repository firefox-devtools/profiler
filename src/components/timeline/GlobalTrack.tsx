/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import classNames from 'classnames';
import {
  changeRightClickedTrack,
  changeLocalTrackOrder,
  selectTrackWithModifiers,
  hideGlobalTrack,
} from 'firefox-profiler/actions/profile-view';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';
import {
  getSelectedThreadIndexes,
  getLocalTrackOrder,
  getSelectedTab,
  getHiddenGlobalTracks,
} from 'firefox-profiler/selectors/url-state';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getGlobalTracks,
  getLocalTracks,
  getGlobalTrackName,
  getProcessesWithMemoryTrack,
  getVisualProgress,
  getPerceptualSpeedIndexProgress,
  getContentfulSpeedIndexProgress,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import './Track.css';
import { TimelineTrackThread } from './TrackThread';
import { TimelineTrackScreenshots } from './TrackScreenshots';
import { TimelineLocalTrack } from './LocalTrack';
import { TrackVisualProgress } from './TrackVisualProgress';
import { Reorderable } from 'firefox-profiler/components/shared/Reorderable';
import { TRACK_PROCESS_BLANK_HEIGHT } from 'firefox-profiler/app-logic/constants';
import { getTrackSelectionModifiers } from 'firefox-profiler/utils';

import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';
import type {
  GlobalTrackReference,
  Pid,
  ProgressGraphData,
  TrackIndex,
  GlobalTrack,
  LocalTrack,
  InitialSelectedTrackReference,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly trackReference: GlobalTrackReference;
  readonly trackIndex: TrackIndex;
  readonly style?: unknown /* This is used by Reorderable */;
  readonly setInitialSelected: (el: InitialSelectedTrackReference) => void;
};

type StateProps = {
  readonly trackName: string;
  readonly globalTrack: GlobalTrack;
  readonly isSelected: boolean;
  readonly isHidden: boolean;
  readonly titleText: string | null;
  readonly localTrackOrder: TrackIndex[];
  readonly localTracks: LocalTrack[];
  readonly pid: Pid | null;
  readonly selectedTab: TabSlug;
  readonly processesWithMemoryTrack: Set<Pid>;
  readonly progressGraphData: ProgressGraphData[] | null;
};

type DispatchProps = {
  readonly changeRightClickedTrack: typeof changeRightClickedTrack;
  readonly changeLocalTrackOrder: typeof changeLocalTrackOrder;
  readonly selectTrackWithModifiers: typeof selectTrackWithModifiers;
  readonly hideGlobalTrack: typeof hideGlobalTrack;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class GlobalTrackComponent extends PureComponent<Props> {
  _container: HTMLElement | null = null;
  _isInitialSelectedPane: boolean | null = null;

  _onContextMenu = () => {
    const { changeRightClickedTrack, trackReference } = this.props;
    // Notify the redux store that this was right clicked.
    changeRightClickedTrack(trackReference);
  };

  _selectCurrentTrack = (
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => {
    const { selectTrackWithModifiers, trackReference } = this.props;
    selectTrackWithModifiers(trackReference, getTrackSelectionModifiers(event));
  };

  _hideCurrentTrack = (
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => {
    const { trackIndex, hideGlobalTrack } = this.props;
    hideGlobalTrack(trackIndex);
    event.stopPropagation();
  };

  renderTrack() {
    const {
      globalTrack,
      processesWithMemoryTrack,
      progressGraphData,
      trackName,
    } = this.props;
    switch (globalTrack.type) {
      case 'process': {
        const { mainThreadIndex } = globalTrack;
        if (mainThreadIndex === null) {
          return (
            <div
              className="timelineTrackThreadBlank"
              style={
                {
                  '--timeline-track-thread-blank-height': `${TRACK_PROCESS_BLANK_HEIGHT}px`,
                } as React.CSSProperties
              }
            />
          );
        }
        return (
          <TimelineTrackThread
            threadsKey={mainThreadIndex}
            showMemoryMarkers={!processesWithMemoryTrack.has(globalTrack.pid)}
            trackType="expanded"
            trackName={trackName}
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
          throw new Error('Visual progress graph data is missing');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphDotTooltipText=" visual completeness at this time"
          />
        );
      }
      case 'perceptual-visual-progress': {
        if (!progressGraphData) {
          throw new Error('Perceptual visual progress graph data is missing');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphDotTooltipText=" perceptual visual completeness at this time"
          />
        );
      }
      case 'contentful-visual-progress': {
        if (!progressGraphData) {
          throw new Error('Contentful visual progress graph data is missing');
        }
        return (
          <TrackVisualProgress
            progressGraphData={progressGraphData}
            graphDotTooltipText=" contentful visual completeness at this time"
          />
        );
      }
      default:
        console.error('Unhandled globalTrack type', globalTrack as never);
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
            setIsInitialSelectedPane={this.setIsInitialSelectedPane}
          />
        ))}
      </Reorderable>
    );
  }

  _takeContainerRef = (el: HTMLElement | null) => {
    const { isSelected } = this.props;
    this._container = el;

    if (isSelected) {
      this.setIsInitialSelectedPane(true);
    }
  };

  setIsInitialSelectedPane = (value: boolean) => {
    this._isInitialSelectedPane = value;
  };

  override componentDidMount() {
    if (this._isInitialSelectedPane && this._container !== null) {
      this.props.setInitialSelected(this._container);
    }
  }

  override render() {
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
      <li
        ref={this._takeContainerRef}
        className="timelineTrack"
        style={style as React.CSSProperties}
      >
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
              onContextMenu: this._onContextMenu,
            }}
          >
            <button type="button" className="timelineTrackNameButton">
              {trackName}
              {
                // Only show the PID if:
                //   1. It is non-null. For example, Screenshot tracks have a null
                //      PIDs, and we don't want to show "PID: " for them.
                //   2. The global track actually points to a real thread. A stub
                //      process track is created
              }
              {pid !== null &&
              pid !== '0' &&
              globalTrack.type === 'process' &&
              globalTrack.mainThreadIndex !== null ? (
                <div className="timelineTrackNameButtonAdditionalDetails">
                  PID: {pid}
                </div>
              ) : null}
            </button>
            <Localized
              id="TrackNameButton--hide-process"
              attrs={{ title: true }}
            >
              <button
                type="button"
                className="timelineTrackCloseButton"
                title="Hide process"
                onClick={this._hideCurrentTrack}
              />
            </Localized>
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
const EMPTY_TRACK_ORDER: number[] = [];
const EMPTY_LOCAL_TRACKS: LocalTrack[] = [];

export const TimelineGlobalTrack = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
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
            getSelectedThreadIndexes(state).has(threadIndex) &&
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
        titleText = 'Visual Progress';
        progressGraphData = getVisualProgress(state);
        break;
      case 'perceptual-visual-progress':
        titleText = 'Perceptual Visual Progress';
        progressGraphData = getPerceptualSpeedIndexProgress(state);
        break;
      case 'contentful-visual-progress':
        titleText = 'Contentful Visual Progress';
        progressGraphData = getContentfulSpeedIndexProgress(state);
        break;
      default:
        throw new Error(`Unhandled GlobalTrack type ${globalTrack as never}`);
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
    selectTrackWithModifiers,
    hideGlobalTrack,
  },
  component: GlobalTrackComponent,
});
