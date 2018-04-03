/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import {
  getSampleIndexClosestToTime,
  getCallNodePathFromIndex,
} from '../../profile-logic/profile-data';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import ProfileThreadJankOverview from './ProfileThreadJankOverview';
import ProfileThreadTracingMarkerOverview from './ProfileThreadTracingMarkerOverview';
import {
  changeSelectedThread,
  updateProfileSelection,
  changeRightClickedThread,
  changeSelectedCallNode,
  focusCallTree,
} from '../../actions/profile-view';
import EmptyThreadIndicator from './EmptyThreadIndicator';

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
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +isHidden: boolean,
  +isModifyingSelection: boolean,
  +style?: Object /* This is used by Reorderable */,
|};

type StateProps = {|
  +thread: Thread,
  +threadName: string,
  +processDetails: string,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +isSelected: boolean,
  +unfilteredSamplesRange: StartEndRange | null,
|};

type DispatchProps = {|
  +changeSelectedThread: typeof changeSelectedThread,
  +changeRightClickedThread: typeof changeRightClickedThread,
  +updateProfileSelection: typeof updateProfileSelection,
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class ProfileThreadHeaderBar extends PureComponent<Props> {
  constructor(props) {
    super(props);
    (this: any)._onLabelMouseDown = this._onLabelMouseDown.bind(this);
    (this: any)._onStackClick = this._onStackClick.bind(this);
    (this: any)._onLineClick = this._onLineClick.bind(this);
    (this: any)._onIntervalMarkerSelect = this._onIntervalMarkerSelect.bind(
      this
    );
  }

  _onLabelMouseDown(event: MouseEvent) {
    const {
      changeSelectedThread,
      changeRightClickedThread,
      threadIndex,
    } = this.props;
    if (event.button === 0) {
      changeSelectedThread(threadIndex);

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    } else if (event.button === 2) {
      // This is needed to allow the context menu to know what was right clicked without
      // actually changing the current selection.
      changeRightClickedThread(threadIndex);
    }
  }

  _onLineClick() {
    const { threadIndex, changeSelectedThread } = this.props;
    changeSelectedThread(threadIndex);
  }

  _onStackClick(time: number) {
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
      threadName,
      processDetails,
      isHidden,
      isModifyingSelection,
      unfilteredSamplesRange,
      style,
    } = this.props;

    if (isHidden) {
      // If this thread is hidden, render out a stub element so that the Reorderable
      // Component still works across all the threads.
      return <li className="profileThreadHeaderBarHidden" />;
    }

    const processType = thread.processType;
    const displayJank = processType !== 'plugin';
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
          <h1 className="profileThreadHeaderBarThreadName">{threadName}</h1>
        </ContextMenuTrigger>
        <div className="profileThreadHeaderBarThreadDetails">
          {displayJank ? (
            <ProfileThreadJankOverview
              className={`${className}IntervalMarkerOverview ${className}IntervalMarkerOverviewJank`}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              threadIndex={threadIndex}
              onSelect={this._onIntervalMarkerSelect}
              isModifyingSelection={isModifyingSelection}
            />
          ) : null}
          {displayTracingMarkers ? (
            <ProfileThreadTracingMarkerOverview
              className={`${className}IntervalMarkerOverview ${className}IntervalMarkerOverviewGfx ${className}IntervalMarkerOverviewThread${
                thread.name
              }`}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              threadIndex={threadIndex}
              onSelect={this._onIntervalMarkerSelect}
              isModifyingSelection={isModifyingSelection}
            />
          ) : null}
          <ThreadStackGraph
            interval={interval}
            thread={thread}
            className="threadStackGraph"
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
      </li>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state: State, ownProps: OwnProps) => {
    const { threadIndex } = ownProps;
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
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedThread,
    updateProfileSelection,
    changeRightClickedThread,
    changeSelectedCallNode,
    focusCallTree,
  },
  component: ProfileThreadHeaderBar,
};
export default explicitConnect(options);
