import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import { withSize } from '../with-size';

class TracingMarkerTimeline extends Component {

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { className, rangeStart, rangeEnd, width, tracingMarkers, threadIndex, threadName, onTracingMarkerSelect } = this.props;
    return (<ol className={className}>
      {
        tracingMarkers.map(({ start, dur }, i) => {
          const pos = (start - rangeStart) / (rangeEnd - rangeStart) * width;
          const itemWidth = dur / (rangeEnd - rangeStart) * width;
          return <li className={`${className}Item`}
                     key={i}
                     title={`${dur.toFixed(2)}ms event processing delay on thread ${threadName}`}
                     style={{left: `${pos}px`, width: `${itemWidth}px`}}
                     onMouseDown={(e) => e.stopPropagation()}
                     onClick={() => onTracingMarkerSelect(threadIndex, start, start + dur)}/>;
        })
      }
    </ol>);
  }

}

TracingMarkerTimeline.propTypes = {
  className: PropTypes.string.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  tracingMarkers: PropTypes.arrayOf(PropTypes.shape({
    start: PropTypes.number.isRequired,
    dur: PropTypes.number.isRequired,
  })).isRequired,
  width: PropTypes.number.isRequired,
  threadIndex: PropTypes.number.isRequired,
  threadName: PropTypes.string.isRequired,
  onTracingMarkerSelect: PropTypes.func.isRequired,
};

export default withSize(TracingMarkerTimeline);
