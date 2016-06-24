import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import { withSize } from '../with-size';

class JankTimeline extends Component {

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { className, rangeStart, rangeEnd, width, jankInstances, threadIndex, threadName, onJankInstanceSelect } = this.props;
    return (<ol className={className}>
      {
        jankInstances.map(({ start, dur }, i) => {
          const pos = (start - rangeStart) / (rangeEnd - rangeStart) * width;
          const itemWidth = dur / (rangeEnd - rangeStart) * width;
          return <li className={`${className}Item`}
                     key={i}
                     title={`${dur.toFixed(2)}ms event processing delay on thread ${threadName}`}
                     style={{left: `${pos}px`, width: `${itemWidth}px`}}
                     onMouseDown={(e) => e.stopPropagation()}
                     onClick={() => onJankInstanceSelect(threadIndex, start, start + dur)}/>;
        })
      }
    </ol>);
  }

}

JankTimeline.propTypes = {
  className: PropTypes.string.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  jankInstances: PropTypes.arrayOf(PropTypes.shape({
    start: PropTypes.number.isRequired,
    dur: PropTypes.number.isRequired,
  })).isRequired,
  width: PropTypes.number.isRequired,
  threadIndex: PropTypes.number.isRequired,
  threadName: PropTypes.string.isRequired,
  onJankInstanceSelect: PropTypes.func.isRequired,
};

export default withSize(JankTimeline);
