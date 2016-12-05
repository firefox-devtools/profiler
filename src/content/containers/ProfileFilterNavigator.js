import { connect } from 'react-redux';
import * as actions from '../actions';
import { getRangeFilters } from '../selectors';
import FilterNavigatorBar from '../components/FilterNavigatorBar';

function rangeString(range) {
  return `Range: ${(range.start / 1000).toFixed(2)}s–${(range.end / 1000).toFixed(2)}s`;
}

export default connect(state => {
  const items = ['Complete Profile', ...getRangeFilters(state).map(rangeString)];
  return {
    className: 'profileFilterNavigator',
    items,
    selectedItem: items.length - 1,
  };
}, {
  onPop: actions.popRangeFiltersAndUnsetSelection,
})(FilterNavigatorBar);
