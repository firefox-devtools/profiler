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
  hasProfileExtraInfo,
  getMarkerSchemaByName,
  getProfileExtraInfo,
} from 'firefox-profiler/selectors/profile';
import { resymbolicateProfile } from 'firefox-profiler/actions/receive-profile';
import { formatFromMarkerSchema } from 'firefox-profiler/profile-logic/marker-schema';

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

import type {
  Profile,
  SymbolicationStatus,
  ExtraProfileInfoSection,
  MarkerSchemaByName,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './MetaInfo.css';

type State = {|
  showsMoreInfo: boolean,
|};

type OwnProps = $ReadOnly<{|
  profile: Profile,
  symbolicationStatus: SymbolicationStatus,
  hasProfileExtraInfo: boolean,
  +profileExtraInfo: ExtraProfileInfoSection[],
  +markerSchemaByName: MarkerSchemaByName,
|}>;

type DispatchProps = $ReadOnly<{|
  resymbolicateProfile: typeof resymbolicateProfile,
|}>;

type Props = ConnectedProps<{||}, OwnProps, DispatchProps>;

/**
 * This component formats the profile's meta information into a dropdown panel.
 */
class MetaInfoPanelImpl extends React.PureComponent<Props, State> {
  state = { showsMoreInfo: false };

  /**
   * This method provides information about the symbolication status, and a button
   * to re-trigger symbolication.
   */
  renderSymbolication() {
    const { profile, symbolicationStatus, resymbolicateProfile } = this.props;
    const isSymbolicated = profile.meta.symbolicated;

    const supportsSymbolication =
      profile.meta.symbolicationNotSupported !== true;
    if (!supportsSymbolication) {
      return null;
    }

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

  _handleMoreInfoButtonClick = () => {
    this.setState((state) => ({ showsMoreInfo: !state.showsMoreInfo }));
  };

  _renderMoreInfoSection(section: ExtraProfileInfoSection) {
    return (
      <div key={section.label}>
        <h2 className="metaInfoSubTitle" key={'title ' + section.label}>
          {section.label}
        </h2>
        <div className="metaInfoSection" key={'section ' + section.label}>
          {section.entries.map(({ label, format, value }) => {
            return (
              <div className="moreInfoRow" key={label}>
                <span className="metaInfoWideLabel">{label}</span>
                <div className="moreInfoValue">
                  {formatFromMarkerSchema('moreInfo', format, value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  _renderMoreInfo() {
    return (
      <div open={this.state.showsMoreInfo} className="moreInfoPart">
        {this.props.profileExtraInfo.map(this._renderMoreInfoSection)}
      </div>
    );
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
                <Localized id="MenuButtons--metaInfo--main-process-started">
                  Main process started:
                </Localized>
              </span>
              {_formatDate(meta.startTime)}
            </div>
          ) : null}
          {meta.endTime ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--main-process-ended">
                  Main process ended:
                </Localized>
              </span>
              {_formatDate(meta.endTime)}
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
          {configuration ? (
            <>
              <div className="metaInfoRow">
                <span className="metaInfoLabel">
                  <Localized id="MenuButtons--metaInfo--buffer-capacity">
                    Buffer capacity:
                  </Localized>
                </span>
                {
                  /* The capacity is expressed in "entries", where 1 entry == 8 bytes. */
                  formatBytes(configuration.capacity * 8, 0)
                }
              </div>
              <div className="metaInfoRow">
                <span className="metaInfoLabel">
                  <Localized id="MenuButtons--metaInfo--buffer-duration">
                    Buffer duration:
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
                  Update channel:
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
                  Build type:
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
          {meta.arguments ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--arguments">
                  Arguments:
                </Localized>
              </span>
              <div className="metaInfoLargeContent">{meta.arguments}</div>
            </div>
          ) : null}
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
          {meta.mainMemory ? (
            <div className="metaInfoRow">
              <span className="metaInfoLabel">
                <Localized id="MenuButtons--metaInfo--main-memory">
                  Main memory:
                </Localized>
              </span>
              {formatBytes(meta.mainMemory)}
            </div>
          ) : null}
        </div>
        {meta.visualMetrics ? (
          <>
            <h2 className="metaInfoSubTitle">
              <Localized id="MenuButtons--metaInfo--visual-metrics">
                Visual metrics
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
        {this.props.hasProfileExtraInfo ? (
          <div className="metaInfoRow">
            <button
              type="button"
              className="moreInfoButton photon-button photon-button-default photon-button-micro"
              onClick={this._handleMoreInfoButtonClick}
            >
              <Localized
                id={`MenuButtons--index--${
                  this.state.showsMoreInfo ? 'hide' : 'show'
                }-moreInfo-button`}
              >
                {this.state.showsMoreInfo ? 'Show Less' : 'Show More'}
              </Localized>
            </button>
          </div>
        ) : null}
        {this.props.hasProfileExtraInfo && this.state.showsMoreInfo
          ? this._renderMoreInfo()
          : null}
      </>
    );
  }
}

function _renderRowOfList(labelL10nId: string, data: string[]): React.Node {
  if (!data.length) {
    return null;
  }
  return (
    <div className="metaInfoRow metaInfoListRow">
      <span className="metaInfoLabel">
        <Localized id={labelL10nId} />
      </span>
      <ul className="metaInfoList">
        {data.map((d) => (
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

export const MetaInfoPanel = explicitConnect<{||}, OwnProps, DispatchProps>({
  mapStateToProps: (state) => ({
    profile: getProfile(state),
    symbolicationStatus: getSymbolicationStatus(state),
    hasProfileExtraInfo: hasProfileExtraInfo(state),
    profileExtraInfo: getProfileExtraInfo(state),
    markerSchemaByName: getMarkerSchemaByName(state),
  }),
  mapDispatchToProps: {
    resymbolicateProfile,
  },
  component: MetaInfoPanelImpl,
});
