/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import { withSize, type SizeProps } from '../shared/WithSize';
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
  getInvertCallstack,
  getTimelineTrackOrganization,
} from '../../selectors/url-state';
import {
  TimelineMarkersJank,
  TimelineMarkersFileIo,
  TimelineMarkersOverview,
  TimelineMarkersMemory,
} from './Markers';
import {
  updatePreviewSelection,
  changeRightClickedTrack,
  changeSelectedCallNode,
  focusCallTree,
  selectLeafCallNode,
  selectRootCallNode,
} from '../../actions/profile-view';
import { reportTrackThreadHeight } from '../../actions/app';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import './TrackThread.css';

import type {
  TimelineType,
  Thread,
  ThreadIndex,
  CategoryList,
  IndexIntoSamplesTable,
  Milliseconds,
  StartEndRange,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  SelectedState,
  State,
  TimelineTrackOrganization,
} from 'firefox-profiler/types';

import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  +trackType: 'expanded' | 'condensed',
  +showMemoryMarkers?: boolean,
|};

type StateProps = {|
  +fullThread: Thread,
  +filteredThread: Thread,
  +tabFilteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +unfilteredSamplesRange: StartEndRange | null,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +categories: CategoryList,
  +timelineType: TimelineType,
  +hasFileIoMarkers: boolean,
  +samplesSelectedStates: null | SelectedState[],
  +invertCallstack: boolean,
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +timelineTrackOrganization: TimelineTrackOrganization,
|};

type DispatchProps = {|
  +changeRightClickedTrack: typeof changeRightClickedTrack,
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
  +selectLeafCallNode: typeof selectLeafCallNode,
  +selectRootCallNode: typeof selectRootCallNode,
  +reportTrackThreadHeight: typeof reportTrackThreadHeight,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
|};

class TimelineTrackThread extends PureComponent<Props> {
  /**
   * Handle when a sample is clicked in the ThreadStackGraph and in the ThreadActivityGraph.
   * This will select the leaf-most stack frame or call node.
   */
  _onSampleClick = (sampleIndex: IndexIntoSamplesTable) => {
    const {
      threadIndex,
      selectLeafCallNode,
      selectRootCallNode,
      focusCallTree,
      invertCallstack,
    } = this.props;
    /**
     * When we're displaying the inverted call stack, the "leaf" call node we're
     * interested in is actually displayed as the "root" of the tree.
     */
    if (invertCallstack) {
      selectRootCallNode(threadIndex, sampleIndex);
    } else {
      selectLeafCallNode(threadIndex, sampleIndex);
    }
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

  componentDidUpdate() {
    const { threadIndex, height, reportTrackThreadHeight } = this.props;
    // Most likely this track height shouldn't change, but if it does, report it.
    // The action will only dispatch on changed values.
    reportTrackThreadHeight(threadIndex, height);
  }

  render() {
    const {
      filteredThread,
      fullThread,
      tabFilteredThread,
      threadIndex,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      unfilteredSamplesRange,
      categories,
      timelineType,
      hasFileIoMarkers,
      showMemoryMarkers,
      samplesSelectedStates,
      treeOrderSampleComparator,
      trackType,
      timelineTrackOrganization,
    } = this.props;

    const processType = filteredThread.processType;
    const displayJank = processType !== 'plugin';
    const displayMarkers =
      (filteredThread.name === 'GeckoMain' ||
        filteredThread.name === 'Compositor' ||
        filteredThread.name === 'Renderer' ||
        filteredThread.name === 'Java Main Thread' ||
        filteredThread.name.startsWith('MediaDecoderStateMachine')) &&
      processType !== 'plugin';

    return (
      <div className="timelineTrackThread">
        {timelineTrackOrganization.type !== 'active-tab' ? (
          <>
            {showMemoryMarkers ? (
              <TimelineMarkersMemory
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadIndex={threadIndex}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {hasFileIoMarkers ? (
              <TimelineMarkersFileIo
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
          </>
        ) : null}
        {timelineType === 'category' && !filteredThread.isJsTracer ? (
          <ThreadActivityGraph
            className="threadActivityGraph"
            interval={interval}
            fullThread={fullThread}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onSampleClick={this._onSampleClick}
            categories={categories}
            samplesSelectedStates={samplesSelectedStates}
            treeOrderSampleComparator={treeOrderSampleComparator}
          />
        ) : (
          <ThreadStackGraph
            className="threadStackGraph"
            interval={interval}
            thread={filteredThread}
            tabFilteredThread={tabFilteredThread}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            callNodeInfo={callNodeInfo}
            selectedCallNodeIndex={selectedCallNodeIndex}
            categories={categories}
            onSampleClick={this._onSampleClick}
          />
        )}
        {timelineTrackOrganization.type === 'active-tab' ? (
          <div className="timelineTrackThreadMarkers">
            {trackType === 'expanded' && showMemoryMarkers ? (
              <TimelineMarkersMemory
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadIndex={threadIndex}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {trackType === 'expanded' && hasFileIoMarkers ? (
              <TimelineMarkersFileIo
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
            {trackType === 'expanded' && displayMarkers ? (
              <TimelineMarkersOverview
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadIndex={threadIndex}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
          </div>
        ) : null}
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

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state: State, ownProps: OwnProps) => {
    const { threadIndex } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const committedRange = getCommittedRange(state);
    const selectedCallNodeIndex =
      threadIndex === selectedThread
        ? selectors.getSelectedCallNodeIndex(state)
        : null;
    return {
      invertCallstack: getInvertCallstack(state),
      filteredThread: selectors.getFilteredThread(state),
      fullThread: selectors.getRangeFilteredThread(state),
      tabFilteredThread: selectors.getTabFilteredThread(state),
      callNodeInfo: selectors.getCallNodeInfo(state),
      selectedCallNodeIndex,
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      interval: getProfileInterval(state),
      rangeStart: committedRange.start,
      rangeEnd: committedRange.end,
      categories: getCategories(state),
      timelineType: getTimelineType(state),
      hasFileIoMarkers:
        selectors.getFileIoMarkerIndexesForHeader(state).length !== 0,
      samplesSelectedStates: selectors.getSamplesSelectedStatesInFilteredThread(
        state
      ),
      treeOrderSampleComparator: selectors.getTreeOrderComparatorInFilteredThread(
        state
      ),
      timelineTrackOrganization: getTimelineTrackOrganization(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    changeRightClickedTrack,
    changeSelectedCallNode,
    focusCallTree,
    selectLeafCallNode,
    selectRootCallNode,
    reportTrackThreadHeight,
  },
  component: withSize<Props>(TimelineTrackThread),
});
