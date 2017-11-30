/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import ProfileThreadHeaderBar from './ProfileThreadHeaderBar';
import Reorderable from '../shared/Reorderable';
import TimeSelectionScrubber from './TimeSelectionScrubber';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import explicitConnect from '../../utils/connect';
import {
  getProfile,
  getProfileViewOptions,
  getDisplayRange,
  getZeroAt,
} from '../../reducers/profile-view';
import { getHiddenThreads, getThreadOrder } from '../../reducers/url-state';

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

type StateProps = {|
  +profile: Profile,
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

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewerHeader extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any)._onZoomButtonClick = this._onZoomButtonClick.bind(this);
  }

  _onZoomButtonClick(start: Milliseconds, end: Milliseconds) {
    const { addRangeFilterAndUnsetSelection, zeroAt } = this.props;
    addRangeFilterAndUnsetSelection(start - zeroAt, end - zeroAt);
  }

  render() {
    const {
      profile,
      threadOrder,
      changeThreadOrder,
      selection,
      timeRange,
      zeroAt,
      hiddenThreads,
      updateProfileSelection,
    } = this.props;
    const threads = profile.threads;

    return (
      <OverflowEdgeIndicator className="profileViewerHeaderOverflowEdgeIndicator">
        <TimeSelectionScrubber
          className="profileViewerHeader"
          zeroAt={zeroAt}
          rangeStart={timeRange.start}
          rangeEnd={timeRange.end}
          minSelectionStartWidth={profile.meta.interval}
          selection={selection}
          onSelectionChange={updateProfileSelection}
          onZoomButtonClick={this._onZoomButtonClick}
        >
          {
            <Reorderable
              tagName="ol"
              className="profileViewerHeaderThreadList"
              order={threadOrder}
              orient="vertical"
              onChangeOrder={changeThreadOrder}
            >
              {threads.map((thread, threadIndex) =>
                <ProfileThreadHeaderBar
                  key={threadIndex}
                  threadIndex={threadIndex}
                  interval={profile.meta.interval}
                  rangeStart={timeRange.start}
                  rangeEnd={timeRange.end}
                  isHidden={hiddenThreads.includes(threadIndex)}
                  isModifyingSelection={selection.isModifying}
                />
              )}
            </Reorderable>
          }
        </TimeSelectionScrubber>
      </OverflowEdgeIndicator>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    profile: getProfile(state),
    selection: getProfileViewOptions(state).selection,
    threadOrder: getThreadOrder(state),
    hiddenThreads: getHiddenThreads(state),
    timeRange: getDisplayRange(state),
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: {
    changeThreadOrder,
    updateProfileSelection,
    addRangeFilterAndUnsetSelection,
  },
  component: ProfileViewerHeader,
};

export default explicitConnect(options);
