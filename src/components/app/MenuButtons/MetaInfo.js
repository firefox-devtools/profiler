/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Localized } from '@fluent/react';

import { MetaOverheadStatistics } from './MetaOverheadStatistics';
import {
  getProfile,
  getSymbolicationStatus,
} from 'firefox-profiler/selectors/profile';
import { resymbolicateProfile } from 'firefox-profiler/actions/receive-profile';

import {
  formatBytes,
  formatTimestamp,
} from 'firefox-profiler/utils/format-numbers';
import {
  formatProductAndVersion,
  formatPlatform,
} from 'firefox-profiler/profile-logic/profile-metainfo';

import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { Profile, SymbolicationStatus } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './MetaInfo.css';

type StateProps = $ReadOnly<{|
  profile: Profile,
  symbolicationStatus: SymbolicationStatus,
|}>;

type DispatchProps = $ReadOnly<{|
  resymbolicateProfile: typeof resymbolicateProfile,
|}>;

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

/**
 * This component formats the profile's meta information into a dropdown panel.
 */
class MetaInfoPanelImpl extends React.PureComponent<Props> {
  /**
   * This method provides information about the symbolication status, and a button
   * to re-trigger symbolication.
   */
  renderSymbolication() {
    const { profile, symbolicationStatus, resymbolicateProfile } = this.props;
    const isSymbolicated = profile.meta.symbolicated;

    switch (symbolicationStatus) {
      case 'DONE':
        return (
          <>
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--symbols">
                  Symbols:
                </Localized>
              </span>
              <Localized
                id={
                  isSymbolicated
                    ? 'MenuButtons--metaInfo--profile-symbolicated'
                    : 'MenuButtons--metaInfo--profile-not-symbolicated'
                }
              />
            </div>
            <div className="metaInfoRow">
              <span className="metaInfoLabel"></span>
              <button
                onClick={resymbolicateProfile}
                type="button"
                className="photon-button photon-button-micro"
              >
                <Localized
                  id={
                    isSymbolicated
                      ? 'MenuButtons--metaInfo--resymbolicate-profile'
                      : 'MenuButtons--metaInfo--symbolicate-profile'
                  }
                />
              </button>
            </div>
          </>
        );
      case 'SYMBOLICATING':
        return (
          <div className="metaInfoRow">
            <span className="metaInfoLabel">
              <Localized id="MenuButtons--metaInfo--symbols">
                Symbols:
              </Localized>
            </span>
            <Localized
              id={
                isSymbolicated
                  ? 'MenuButtons--metaInfo--attempting-resymbolicate'
                  : 'MenuButtons--metaInfo--currently-symbolicating'
              }
            />
          </div>
        );
      default:
        throw assertExhaustiveCheck(
          symbolicationStatus,
          'Unhandled SymbolicationStatus.'
        );
    }
  }

  render() {
    const { meta, profilerOverhead } = this.props.profile;
    const { configuration } = meta;

    const platformInformation = formatPlatform(meta);

    let cpuCount = null;
    if (meta.physicalCPUs && meta.logicalCPUs) {
      cpuCount = (
        <Localized
          id="MenuButtons--metaInfo--physical-and-logical-cpu"
          vars={{
            physicalCPUs: meta.physicalCPUs,
            logicalCPUs: meta.logicalCPUs,
          }}
        />
      );
    } else if (meta.physicalCPUs) {
      cpuCount = (
        <Localized
          id="MenuButtons--metaInfo--physical-cpu"
          vars={{ physicalCPUs: meta.physicalCPUs }}
        />
      );
    } else if (meta.logicalCPUs) {
      cpuCount = (
        <Localized
          id="MenuButtons--metaInfo--logical-cpu"
          vars={{ logicalCPUs: meta.logicalCPUs }}
        />
      );
    }

    return (
      <>
        <div className="metaInfoSection">
          {meta.startTime ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--recording-started">
                  Recording started:
                </Localized>
              </span>
              {_formatDate(meta.startTime)}
            </div>
          ) : null}
          {meta.interval ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--interval">
                  Interval:
                </Localized>
              </span>
              {formatTimestamp(meta.interval, 4, 1)}
            </div>
          ) : null}
          {meta.preprocessedProfileVersion ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--profile-version">
                  Profile Version:
                </Localized>
              </span>
              {meta.preprocessedProfileVersion}
            </div>
          ) : null}
          {configuration ? (
            <>
              <div className="metaInfoRow">
                <span className="metaInfoLabel">
                  <Localized id="MenuButtons--metaInfo--buffer-capacity">
                    Buffer Capacity:
                  </Localized>
                </span>
                {/* The capacity is expressed in "entries", where 1 entry == 8 bytes. */
                formatBytes(configuration.capacity * 8, 0)}
              </div>
              <div className="metaInfoRow">
                <span className="metaInfoLabel">
                  <Localized id="MenuButtons--metaInfo--buffer-duration">
                    Buffer Duration:
                  </Localized>
                </span>
                {configuration.duration ? (
                  <Localized
                    id="MenuButtons--metaInfo--buffer-duration-seconds"
                    vars={{ configurationDuration: configuration.duration }}
                  >
                    {'{$configurationDuration} seconds'}
                  </Localized>
                ) : (
                  <Localized id="MenuButtons--metaInfo--buffer-duration-unlimited">
                    Unlimited
                  </Localized>
                )}
              </div>
              <div className="metaInfoSection">
                {_renderRowOfList(
                  'MenuButtons--metaInfo-renderRowOfList-label-features',
                  configuration.features
                )}
                {_renderRowOfList(
                  'MenuButtons--metaInfo-renderRowOfList-label-threads-filter',
                  configuration.threads
                )}
              </div>
            </>
          ) : null}
          {this.renderSymbolication()}
        </div>
        <h2 className="metaInfoSubTitle">
          <Localized id="MenuButtons--metaInfo--application">
            Application
          </Localized>
        </h2>
        <div className="metaInfoSection">
          {meta.product ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--name-and-version">
                  Name and version:
                </Localized>
              </span>
              {formatProductAndVersion(meta)}
            </div>
          ) : null}
          {meta.updateChannel ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--update-channel">
                  Update Channel:
                </Localized>
              </span>
              {meta.updateChannel}
            </div>
          ) : null}
          {meta.appBuildID ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--build-id">
                  Build ID:
                </Localized>
              </span>
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
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--build-type">
                  Build Type:
                </Localized>
              </span>
              <Localized
                id={
                  meta.debug
                    ? 'MenuButtons--metaInfo--build-type-debug'
                    : 'MenuButtons--metaInfo--build-type-opt'
                }
              />
            </div>
          ) : null}
          {meta.extensions
            ? _renderRowOfList(
                'MenuButtons--metaInfo-renderRowOfList-label-extensions',
                meta.extensions.name
              )
            : null}
        </div>
        <h2 className="metaInfoSubTitle">
          <Localized id="MenuButtons--metaInfo--platform">Platform</Localized>
        </h2>
        <div className="metaInfoSection">
          {meta.device ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--device">
                  Device:
                </Localized>
              </span>
              {meta.device}
            </div>
          ) : null}
          {platformInformation ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--os">OS:</Localized>
              </span>
              {platformInformation}
            </div>
          ) : null}
          {meta.abi ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--abi">ABI:</Localized>
              </span>
              {meta.abi}
            </div>
          ) : null}
          {cpuCount ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--cpu">CPU:</Localized>
              </span>
              {cpuCount}
            </div>
          ) : null}
        </div>
        {meta.visualMetrics ? (
          <>
            <h2 className="metaInfoSubTitle">
              <Localized id="MenuButtons--metaInfo--visual-metrics">
                Visual Metrics
              </Localized>
            </h2>
            <div className="metaInfoSection">
              <div className="metaInfoRow">
                <span className="visualMetricsLabel">
                  <Localized id="MenuButtons--metaInfo--speed-index">
                    Speed Index:
                  </Localized>
                </span>
                {meta.visualMetrics.SpeedIndex}
              </div>
              <div className="metaInfoRow">
                <span className="visualMetricsLabel">
                  <Localized id="MenuButtons--metaInfo--perceptual-speed-index">
                    Perceptual Speed Index:
                  </Localized>
                </span>
                {meta.visualMetrics.PerceptualSpeedIndex}
              </div>
              <div className="metaInfoRow">
                <span className="visualMetricsLabel">
                  <Localized id="MenuButtons--metaInfo--contentful-speed-Index">
                    Contentful Speed Index:
                  </Localized>
                </span>
                {meta.visualMetrics.ContentfulSpeedIndex}
              </div>
            </div>
          </>
        ) : null}
        {/*
              Older profiles(before FF 70) don't have any overhead info.
              Don't show anything if that's the case.
            */}
        {profilerOverhead ? (
          <MetaOverheadStatistics profilerOverhead={profilerOverhead} />
        ) : null}
      </>
    );
  }
}

function _renderRowOfList(labelL10nId: string, data: string[]): React.Node {
  if (!data.length) {
    return null;
  }
  return (
    <div className="metaInfoRow">
      <span className="metaInfoLabel">
        <Localized id={labelL10nId} />
      </span>
      <ul className="metaInfoList">
        {data.map(d => (
          <li className="metaInfoListItem" key={d}>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
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

export const MetaInfoPanel = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    profile: getProfile(state),
    symbolicationStatus: getSymbolicationStatus(state),
  }),
  mapDispatchToProps: {
    resymbolicateProfile,
  },
  component: MetaInfoPanelImpl,
});
