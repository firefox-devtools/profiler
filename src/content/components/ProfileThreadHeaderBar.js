/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread } from '../reducers/profile-view';
import { getSelectedThreadIndex } from '../reducers/url-state';
import { getSampleIndexClosestToTime, getStackAsFuncArray } from '../profile-data';
import actions from '../actions';
import { ContextMenuTrigger } from 'react-contextmenu';

class ProfileThreadHeaderBar extends PureComponent {

  constructor(props) {
    super(props);
    this._onLabelMouseDown = this._onLabelMouseDown.bind(this);
    this._onGraphClick = this._onGraphClick.bind(this);
    this._onMarkerSelect = this._onMarkerSelect.bind(this);
  }

  _onLabelMouseDown(event) {
    if (event.button === 0) {
      const { changeSelectedThread, threadIndex } = this.props;
      changeSelectedThread(threadIndex);

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    }
  }

  _onGraphClick(time) {
    const { threadIndex, changeSelectedThread } = this.props;
    changeSelectedThread(threadIndex);
    if (time !== undefined) {
      const { thread, funcStackInfo, changeSelectedFuncStack } = this.props;
      const sampleIndex = getSampleIndexClosestToTime(thread.samples, time);
      const newSelectedStack = thread.samples.stack[sampleIndex];
      const newSelectedFuncStack = newSelectedStack === null ? -1 : funcStackInfo.stackIndexToFuncStackIndex[newSelectedStack];
      changeSelectedFuncStack(threadIndex,
        getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable));
    }
  }

  _onMarkerSelect(/* markerIndex */) {
  }

  render() {
    const {
      thread, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack,
      isSelected, style, threadName, processDetails,
    } = this.props;

    return (
      <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')} style={style}>
        <ContextMenuTrigger id={'ProfileThreadHeaderContextMenu'}
                            renderTag='h1'
                            attributes={{
                              title: processDetails,
                              className: 'grippy',
                              // Capture to bypass the context menu.
                              onMouseDownCapture: this._onLabelMouseDown,
                            }}>
          {threadName}
        </ContextMenuTrigger>
        <ThreadStackGraph interval={interval}
                          thread={thread}
                          className='threadStackGraph'
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                          funcStackInfo={funcStackInfo}
                          selectedFuncStack={selectedFuncStack}
                          onClick={this._onGraphClick}
                          onMarkerSelect={this._onMarkerSelect}/>
      </li>
    );
  }

}

ProfileThreadHeaderBar.propTypes = {
  threadIndex: PropTypes.number.isRequired,
  thread: PropTypes.object.isRequired,
  funcStackInfo: PropTypes.object.isRequired,
  changeSelectedThread: PropTypes.func.isRequired,
  changeSelectedFuncStack: PropTypes.func.isRequired,
  interval: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  selectedFuncStack: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  style: PropTypes.object,
  threadName: PropTypes.string,
  processDetails: PropTypes.string,
};

export default connect((state, props) => {
  const threadIndex = props.index;
  const selectors = selectorsForThread(threadIndex);
  const selectedThread = getSelectedThreadIndex(state);
  return {
    thread: selectors.getFilteredThread(state),
    threadName: selectors.getFriendlyThreadName(state),
    processDetails: selectors.getThreadProcessDetails(state),
    funcStackInfo: selectors.getFuncStackInfo(state),
    selectedFuncStack: threadIndex === selectedThread ? selectors.getSelectedFuncStack(state) : -1,
    isSelected: threadIndex === selectedThread,
    threadIndex,
  };
}, actions)(ProfileThreadHeaderBar);
