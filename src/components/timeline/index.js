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
import {
  getProfile,
  getProfileViewOptions,
  getDisplayRange,
  getZeroAt,
  getGlobalTracks,
  getGlobalTrackReferences,
} from '../../reducers/profile-view';
import { getGlobalTrackOrder } from '../../reducers/url-state';
import './index.css';

import type { SizeProps } from '../shared/WithSize';

import {
  changeGlobalTrackOrder,
  updateProfileSelection,
  addRangeFilterAndUnsetSelection,
} from '../../actions/profile-view';

import type { Profile } from '../../types/profile';
import type { TrackIndex, GlobalTrack } from '../../types/profile-derived';
import type { ProfileSelection, TrackReference } from '../../types/actions';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = SizeProps;

type StateProps = {|
  +profile: Profile,
  +displayRange: StartEndRange,
  +selection: ProfileSelection,
  +globalTracks: GlobalTrack[],
  +globalTrackOrder: TrackIndex[],
  +globalTrackReferences: TrackReference[],
  +timeRange: StartEndRange,
  +zeroAt: Milliseconds,
|};

type DispatchProps = {|
  +changeGlobalTrackOrder: typeof changeGlobalTrackOrder,
  +addRangeFilterAndUnsetSelection: typeof addRangeFilterAndUnsetSelection,
  +updateProfileSelection: typeof updateProfileSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class Timeline extends PureComponent<Props> {
  render() {
    const {
      globalTracks,
      globalTrackOrder,
      changeGlobalTrackOrder,
      displayRange,
      zeroAt,
      width,
      globalTrackReferences,
    } = this.props;

    return (
      <TimelineSelection width={width}>
        <TimelineRuler
          zeroAt={zeroAt}
          rangeStart={displayRange.start}
          rangeEnd={displayRange.end}
          width={width}
        />
        <OverflowEdgeIndicator className="timelineOverflowEdgeIndicator">
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
    profile: getProfile(state),
    selection: getProfileViewOptions(state).selection,
    globalTracks: getGlobalTracks(state),
    globalTrackOrder: getGlobalTrackOrder(state),
    globalTrackReferences: getGlobalTrackReferences(state),
    timeRange: getDisplayRange(state),
    displayRange: getDisplayRange(state),
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: {
    changeGlobalTrackOrder,
    updateProfileSelection,
    addRangeFilterAndUnsetSelection,
  },
  component: Timeline,
};
export default withSize(explicitConnect(options));
