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
  getStackAsFuncArray,
} from '../../profile-logic/profile-data';
import {
  changeSelectedThread,
  changeSelectedStack,
} from '../../actions/profile-view';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';

import type {
  Thread,
  ThreadIndex,
  IndexIntoStackTable,
} from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { State } from '../../types/reducers';

type Props = {
  threadIndex: ThreadIndex,
  thread: Thread,
  interval: Milliseconds,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  selectedStack: IndexIntoStackTable | null,
  isSelected: boolean,
  isHidden: boolean,
  style: Object,
  threadName: string,
  processDetails: string,
  changeSelectedThread: typeof changeSelectedThread,
  changeSelectedStack: typeof changeSelectedStack,
};

class ProfileThreadHeaderBar extends PureComponent {
  props: Props;

  constructor(props: Props) {
    super(props);
    (this: any)._onLabelMouseDown = this._onLabelMouseDown.bind(this);
    (this: any)._onGraphClick = this._onGraphClick.bind(this);
    (this: any)._onMarkerSelect = this._onMarkerSelect.bind(this);
  }

  _onLabelMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      const { changeSelectedThread, threadIndex } = this.props;
      changeSelectedThread(threadIndex);

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    }
  }

  _onGraphClick(time?: number) {
    const {
      thread,
      threadIndex,
      changeSelectedThread,
      changeSelectedStack,
    } = this.props;
    changeSelectedThread(threadIndex);
    if (time !== undefined) {
      const sampleIndex = getSampleIndexClosestToTime(thread.samples, time);
      console.log(
        'getStackAsFuncArray',
        getStackAsFuncArray(thread.samples.stack[sampleIndex], thread)
      );
      changeSelectedStack(
        threadIndex,
        getStackAsFuncArray(thread.samples.stack[sampleIndex], thread)
      );
    }
  }

  _onMarkerSelect(/* markerIndex */) {}

  render() {
    const {
      thread,
      interval,
      rangeStart,
      rangeEnd,
      selectedStack,
      isSelected,
      style,
      threadName,
      processDetails,
      isHidden,
    } = this.props;
    if (isHidden) {
      // If this thread is hidden, render out a stub element so that the Reorderable
      // Component still works across all the threads.
      return <li className="profileThreadHeaderBarHidden" />;
    }
    return (
      <li
        className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')}
        style={style}
      >
        <ContextMenuTrigger
          id={'ProfileThreadHeaderContextMenu'}
          renderTag="h1"
          attributes={{
            title: processDetails,
            className: 'grippy',
            onMouseDown: this._onLabelMouseDown,
          }}
        >
          {threadName}
        </ContextMenuTrigger>
        <ThreadStackGraph
          interval={interval}
          thread={thread}
          className="threadStackGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          selectedStack={selectedStack}
          onClick={this._onGraphClick}
          onMarkerSelect={this._onMarkerSelect}
        />
      </li>
    );
  }
}

export default connect(
  (state: State, props) => {
    const threadIndex: ThreadIndex = props.index;
    const selectors = selectorsForThread(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const isSelected = threadIndex === selectedThread;
    return {
      thread: selectors.getFilteredThread(state),
      threadName: selectors.getFriendlyThreadName(state),
      processDetails: selectors.getThreadProcessDetails(state),
      selectedStack: isSelected ? selectors.getSelectedStack(state) : -1,
      isSelected,
      threadIndex,
    };
  },
  {
    changeSelectedStack,
    changeSelectedThread,
  }
)(ProfileThreadHeaderBar);
