import React, { Component, PropTypes } from 'react';

class TimeLine extends Component {

  componentDidMount() {
    // Re-render now that we can find out the width of the container.
    this.forceUpdate();
  }

  _findNiceNumberGreaterOrEqualTo(uglyNumber) {
    // Write uglyNumber as a * 10^b, with 1 <= a < 10.
    // Return the lowest of 2 * 10^b, 5 * 10^b, 10 * 10^b that is greater or equal to uglyNumber.
    const b = Math.floor(Math.log10(uglyNumber));
    if (uglyNumber <= 2 * Math.pow(10, b)) {
      return { number: 2 * Math.pow(10, b), exponent: b };
    }
    if (uglyNumber <= 5 * Math.pow(10, b)) {
      return { number: 5 * Math.pow(10, b), exponent: b };
    }
    return { number: Math.pow(10, b + 1), exponent: b + 1 };
  }

  _getNotches() {
    if (!this.refs.container) {
      return { notches: [], decimalPlaces: 0 };
    }

    const width = this.refs.container.getBoundingClientRect().width;
    const { zeroAt, rangeStart, rangeEnd } = this.props;
    const pixelsPerMilliSecond = width / (rangeEnd - rangeStart);
    const minimumNotchWidth = 50; // pixels
    const { number: notchTime, exponent } = this._findNiceNumberGreaterOrEqualTo(minimumNotchWidth / pixelsPerMilliSecond);
    const firstNotchIndex = Math.ceil((rangeStart - zeroAt) / notchTime);
    const lastNotchIndex = Math.floor((rangeEnd - zeroAt) / notchTime);
    const notches = [];
    for (let i = firstNotchIndex; i <= lastNotchIndex; i++) {
      notches.push({ time: i * notchTime / 1000, pos: (i * notchTime + (rangeStart - zeroAt)) * pixelsPerMilliSecond});
    }
    return { notches, decimalPlaces: Math.max(0, -(exponent - 3)) };
  }

  render() {
    const { className } = this.props;
    const { notches, decimalPlaces } = this._getNotches();
    return (<div className={className}>
      <ol className='timeLineContainer' ref='container'>
        {
          notches.map(({ time, pos }, i) => (
            <li className='timeLineNotch' key={i} style={{left: `${pos}px`}}>
              <span className='timeLineNotchText'>{`${time.toFixed(decimalPlaces)}s`}</span>
            </li>
          ))
        }
      </ol>
    </div>);
  }

}

TimeLine.propTypes = {
  className: PropTypes.string.isRequired,
  zeroAt: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
};

export default TimeLine;
