/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import TimelineThread from './Thread';
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
} from '../../reducers/profile-view';
import { getHiddenThreads, getThreadOrder } from '../../reducers/url-state';
import './index.css';

import type { SizeProps } from '../shared/WithSize';

import {
  changeThreadOrder,
  updateProfileSelection,
  addRangeFilterAndUnsetSelection,
} from '../../actions/profile-view';

import type { Profile, ThreadIndex } from '../../types/profile';
import type { ProfileSelection } from '../../types/actions';
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
  +threadOrder: ThreadIndex[],
  +hiddenThreads: ThreadIndex[],
  +timeRange: StartEndRange,
  +zeroAt: Milliseconds,
|};

type DispatchProps = {|
  +changeThreadOrder: typeof changeThreadOrder,
  +addRangeFilterAndUnsetSelection: typeof addRangeFilterAndUnsetSelection,
  +updateProfileSelection: typeof updateProfileSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class Timeline extends PureComponent<Props> {
  render() {
    const {
      profile,
      threadOrder,
      changeThreadOrder,
      selection,
      timeRange,
      hiddenThreads,
      displayRange,
      zeroAt,
      width,
    } = this.props;
    const threads = profile.threads;
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
              order={threadOrder}
              orient="vertical"
              onChangeOrder={changeThreadOrder}
            >
              {threads.map((thread, threadIndex) => (
                <TimelineThread
                  key={threadIndex}
                  threadIndex={threadIndex}
                  interval={profile.meta.interval}
                  rangeStart={timeRange.start}
                  rangeEnd={timeRange.end}
                  isHidden={hiddenThreads.includes(threadIndex)}
                  isModifyingSelection={selection.isModifying}
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
    threadOrder: getThreadOrder(state),
    hiddenThreads: getHiddenThreads(state),
    timeRange: getDisplayRange(state),
    displayRange: getDisplayRange(state),
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: {
    changeThreadOrder,
    updateProfileSelection,
    addRangeFilterAndUnsetSelection,
  },
  component: Timeline,
};
export default withSize(explicitConnect(options));
