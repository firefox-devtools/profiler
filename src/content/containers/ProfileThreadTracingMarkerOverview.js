import { connect } from 'react-redux';
import IntervalMarkerOverview from '../components/IntervalMarkerOverview';
import { selectorsForThread } from '../reducers/profile-view';
import { styles, overlayFills } from '../interval-marker-styles';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  return {
    intervalMarkers: selectors.getRangeSelectionFilteredTracingMarkers(state),
    threadName: selectors.getThread(state).name,
    styles,
    overlayFills,
  };
})(IntervalMarkerOverview);
