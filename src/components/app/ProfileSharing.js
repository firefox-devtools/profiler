/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import classNames from 'classnames';
import {
  getProfile,
  getProfileRootRange,
  getProfileSharingStatus,
  getSymbolicationStatus,
} from '../../reducers/profile-view';
import { getDataSource, getUrlPredictor } from '../../reducers/url-state';
import actions from '../../actions';
import { compress } from '../../utils/gz';
import { uploadBinaryProfileData } from '../../profile-logic/profile-store';
import ArrowPanel from '../shared/ArrowPanel';
import ButtonWithPanel from '../shared/ButtonWithPanel';
import shortenUrl from '../../utils/shorten-url';
import { serializeProfile } from '../../profile-logic/process-profile';
import prettyBytes from '../../utils/pretty-bytes';
import sha1 from '../../utils/sha1';
import { sendAnalytics } from '../../utils/analytics';
import url from 'url';

import type { StartEndRange } from '../../types/units';
import type { Profile } from '../../types/profile';
import type { Action, DataSource } from '../../types/actions';
import type {
  ProfileSharingStatus,
  SymbolicationStatus,
} from '../../types/reducers';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./ProfileSharing.css');

const PrivacyNotice = () => (
  <section className="privacyNotice">
    <p
    >{`You’re about to upload your profile publicly where anyone will be able to access it.
      To better diagnose performance problems profiles include the following information:`}</p>
    <ul>
      <li>{'The URLs of all painted tabs, and running scripts.'}</li>
      <li>{'The metadata of all your add-ons to identify slow add-ons.'}</li>
      <li>{'Firefox build and runtime configuration.'}</li>
    </ul>
    <p
    >{`To view all the information you can download the full profile to a file and open the
      json structure with a text editor.`}</p>
    <p>
      {`By default, the URLs of all network requests will be removed while sharing the profile
        but keeping the URLs may help to identify the problems. Please select the checkbox
        below to share the URLs of the network requests:`}
    </p>
  </section>
);

const UploadingStatus = ({ progress }: { progress: number }) => (
  <div className="profileSharingUploadingButton">
    <div className="profileSharingUploadingButtonInner">
      <progress
        className="profileSharingUploadingButtonProgress"
        value={progress}
      />
      <div className="profileSharingUploadingButtonLabel">Uploading...</div>
    </div>
  </div>
);

const ProfileSharingButton = ({
  buttonClassName,
  shareLabel,
  symbolicationStatus,
  okButtonClickEvent,
  panelOpenEvent,
  shareNetworkUrlChecboxChecked,
  shareNetworkUrlChecboxOnChange,
  checkboxDisabled,
}: {
  buttonClassName: string,
  shareLabel: string,
  symbolicationStatus: string,
  okButtonClickEvent: () => void,
  panelOpenEvent: (() => void) | null,
  shareNetworkUrlChecboxChecked: boolean,
  shareNetworkUrlChecboxOnChange:
    | ((SyntheticEvent<HTMLInputElement>) => void)
    | null,
  checkboxDisabled: boolean,
}) => (
  <ButtonWithPanel
    className={buttonClassName}
    label={shareLabel}
    disabled={symbolicationStatus !== 'DONE'}
    panel={
      <ArrowPanel
        className="profileSharingPrivacyPanel"
        title={'Upload Profile – Privacy Notice'}
        okButtonText="Share"
        cancelButtonText="Cancel"
        onOkButtonClick={okButtonClickEvent}
        onOpen={panelOpenEvent ? panelOpenEvent : undefined}
      >
        <PrivacyNotice />
        <p className="profileSharingShareNetworkUrlsContainer">
          <label>
            <input
              type="checkbox"
              className="profileSharingShareNetworkUrlsCheckbox"
              checked={shareNetworkUrlChecboxChecked}
              onChange={
                shareNetworkUrlChecboxOnChange
                  ? shareNetworkUrlChecboxOnChange
                  : undefined
              }
              disabled={checkboxDisabled}
            />
            Share the URLs of all network requests
          </label>
        </p>
      </ArrowPanel>
    }
  />
);

type ProfileSharingCompositeButtonProps = {
  profile: Profile,
  dataSource: DataSource,
  symbolicationStatus: SymbolicationStatus,
  predictUrl: (Action | Action[]) => string,
  onProfilePublished: typeof actions.profilePublished,
  profileSharingStatus: ProfileSharingStatus,
  setProfileSharingStatus: typeof actions.setProfileSharingStatus,
};

type ProfileSharingCompositeButtonState = {
  state: string,
  uploadProgress: number,
  error: Error | null,
  fullUrl: string,
  shortUrl: string,
  shareNetworkUrls: boolean,
};

class ProfileSharingCompositeButton extends PureComponent<
  ProfileSharingCompositeButtonProps,
  ProfileSharingCompositeButtonState
> {
  _permalinkButton: ButtonWithPanel | null;
  _uploadErrorButton: ButtonWithPanel | null;
  _permalinkTextField: HTMLInputElement | null;
  _permalinkButtonCreated: (ButtonWithPanel | null) => void;
  _uploadErrorButtonCreated: (ButtonWithPanel | null) => void;
  _permalinkTextFieldCreated: (HTMLInputElement | null) => void;
  _attemptToSecondaryShare: () => void;

  constructor(props: ProfileSharingCompositeButtonProps) {
    super(props);
    const { dataSource } = props;
    this.state = {
      state: dataSource === 'public' ? 'public' : 'local', // local -> uploading (<-> error) -> public
      uploadProgress: 0,
      error: null,
      fullUrl: window.location.href,
      shortUrl: window.location.href,
      shareNetworkUrls: false,
    };

    (this: any)._attemptToShare = this._attemptToShare.bind(this);
    (this: any)._attemptToSecondaryShare = this._attemptToShare.bind(
      this,
      true
    );
    (this: any)._onChangeShareNetworkUrls = this._onChangeShareNetworkUrls.bind(
      this
    );
    (this: any)._onPermalinkPanelOpen = this._onPermalinkPanelOpen.bind(this);
    (this: any)._onPermalinkPanelClose = this._onPermalinkPanelClose.bind(this);
    (this: any)._onSecondarySharePanelOpen = this._onSecondarySharePanelOpen.bind(
      this
    );
    this._permalinkButtonCreated = (elem: ButtonWithPanel | null) => {
      this._permalinkButton = elem;
    };
    this._uploadErrorButtonCreated = (elem: ButtonWithPanel | null) => {
      this._uploadErrorButton = elem;
    };
    this._permalinkTextFieldCreated = (elem: HTMLInputElement | null) => {
      this._permalinkTextField = elem;
    };
  }

  componentWillReceiveProps({
    dataSource,
  }: ProfileSharingCompositeButtonProps) {
    if (dataSource === 'public' && this.state.state !== 'public') {
      this.setState({ state: 'public' });
    }
    if (window.location.href !== this.state.fullUrl) {
      this.setState({
        fullUrl: window.location.href,
        shortUrl: window.location.href,
      });
    }
  }

  _onPermalinkPanelOpen() {
    this._shortenUrlAndFocusTextFieldOnCompletion();
  }

  _shortenUrlAndFocusTextFieldOnCompletion(): Promise<void> {
    return shortenUrl(this.state.fullUrl)
      .then(shortUrl => {
        this.setState({ shortUrl });
        const textField = this._permalinkTextField;
        if (textField) {
          textField.focus();
          textField.select();
        }
      })
      .catch(() => {});
  }

  _onPermalinkPanelClose() {
    if (this._permalinkTextField) {
      this._permalinkTextField.blur();
    }
  }

  _notifyAnalytics() {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile upload',
      eventAction: 'start',
    });
  }

  // Takes an optional argument that indicates if the share attempt
  // is being made for the second time. We have two share buttons now,
  // one for sharing for the first time, and one for sharing
  // after the initial share depending on the previous URL share status.
  // People can decide to remove the URLs from the profile after sharing
  // with URLs or they can decide to add the URLs after sharing without
  // them. We check the current state before attempting to share depending
  // on that flag.
  _attemptToShare(isSecondaryShare: boolean = false) {
    if (
      ((!isSecondaryShare && this.state.state !== 'local') ||
        (isSecondaryShare && this.state.state !== 'public')) &&
      this.state.state !== 'error'
    ) {
      return;
    }
    this._notifyAnalytics();

    const { profile, predictUrl, profileSharingStatus } = this.props;

    new Promise(resolve => {
      if (!profile) {
        throw new Error('profile is null');
      }
      const jsonString = serializeProfile(profile, this.state.shareNetworkUrls);
      if (!jsonString) {
        throw new Error('profile serialization failed');
      }

      const newProfileSharingStatus = {
        sharedWithUrls:
          this.state.shareNetworkUrls || profileSharingStatus.sharedWithUrls,
        sharedWithoutUrls:
          !this.state.shareNetworkUrls ||
          profileSharingStatus.sharedWithoutUrls,
      };
      this.props.setProfileSharingStatus(newProfileSharingStatus);
      this.setState({ state: 'uploading', uploadProgress: 0 });
      resolve(jsonString);
    })
      .then((s: string) => new TextEncoder().encode(s))
      .then((typedArray: $TypedArray) => {
        return Promise.all([compress(typedArray.slice(0)), sha1(typedArray)]);
      })
      .then(([gzipData, hash]: [string, string]) => {
        const predictedUrl = url.resolve(
          window.location.href,
          predictUrl(actions.profilePublished(hash))
        );
        this.setState({
          fullUrl: predictedUrl,
          shortUrl: predictedUrl,
        });
        const uploadPromise = uploadBinaryProfileData(
          gzipData,
          uploadProgress => {
            this.setState({ uploadProgress });
          }
        ).then((hash: string) => {
          const { onProfilePublished } = this.props;
          onProfilePublished(hash);

          this.setState(prevState => {
            const newShortUrl =
              prevState.fullUrl === window.location.href
                ? prevState.shortUrl
                : window.location.href;

            return {
              state: 'public',
              fullUrl: window.location.href,
              shortUrl: newShortUrl,
            };
          });

          sendAnalytics({
            hitType: 'event',
            eventCategory: 'profile upload',
            eventAction: 'succeeded',
          });
        });
        const shortenUrlPromise = this._shortenUrlAndFocusTextFieldOnCompletion();
        Promise.race([uploadPromise, shortenUrlPromise]).then(() => {
          if (this._permalinkButton) {
            this._permalinkButton.openPanel();
          }
        });
        return Promise.all([uploadPromise, shortenUrlPromise]);
      })
      .catch((error: Error) => {
        this.setState({
          state: 'error',
          error,
        });
        if (this._uploadErrorButton) {
          this._uploadErrorButton.openPanel();
        }
        sendAnalytics({
          hitType: 'event',
          eventCategory: 'profile upload',
          eventAction: 'failed',
        });
      });
  }

  _onChangeShareNetworkUrls(event: SyntheticEvent<HTMLInputElement>) {
    this.setState({
      shareNetworkUrls: event.currentTarget.checked,
    });
  }

  _onSecondarySharePanelOpen() {
    const { profileSharingStatus } = this.props;
    this.setState({
      shareNetworkUrls: !profileSharingStatus.sharedWithUrls,
    });
  }

  render() {
    const { state, uploadProgress, error, shortUrl } = this.state;
    const { profile, symbolicationStatus, profileSharingStatus } = this.props;

    const shareLabel =
      symbolicationStatus === 'DONE'
        ? 'Share...'
        : 'Sharing will be enabled once symbolication is complete';

    const secondaryShareButtonVisibility =
      // It must have been shared before
      state === 'public' &&
      // If it's been shared both with and without URLs, do not show anymore
      (!profileSharingStatus.sharedWithUrls ||
        !profileSharingStatus.sharedWithoutUrls) &&
      // If profile is shared without network URLs and they are removed from the profile, do not show.
      (profileSharingStatus.sharedWithUrls || !profile.meta.networkURLsRemoved);

    const secondaryShareLabel = profileSharingStatus.sharedWithUrls
      ? 'Share without URLs'
      : 'Share with URLs';

    return (
      <div
        className={classNames('profileSharingCompositeButtonContainer', {
          currentButtonIsShareButton: state === 'local',
          currentButtonIsUploadingButton: state === 'uploading',
          currentButtonIsPermalinkButton: state === 'public',
          currentButtonIsUploadErrorButton: state === 'error',
          currentButtonIsSecondaryShareButton: secondaryShareButtonVisibility,
        })}
      >
        <ProfileSharingButton
          buttonClassName="profileSharingShareButton"
          shareLabel={shareLabel}
          symbolicationStatus={symbolicationStatus}
          okButtonClickEvent={this._attemptToShare}
          panelOpenEvent={null}
          shareNetworkUrlChecboxChecked={this.state.shareNetworkUrls}
          shareNetworkUrlChecboxOnChange={this._onChangeShareNetworkUrls}
          checkboxDisabled={false}
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
                value={shortUrl}
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
              <pre>{error && error.toString()}</pre>
            </ArrowPanel>
          }
        />
        <ProfileSharingButton
          buttonClassName="profileSharingSecondaryShareButton"
          shareLabel={secondaryShareLabel}
          symbolicationStatus={symbolicationStatus}
          okButtonClickEvent={this._attemptToSecondaryShare}
          panelOpenEvent={this._onSecondarySharePanelOpen}
          shareNetworkUrlChecboxChecked={this.state.shareNetworkUrls}
          shareNetworkUrlChecboxOnChange={null}
          checkboxDisabled={true}
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

type ProfileDownloadButtonState = {|
  uncompressedBlobUrl: string,
  compressedBlobUrl: string,
  uncompressedSize: number,
  compressedSize: number,
  filename: string,
|};

class ProfileDownloadButton extends PureComponent<
  ProfileDownloadButtonProps,
  ProfileDownloadButtonState
> {
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
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile save locally',
      eventAction: 'save',
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
              {uncompressedBlobUrl ? (
                <p>
                  <a
                    className="profileSharingDownloadLink"
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
                    className="profileSharingDownloadLink"
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

type ProfileSharingStateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +dataSource: DataSource,
  +symbolicationStatus: SymbolicationStatus,
  +profileSharingStatus: ProfileSharingStatus,
  +predictUrl: (Action | Action[]) => string,
|};

type ProfileSharingDispatchProps = {|
  +profilePublished: typeof actions.profilePublished,
  +setProfileSharingStatus: typeof actions.setProfileSharingStatus,
|};

type ProfileSharingProps = ConnectedProps<
  {||},
  ProfileSharingStateProps,
  ProfileSharingDispatchProps
>;

const ProfileSharing = ({
  profile,
  rootRange,
  dataSource,
  symbolicationStatus,
  profilePublished,
  profileSharingStatus,
  setProfileSharingStatus,
  predictUrl,
}: ProfileSharingProps) => (
  <div className="profileSharing">
    <ProfileSharingCompositeButton
      profile={profile}
      dataSource={dataSource}
      symbolicationStatus={symbolicationStatus}
      onProfilePublished={profilePublished}
      profileSharingStatus={profileSharingStatus}
      setProfileSharingStatus={setProfileSharingStatus}
      predictUrl={predictUrl}
    />
    <ProfileDownloadButton profile={profile} rootRange={rootRange} />
  </div>
);

const options: ExplicitConnectOptions<
  {||},
  ProfileSharingStateProps,
  ProfileSharingDispatchProps
> = {
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    symbolicationStatus: getSymbolicationStatus(state),
    profileSharingStatus: getProfileSharingStatus(state),
    predictUrl: getUrlPredictor(state),
  }),
  mapDispatchToProps: {
    profilePublished: actions.profilePublished,
    setProfileSharingStatus: actions.setProfileSharingStatus,
  },
  component: ProfileSharing,
};
export default explicitConnect(options);
