import { connect } from 'react-redux';
import * as actions from '../actions';
import { getSelectedThreadIndex, selectedThreadSelectors, getCallTreeFilters } from '../selectors';
import FilterNavigatorBar from '../components/FilterNavigatorBar';

import './ProfileCallTreeFilterNavigator.css';

function filterString(filter, { funcTable, stringTable }) {
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
}

export default connect((state, props) => {
  const thread = selectedThreadSelectors.getFilteredThread(state, props);
  const callTreeFilters = getCallTreeFilters(state, props);
  const items = ['Complete Thread', ...callTreeFilters.map(f => filterString(f, thread))];
  return {
    className: 'profileCallTreeFilterNavigator',
    items,
    selectedItem: items.length - 1,
    threadIndex: getSelectedThreadIndex(state, props),
  };
}, actions, (stateProps, dispatchProps, ownProps) => ({
  className: stateProps.className,
  items: stateProps.items,
  selectedItem: stateProps.selectedItem,
  onPop: i => dispatchProps.popCallTreeFilters(stateProps.threadIndex, i, ownProps.location),
}))(FilterNavigatorBar);
