import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import Histogram from './Histogram';

class ProfileThreadHeaderBar extends Component {

  constructor(props) {
    super(props);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  render() {
    const { thread, index, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack, isSelected, onClick } = this.props;
    return (
      <li className={'profileThreadHeaderBar' + (isSelected ? ' selected' : '')}>
        <h1 onClick={(event) => onClick(index, event)}>{thread.name}</h1>
        <Histogram interval={interval}
                   thread={thread}
                   className='histogram'
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
    sampleFuncStacks: PropTypes.object.isRequired,
  }).isRequired,
  selectedFuncStack: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

export default ProfileThreadHeaderBar;
