import { connect } from 'react-redux';
import IntervalMarkerTimeline from '../components/IntervalMarkerTimeline';
import { selectorsForThread } from '../selectors/';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  const threadName = selectors.getThread(state).name;
  return {
    intervalMarkers: selectors.getJankInstances(state),
    threadName,
  };
})(IntervalMarkerTimeline);
