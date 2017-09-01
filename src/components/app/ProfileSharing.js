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
  getURLPredictor,
} from '../../reducers/url-state';
import actions from '../../actions';
import { compress } from '../../utils/gz';
import { uploadBinaryProfileData } from '../../profile-logic/profile-store';
import ArrowPanel from '../shared/ArrowPanel';
import ButtonWithPanel from '../shared/ButtonWithPanel';
import shortenURL from '../../utils/shorten-url';
import { serializeProfile } from '../../profile-logic/process-profile';
import prettyBytes from 'pretty-bytes';
import sha1 from '../../utils/sha1';
import url from 'url';

import type { StartEndRange } from '../../types/units';
import type { Profile } from '../../types/profile';
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
  hash: string,
  predictURL: (Action | Action[]) => string,
  onProfilePublished: typeof actions.profilePublished,
};

class ProfileSharingCompositeButton extends PureComponent {
  props: ProfileSharingCompositeButtonProps;
  _permalinkButton: ButtonWithPanel;
  _uploadErrorButton: ButtonWithPanel;
  _permalinkTextField: HTMLInputElement;
  _permalinkButtonCreated: ButtonWithPanel => void;
  _uploadErrorButtonCreated: ButtonWithPanel => void;
  _permalinkTextFieldCreated: HTMLInputElement => void;
  state: {
    state: string,
    uploadProgress: number,
    hash: string,
    error: Error | null,
    fullURL: string,
    shortURL: string,
  };

  constructor(props: ProfileSharingCompositeButtonProps) {
    super(props);
    const { dataSource, hash } = props;
    this.state = {
      state: dataSource === 'public' ? 'public' : 'local', // local -> uploading (<-> error) -> public
      uploadProgress: 0,
      hash,
      error: null,
      fullURL: window.location.href,
      shortURL: window.location.href,
    };

    (this: any)._attemptToShare = this._attemptToShare.bind(this);
    (this: any)._onPermalinkPanelOpen = this._onPermalinkPanelOpen.bind(this);
    (this: any)._onPermalinkPanelClose = this._onPermalinkPanelClose.bind(this);
    this._permalinkButtonCreated = (elem: ButtonWithPanel) => {
      this._permalinkButton = elem;
    };
    this._uploadErrorButtonCreated = (elem: ButtonWithPanel) => {
      this._uploadErrorButton = elem;
    };
    this._permalinkTextFieldCreated = (elem: HTMLInputElement) => {
      this._permalinkTextField = elem;
    };
  }

  componentWillReceiveProps({
    dataSource,
    hash,
  }: ProfileSharingCompositeButtonProps) {
    if (dataSource === 'public' && this.state.state !== 'public') {
      this.setState({ state: 'public', hash });
    }
    if (window.location.href !== this.state.fullURL) {
      this.setState({
        fullURL: window.location.href,
        shortURL: window.location.href,
      });
    }
  }

  _onPermalinkPanelOpen() {
    this._shortenURLAndFocusTextFieldOnCompletion();
  }

  _shortenURLAndFocusTextFieldOnCompletion(): Promise<void> {
    return shortenURL(this.state.fullURL)
      .then(shortURL => {
        this.setState({ shortURL });
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

  _attemptToShare() {
    if (this.state.state !== 'local' && this.state.state !== 'error') {
      return;
    }

    const { profile, predictURL } = this.props;

    new Promise(resolve => {
      if (!profile) {
        throw new Error('profile is null');
      }
      const jsonString = serializeProfile(profile);
      if (!jsonString) {
        throw new Error('profile serialization failed');
      }

      this.setState({ state: 'uploading', uploadProgress: 0 });
      resolve(jsonString);
    })
      .then((s: string) => new TextEncoder().encode(s))
      .then((typedArray: $TypedArray) => {
        return Promise.all([compress(typedArray.slice(0)), sha1(typedArray)]);
      })
      .then(([gzipData, hash]: [string, string]) => {
        const predictedURL = url.resolve(
          window.location.href,
          predictURL(actions.profilePublished(hash))
        );
        this.setState({
          hash,
          fullURL: predictedURL,
          shortURL: predictedURL,
        });
        const uploadPromise = uploadBinaryProfileData(
          gzipData,
          uploadProgress => {
            this.setState({ uploadProgress });
          }
        ).then((hash: string) => {
          const { onProfilePublished } = this.props;
          onProfilePublished(hash);
          const newShortURL =
            this.state.fullURL === window.location.href
              ? this.state.shortURL
              : window.location.href;
          this.setState({
            state: 'public',
            hash,
            fullURL: window.location.href,
            shortURL: newShortURL,
          });
        });
        const shortenURLPromise = this._shortenURLAndFocusTextFieldOnCompletion();
        Promise.race([uploadPromise, shortenURLPromise]).then(() => {
          if (this._permalinkButton) {
            this._permalinkButton.openPanel();
          }
        });
        return Promise.all([uploadPromise, shortenURLPromise]);
      })
      .catch((error: Error) => {
        this.setState({
          state: 'error',
          error,
        });
        if (this._uploadErrorButton) {
          this._uploadErrorButton.openPanel();
        }
      });
  }

  render() {
    const { state, uploadProgress, error, shortURL } = this.state;
    return (
      <div
        className={classNames('profileSharingCompositeButtonContainer', {
          currentButtonIsShareButton: state === 'local',
          currentButtonIsUploadingButton: state === 'uploading',
          currentButtonIsPermalinkButton: state === 'public',
          currentButtonIsUploadErrorButton: state === 'error',
        })}
      >
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
        <UploadingStatus progress={uploadProgress} />
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
                value={shortURL}
                readOnly="readOnly"
                ref={this._permalinkTextFieldCreated}
              />
            </ArrowPanel>
          }
        />
        <ButtonWithPanel
          className="profileSharingUploadErrorButton"
          ref={this._uploadErrorButtonCreated}
          label="Upload Error"
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
    const blobURL = URL.createObjectURL(blob);
    this.setState({
      filename: `${profile.meta.product} ${filenameDateString(
        profileDate
      )} profile.sps.json`,
      uncompressedBlobUrl: blobURL,
      uncompressedSize: blob.size,
    });
    compress(serializedProfile).then(data => {
      const blob = new Blob([data], { type: 'application/octet-binary' });
      const blobURL = URL.createObjectURL(blob);
      this.setState({
        compressedBlobUrl: blobURL,
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
  hash: string,
  profilePublished: typeof actions.profilePublished,
  predictURL: (Action | Action[]) => string,
};

const ProfileSharing = ({
  profile,
  rootRange,
  dataSource,
  hash,
  profilePublished,
  predictURL,
}: ProfileSharingProps) =>
  <div className="profileSharing">
    <ProfileSharingCompositeButton
      profile={profile}
      dataSource={dataSource}
      hash={hash}
      onProfilePublished={profilePublished}
      predictURL={predictURL}
    />
    <ProfileDownloadButton profile={profile} rootRange={rootRange} />
  </div>;

export default connect(
  state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    hash: getHash(state),
    predictURL: getURLPredictor(state),
  }),
  { profilePublished: actions.profilePublished }
)(ProfileSharing);
