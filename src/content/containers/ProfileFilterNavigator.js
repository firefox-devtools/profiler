import { connect } from 'react-redux';
import actions from '../actions';
import { getRangeFilterLabels } from '../reducers/url-state';
import FilterNavigatorBar from '../components/FilterNavigatorBar';

export default connect(state => {
  const items = getRangeFilterLabels(state);
  return {
    className: 'profileFilterNavigator',
    items: items,
    selectedItem: items.length - 1,
  };
}, {
  onPop: actions.popRangeFiltersAndUnsetSelection,
})(FilterNavigatorBar);
