/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  withSize,
  type SizeProps,
} from 'firefox-profiler/components/shared/WithSize';
import { ThreadStackGraph } from 'firefox-profiler/components/shared/thread/StackGraph';
import { ThreadActivityGraph } from 'firefox-profiler/components/shared/thread/ActivityGraph';

import {
  getProfileInterval,
  getCommittedRange,
  getCategories,
  getSelectedThreadIndexes,
  getTimelineType,
  getInvertCallstack,
  getTimelineTrackOrganization,
  getThreadSelectorsFromThreadsKey,
} from 'firefox-profiler/selectors';
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
} from 'firefox-profiler/actions/profile-view';
import { reportTrackThreadHeight } from 'firefox-profiler/actions/app';
import { hasThreadKeys } from 'firefox-profiler/profile-logic/profile-data';
import EmptyThreadIndicator from './EmptyThreadIndicator';
import { getTrackSelectionModifier } from 'firefox-profiler/utils';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
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
  ThreadsKey,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  +threadsKey: ThreadsKey,
  +trackType: 'expanded' | 'condensed',
  +showMemoryMarkers?: boolean,
  +trackName: string,
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
  +selectedThreadIndexes: Set<ThreadIndex>,
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
  _onSampleClick = (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable
  ) => {
    const modifier = getTrackSelectionModifier(event);
    switch (modifier) {
      case 'none': {
        const {
          threadsKey,
          selectLeafCallNode,
          selectRootCallNode,
          focusCallTree,
          invertCallstack,
          selectedThreadIndexes,
        } = this.props;

        // Sample clicking only works for one thread. See issue #2709
        if (selectedThreadIndexes.size === 1) {
          if (invertCallstack) {
            // When we're displaying the inverted call stack, the "leaf" call node we're
            // interested in is actually displayed as the "root" of the tree.
            selectRootCallNode(threadsKey, sampleIndex);
          } else {
            selectLeafCallNode(threadsKey, sampleIndex);
          }
          focusCallTree();
        }
        if (
          typeof threadsKey === 'number' &&
          selectedThreadIndexes.has(threadsKey)
        ) {
          // We could have multiple threads selected here, and we wouldn't want
          // to de-select one when interacting with it.
          event.stopPropagation();
        }
        break;
      }
      case 'ctrl':
        // Do nothing, the track selection logic will kick in.
        break;
      default:
        assertExhaustiveCheck(modifier, 'Unhandled modifier case.');
        break;
    }
  };

  _onMarkerSelect = (start: Milliseconds, end: Milliseconds) => {
    const { rangeStart, rangeEnd, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(rangeStart, start),
      selectionEnd: Math.min(rangeEnd, end),
    });
  };

  componentDidUpdate() {
    const { threadsKey, height, reportTrackThreadHeight } = this.props;
    // Most likely this track height shouldn't change, but if it does, report it.
    // The action will only dispatch on changed values.
    reportTrackThreadHeight(threadsKey, height);
  }

  render() {
    const {
      filteredThread,
      fullThread,
      tabFilteredThread,
      threadsKey,
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
      trackName,
    } = this.props;

    const processType = filteredThread.processType;
    const displayJank = processType !== 'plugin';
    const displayMarkers =
      (filteredThread.name === 'GeckoMain' ||
        filteredThread.name === 'Compositor' ||
        filteredThread.name === 'Renderer' ||
        filteredThread.name === 'Java Main Thread' ||
        filteredThread.name === 'Merged thread' ||
        filteredThread.name.startsWith('MediaDecoderStateMachine')) &&
      processType !== 'plugin';

    return (
      <div className={classNames('timelineTrackThread', trackType)}>
        {timelineTrackOrganization.type !== 'active-tab' ? (
          <>
            {showMemoryMarkers ? (
              <TimelineMarkersMemory
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {hasFileIoMarkers ? (
              <TimelineMarkersFileIo
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {displayJank ? (
              <TimelineMarkersJank
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {displayMarkers ? (
              <TimelineMarkersOverview
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
          </>
        ) : null}
        {timelineType === 'category' && !filteredThread.isJsTracer ? (
          <ThreadActivityGraph
            className="threadActivityGraph"
            trackName={trackName}
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
            trackName={trackName}
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
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {trackType === 'expanded' && hasFileIoMarkers ? (
              <TimelineMarkersFileIo
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {displayJank ? (
              <TimelineMarkersJank
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
                onSelect={this._onMarkerSelect}
              />
            ) : null}
            {trackType === 'expanded' && displayMarkers ? (
              <TimelineMarkersOverview
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadsKey={threadsKey}
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

/**
 * Memoize the hasThreadKeys to not compute it all the time.
 */
const _getTimelineIsSelected = memoize(
  (selectedThreads, threadsKey) => hasThreadKeys(selectedThreads, threadsKey),
  { limit: 1 }
);

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state: State, ownProps: OwnProps) => {
    const { threadsKey } = ownProps;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreadIndexes = getSelectedThreadIndexes(state);
    const committedRange = getCommittedRange(state);
    const selectedCallNodeIndex = _getTimelineIsSelected(
      selectedThreadIndexes,
      threadsKey
    )
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
        selectors.getTimelineFileIoMarkerIndexes(state).length !== 0,
      samplesSelectedStates: selectors.getSamplesSelectedStatesInFilteredThread(
        state
      ),
      treeOrderSampleComparator: selectors.getTreeOrderComparatorInFilteredThread(
        state
      ),
      timelineTrackOrganization: getTimelineTrackOrganization(state),
      selectedThreadIndexes,
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
