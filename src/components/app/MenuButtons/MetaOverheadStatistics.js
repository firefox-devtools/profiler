/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  formatNanoseconds,
  formatPercent,
} from '../../../utils/format-numbers';

import type { ProfilerOverhead } from '../../../types/profile';

import './MetaOverheadStatistics.css';

type Props = {
  profilerOverhead?: ProfilerOverhead[],
};

/**
 * This component formats the profile's meta information into a dropdown panel.
 */
export class MetaOverheadStatistics extends React.PureComponent<Props> {
  render() {
    const { profilerOverhead } = this.props;

    const calculatedStats: Map<string, ProfilerStats> = new Map();
    // These 3 values only have single values, so we are not using ProfilerStats class for them.
    let overheadDurations = 0;
    let overheadPercentage = 0;
    let profiledDuration = 0;
    let totalSamplingCount = 0;

    // Older profiles(Before FF 70) don't have any overhead info. Don't show anything if
    // that's the case.
    if (profilerOverhead) {
      // Overhead keys that have min/max/mean values to loop.
      const statKeys = [
        'Overhead',
        'Cleaning',
        'Counter',
        'Interval',
        'Lockings',
      ];

      for (const overhead of profilerOverhead) {
        const { statistics } = overhead;
        const { samplingCount } = statistics;

        // Calculation the single values without any loop, it's not worth it.
        overheadDurations += statistics.overheadDurations * samplingCount;
        overheadPercentage += statistics.overheadPercentage * samplingCount;
        profiledDuration += statistics.profiledDuration * samplingCount;
        totalSamplingCount += samplingCount;

        // Looping through the overhead values that have min/max/mean values
        // and calculating them.
        for (const stat of statKeys) {
          const max = statistics['max' + stat];
          const mean = statistics['mean' + stat];
          const min = statistics['min' + stat];

          let currentStat = calculatedStats.get(stat);
          if (currentStat === undefined) {
            currentStat = new ProfilerStats();
            calculatedStats.set(stat, currentStat);
          }

          currentStat.count(min, max, mean, samplingCount);
        }
      }
    }

    return calculatedStats.size > 0 ? (
      <details>
        <summary className="arrowPanelSubTitle">Profiler Overhead</summary>
        <div className="arrowPanelSection">
          <div className="metaInfoGrid">
            <div />
            <div>Mean</div>
            <div>Max</div>
            <div>Min</div>
            {Array.from(calculatedStats).map(([key, val]) => [
              <div key={key}>{key}</div>,
              <div key={key + 'mean'}>{formatNanoseconds(val.mean)}</div>,
              <div key={key + 'max'}>{formatNanoseconds(val.max)}</div>,
              <div key={key + 'min'}>{formatNanoseconds(val.min)}</div>,
            ])}
          </div>

          {overheadDurations !== 0 ? (
            <div className="metaInfoRow">
              <span className="metaInfoWideLabel">Overhead Durations:</span>
              <span className="metaInfoValueRight">
                {formatNanoseconds(overheadDurations / totalSamplingCount)}
              </span>
            </div>
          ) : null}
          {overheadPercentage !== 0 ? (
            <div className="metaInfoRow">
              <span className="metaInfoWideLabel">Overhead Percentage:</span>
              <span className="metaInfoValueRight">
                {formatPercent(overheadPercentage / totalSamplingCount)}
              </span>
            </div>
          ) : null}
          {profiledDuration !== 0 ? (
            <div className="metaInfoRow">
              <span className="metaInfoWideLabel">Profiled Duration:</span>
              <span className="metaInfoValueRight">
                {formatNanoseconds(profiledDuration / totalSamplingCount)}
              </span>
            </div>
          ) : null}
        </div>
      </details>
    ) : null;
  }
}

// A helper class to calculate the weighted arithmetic mean statistic values.
class ProfilerStats {
  _max = 0;
  _min = 0;
  _mean = 0;
  _weight = 0;

  count(min: number, max: number, mean: number, weight: number) {
    this._weight += weight;
    this._min = min * weight;
    this._max = max * weight;
    this._mean = mean * weight;
  }

  get min(): number {
    return this._min / this._weight;
  }

  get max(): number {
    return this._max / this._weight;
  }

  get mean(): number {
    return this._mean / this._weight;
  }
}
