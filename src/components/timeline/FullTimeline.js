/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { showMenu } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { TimelineGlobalTrack } from './GlobalTrack';
import { TimelineRuler } from './Ruler';
import { TimelineSelection } from './Selection';
import { OverflowEdgeIndicator } from './OverflowEdgeIndicator';
import { Reorderable } from 'firefox-profiler/components/shared/Reorderable';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getZeroAt,
  getGlobalTracks,
  getGlobalTrackReferences,
  getHiddenTrackCount,
  getActiveTabID,
  getTimelineTrackOrganization,
  getGlobalTrackOrder,
  getTimelineType,
  getPanelLayoutGeneration,
  getIsCPUUtilizationProvided,
} from 'firefox-profiler/selectors';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
  TIMELINE_SETTINGS_HEIGHT,
} from 'firefox-profiler/app-logic/constants';
import { TimelineTrackContextMenu } from './TrackContextMenu';

import './index.css';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';

import {
  changeGlobalTrackOrder,
  changeTimelineType,
  changeRightClickedTrack,
} from 'firefox-profiler/actions/profile-view';
import { changeTimelineTrackOrganization } from 'firefox-profiler/actions/receive-profile';

import type {
  TabID,
  TrackIndex,
  GlobalTrack,
  InitialSelectedTrackReference,
  TimelineTrackOrganization,
  GlobalTrackReference,
  TimelineType,
  HiddenTrackCount,
  Milliseconds,
  StartEndRange,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +committedRange: StartEndRange,
  +globalTracks: GlobalTrack[],
  +globalTrackOrder: TrackIndex[],
  +globalTrackReferences: GlobalTrackReference[],
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
  +timelineType: TimelineType,
  +hiddenTrackCount: HiddenTrackCount,
  +activeTabID: TabID | null,
  +timelineTrackOrganization: TimelineTrackOrganization,
  +isCPUUtilizationProvided: boolean,
|};

type DispatchProps = {|
  +changeGlobalTrackOrder: typeof changeGlobalTrackOrder,
  +changeTimelineType: typeof changeTimelineType,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +changeTimelineTrackOrganization: typeof changeTimelineTrackOrganization,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<{||}, StateProps, DispatchProps>,
|};

type State = {|
  initialSelected: InitialSelectedTrackReference | null,
|};

class TimelineSettingsGraphType extends React.PureComponent<{|
  +timelineType: TimelineType,
  +changeTimelineType: typeof changeTimelineType,
  +isCPUUtilizationProvided: boolean,
|}> {
  _changeToCategories = () => this.props.changeTimelineType('category');
  _changeToCPUCategories = () => this.props.changeTimelineType('cpu-category');
  _changeToStacks = () => this.props.changeTimelineType('stack');

  render() {
    const { timelineType, isCPUUtilizationProvided } = this.props;

    return (
      <form>
        <div className="timelineSettingsToggle">
          <Localized id="FullTimeline--graph-type">Graph type:</Localized>
          {isCPUUtilizationProvided ? (
            <label className="photon-label photon-label-micro timelineSettingsToggleLabel">
              <input
                type="radio"
                name="timelineSettingsToggle"
                className="photon-radio photon-radio-micro timelineSettingsToggleInput"
                checked={timelineType === 'cpu-category'}
                onChange={this._changeToCPUCategories}
              />
              <Localized id="FullTimeline--categories-with-cpu">
                Categories with CPU
              </Localized>
            </label>
          ) : null}
          <label className="photon-label photon-label-micro timelineSettingsToggleLabel">
            <input
              type="radio"
              name="timelineSettingsToggle"
              className="photon-radio photon-radio-micro timelineSettingsToggleInput"
              checked={timelineType === 'category'}
              onChange={this._changeToCategories}
            />
            <Localized id="FullTimeline--categories">Categories</Localized>
          </label>
          <label className="photon-label-micro timelineSettingsToggleLabel">
            <input
              type="radio"
              name="timelineSettingsToggle"
              className="photon-radio photon-radio-micro timelineSettingsToggleInput"
              checked={timelineType === 'stack'}
              onChange={this._changeToStacks}
            />
            <Localized id="FullTimeline--stack-height">Stack height</Localized>
          </label>
        </div>
      </form>
    );
  }
}

class TimelineSettingsHiddenTracks extends React.PureComponent<{|
  +hiddenTrackCount: HiddenTrackCount,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
|}> {
  _showMenu = (event: SyntheticMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    this.props.changeRightClickedTrack(null);
    showMenu({
      data: null,
      id: 'TimelineTrackContextMenu',
      position: { x: rect.left, y: rect.bottom },
      target: event.target,
    });
  };

  render() {
    const { hiddenTrackCount } = this.props;

    return (
      <Localized
        id="FullTimeline--tracks-button"
        elems={{
          span: <span className="timelineSettingsHiddenTracksNumber" />,
        }}
        vars={{
          visibleTrackCount: hiddenTrackCount.total - hiddenTrackCount.hidden,
          totalTrackCount: hiddenTrackCount.total,
        }}
      >
        <button
          type="button"
          onClick={this._showMenu}
          className="timelineSettingsHiddenTracks"
        >
          <span className="timelineSettingsHiddenTracksNumber">
            {hiddenTrackCount.total - hiddenTrackCount.hidden}
          </span>
          {' / '}
          <span className="timelineSettingsHiddenTracksNumber">
            {hiddenTrackCount.total}{' '}
          </span>
          tracks
        </button>
      </Localized>
    );
  }
}

class TimelineSettingsActiveTabView extends React.PureComponent<{|
  +activeTabID: TabID | null,
  +timelineTrackOrganization: TimelineTrackOrganization,
  +changeTimelineTrackOrganization: typeof changeTimelineTrackOrganization,
|}> {
  _toggleActiveTabView = () => {
    const {
      timelineTrackOrganization,
      changeTimelineTrackOrganization,
      activeTabID,
    } = this.props;
    if (timelineTrackOrganization.type === 'full' && activeTabID !== null) {
      changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID: activeTabID,
      });
    } else {
      changeTimelineTrackOrganization({ type: 'full' });
    }
  };

  render() {
    const { activeTabID, timelineTrackOrganization } = this.props;
    if (activeTabID === null) {
      return null;
    }

    return (
      <div className="timelineSettingsToggle">
        <label className="photon-label photon-label-micro timelineSettingsToggleLabel">
          <input
            type="checkbox"
            name="timelineSettingsActiveTabToggle"
            className="photon-checkbox photon-checkbox-micro"
            onChange={this._toggleActiveTabView}
            checked={timelineTrackOrganization.type === 'active-tab'}
          />
          Show active tab only
        </label>
      </div>
    );
  }
}

class FullTimelineImpl extends React.PureComponent<Props, State> {
  state = {
    initialSelected: null,
  };

  /**
   * This method collects the initially selected track's HTMLElement. This allows the timeline
   * to scroll the initially selected track into view once the page is loaded.
   */
  setInitialSelected = (el: InitialSelectedTrackReference) => {
    this.setState({ initialSelected: el });
  };

  render() {
    const {
      globalTracks,
      globalTrackOrder,
      changeGlobalTrackOrder,
      committedRange,
      zeroAt,
      width,
      globalTrackReferences,
      panelLayoutGeneration,
      timelineType,
      hiddenTrackCount,
      changeTimelineType,
      changeRightClickedTrack,
      activeTabID,
      timelineTrackOrganization,
      changeTimelineTrackOrganization,
      isCPUUtilizationProvided,
    } = this.props;

    // Do not include the left and right margins when computing the timeline width.
    const timelineWidth = width - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;

    return (
      <>
        <div
          className="timelineSettings"
          style={{
            '--timeline-settings-height': `${TIMELINE_SETTINGS_HEIGHT}px`,
          }}
        >
          <TimelineSettingsGraphType
            timelineType={timelineType}
            changeTimelineType={changeTimelineType}
            isCPUUtilizationProvided={isCPUUtilizationProvided}
          />
          {/*
            Removing the active tab view checkbox for now.
            TODO: Bring it back once we are done with the new active tab UI implementation.
           */}
          {/* eslint-disable-next-line no-constant-condition */}
          {true ? null : (
            <TimelineSettingsActiveTabView
              activeTabID={activeTabID}
              timelineTrackOrganization={timelineTrackOrganization}
              changeTimelineTrackOrganization={changeTimelineTrackOrganization}
            />
          )}
        </div>
        <TimelineSelection width={timelineWidth}>
          <div className="timelineHeader">
            <TimelineSettingsHiddenTracks
              hiddenTrackCount={hiddenTrackCount}
              changeRightClickedTrack={changeRightClickedTrack}
            />
            <TimelineRuler
              zeroAt={zeroAt}
              rangeStart={committedRange.start}
              rangeEnd={committedRange.end}
              width={timelineWidth}
            />
          </div>
          <OverflowEdgeIndicator
            className="timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
            initialSelected={this.state.initialSelected}
          >
            <Reorderable
              tagName="ol"
              className="timelineThreadList"
              grippyClassName="timelineTrackGlobalGrippy"
              order={globalTrackOrder}
              orient="vertical"
              onChangeOrder={changeGlobalTrackOrder}
            >
              {globalTracks.map((globalTrack, trackIndex) => (
                <TimelineGlobalTrack
                  key={trackIndex}
                  trackIndex={trackIndex}
                  trackReference={globalTrackReferences[trackIndex]}
                  setInitialSelected={this.setInitialSelected}
                />
              ))}
            </Reorderable>
          </OverflowEdgeIndicator>
        </TimelineSelection>
        <TimelineTrackContextMenu />
      </>
    );
  }
}

export const FullTimeline = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    globalTracks: getGlobalTracks(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    globalTrackReferences: getGlobalTrackReferences(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
    timelineType: getTimelineType(state),
    hiddenTrackCount: getHiddenTrackCount(state),
    activeTabID: getActiveTabID(state),
    timelineTrackOrganization: getTimelineTrackOrganization(state),
    isCPUUtilizationProvided: getIsCPUUtilizationProvided(state),
  }),
  mapDispatchToProps: {
    changeGlobalTrackOrder,
    changeTimelineType,
    changeRightClickedTrack,
    changeTimelineTrackOrganization,
  },
  component: withSize<Props>(FullTimelineImpl),
});
