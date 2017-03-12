import { connect } from 'react-redux';
import * as actions from '../actions';
import { getRangeFilters } from '../reducers/url-state';
import FilterNavigatorBar from '../components/FilterNavigatorBar';
import { weakMemoize } from '../utils';

const getRangeFilterLabels = weakMemoize(rangeFilters => {
  const labels = rangeFilters.map(range => {
    return `Range: ${(range.start / 1000).toFixed(2)}s–${(range.end / 1000).toFixed(2)}s`;
  });
  labels.unshift('Complete Profile');
  return labels;
});

export default connect(state => {
  const items = getRangeFilterLabels(getRangeFilters(state));
  return {
    className: 'profileFilterNavigator',
    items: items,
    selectedItem: items.length - 1,
  };
}, {
  onPop: actions.popRangeFiltersAndUnsetSelection,
})(FilterNavigatorBar);
