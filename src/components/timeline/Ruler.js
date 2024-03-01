/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { TIMELINE_RULER_HEIGHT } from 'firefox-profiler/app-logic/constants';
import { formatTimestamp } from 'firefox-profiler/utils/format-numbers';

import './Ruler.css';

import type { Milliseconds, CssPixels } from 'firefox-profiler/types';

type Props = {|
  +zeroAt: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +width: CssPixels,
|};

export class TimelineRuler extends PureComponent<Props> {
  _findNiceNumberGreaterOrEqualTo(uglyNumber: Milliseconds) {
    // Special case numbers in the seconds, minutes or hour ranges.
    if (uglyNumber > 10000 && uglyNumber <= 48 * 3600 * 1000) {
      for (const seconds of [15, 20, 30]) {
        const number = seconds * 1000;
        if (uglyNumber <= number) {
          return number;
        }
      }
      for (const minutes of [1, 2, 5, 10, 15, 20, 30]) {
        const number = minutes * 60 * 1000;
        if (uglyNumber <= number) {
          return number;
        }
      }
      for (const hours of [1, 2, 3, 4, 6, 8, 12, 24, 48]) {
        const number = hours * 3600 * 1000;
        if (uglyNumber <= number) {
          return number;
        }
      }
    }

    // Write uglyNumber as a * 10^b, with 1 <= a < 10.
    // Return the lowest of 2 * 10^b, 5 * 10^b, 10 * 10^b that is greater or equal to uglyNumber.
    const b = Math.floor(Math.log10(uglyNumber));
    if (uglyNumber <= 2 * Math.pow(10, b)) {
      return 2 * Math.pow(10, b);
    }
    if (uglyNumber <= 5 * Math.pow(10, b)) {
      return 5 * Math.pow(10, b);
    }
    return Math.pow(10, b + 1);
  }

  _getNotches() {
    if (this.props.width === 0) {
      return { notches: [], notchTime: 0 };
    }

    const { zeroAt, rangeStart, rangeEnd, width } = this.props;
    const pixelsPerMilliSecond = width / (rangeEnd - rangeStart);
    const minimumNotchWidth = 55; // pixels
    const notchTime = this._findNiceNumberGreaterOrEqualTo(
      minimumNotchWidth / pixelsPerMilliSecond
    );
    const firstNotchIndex = Math.ceil((rangeStart - zeroAt) / notchTime);
    const lastNotchIndex = Math.floor((rangeEnd - zeroAt) / notchTime);
    const notches = [];
    for (let i = firstNotchIndex; i <= lastNotchIndex; i++) {
      notches.push({
        time: i * notchTime,
        pos: (i * notchTime - (rangeStart - zeroAt)) * pixelsPerMilliSecond,
      });
    }
    return { notches, notchTime };
  }

  render() {
    const { notches, notchTime } = this._getNotches();
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
              <span className="timelineRulerNotchText">
                {formatTimestamp(time, 2, 2, notchTime)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
}
