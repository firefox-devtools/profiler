import { connect } from 'react-redux';
import * as actions from '../actions';
import { selectedThreadSelectors } from '../reducers/profile-view';
import { getSelectedThreadIndex } from '../reducers/url-state';
import FilterNavigatorBar from '../components/FilterNavigatorBar';
import { weakMemoize } from '../utils';

import './ProfileCallTreeFilterNavigator.css';

const getCallTreeFilterLabels = weakMemoize((callTreeFilters, thread) => {
  const { funcTable, stringTable } = thread;
  const labels = callTreeFilters.map(filter => {
    function lastFuncString(funcArray) {
      const lastFunc = funcArray[funcArray.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }
    switch (filter.type) {
      case 'prefix':
        return lastFuncString(filter.prefixFuncs);
      case 'postfix':
        return lastFuncString(filter.postfixFuncs);
      default:
        throw new Error('Unexpected filter type');
    }
  });
  labels.unshift('Complete Thread');
  return labels;
});

export default connect(state => {
  const items = getCallTreeFilterLabels(
    selectedThreadSelectors.getCallTreeFilters(state),
    selectedThreadSelectors.getThread(state),
  );
  return {
    className: 'profileCallTreeFilterNavigator',
    items,
    selectedItem: items.length - 1,
    threadIndex: getSelectedThreadIndex(state),
  };
}, actions, (stateProps, dispatchProps) => ({
  className: stateProps.className,
  items: stateProps.items,
  selectedItem: stateProps.selectedItem,
  onPop: i => dispatchProps.popCallTreeFilters(stateProps.threadIndex, i),
}))(FilterNavigatorBar);
