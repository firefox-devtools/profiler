/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { getProfile, getProfileRootRange } from '../../reducers/profile-view';
import {
  getDataSource,
  getHash,
  getUrlPredictor,
} from '../../reducers/url-state';
import { compress } from '../../utils/gz';
import {
  getProgress,
  getStatus,
  getError,
} from '../../reducers/profile-upload';
import {
  getValue as getShortUrl,
  getOriginalUrl,
} from '../../reducers/short-url';
import {
  uploadBinaryProfileData,
  uploadSuccess,
  uploadError,
} from '../../actions/profile-upload';
import { shortenUrl } from '../../actions/short-url';
import ArrowPanel from '../shared/ArrowPanel';
import ButtonWithPanel from '../shared/ButtonWithPanel';
import { serializeProfile } from '../../profile-logic/process-profile';
import prettyBytes from 'pretty-bytes';
import sha1 from '../../utils/sha1';
import url from 'url';

import type { StartEndRange } from '../../types/units';
import type { Profile } from '../../types/profile';
import type { ProfileUploadStatus } from '../../types/reducers';
import type { Action, DataSource } from '../../types/actions';

require('./ProfileSharing.css');

const PrivacyNotice = () =>
  <section className="privacyNotice">
    <p
    >{`You’re about to upload your profile publicly where anyone will be able to access it.
      To better diagnose performance problems profiles include the following information:`}</p>
    <ul>
      <li>
        {'The URLs and scripts of the tabs that were executing.'}
      </li>
      <li>
        {'The metadata of all your add-ons to identify slow add-ons.'}
      </li>
      <li>
        {'Firefox build and runtime configuration.'}
      </li>
    </ul>
    <p
    >{`To view all the information you can download the full profile to a file and open the
      json structure with a text editor.`}</p>
  </section>;

const UploadingStatus = ({ progress }: { progress: number }) =>
  <div className="profileSharingUploadingButton">
    <div className="profileSharingUploadingButtonInner">
      <progress
        className="profileSharingUploadingButtonProgress"
        value={progress}
      />
      <div className="profileSharingUploadingButtonLabel">Uploading...</div>
    </div>
  </div>;

type ProfileSharingCompositeButtonProps = {
  profile: Profile,
  dataSource: DataSource,
  progress: number,
  shortUrl: string,
  lastShortenedUrl: string,
  hash: string,
  status: ProfileUploadStatus,
  error: Error | null,
  predictUrl: (Action | Action[]) => string,
  uploadBinaryProfileData: string => Promise<void>,
  shortenUrl: string => Promise<string>,
  uploadError: typeof uploadError,
};

class ProfileSharingCompositeButton extends PureComponent {
  props: ProfileSharingCompositeButtonProps;
  _permalinkButton: ButtonWithPanel;
  _permalinkTextField: HTMLInputElement;
  _permalinkButtonCreated: ButtonWithPanel => void;
  _permalinkTextFieldCreated: HTMLInputElement => void;

  constructor(props: ProfileSharingCompositeButtonProps) {
    super(props);
    (this: any)._attemptToShare = this._attemptToShare.bind(this);
    (this: any)._onPermalinkPanelOpen = this._onPermalinkPanelOpen.bind(this);
    (this: any)._onPermalinkPanelClose = this._onPermalinkPanelClose.bind(this);
    this._permalinkButtonCreated = (elem: ButtonWithPanel) => {
      this._permalinkButton = elem;
    };
    this._permalinkTextFieldCreated = (elem: HTMLInputElement) => {
      this._permalinkTextField = elem;
    };
  }

  _onPermalinkPanelOpen() {
    this._shortenUrlAndFocusTextFieldOnCompletion();
  }

  _shortenUrlAndFocusTextFieldOnCompletion(url?: string): Promise<void> {
    const { shortenUrl, lastShortenedUrl } = this.props;
    const fullUrl = url || lastShortenedUrl || window.location.href;
    return shortenUrl(fullUrl)
      .then(() => {
        if (this._permalinkTextField) {
          this._permalinkTextField.focus();
          this._permalinkTextField.select();
        }
      })
      .catch(() => {});
  }

  _onPermalinkPanelClose() {
    if (this._permalinkTextField) {
      this._permalinkTextField.blur();
    }
  }

  async _attemptToShare() {
    if (this.props.dataSource === 'public' && this.props.status !== 'error') {
      return;
    }

    try {
      const { profile, predictUrl, uploadBinaryProfileData } = this.props;

      if (!profile) {
        throw new Error('profile is null');
      }
      const jsonString = serializeProfile(profile);
      if (!jsonString) {
        throw new Error('profile serialization failed');
      }

      const typedArray = await new TextEncoder().encode(jsonString);
      const [gzipData, hash] = await Promise.all([
        compress(typedArray.slice(0)),
        sha1(typedArray),
      ]);
      const predictedUrl = url.resolve(
        window.location.href,
        predictUrl(uploadSuccess(hash)) // uploadSuccess is used directly, so it doesn't dispatch an action
      );
      const uploadPromise = uploadBinaryProfileData(gzipData);
      const shortenUrlPromise = this._shortenUrlAndFocusTextFieldOnCompletion(
        predictedUrl
      );
      await Promise.race([uploadPromise, shortenUrlPromise]);
      if (this._permalinkButton) {
        this._permalinkButton.openPanel();
      }
      await uploadPromise;
      await shortenUrlPromise;
    } catch (error) {
      const { uploadError } = this.props;
      uploadError(error);
    }
  }

  render() {
    const { shortUrl, dataSource, status, progress, error } = this.props;
    const classes = classNames('profileSharingCompositeButtonContainer', {
      currentButtonIsShareButton: status === 'none' && dataSource !== 'public',
      currentButtonIsPermalinkButton:
        status === 'none' && dataSource === 'public',
      currentButtonIsUploadingButton: status === 'uploading',
      currentButtonIsUploadErrorButton: status === 'error',
    });
    return (
      <div className={classes}>
        <ButtonWithPanel
          className="profileSharingShareButton"
          label="Share..."
          panel={
            <ArrowPanel
              className="profileSharingPrivacyPanel"
              title={'Upload Profile – Privacy Notice'}
              okButtonText="Share"
              cancelButtonText="Cancel"
              onOkButtonClick={this._attemptToShare}
            >
              <PrivacyNotice />
            </ArrowPanel>
          }
        />
        <UploadingStatus progress={progress} />
        <ButtonWithPanel
          className="profileSharingPermalinkButton"
          ref={this._permalinkButtonCreated}
          label="Permalink"
          panel={
            <ArrowPanel
              className="profileSharingPermalinkPanel"
              onOpen={this._onPermalinkPanelOpen}
              onClose={this._onPermalinkPanelClose}
            >
              <input
                type="text"
                className="profileSharingPermalinkTextField"
                value={shortUrl}
                readOnly="readOnly"
                ref={this._permalinkTextFieldCreated}
              />
            </ArrowPanel>
          }
        />
        <ButtonWithPanel
          className="profileSharingUploadErrorButton"
          label="Upload Error"
          open={!!error}
          panel={
            <ArrowPanel
              className="profileSharingUploadErrorPanel"
              title={'Upload Error'}
              okButtonText="Try Again"
              cancelButtonText="Cancel"
              onOkButtonClick={this._attemptToShare}
            >
              <p>An error occurred during upload:</p>
              <pre>
                {error && error.toString()}
              </pre>
            </ArrowPanel>
          }
        />
      </div>
    );
  }
}

function filenameDateString(d: Date): string {
  const pad = x => (x < 10 ? `0${x}` : `${x}`);
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

type ProfileDownloadButtonProps = {
  profile: Profile,
  rootRange: StartEndRange,
};

class ProfileDownloadButton extends PureComponent {
  props: ProfileDownloadButtonProps;
  state: {|
    uncompressedBlobUrl: string,
    compressedBlobUrl: string,
    uncompressedSize: number,
    compressedSize: number,
    filename: string,
  |};

  constructor(props: ProfileDownloadButtonProps) {
    super(props);
    this.state = {
      uncompressedBlobUrl: '',
      compressedBlobUrl: '',
      uncompressedSize: 0,
      compressedSize: 0,
      filename: '',
    };
    (this: any)._onPanelOpen = this._onPanelOpen.bind(this);
  }

  _onPanelOpen() {
    const { profile, rootRange } = this.props;
    const profileDate = new Date(profile.meta.startTime + rootRange.start);
    const serializedProfile = serializeProfile(profile);
    const blob = new Blob([serializedProfile], {
      type: 'application/octet-binary',
    });
    const blobUrl = URL.createObjectURL(blob);
    this.setState({
      filename: `${profile.meta.product} ${filenameDateString(
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
  }

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
        className="profileSharingProfileDownloadButton"
        label="Save as file..."
        panel={
          <ArrowPanel
            className="profileSharingProfileDownloadPanel"
            title={'Save Profile to a Local File'}
            onOpen={this._onPanelOpen}
          >
            <section>
              {uncompressedBlobUrl
                ? <p>
                    <a
                      className="profileSharingDownloadLink"
                      href={uncompressedBlobUrl}
                      download={filename}
                    >
                      {`${filename} (${prettyBytes(uncompressedSize)})`}
                    </a>
                  </p>
                : null}
              {compressedBlobUrl
                ? <p>
                    <a
                      className="profileSharingDownloadLink"
                      href={compressedBlobUrl}
                      download={`${filename}.gz`}
                    >
                      {`${filename}.gz (${prettyBytes(compressedSize)})`}
                    </a>
                  </p>
                : null}
            </section>
          </ArrowPanel>
        }
      />
    );
  }
}

type ProfileSharingProps = {
  profile: Profile,
  rootRange: StartEndRange,
  dataSource: DataSource,
  progress: number,
  hash: string,
  shortUrl: string,
  lastShortenedUrl: string,
  status: ProfileUploadStatus,
  error: Error | null,
  predictUrl: (Action | Action[]) => string,
  shortenUrl: string => Promise<string>,
  uploadBinaryProfileData: string => Promise<void>,
  uploadError: typeof uploadError,
};

const ProfileSharing = ({
  profile,
  rootRange,
  dataSource,
  progress,
  hash,
  shortUrl,
  lastShortenedUrl,
  status,
  error,
  predictUrl,
  shortenUrl,
  uploadBinaryProfileData,
  uploadError,
}: ProfileSharingProps) =>
  <div className="profileSharing">
    <ProfileSharingCompositeButton
      profile={profile}
      dataSource={dataSource}
      progress={progress}
      hash={hash}
      shortUrl={shortUrl}
      lastShortenedUrl={lastShortenedUrl}
      error={error}
      status={status}
      uploadBinaryProfileData={uploadBinaryProfileData}
      uploadError={uploadError}
      predictUrl={predictUrl}
      shortenUrl={shortenUrl}
    />
    <ProfileDownloadButton profile={profile} rootRange={rootRange} />
  </div>;

export default connect(
  state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    hash: getHash(state),
    shortUrl: getShortUrl(state),
    lastShortenedUrl: getOriginalUrl(state),
    predictUrl: getUrlPredictor(state),
    error: getError(state),
    status: getStatus(state),
    progress: getProgress(state),
  }),
  { uploadBinaryProfileData, uploadError, shortenUrl }
)(ProfileSharing);
