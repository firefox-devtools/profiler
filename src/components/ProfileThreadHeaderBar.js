import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import ThreadStackGraph from './ThreadStackGraph';

class ProfileThreadHeaderBar extends Component {

  constructor(props) {
    super(props);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { thread, index, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack, isSelected, onMouseDown, style } = this.props;
    return (
      <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')} style={style}>
        <h1 onMouseDown={(event) => onMouseDown(index, event)} className='grippy'>{thread.name}</h1>
        <ThreadStackGraph interval={interval}
                   thread={thread}
                   className='threadStackGraph'
                   rangeStart={rangeStart}
                   rangeEnd={rangeEnd}
                   funcStackInfo={funcStackInfo}
                   selectedFuncStack={selectedFuncStack}/>
      </li>
    );
  }

}

ProfileThreadHeaderBar.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  index: PropTypes.number.isRequired,
  interval: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  funcStackInfo: PropTypes.shape({
    funcStackTable: PropTypes.object.isRequired,
    sampleFuncStacks: PropTypes.array.isRequired,
  }).isRequired,
  selectedFuncStack: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onMouseDown: PropTypes.func.isRequired,
  style: PropTypes.style,
};

export default ProfileThreadHeaderBar;
