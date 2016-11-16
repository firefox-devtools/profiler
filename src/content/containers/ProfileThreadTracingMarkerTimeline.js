import { connect } from 'react-redux';
import IntervalMarkerTimeline from '../components/IntervalMarkerTimeline';
import { selectorsForThread } from '../selectors/';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  return {
    intervalMarkers: selectors.getTracingMarkers(state, props),
    threadName: selectors.getThread(state, props).name,
  };
})(IntervalMarkerTimeline);
