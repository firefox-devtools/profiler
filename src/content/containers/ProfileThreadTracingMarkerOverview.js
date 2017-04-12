import { connect } from 'react-redux';
import IntervalMarkerOverview from '../components/IntervalMarkerOverview';
import { selectorsForThread } from '../reducers/profile-view';
import { styles, overlayFills } from '../interval-marker-styles';
import { getSelectedThreadIndex } from '../reducers/url-state';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  const selectedThread = getSelectedThreadIndex(state);
  return {
    intervalMarkers: selectors.getRangeSelectionFilteredTracingMarkers(state),
    threadName: selectors.getThread(state).name,
    isSelected: threadIndex === selectedThread,
    styles,
    overlayFills,
  };
})(IntervalMarkerOverview);
