import React from 'react';
import { connect } from 'react-redux';
import ThreadStackGraph from './ThreadStackGraph';
import { selectorsForThread, getSelectedThreadIndex } from '../selectors/';
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
  const { threadIndex } = stateProps;
  const { dispatch } = dispatchProps;
  return Object.assign({}, stateProps, ownProps, {
    onMouseDown: event => {
      dispatch(Actions.changeSelectedThread(threadIndex));

      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
    },
  });
})(({ thread, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack, isSelected, onMouseDown, style }) => (
  <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')} style={style}>
    <h1 onMouseDown={onMouseDown} className='grippy'>{thread.name}</h1>
    <ThreadStackGraph interval={interval}
               thread={thread}
               className='threadStackGraph'
               rangeStart={rangeStart}
               rangeEnd={rangeEnd}
               funcStackInfo={funcStackInfo}
               selectedFuncStack={selectedFuncStack}/>
  </li>
));
