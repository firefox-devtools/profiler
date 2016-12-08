import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread, getSelectedThreadIndex } from '../selectors/';
import { getSampleIndexClosestToTime, getStackAsFuncArray } from '../profile-data';
import * as actions from '../actions';

class ProfileThreadHeaderBar extends Component {

  constructor(props) {
    super(props);
    this._onLabelMouseDown = this._onLabelMouseDown.bind(this);
    this._onGraphClick = this._onGraphClick.bind(this);
  }

  _onLabelMouseDown(e) {
    const { changeSelectedThread, threadIndex } = this.props;
    changeSelectedThread(threadIndex);

    // Don't allow clicks on the threads list to steal focus from the tree view.
    e.preventDefault();
  }

  _onGraphClick(time) {
    const { thread, threadIndex, funcStackInfo, changeSelectedThread, changeSelectedFuncStack } = this.props;
    const sampleIndex = getSampleIndexClosestToTime(thread.samples, time);
    const newSelectedStack = thread.samples.stack[sampleIndex];
    const newSelectedFuncStack = newSelectedStack === null ? -1 : funcStackInfo.stackIndexToFuncStackIndex[newSelectedStack];
    changeSelectedThread(threadIndex);
    changeSelectedFuncStack(threadIndex,
      getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable));
  }

  render() {
    const { thread, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack, isSelected, style } = this.props;
    const title = thread.processType ? `${thread.name} [${thread.processType}]` : thread.name;
    return (
      <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')} style={style}>
        <h1 onMouseDown={this._onLabelMouseDown} className='grippy' title={title}>{title}</h1>
        <ThreadStackGraph interval={interval}
                   thread={thread}
                   className='threadStackGraph'
                   rangeStart={rangeStart}
                   rangeEnd={rangeEnd}
                   funcStackInfo={funcStackInfo}
                   selectedFuncStack={selectedFuncStack}
                   onClick={this._onGraphClick}/>
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
};

export default connect((state, props) => {
  const threadIndex = props.index;
  const selectors = selectorsForThread(threadIndex);
  const selectedThread = getSelectedThreadIndex(state);
  return {
    thread: selectors.getFilteredThread(state),
    funcStackInfo: selectors.getFuncStackInfo(state),
    selectedFuncStack: threadIndex === selectedThread ? selectors.getSelectedFuncStack(state) : -1,
    isSelected: threadIndex === selectedThread,
    threadIndex,
  };
}, actions)(ProfileThreadHeaderBar);
