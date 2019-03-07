/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../../utils/connect';
import {
  getProfile,
  getProfileRootRange,
  getProfileSharingStatus,
} from '../../../selectors/profile';
import { getDataSource, getUrlPredictor } from '../../../selectors/url-state';
import actions from '../../../actions';
import { compress } from '../../../utils/gz';
import ArrowPanel from '../../shared/ArrowPanel';
import ButtonWithPanel from '../../shared/ButtonWithPanel';
import { serializeProfile } from '../../../profile-logic/process-profile';
import prettyBytes from '../../../utils/pretty-bytes';
import { sendAnalytics } from '../../../utils/analytics';
import { MenuButtonsMetaInfo } from './MetaInfo';
import { MenuButtonsProfileSharing } from './ProfileSharing';

import type { StartEndRange } from '../../../types/units';
import type { Profile } from '../../../types/profile';
import type { Action, DataSource } from '../../../types/actions';
import type { ProfileSharingStatus } from '../../../types/state';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../../utils/connect';

require('./index.css');

type ProfileDownloadButtonProps = {
  profile: Profile,
  rootRange: StartEndRange,
};

type ProfileDownloadButtonState = {|
  uncompressedBlobUrl: string,
  compressedBlobUrl: string,
  uncompressedSize: number,
  compressedSize: number,
  filename: string,
|};

class ProfileDownloadButton extends React.PureComponent<
  ProfileDownloadButtonProps,
  ProfileDownloadButtonState
> {
  state = {
    uncompressedBlobUrl: '',
    compressedBlobUrl: '',
    uncompressedSize: 0,
    compressedSize: 0,
    filename: '',
  };

  _onPanelOpen = () => {
    const { profile, rootRange } = this.props;
    const profileDate = new Date(profile.meta.startTime + rootRange.start);
    const serializedProfile = serializeProfile(profile);
    const blob = new Blob([serializedProfile], {
      type: 'application/octet-binary',
    });
    const blobUrl = URL.createObjectURL(blob);
    this.setState({
      filename: `${profile.meta.product} ${_filenameDateString(
        profileDate
      )} profile.sps.json`,
      uncompressedBlobUrl: blobUrl,
      uncompressedSize: blob.size,
    });
    compress(serializedProfile).then(data => {
      const blob = new Blob([data], { type: 'application/octet-binary' });
      const blobUrl = URL.createObjectURL(blob);
      this.setState({
        compressedBlobUrl: blobUrl,
        compressedSize: blob.size,
      });
    });
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile save locally',
      eventAction: 'save',
    });
  };

  render() {
    const {
      filename,
      uncompressedBlobUrl,
      compressedBlobUrl,
      uncompressedSize,
      compressedSize,
    } = this.state;
    return (
      <ButtonWithPanel
        className="menuButtonsProfileDownloadButton"
        label="Save as file…"
        panel={
          <ArrowPanel
            className="menuButtonsProfileDownloadPanel"
            title="Save Profile to a Local File"
            onOpen={this._onPanelOpen}
          >
            <section>
              {uncompressedBlobUrl ? (
                <p>
                  <a
                    className="menuButtonsDownloadLink"
                    href={uncompressedBlobUrl}
                    download={filename}
                  >
                    {`${filename} (${prettyBytes(uncompressedSize)})`}
                  </a>
                </p>
              ) : null}
              {compressedBlobUrl ? (
                <p>
                  <a
                    className="menuButtonsDownloadLink"
                    href={compressedBlobUrl}
                    download={`${filename}.gz`}
                  >
                    {`${filename}.gz (${prettyBytes(compressedSize)})`}
                  </a>
                </p>
              ) : null}
            </section>
          </ArrowPanel>
        }
      />
    );
  }
}

type MenuButtonsStateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +dataSource: DataSource,
  +profileSharingStatus: ProfileSharingStatus,
  +predictUrl: (Action | Action[]) => string,
|};

type MenuButtonsDispatchProps = {|
  +profilePublished: typeof actions.profilePublished,
  +setProfileSharingStatus: typeof actions.setProfileSharingStatus,
|};

type MenuButtonsProps = ConnectedProps<
  {||},
  MenuButtonsStateProps,
  MenuButtonsDispatchProps
>;

const MenuButtons = ({
  profile,
  rootRange,
  dataSource,
  profilePublished,
  profileSharingStatus,
  setProfileSharingStatus,
  predictUrl,
}: MenuButtonsProps) => (
  <>
    {/* Place the info button outside of the menu buttons to allow it to shrink. */}
    <MenuButtonsMetaInfo profile={profile} />
    <div className="menuButtons">
      <MenuButtonsProfileSharing
        profile={profile}
        dataSource={dataSource}
        onProfilePublished={profilePublished}
        profileSharingStatus={profileSharingStatus}
        setProfileSharingStatus={setProfileSharingStatus}
        predictUrl={predictUrl}
      />
      <ProfileDownloadButton profile={profile} rootRange={rootRange} />
      <a
        href="/docs/"
        target="_blank"
        className="menuButtonsLink"
        title="Open the documentation in a new window"
      >
        Docs…
      </a>
    </div>
  </>
);

function _filenameDateString(d: Date): string {
  const pad = x => (x < 10 ? `0${x}` : `${x}`);
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

const options: ExplicitConnectOptions<
  {||},
  MenuButtonsStateProps,
  MenuButtonsDispatchProps
> = {
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    profileSharingStatus: getProfileSharingStatus(state),
    predictUrl: getUrlPredictor(state),
  }),
  mapDispatchToProps: {
    profilePublished: actions.profilePublished,
    setProfileSharingStatus: actions.setProfileSharingStatus,
  },
  component: MenuButtons,
};
export default explicitConnect(options);
