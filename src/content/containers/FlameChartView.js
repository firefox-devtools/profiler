import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import FlameChartViewport from '../components/FlameChartViewport';
import { getSelectedThreadIndex, selectedThreadSelectors, getDisplayRange, getProfileInterval } from '../selectors/';
import * as actions from '../actions';
import ProfileCallTreeSettings from '../components/ProfileCallTreeSettings';

require('./FlameChartView.css');

const ROW_HEIGHT = 16;

class FlameChartView extends Component {

  render() {
    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const {maxStackDepth} = this.props;
    const maxViewportHeight = (maxStackDepth + 1) * ROW_HEIGHT;

    return (
      <div className='flameChartView'>
        <ProfileCallTreeSettings />
        <FlameChartViewport connectedProps={this.props}
                            maxViewportHeight={maxViewportHeight}
                            rowHeight={ROW_HEIGHT} />
      </div>
    );
  }
}

FlameChartView.propTypes = {
  threadIndex: PropTypes.number.isRequired,
  thread: PropTypes.object.isRequired,
  interval: PropTypes.number.isRequired,
  timeRange: PropTypes.object.isRequired,
  isSelected: PropTypes.bool.isRequired,
  maxStackDepth: PropTypes.number.isRequired,
};

export default connect(state => {
  return {
    thread: selectedThreadSelectors.getFilteredThread(state),
    maxStackDepth: selectedThreadSelectors.getFuncStackMaxDepth(state),
    stackTimingByDepth: selectedThreadSelectors.getStackTimingByDepth(state),
    isSelected: true,
    timeRange: getDisplayRange(state),
    threadIndex: getSelectedThreadIndex(state),
    interval: getProfileInterval(state),
  };
}, actions)(FlameChartView);
