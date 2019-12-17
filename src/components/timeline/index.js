/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { showMenu } from 'react-contextmenu';
import TimelineGlobalTrack from './GlobalTrack';
import TimelineRuler from './Ruler';
import TimelineSelection from './Selection';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import Reorderable from '../shared/Reorderable';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import { getPanelLayoutGeneration } from 'selectors/app';
import {
  getCommittedRange,
  getZeroAt,
  getGlobalTracks,
  getGlobalTrackReferences,
  getHiddenTrackCount,
} from 'selectors/profile';
import { getGlobalTrackOrder, getTimelineType } from 'selectors/url-state';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
  TIMELINE_SETTINGS_HEIGHT,
} from '../../app-logic/constants';

import './index.css';

import type { SizeProps } from '../shared/WithSize';

import {
  changeGlobalTrackOrder,
  updatePreviewSelection,
  commitRange,
  changeTimelineType,
  changeRightClickedTrack,
} from '../../actions/profile-view';

import type { TrackIndex, GlobalTrack } from '../../types/profile-derived';
import type {
  GlobalTrackReference,
  TimelineType,
  HiddenTrackCount,
} from '../../types/actions';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +committedRange: StartEndRange,
  +globalTracks: GlobalTrack[],
  +globalTrackOrder: TrackIndex[],
  +globalTrackReferences: GlobalTrackReference[],
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
  +timelineType: TimelineType,
  +hiddenTrackCount: HiddenTrackCount,
|};

type DispatchProps = {|
  +changeGlobalTrackOrder: typeof changeGlobalTrackOrder,
  +commitRange: typeof commitRange,
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeTimelineType: typeof changeTimelineType,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<{||}, StateProps, DispatchProps>,
|};

class TimelineSettingsGraphType extends React.PureComponent<{|
  +timelineType: TimelineType,
  +changeTimelineType: typeof changeTimelineType,
|}> {
  _changeToCategories = () => this.props.changeTimelineType('category');
  _changeToStacks = () => this.props.changeTimelineType('stack');

  render() {
    const { timelineType } = this.props;

    return (
      <form>
        <div className="timelineSettingsToggle">
          Graph type:{' '}
          <label className="photon-label photon-label-micro timelineSettingsToggleLabel">
            <input
              type="radio"
              name="timelineSettingsToggle"
              className="photon-radio photon-radio-micro timelineSettingsToggleInput"
              checked={timelineType === 'category'}
              onChange={this._changeToCategories}
            />
            Categories
          </label>
          <label className="photon-label-micro timelineSettingsToggleLabel">
            <input
              type="radio"
              name="timelineSettingsToggle"
              className="photon-radio photon-radio-micro timelineSettingsToggleInput"
              checked={timelineType === 'stack'}
              onChange={this._changeToStacks}
            />
            Stack height
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
    changeRightClickedTrack(null);
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
        tracks visible
      </button>
    );
  }
}

class Timeline extends React.PureComponent<Props> {
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
          />
          <TimelineSettingsHiddenTracks
            hiddenTrackCount={hiddenTrackCount}
            changeRightClickedTrack={changeRightClickedTrack}
          />
        </div>
        <TimelineSelection width={timelineWidth}>
          <TimelineRuler
            zeroAt={zeroAt}
            rangeStart={committedRange.start}
            rangeEnd={committedRange.end}
            width={timelineWidth}
          />
          <OverflowEdgeIndicator
            className="timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
          >
            {
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
                  />
                ))}
              </Reorderable>
            }
          </OverflowEdgeIndicator>
        </TimelineSelection>
      </>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    globalTracks: getGlobalTracks(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    globalTrackReferences: getGlobalTrackReferences(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
    timelineType: getTimelineType(state),
    hiddenTrackCount: getHiddenTrackCount(state),
  }),
  mapDispatchToProps: {
    changeGlobalTrackOrder,
    updatePreviewSelection,
    commitRange,
    changeTimelineType,
    changeRightClickedTrack,
  },
  component: withSize<Props>(Timeline),
});
