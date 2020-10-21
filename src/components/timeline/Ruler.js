/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { TIMELINE_RULER_HEIGHT } from 'firefox-profiler/app-logic/constants';

import './Ruler.css';

import type { Milliseconds, CssPixels } from 'firefox-profiler/types';

type Props = {|
  +zeroAt: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +width: CssPixels,
|};

class TimelineRuler extends PureComponent<Props> {
  _findNiceNumberGreaterOrEqualTo(uglyNumber: number) {
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
    if (this.props.width === 0) {
      return { notches: [], decimalPlaces: 0 };
    }

    const { zeroAt, rangeStart, rangeEnd, width } = this.props;
    const pixelsPerMilliSecond = width / (rangeEnd - rangeStart);
    const minimumNotchWidth = 55; // pixels
    const {
      number: notchTime,
      exponent,
    } = this._findNiceNumberGreaterOrEqualTo(
      minimumNotchWidth / pixelsPerMilliSecond
    );
    const firstNotchIndex = Math.ceil((rangeStart - zeroAt) / notchTime);
    const lastNotchIndex = Math.floor((rangeEnd - zeroAt) / notchTime);
    const notches = [];
    for (let i = firstNotchIndex; i <= lastNotchIndex; i++) {
      notches.push({
        time: (i * notchTime) / 1000,
        pos: (i * notchTime - (rangeStart - zeroAt)) * pixelsPerMilliSecond,
      });
    }
    return { notches, decimalPlaces: Math.max(0, -(exponent - 3)) };
  }

  render() {
    const { notches, decimalPlaces } = this._getNotches();
    return (
      <div
        className="timelineRuler"
        style={{ '--timeline-ruler-height': `${TIMELINE_RULER_HEIGHT}px` }}
      >
        <ol className="timelineRulerContainer">
          {notches.map(({ time, pos }, i) => (
            <li
              className="timelineRulerNotch"
              key={i}
              style={{ left: `${pos}px` }}
            >
              <span className="timelineRulerNotchText">{`${time.toFixed(
                decimalPlaces
              )}s`}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
}

export default TimelineRuler;
