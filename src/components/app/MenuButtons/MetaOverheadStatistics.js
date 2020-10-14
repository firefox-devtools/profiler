/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  formatMicroseconds,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';

import type { ProfilerOverhead } from 'firefox-profiler/types';

import './MetaOverheadStatistics.css';

// Profiler overhead statistics keys that have max/min/mean values.
type StatKeys = 'Overhead' | 'Cleaning' | 'Counter' | 'Interval' | 'Lockings';

type Props = {|
  +profilerOverhead: ProfilerOverhead[],
|};

/**
 * This component formats the profile's meta information into a dropdown panel.
 */
export class MetaOverheadStatistics extends React.PureComponent<Props> {
  render() {
    const { profilerOverhead } = this.props;

    const calculatedStats: Map<StatKeys, ProfilerStats> = new Map();
    // These 3 values only have single values, so we are not using ProfilerStats class for them.
    // Weightedly accumulated value of `overheadDurations. It's used to calculate mean value.
    let overheadDurations = 0;
    // Weightedly accumulated value of `overheadPercentage. It's used to calculate mean value.
    let overheadPercentage = 0;
    // Weightedly accumulated value of `profiledDuration. It's used to calculate mean value.
    let profiledDuration = 0;
    // Total sampling count is used to calculate mean values of the 3
    // statistics values above.
    let totalSamplingCount = 0;

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

      // Statistics can be undefined in case there is no sample in the
      // profilerOverhead object. Ignore it and continue if that's the case.
      if (statistics === undefined) {
        continue;
      }

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

        currentStat.accumulate(min, max, mean, samplingCount);
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
            {[...calculatedStats].map(([key, val]) => (
              <React.Fragment key={key}>
                <div>{key}</div>
                <div>{formatMicroseconds(val.mean)}</div>
                <div>{formatMicroseconds(val.max)}</div>
                <div>{formatMicroseconds(val.min)}</div>
              </React.Fragment>
            ))}
          </div>

          {overheadDurations !== 0 ? (
            <div className="metaInfoRow">
              <span className="metaInfoWideLabel">Overhead Durations:</span>
              <span className="metaInfoValueRight">
                {formatMicroseconds(overheadDurations / totalSamplingCount)}
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
                {formatMicroseconds(profiledDuration / totalSamplingCount)}
              </span>
            </div>
          ) : null}
        </div>
      </details>
    ) : null;
  }
}

// A helper class to calculate the weighted arithmetic mean statistic values.
// For example let's say that we have 2 processes with these profile stats.
// Process 1: samplingCount: 90, maxCounter: 10
// Process 2: samplingCount: 10, maxCounter: 100
// Since the process 2 has less samples, the weighted average maxCounter going to be
// (90 * 10 + 10 * 100) / (10 + 90) = 19
class ProfilerStats {
  _accumulatedMax = 0;
  _accumulatedMin = 0;
  _accumulatedMean = 0;
  _accumulatedWeight = 0;

  accumulate(min: number, max: number, mean: number, weight: number) {
    this._accumulatedWeight += weight;
    this._accumulatedMin += min * weight;
    this._accumulatedMax += max * weight;
    this._accumulatedMean += mean * weight;
  }

  get min(): number {
    return this._accumulatedMin / this._accumulatedWeight;
  }

  get max(): number {
    return this._accumulatedMax / this._accumulatedWeight;
  }

  get mean(): number {
    return this._accumulatedMean / this._accumulatedWeight;
  }
}
