import { connect } from 'react-redux';
import * as actions from '../actions';
import { getRangeFilters } from '../selectors';
import FilterNavigatorBar from '../components/FilterNavigatorBar';

function rangeString(range) {
  return `Range: ${(range.start / 1000).toFixed(2)}s–${(range.end / 1000).toFixed(2)}s`;
}

export default connect((state, props) => {
  const items = ['Complete Profile', ...getRangeFilters(state, props).map(rangeString)];
  return {
    className: 'profileFilterNavigator',
    items,
    selectedItem: items.length - 1,
  };
}, actions, (stateProps, dispatchProps, ownProps) => ({
  className: stateProps.className,
  items: stateProps.items,
  selectedItem: stateProps.selectedItem,
  onPop: i => dispatchProps.popRangeFiltersAndUnsetSelection(i, ownProps.location),
}))(FilterNavigatorBar);
