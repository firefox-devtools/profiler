/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import {
  getSampleIndexClosestToTime,
  getCallNodePath,
} from '../../profile-logic/profile-data';
import actions from '../../actions';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import ProfileThreadJankOverview from './ProfileThreadJankOverview';
import ProfileThreadTracingMarkerOverview from './ProfileThreadTracingMarkerOverview';

import type { Thread, ThreadIndex } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type {
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { State } from '../../types/reducers';

import { updateProfileSelection } from '../../actions/profile-view';

type Props = {
  threadIndex: ThreadIndex,
  thread: Thread,
  callNodeInfo: CallNodeInfo,
  interval: Milliseconds,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  selectedCallNodeIndex: IndexIntoCallNodeTable,
  isSelected: boolean,
  isHidden: boolean,
  isModifyingSelection: boolean,
  style: Object,
  threadName: string,
  processDetails: string,
  changeSelectedThread: ThreadIndex => void,
  updateProfileSelection: typeof updateProfileSelection,
  changeSelectedCallNode: (IndexIntoCallNodeTable, CallNodePath) => void,
};

class ProfileThreadHeaderBar extends PureComponent<Props> {
  constructor(props) {
    super(props);
    (this: any)._onLabelMouseDown = this._onLabelMouseDown.bind(this);
    (this: any)._onGraphClick = this._onGraphClick.bind(this);
    (this: any)._onLineClick = this._onLineClick.bind(this);
    (this: any)._onMarkerSelect = this._onMarkerSelect.bind(this);
    (this: any)._onIntervalMarkerSelect = this._onIntervalMarkerSelect.bind(
      this
    );
  }

  _onLabelMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      const { changeSelectedThread, threadIndex } = this.props;
      changeSelectedThread(threadIndex);

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    }
  }

  _onLineClick() {
    const { threadIndex, changeSelectedThread } = this.props;
    changeSelectedThread(threadIndex);
  }

  _onGraphClick(time: number) {
    const { threadIndex, interval } = this.props;
    if (time !== undefined) {
      const { thread, callNodeInfo, changeSelectedCallNode } = this.props;
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
        getCallNodePath(newSelectedCallNode, callNodeInfo.callNodeTable)
      );
    }
  }

  _onIntervalMarkerSelect(
    threadIndex: ThreadIndex,
    start: Milliseconds,
    end: Milliseconds
  ) {
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
  }

  _onMarkerSelect(/* markerIndex */) {}

  render() {
    const {
      thread,
      threadIndex,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      isSelected,
      style,
      threadName,
      processDetails,
      isHidden,
      isModifyingSelection,
    } = this.props;

    if (isHidden) {
      // If this thread is hidden, render out a stub element so that the Reorderable
      // Component still works across all the threads.
      return <li className="profileThreadHeaderBarHidden" />;
    }

    const processType = thread.processType;
    const displayJank = thread.name === 'GeckoMain' && processType !== 'plugin';
    const displayTracingMarkers =
      (thread.name === 'GeckoMain' ||
        thread.name === 'Compositor' ||
        thread.name === 'Renderer') &&
      processType !== 'plugin';
    const className = 'profileThreadHeaderBar';

    return (
      <li
        className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')}
        onClick={this._onLineClick}
        style={style}
      >
        <ContextMenuTrigger
          id={'ProfileThreadHeaderContextMenu'}
          renderTag="div"
          attributes={{
            title: processDetails,
            className: 'grippy profileThreadHeaderBarThreadLabel',
            onMouseDown: this._onLabelMouseDown,
          }}
        >
          <h1 className="profileThreadHeaderBarThreadName">
            {threadName}
          </h1>
        </ContextMenuTrigger>
        <div className="profileThreadHeaderBarThreadDetails">
          {displayJank
            ? <ProfileThreadJankOverview
                className={`${className}IntervalMarkerOverview ${className}IntervalMarkerOverviewJank`}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadIndex={threadIndex}
                onSelect={this._onIntervalMarkerSelect}
                isModifyingSelection={isModifyingSelection}
              />
            : null}
          {displayTracingMarkers
            ? <ProfileThreadTracingMarkerOverview
                className={`${className}IntervalMarkerOverview ${className}IntervalMarkerOverviewGfx ${className}IntervalMarkerOverviewThread${thread.name}`}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                threadIndex={threadIndex}
                onSelect={this._onIntervalMarkerSelect}
                isModifyingSelection={isModifyingSelection}
              />
            : null}
          <ThreadStackGraph
            interval={interval}
            thread={thread}
            className="threadStackGraph"
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            callNodeInfo={callNodeInfo}
            selectedCallNodeIndex={selectedCallNodeIndex}
            onClick={this._onGraphClick}
            onMarkerSelect={this._onMarkerSelect}
          />
        </div>
      </li>
    );
  }
}

export default connect((state: State, props) => {
  const threadIndex: ThreadIndex = props.index;
  const selectors = selectorsForThread(threadIndex);
  const selectedThread = getSelectedThreadIndex(state);
  return {
    thread: selectors.getFilteredThread(state),
    threadName: selectors.getFriendlyThreadName(state),
    processDetails: selectors.getThreadProcessDetails(state),
    callNodeInfo: selectors.getCallNodeInfo(state),
    selectedCallNodeIndex:
      threadIndex === selectedThread
        ? selectors.getSelectedCallNodeIndex(state)
        : -1,
    isSelected: threadIndex === selectedThread,
    threadIndex,
  };
}, actions)(ProfileThreadHeaderBar);
