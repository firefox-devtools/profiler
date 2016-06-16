import React from 'react';
import { connect } from 'react-redux';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread, getSelectedThreadIndex } from '../selectors/';
import { getSampleIndexClosestToTime, getStackAsFuncArray } from '../profile-data';
import * as Actions from '../actions';

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
}, null, (stateProps, dispatchProps, ownProps) => {
  const { threadIndex, thread, funcStackInfo } = stateProps;
  const { dispatch } = dispatchProps;
  return Object.assign({}, stateProps, ownProps, {
    onMouseDown: event => {
      dispatch(Actions.changeSelectedThread(threadIndex));

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    },
    onGraphClick: time => {
      const sampleIndex = getSampleIndexClosestToTime(thread, time);
      const newSelectedStack = thread.samples.stack[sampleIndex];
      const newSelectedFuncStack = funcStackInfo.stackIndexToFuncStackIndex.get(newSelectedStack);
      dispatch(Actions.changeSelectedThread(threadIndex));
      dispatch(Actions.changeSelectedFuncStack(threadIndex,
        getStackAsFuncArray(newSelectedFuncStack, funcStackInfo.funcStackTable)));
      // TODO: scroll selected row into view
    },
  });
})(({ thread, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack, isSelected, onMouseDown, style, onGraphClick }) => (
  <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')} style={style}>
    <h1 onMouseDown={onMouseDown} className='grippy'>{thread.name}</h1>
    <ThreadStackGraph interval={interval}
               thread={thread}
               className='threadStackGraph'
               rangeStart={rangeStart}
               rangeEnd={rangeEnd}
               funcStackInfo={funcStackInfo}
               selectedFuncStack={selectedFuncStack}
               onClick={onGraphClick}/>
  </li>
));
