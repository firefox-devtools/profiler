/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import TimelineGlobalTrack from './GlobalTrack';
import TimelineRuler from './Ruler';
import TimelineSelection from './Selection';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import Reorderable from '../shared/Reorderable';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import { getPanelLayoutGeneration } from '../../reducers/app';
import {
  getCommittedRange,
  getZeroAt,
  getGlobalTracks,
  getGlobalTrackReferences,
} from '../../reducers/profile-view';
import { getGlobalTrackOrder, getTimelineType } from '../../reducers/url-state';
import './index.css';

import type { SizeProps } from '../shared/WithSize';

import {
  changeGlobalTrackOrder,
  updatePreviewSelection,
  commitRange,
  changeTimelineType,
} from '../../actions/profile-view';

import type { TrackIndex, GlobalTrack } from '../../types/profile-derived';
import type { TrackReference, TimelineType } from '../../types/actions';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = SizeProps;

type StateProps = {|
  +committedRange: StartEndRange,
  +globalTracks: GlobalTrack[],
  +globalTrackOrder: TrackIndex[],
  +globalTrackReferences: TrackReference[],
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
  +timelineType: TimelineType,
|};

type DispatchProps = {|
  +changeGlobalTrackOrder: typeof changeGlobalTrackOrder,
  +commitRange: typeof commitRange,
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeTimelineType: typeof changeTimelineType,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class Timeline extends PureComponent<Props> {
  _changeToCategories = () => this.props.changeTimelineType('category');
  _changeToStacks = () => this.props.changeTimelineType('stack');

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
    } = this.props;

    return (
      <TimelineSelection width={width}>
        <form>
          <div className="timelineToggle">
            <label className="timelineToggleLabel">
              <input
                type="radio"
                name="timelineToggle"
                className="timelineToggleInput"
                checked={timelineType === 'category'}
                onChange={this._changeToCategories}
              />
              Categories
            </label>
            <label className="timelineToggleLabel">
              <input
                type="radio"
                name="timelineToggle"
                className="timelineToggleInput"
                checked={timelineType === 'stack'}
                onChange={this._changeToStacks}
              />
              Stack height
            </label>
          </div>
        </form>
        <TimelineRuler
          zeroAt={zeroAt}
          rangeStart={committedRange.start}
          rangeEnd={committedRange.end}
          width={width}
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
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    globalTracks: getGlobalTracks(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    globalTrackReferences: getGlobalTrackReferences(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
    timelineType: getTimelineType(state),
  }),
  mapDispatchToProps: {
    changeGlobalTrackOrder,
    updatePreviewSelection,
    commitRange,
    changeTimelineType,
  },
  component: Timeline,
};
export default withSize(explicitConnect(options));
