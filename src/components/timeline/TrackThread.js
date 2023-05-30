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
import { ThreadCPUGraph } from 'firefox-profiler/components/shared/thread/CPUGraph';
import { ThreadSampleGraph } from 'firefox-profiler/components/shared/thread/SampleGraph';
import { ThreadActivityGraph } from 'firefox-profiler/components/shared/thread/ActivityGraph';

import {
  getProfileInterval,
  getCommittedRange,
  getCategories,
  getSelectedThreadIndexes,
  getTimelineType,
  getInvertCallstack,
  getThreadSelectorsFromThreadsKey,
  getMaxThreadCPUDeltaPerMs,
  getIsExperimentalCPUGraphsEnabled,
  getImplementationFilter,
} from 'firefox-profiler/selectors';
import {
  TimelineMarkersJank,
  TimelineMarkersFileIo,
  TimelineMarkersOverview,
  TimelineMarkersMemory,
} from './Markers';
import {
  updatePreviewSelection,
  changeSelectedCallNode,
  focusCallTree,
  selectLeafCallNode,
  selectRootCallNode,
} from 'firefox-profiler/actions/profile-view';
import { reportTrackThreadHeight } from 'firefox-profiler/actions/app';
import { hasThreadKeys } from 'firefox-profiler/profile-logic/profile-data';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';
import { getTrackSelectionModifiers } from 'firefox-profiler/utils';
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
  ImplementationFilter,
  IndexIntoCallNodeTable,
  SelectedState,
  State,
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
  +rangeFilteredThread: Thread,
  +filteredThread: Thread,
  +tabFilteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +unfilteredSamplesRange: StartEndRange | null,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +sampleIndexOffset: number,
  +categories: CategoryList,
  +timelineType: TimelineType,
  +hasFileIoMarkers: boolean,
  +samplesSelectedStates: null | SelectedState[],
  +invertCallstack: boolean,
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +selectedThreadIndexes: Set<ThreadIndex>,
  +enableCPUUsage: boolean,
  +isExperimentalCPUGraphsEnabled: boolean,
  +maxThreadCPUDeltaPerMs: number,
  +implementationFilter: ImplementationFilter,
|};

type DispatchProps = {|
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

class TimelineTrackThreadImpl extends PureComponent<Props> {
  /**
   * Handle when a sample is clicked in the ThreadStackGraph and in the ThreadActivityGraph.
   * This will select the leaf-most stack frame or call node.
   */
  _onSampleClick = (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable | null
  ) => {
    const modifiers = getTrackSelectionModifiers(event);
    if (modifiers.ctrlOrMeta || modifiers.shift) {
      // Do nothing, the track selection logic will kick in.
      return;
    }

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

      if (sampleIndex !== null) {
        // If the user clicked outside of the activity graph (sampleIndex === null),
        // then we don't need to focus the call tree. This action also selects
        // the call tree panel, which we don't want either in this case.
        focusCallTree();
      }
    }
    if (
      typeof threadsKey === 'number' &&
      selectedThreadIndexes.has(threadsKey)
    ) {
      // We could have multiple threads selected here, and we wouldn't want
      // to de-select one when interacting with it.
      event.stopPropagation();
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
      fullThread,
      filteredThread,
      rangeFilteredThread,
      tabFilteredThread,
      threadsKey,
      interval,
      rangeStart,
      rangeEnd,
      sampleIndexOffset,
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
      trackName,
      enableCPUUsage,
      maxThreadCPUDeltaPerMs,
      isExperimentalCPUGraphsEnabled,
      implementationFilter,
    } = this.props;

    const processType = filteredThread.processType;
    const displayJank = processType !== 'plugin';
    const displayMarkers =
      (filteredThread.name === 'GeckoMain' ||
        filteredThread.name === 'Compositor' ||
        filteredThread.name === 'Renderer' ||
        filteredThread.name === 'AndroidUI (JVM)' ||
        filteredThread.name === 'CrRendererMain' ||
        filteredThread.name === 'Merged thread' ||
        filteredThread.name.startsWith('MediaDecoderStateMachine')) &&
      processType !== 'plugin';

    return (
      <div className={classNames('timelineTrackThread', trackType)}>
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

        {(timelineType === 'category' || timelineType === 'cpu-category') &&
        !filteredThread.isJsTracer ? (
          <>
            <ThreadActivityGraph
              className="threadActivityGraph"
              trackName={trackName}
              interval={interval}
              fullThread={fullThread}
              rangeFilteredThread={rangeFilteredThread}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              sampleIndexOffset={sampleIndexOffset}
              onSampleClick={this._onSampleClick}
              categories={categories}
              samplesSelectedStates={samplesSelectedStates}
              treeOrderSampleComparator={treeOrderSampleComparator}
              enableCPUUsage={enableCPUUsage}
              maxThreadCPUDeltaPerMs={maxThreadCPUDeltaPerMs}
              implementationFilter={implementationFilter}
              timelineType={timelineType}
            />
            {trackType === 'expanded' ? (
              <ThreadSampleGraph
                className="threadSampleGraph"
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
            ) : null}
            {isExperimentalCPUGraphsEnabled &&
            rangeFilteredThread.samples.threadCPUDelta !== undefined ? (
              <ThreadCPUGraph
                className="threadCPUGraph"
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
                maxThreadCPUDeltaPerMs={maxThreadCPUDeltaPerMs}
              />
            ) : null}
          </>
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

export const TimelineTrackThread = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
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
    const fullThread = selectors.getCPUProcessedThread(state);
    const timelineType = getTimelineType(state);
    const enableCPUUsage =
      timelineType === 'cpu-category' &&
      fullThread.samples.threadCPUDelta !== undefined;

    return {
      invertCallstack: getInvertCallstack(state),
      fullThread,
      filteredThread: selectors.getFilteredThread(state),
      rangeFilteredThread: selectors.getRangeFilteredThread(state),
      tabFilteredThread: selectors.getTabFilteredThread(state),
      callNodeInfo: selectors.getCallNodeInfo(state),
      selectedCallNodeIndex,
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      interval: getProfileInterval(state),
      rangeStart: committedRange.start,
      rangeEnd: committedRange.end,
      sampleIndexOffset:
        selectors.getSampleIndexOffsetFromCommittedRange(state),
      categories: getCategories(state),
      timelineType,
      hasFileIoMarkers:
        selectors.getTimelineFileIoMarkerIndexes(state).length !== 0,
      samplesSelectedStates:
        selectors.getSamplesSelectedStatesInFilteredThread(state),
      treeOrderSampleComparator:
        selectors.getTreeOrderComparatorInFilteredThread(state),
      selectedThreadIndexes,
      enableCPUUsage,
      isExperimentalCPUGraphsEnabled: getIsExperimentalCPUGraphsEnabled(state),
      maxThreadCPUDeltaPerMs: getMaxThreadCPUDeltaPerMs(state),
      implementationFilter: getImplementationFilter(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    changeSelectedCallNode,
    focusCallTree,
    selectLeafCallNode,
    selectRootCallNode,
    reportTrackThreadHeight,
  },
  component: withSize<Props>(TimelineTrackThreadImpl),
});
