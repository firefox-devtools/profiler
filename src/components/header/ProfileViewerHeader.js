/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import ProfileThreadHeaderBar from './ProfileThreadHeaderBar';
import TimeSelectionScrubber from './TimeSelectionScrubber';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import Screenshots from './Screenshots';
import Network from './Network';

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

  /**
   * Flow didn't like using array mapping, so abstract this into some imperative logic
   * and inside of a function.
   */
  renderThreadsForProcess(threadIndexes: ThreadIndex[]) {
    const { threads } = this.props.profile;
    const elements = [];
    for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
      if (threadIndexes.includes(threadIndex)) {
        elements.push(this.renderThread(threadIndex, false));
      }
    }
    return elements;
  }

  renderThread(threadIndex: ThreadIndex, isMainThread: boolean) {
    const { profile, timeRange, hiddenThreads, selection } = this.props;

    return (
      <ProfileThreadHeaderBar
        key={threadIndex}
        threadIndex={threadIndex}
        interval={profile.meta.interval}
        rangeStart={timeRange.start}
        rangeEnd={timeRange.end}
        isHidden={hiddenThreads.includes(threadIndex)}
        isModifyingSelection={selection.isModifying}
        isMainThread={isMainThread}
      />
    );
  }

  optionallyRenderScreenshots(
    mainThreadIndex: ThreadIndex | null,
    threadIndexes: ThreadIndex[]
  ) {
    const { profile: { threads } } = this.props;
    if (mainThreadIndex === null) {
      return null;
    }
    const mainThread = threads[mainThreadIndex];

    if (
      mainThread.name === 'GeckoMain' &&
      mainThread.processType === 'default'
    ) {
      // This is the main thread of the parent process, check for a compositor process.
      for (let i = 0; i < threadIndexes.length; i++) {
        const threadIndex = threadIndexes[i];
        if (threads[threadIndex].name === 'Compositor') {
          // Found the compositor thread.
          return <Screenshots threadIndex={threadIndex} />;
        }
      }
    }
    return null;
  }

  render() {
    const {
      profile,
      threadOrder,
      selection,
      timeRange,
      zeroAt,
      updateProfileSelection,
      hiddenThreads,
    } = this.props;

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
          {threadOrder.map(
            ({ pid, mainThread, threads: threadIndexes }) =>
              // There is a non-hidden main thread.
              (mainThread && !hiddenThreads.includes(mainThread)) ||
              // Or there are non-hidden threads to show.
              threadIndexes.some(index => !hiddenThreads.includes(index)) ? (
                <div key={pid} className="profileViewerHeaderProcess">
                  {mainThread === null ? null : (
                    <ol className="profileViewerMainThread">
                      {this.renderThread(mainThread, true)}
                    </ol>
                  )}
                  <ol className="profileViewerHeaderThreadList">
                    {mainThread === null ? null : (
                      <Network threadIndex={mainThread} />
                    )}
                    {this.optionallyRenderScreenshots(
                      mainThread,
                      threadIndexes
                    )}
                    {this.renderThreadsForProcess(threadIndexes)}
                  </ol>
                </div>
              ) : null
          )}
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
