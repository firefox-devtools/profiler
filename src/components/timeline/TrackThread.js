/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import StackGraph from './StackGraph';
import {
  selectorsForThread,
  getProfileInterval,
  getCommittedRange,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import {
  getSampleIndexClosestToTime,
  getCallNodePathFromIndex,
} from '../../profile-logic/profile-data';
import {
  TimelineTracingMarkersJank,
  TimelineTracingMarkersOverview,
} from './TracingMarkers';
import {
  changeSelectedThread,
  updateProfileSelection,
  changeRightClickedTrack,
  changeSelectedCallNode,
  focusCallTree,
} from '../../actions/profile-view';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import './TrackThread.css';

import type { Thread, ThreadIndex } from '../../types/profile';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { State } from '../../types/reducers';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  +threadIndex: ThreadIndex,
|};

type StateProps = {|
  +thread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +unfilteredSamplesRange: StartEndRange | null,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
|};

type DispatchProps = {|
  +changeSelectedThread: typeof changeSelectedThread,
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +updateProfileSelection: typeof updateProfileSelection,
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class TimelineTrackThread extends PureComponent<Props> {
  _onStackClick = (time: number) => {
    const { threadIndex, interval } = this.props;
    const {
      thread,
      callNodeInfo,
      changeSelectedCallNode,
      focusCallTree,
    } = this.props;
    const sampleIndex = getSampleIndexClosestToTime(
      thread.samples,
      time,
      interval
    );
    const newSelectedStack = thread.samples.stack[sampleIndex];
    const newSelectedCallNode =
      newSelectedStack === null
        ? -1
        : callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
    changeSelectedCallNode(
      threadIndex,
      getCallNodePathFromIndex(newSelectedCallNode, callNodeInfo.callNodeTable)
    );
    focusCallTree();
  };

  _onIntervalMarkerSelect = (
    threadIndex: ThreadIndex,
    start: Milliseconds,
    end: Milliseconds
  ) => {
    const {
      rangeStart,
      rangeEnd,
      updateProfileSelection,
      changeSelectedThread,
    } = this.props;
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
    changeSelectedThread(threadIndex);
  };

  render() {
    const {
      thread,
      threadIndex,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      unfilteredSamplesRange,
    } = this.props;

    const processType = thread.processType;
    const displayJank = processType !== 'plugin';
    const displayTracingMarkers =
      (thread.name === 'GeckoMain' ||
        thread.name === 'Compositor' ||
        thread.name === 'Renderer') &&
      processType !== 'plugin';

    return (
      <div className="timelineTrackThread">
        {displayJank ? (
          <TimelineTracingMarkersJank
            className="timelineTrackThreadIntervalMarkerOverview"
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadIndex={threadIndex}
            onSelect={this._onIntervalMarkerSelect}
          />
        ) : null}
        {displayTracingMarkers ? (
          <TimelineTracingMarkersOverview
            // Feed in the thread name to the class. This is used for conditional
            // sizing rules, for instance with GeckoMain threads.
            // TODO - This seems kind of brittle, and should probably done through
            // JavaScript and props instead.
            className={`
              timelineTrackThreadIntervalMarkerOverview
              timelineTrackThreadIntervalMarkerOverviewThread${thread.name}
            `}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadIndex={threadIndex}
            onSelect={this._onIntervalMarkerSelect}
          />
        ) : null}
        <StackGraph
          interval={interval}
          thread={thread}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          callNodeInfo={callNodeInfo}
          selectedCallNodeIndex={selectedCallNodeIndex}
          onStackClick={this._onStackClick}
        />
        <EmptyThreadIndicator
          thread={thread}
          interval={interval}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          unfilteredSamplesRange={unfilteredSamplesRange}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state: State, ownProps: OwnProps) => {
    const { threadIndex } = ownProps;
    const selectors = selectorsForThread(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const committedRange = getCommittedRange(state);
    return {
      thread: selectors.getFilteredThread(state),
      callNodeInfo: selectors.getCallNodeInfo(state),
      selectedCallNodeIndex:
        threadIndex === selectedThread
          ? selectors.getSelectedCallNodeIndex(state)
          : -1,
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      interval: getProfileInterval(state),
      rangeStart: committedRange.start,
      rangeEnd: committedRange.end,
    };
  },
  mapDispatchToProps: {
    changeSelectedThread,
    updateProfileSelection,
    changeRightClickedTrack,
    changeSelectedCallNode,
    focusCallTree,
  },
  component: TimelineTrackThread,
};
export default explicitConnect(options);
