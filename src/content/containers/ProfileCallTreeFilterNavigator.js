import { connect } from 'react-redux';
import * as actions from '../actions';
import { selectedThreadSelectors } from '../reducers/profile-view';
import { getSelectedThreadIndex } from '../reducers/url-state';
import FilterNavigatorBar from '../components/FilterNavigatorBar';

import './ProfileCallTreeFilterNavigator.css';

export default connect(state => {
  const items = selectedThreadSelectors.getCallTreeFilterLabels(state);
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
