import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import { withSize } from '../with-size';

class IntervalMarkerTimeline extends Component {
  constructor(props) {
    super(props);
    this._onSelect = this._onSelect.bind(this);
  }

  _onSelect(e) {
    this.props.onSelect(this.props.threadIndex, +e.target.getAttribute("data-start"), +e.target.getAttribute("data-end"));
  }

  _onMouseDown(e) {
    e.stopPropagation();
  }

  shouldComponentUpdate(nextProps, nextState) {
    const doUpdate = shallowCompare(this, nextProps, nextState);
    if (doUpdate) {
      console.log('IntervalMarkerTimeline is updating. Old:', this.props, 'New:', nextProps);
    }
    return doUpdate;
  }

  render() {
    const { className, rangeStart, rangeEnd, width, intervalMarkers, threadIndex, threadName, onSelect } = this.props;
    const itemClassName = className.split(' ')[0] + 'Item';
    return (<ol className={className}>
      {
        intervalMarkers.map(({ start, dur, title, name }, i) => {
          const pos = (start - rangeStart) / (rangeEnd - rangeStart) * width;
          const itemWidth = dur / (rangeEnd - rangeStart) * width;
          return <li className={itemClassName + (name ? ` ${itemClassName}Type${name}` : '')}
                     key={i}
                     title={title}
                     style={{left: `${pos}px`, width: `${itemWidth}px`}}
                     data-start={start}
                     data-end={start + dur}
                     onMouseDown={this._onMouseDown}
                     onClick={this._onSelect}/>;
        })
      }
    </ol>);
  }

}

IntervalMarkerTimeline.propTypes = {
  className: PropTypes.string.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  intervalMarkers: PropTypes.arrayOf(PropTypes.shape({
    start: PropTypes.number.isRequired,
    dur: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    name: PropTypes.string,
  })).isRequired,
  width: PropTypes.number.isRequired,
  threadIndex: PropTypes.number.isRequired,
  threadName: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default withSize(IntervalMarkerTimeline);
