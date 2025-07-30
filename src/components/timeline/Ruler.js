/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { TIMELINE_RULER_HEIGHT } from 'firefox-profiler/app-logic/constants';
import {
  formatBytes,
  formatTimestamp,
  findRoundBytesValueGreaterOrEqualTo,
  findRoundMillisecondsValueGreaterOrEqualTo,
} from 'firefox-profiler/utils/format-numbers';

import './Ruler.css';

import type {
  Milliseconds,
  CssPixels,
  TimelineUnit,
} from 'firefox-profiler/types';

type Props = {
  readonly zeroAt: Milliseconds,
  readonly rangeStart: Milliseconds,
  readonly rangeEnd: Milliseconds,
  readonly width: CssPixels,
  readonly unit: TimelineUnit,
};

export class TimelineRuler extends PureComponent<Props> {
  _pickNotchLength(unit: TimelineUnit, minLength: Milliseconds) {
    if (unit === 'bytes') {
      return findRoundBytesValueGreaterOrEqualTo(minLength);
    }
    return findRoundMillisecondsValueGreaterOrEqualTo(minLength);
  }

  _getNotches() {
    if (this.props.width === 0) {
      return { notches: [], notchTime: 0, unit: 'ms' };
    }

    const { zeroAt, rangeStart, rangeEnd, width, unit } = this.props;
    const pixelsPerMilliSecond = width / (rangeEnd - rangeStart);
    const minimumNotchWidth = 55; // pixels
    const minMillisecondsPerNotch = minimumNotchWidth / pixelsPerMilliSecond;
    const notchTime = this._pickNotchLength(unit, minMillisecondsPerNotch);
    const firstNotchIndex = Math.ceil((rangeStart - zeroAt) / notchTime);
    const lastNotchIndex = Math.floor((rangeEnd - zeroAt) / notchTime);
    const notches = [];
    for (let i = firstNotchIndex; i <= lastNotchIndex; i++) {
      notches.push({
        time: i * notchTime,
        pos: (i * notchTime - (rangeStart - zeroAt)) * pixelsPerMilliSecond,
      });
    }
    return { notches, notchTime, unit };
  }

  render() {
    const { notches, notchTime, unit } = this._getNotches();
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
                {unit === 'bytes'
                  ? formatBytes(time, 3, 2, notchTime)
                  : formatTimestamp(time, 2, 2, notchTime)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
}
