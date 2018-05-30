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
import { ensureExists } from '../../utils/flow';
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
import type { ThreadsInProcess } from '../../types/profile-derived';
import type { ProfileSelection } from '../../types/actions';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +profile: Profile,
  +selection: ProfileSelection,
  +threadOrder: ThreadsInProcess[],
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
  pidToChangeThreadOrderFn = new Map();

  constructor(props: Props) {
    super(props);
    (this: any)._onZoomButtonClick = this._onZoomButtonClick.bind(this);

    // Work around using an arrow function in the render method:
    // "JSX props should not use arrow functions  react/jsx-no-bind"
    // changeThreadOrder needs the pid, so pre-allocate the needed
    // functions with the pid already set.
    for (const { pid } of this.props.threadOrder) {
      const changeThreadOrderFn = threadIndexes =>
        this.props.changeThreadOrder(pid, threadIndexes);
      this.pidToChangeThreadOrderFn.set(pid, changeThreadOrderFn);
    }
  }

  _onZoomButtonClick(start: Milliseconds, end: Milliseconds) {
    const { addRangeFilterAndUnsetSelection, zeroAt } = this.props;
    addRangeFilterAndUnsetSelection(start - zeroAt, end - zeroAt);
  }

  render() {
    const {
      profile,
      threadOrder,
      selection,
      timeRange,
      zeroAt,
      hiddenThreads,
      updateProfileSelection,
    } = this.props;
    const threads = profile.threads;

    return (
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
        <OverflowEdgeIndicator className="profileViewerHeaderOverflowEdgeIndicator">
          {threadOrder.map(({ pid, threads: threadIndexes }) => (
            <Reorderable
              key={pid}
              tagName="ol"
              className="profileViewerHeaderThreadList"
              order={threadIndexes}
              orient="vertical"
              onChangeOrder={ensureExists(
                this.pidToChangeThreadOrderFn.get(pid),
                'Could not find the changeThreadOrder function for a pid'
              )}
            >
              {threads.map((thread, threadIndex) => (
                <ProfileThreadHeaderBar
                  key={threadIndex}
                  threadIndex={threadIndex}
                  interval={profile.meta.interval}
                  rangeStart={timeRange.start}
                  rangeEnd={timeRange.end}
                  isHidden={
                    hiddenThreads.includes(threadIndex) ||
                    !threadIndexes.includes(threadIndex)
                  }
                  isModifyingSelection={selection.isModifying}
                />
              ))}
            </Reorderable>
          ))}
        </OverflowEdgeIndicator>
      </TimeSelectionScrubber>
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
