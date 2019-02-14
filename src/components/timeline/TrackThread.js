/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import ThreadStackGraph from '../shared/thread/StackGraph';
import ThreadActivityGraph from '../shared/thread/ActivityGraph';
import {
  getProfileInterval,
  getCommittedRange,
  getCategories,
} from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';

import {
  getSelectedThreadIndex,
  getTimelineType,
} from '../../selectors/url-state';
import {
  TimelineMarkersJank,
  TimelineMarkersDiskIo,
  TimelineMarkersOverview,
} from './Markers';
import {
  updatePreviewSelection,
  changeRightClickedTrack,
  changeSelectedCallNode,
  focusCallTree,
  selectLeafCallNode,
} from '../../actions/profile-view';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import './TrackThread.css';

import type { TimelineType } from '../../types/actions';
import type {
  Thread,
  ThreadIndex,
  CategoryList,
  IndexIntoSamplesTable,
} from '../../types/profile';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { State } from '../../types/state';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  +threadIndex: ThreadIndex,
|};

type StateProps = {|
  +fullThread: Thread,
  +filteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +unfilteredSamplesRange: StartEndRange | null,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +categories: CategoryList,
  +timelineType: TimelineType,
  +hasDiskIoMarkers: boolean,
|};

type DispatchProps = {|
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
  +selectLeafCallNode: typeof selectLeafCallNode,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class TimelineTrackThread extends PureComponent<Props> {
  /**
   * Handle when a sample is clicked in the ThreadStackGraph. This will select
   * the leaf-most stack frame or call node.
   */
  _onSampleClick = (sampleIndex: IndexIntoSamplesTable) => {
    const { threadIndex, selectLeafCallNode, focusCallTree } = this.props;
    selectLeafCallNode(threadIndex, sampleIndex);
    focusCallTree();
  };

  _onMarkerSelect = (
    threadIndex: ThreadIndex,
    start: Milliseconds,
    end: Milliseconds
  ) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  render() {
    const {
      filteredThread,
      fullThread,
      threadIndex,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      unfilteredSamplesRange,
      categories,
      timelineType,
      hasDiskIoMarkers,
    } = this.props;

    const processType = filteredThread.processType;
    const displayJank = processType !== 'plugin';
    const displayMarkers =
      (filteredThread.name === 'GeckoMain' ||
        filteredThread.name === 'Compositor' ||
        filteredThread.name === 'Renderer') &&
      processType !== 'plugin';

    return (
      <div className="timelineTrackThread">
        {hasDiskIoMarkers ? (
          <TimelineMarkersDiskIo
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadIndex={threadIndex}
            onSelect={this._onMarkerSelect}
          />
        ) : null}
        {displayJank ? (
          <TimelineMarkersJank
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadIndex={threadIndex}
            onSelect={this._onMarkerSelect}
          />
        ) : null}
        {displayMarkers ? (
          <TimelineMarkersOverview
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            threadIndex={threadIndex}
            onSelect={this._onMarkerSelect}
          />
        ) : null}
        {timelineType === 'category' ? (
          <ThreadActivityGraph
            className="threadActivityGraph"
            interval={interval}
            fullThread={fullThread}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onSampleClick={this._onSampleClick}
            categories={categories}
          />
        ) : (
          <ThreadStackGraph
            className="threadStackGraph"
            interval={interval}
            thread={filteredThread}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            callNodeInfo={callNodeInfo}
            selectedCallNodeIndex={selectedCallNodeIndex}
            categories={categories}
            onSampleClick={this._onSampleClick}
          />
        )}
        <EmptyThreadIndicator
          thread={filteredThread}
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
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const committedRange = getCommittedRange(state);
    return {
      filteredThread: selectors.getFilteredThread(state),
      fullThread: selectors.getRangeFilteredThread(state),
      callNodeInfo: selectors.getCallNodeInfo(state),
      selectedCallNodeIndex:
        threadIndex === selectedThread
          ? selectors.getSelectedCallNodeIndex(state)
          : -1,
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      interval: getProfileInterval(state),
      rangeStart: committedRange.start,
      rangeEnd: committedRange.end,
      categories: getCategories(state),
      timelineType: getTimelineType(state),
      hasDiskIoMarkers: selectors.getDiskIoMarkers(state).length !== 0,
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    changeRightClickedTrack,
    changeSelectedCallNode,
    focusCallTree,
    selectLeafCallNode,
  },
  component: TimelineTrackThread,
};
export default explicitConnect(options);
