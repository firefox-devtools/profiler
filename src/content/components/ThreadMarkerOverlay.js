import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';

class ThreadMarkerOverlay extends Component {

  constructor(props) {
    super(props);
    this._mouseDownListener = this._mouseDownListener.bind(this);
  }

  _mouseDownListener(e) {
    this.props.onSelectMarker(e.target.dataset.index);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { thread, rangeStart, rangeEnd } = this.props;
    const { markers, stringTable } = thread;
    return (
      <ol className='threadMarkerOverlay'>
        {
          thread.markers.name.map((markerName, markerIndex) => {
            const time = markers.time[markerIndex];
            if (time < rangeStart || time > rangeEnd) {
              return null;
            }
            return (
              <li className='threadMarkerOverlayMarkerItem'
                  style={{
                    left: (time - rangeStart) / (rangeEnd - rangeStart) * 100 + '%',
                  }}>
                {stringTable.getString(markerName)}
              </li>
            );
          })
        }
      </ol>
    );
  }

}

ThreadMarkerOverlay.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  onSelectMarker: PropTypes.func.isRequired,
};

export default ThreadMarkerOverlay;
