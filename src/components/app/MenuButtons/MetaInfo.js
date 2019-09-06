/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ButtonWithPanel from '../../shared/ButtonWithPanel';
import ArrowPanel from '../../shared/ArrowPanel';
import {
  formatNanoseconds,
  formatPercent,
} from '../../../utils/format-numbers';

import type {
  Profile,
  ProfileMeta,
  ProfilerOverhead,
} from '../../../types/profile';

import './MetaInfo.css';

type Props = {
  profile: Profile,
};

/**
 * This component formats the profile's meta information into a dropdown panel.
 */
export class MenuButtonsMetaInfo extends React.PureComponent<Props> {
  render() {
    const meta = this.props.profile.meta;
    const overheads: ?(ProfilerOverhead[]) = this.props.profile
      .profilerOverhead;
    const calculatedStats: Map<string, ProfilerStats> = new Map();
    // These 3 values only have single values, so we are not using ProfilerStats class for them.
    let overheadDurations = 0;
    let overheadPercentage = 0;
    let profiledDuration = 0;
    let totalSamplingCount = 0;

    // Older profiles(Before FF 70) don't have any overhead info. Don't show anything if
    // that's the case.
    if (overheads) {
      // Overhead keys that have min/max/mean values to loop.
      const statKeys = [
        'Overhead',
        'Cleaning',
        'Counter',
        'Interval',
        'Lockings',
      ];

      for (const overhead of overheads) {
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

    return (
      <ButtonWithPanel
        className="menuButtonsMetaInfoButton"
        buttonClassName="menuButtonsMetaInfoButtonButton"
        label={_formatLabel(meta) || 'Profile information'}
        panel={
          <ArrowPanel className="arrowPanelOpenMetaInfo">
            <h2 className="arrowPanelSubTitle">Timing</h2>
            <div className="arrowPanelSection">
              {meta.startTime ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Recording started:</span>
                  {_formatDate(meta.startTime)}
                </div>
              ) : null}
              {meta.interval ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Interval:</span>
                  {meta.interval}ms
                </div>
              ) : null}
              {meta.preprocessedProfileVersion ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Profile Version:</span>
                  {meta.preprocessedProfileVersion}
                </div>
              ) : null}
            </div>
            <h2 className="arrowPanelSubTitle">Application</h2>
            <div className="arrowPanelSection">
              {meta.product ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Name:</span>
                  {meta.product}
                </div>
              ) : null}
              {meta.misc ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Version:</span>
                  {_formatVersionNumber(meta.misc)}
                </div>
              ) : null}
              {meta.updateChannel ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Update Channel:</span>
                  {meta.updateChannel}
                </div>
              ) : null}
              {meta.appBuildID ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Build ID:</span>
                  {meta.sourceURL ? (
                    <a
                      href={meta.sourceURL}
                      title={meta.sourceURL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {meta.appBuildID}
                    </a>
                  ) : (
                    meta.appBuildID
                  )}
                </div>
              ) : null}
              {meta.debug !== undefined ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Build Type:</span>
                  {meta.debug ? 'Debug' : 'Opt'}
                </div>
              ) : null}
              {meta.extensions ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Extensions:</span>
                  <ul className="metaInfoList">
                    {_mapMetaInfoExtensionNames(meta.extensions.name)}
                  </ul>
                </div>
              ) : null}
            </div>
            <h2 className="arrowPanelSubTitle">Platform</h2>
            <div className="arrowPanelSection">
              {meta.platform ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">Platform:</span>
                  {meta.platform}
                </div>
              ) : null}
              {meta.oscpu ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">OS:</span>
                  {meta.oscpu}
                </div>
              ) : null}
              {meta.abi ? (
                <div className="metaInfoRow">
                  <span className="metaInfoLabel">ABI:</span>
                  {meta.abi}
                </div>
              ) : null}
            </div>
            {calculatedStats.size > 0 ? (
              <details>
                <summary className="arrowPanelSubTitle">
                  Profiler Overhead
                </summary>
                <div className="arrowPanelSection">
                  <div className="metaInfoGrid">
                    <div />
                    <div>Mean</div>
                    <div>Max</div>
                    <div>Min</div>
                    {Array.from(calculatedStats).map(([key, val]) => [
                      <div key={key}>{key}</div>,
                      <div key={key + 'mean'}>
                        {formatNanoseconds(val.mean)}
                      </div>,
                      <div key={key + 'max'}>{formatNanoseconds(val.max)}</div>,
                      <div key={key + 'min'}>{formatNanoseconds(val.min)}</div>,
                    ])}
                  </div>

                  {overheadDurations !== 0 ? (
                    <div className="metaInfoRow">
                      <span className="metaInfoWideLabel">
                        Overhead Durations:
                      </span>
                      {formatNanoseconds(
                        overheadDurations / totalSamplingCount
                      )}
                    </div>
                  ) : null}
                  {overheadPercentage !== 0 ? (
                    <div className="metaInfoRow">
                      <span className="metaInfoWideLabel">
                        Overhead Percentage:
                      </span>
                      {formatPercent(overheadPercentage / totalSamplingCount)}
                    </div>
                  ) : null}
                  {profiledDuration !== 0 ? (
                    <div className="metaInfoRow">
                      <span className="metaInfoWideLabel">
                        Profiled Duration:
                      </span>
                      {formatNanoseconds(profiledDuration / totalSamplingCount)}
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </ArrowPanel>
        }
      />
    );
  }
}

function _mapMetaInfoExtensionNames(data: string[]): React.DOM {
  const extensionList = data.map(d => (
    <li className="metaInfoListItem" key={d}>
      {d}
    </li>
  ));
  return extensionList;
}

function _formatDate(timestamp: number): string {
  const timestampDate = new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    year: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });
  return timestampDate;
}

function _formatVersionNumber(version?: string): string | null {
  const regex = /[0-9]+.+[0-9]/gi;

  if (version) {
    const match = version.match(regex);
    if (match) {
      return match.toString();
    }
  }
  return null;
}

function _formatLabel(meta: ProfileMeta): string {
  const product = meta.product || '';
  const version = _formatVersionNumber(meta.misc) || '';
  let os;
  // To displaying Android Version instead of Linux for Android developers.
  if (meta.platform !== undefined && meta.platform.match(/android/i)) {
    os = meta.platform;
  } else {
    os = meta.oscpu || '';
  }
  const labelTitle = product + ' (' + version + ') ' + os;

  if (labelTitle.length < 5) {
    return '';
  }
  return labelTitle;
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
