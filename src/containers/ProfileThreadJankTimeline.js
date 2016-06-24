import { connect } from 'react-redux';
import JankTimeline from '../components/JankTimeline';
import { selectorsForThread } from '../selectors/';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  return {
    jankInstances: selectors.getJankInstances(state, props),
    threadName: selectors.getThread(state, props).name,
  };
})(JankTimeline);
