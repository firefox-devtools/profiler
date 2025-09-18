/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import type { InflightProfileEncoding } from 'firefox-profiler/actions/publish';
import {
  updateSharingOption,
  attemptToPublish,
  resetUploadState,
  encodeSanitizedProfile,
} from 'firefox-profiler/actions/publish';
import {
  getProfile,
  getProfileRootRange,
  getHasPreferenceMarkers,
  getContainsPrivateBrowsingInformation,
} from 'firefox-profiler/selectors/profile';
import {
  getAbortFunction,
  getCheckedSharingOptions,
  getFilenameString,
  getUploadPhase,
  getUploadProgress,
  getUploadProgressString,
  getUploadError,
  getShouldSanitizeByDefault,
  getSanitizedProfileEncodingState,
} from 'firefox-profiler/selectors/publish';
import { BlobUrlLink } from 'firefox-profiler/components/shared/BlobUrlLink';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import prettyBytes from 'firefox-profiler/utils/pretty-bytes';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import WarningImage from 'firefox-profiler-res/img/svg/warning.svg';

import type {
  Profile,
  CheckedSharingOptions,
  StartEndRange,
  UploadPhase,
  SanitizedProfileEncodingState,
} from 'firefox-profiler/types';

import './Publish.css';
import { Localized } from '@fluent/react';

type OwnProps = {
  readonly isRepublish?: boolean;
};

type StateProps = {
  readonly profile: Profile;
  readonly rootRange: StartEndRange;
  readonly shouldShowPreferenceOption: boolean;
  readonly profileContainsPrivateBrowsingInformation: boolean;
  readonly checkedSharingOptions: CheckedSharingOptions;
  readonly sanitizedProfileEncodingState: SanitizedProfileEncodingState;
  readonly downloadFileName: string;
  readonly uploadPhase: UploadPhase;
  readonly uploadProgress: number;
  readonly uploadProgressString: string;
  readonly shouldSanitizeByDefault: boolean;
  readonly uploadError: unknown;
  readonly abortFunction: () => void;
};

type DispatchProps = {
  readonly updateSharingOption: typeof updateSharingOption;
  readonly encodeSanitizedProfile: typeof encodeSanitizedProfile;
  readonly attemptToPublish: typeof attemptToPublish;
  readonly resetUploadState: typeof resetUploadState;
};

type PublishProps = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class PublishPanelImpl extends React.PureComponent<PublishProps, {}> {
  _inflightEncoding: InflightProfileEncoding | undefined;

  override componentDidMount(): void {
    this._inflightEncoding = this.props.encodeSanitizedProfile();
  }

  _onCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sharingOption = e.target.name as keyof CheckedSharingOptions;
    this.props.updateSharingOption(sharingOption, e.target.checked);

    this._inflightEncoding = this.props.encodeSanitizedProfile(
      this._inflightEncoding
    );
  };

  _renderCheckbox(
    slug: keyof CheckedSharingOptions,
    labelL10nId: string,
    additionalContent?: React.ReactNode
  ) {
    const { checkedSharingOptions } = this.props;
    return (
      <label className="photon-label publishPanelDataChoicesLabel">
        <input
          type="checkbox"
          className="photon-checkbox photon-checkbox-default"
          name={slug}
          onChange={this._onCheckboxChange}
          checked={checkedSharingOptions[slug]}
        />
        <Localized id={labelL10nId} />
        {additionalContent}
      </label>
    );
  }

  _onSubmit = () => {
    this.props.attemptToPublish(this._inflightEncoding);
  };

  _renderPublishPanel() {
    const {
      shouldShowPreferenceOption,
      profileContainsPrivateBrowsingInformation,
      sanitizedProfileEncodingState,
      downloadFileName,
      shouldSanitizeByDefault,
      isRepublish,
    } = this.props;

    return (
      <div data-testid="PublishPanel-container">
        <form
          className="publishPanelContent photon-body-10"
          onSubmit={this._onSubmit}
        >
          <h1 className="publishPanelTitle photon-title-40">
            {isRepublish ? (
              <Localized id="MenuButtons--publish--reupload-performance-profile">
                Re-upload Performance Profile
              </Localized>
            ) : (
              <Localized id="MenuButtons--publish--share-performance-profile">
                Share Performance Profile
              </Localized>
            )}
          </h1>
          <p className="publishPanelInfoDescription">
            <Localized id="MenuButtons--publish--info-description">
              Upload your profile and make it accessible to anyone with the
              link.
            </Localized>{' '}
            {shouldSanitizeByDefault ? (
              <Localized id="MenuButtons--publish--info-description-default">
                By default, your personal data is removed.
              </Localized>
            ) : (
              <Localized id="MenuButtons--publish--info-description-firefox-nightly2">
                This profile is from Firefox Nightly, so by default most
                information is included.
              </Localized>
            )}
          </p>
          <h3 className="photon-title-10">
            <Localized id="MenuButtons--publish--include-additional-data">
              Include additional data that may be identifiable
            </Localized>
          </h3>
          <div className="publishPanelDataChoices">
            {this._renderCheckbox(
              'includeHiddenThreads',
              'MenuButtons--publish--renderCheckbox-label-hidden-threads'
            )}
            {this._renderCheckbox(
              'includeFullTimeRange',
              'MenuButtons--publish--renderCheckbox-label-hidden-time'
            )}
            {this._renderCheckbox(
              'includeScreenshots',
              'MenuButtons--publish--renderCheckbox-label-include-screenshots'
            )}
            {this._renderCheckbox(
              'includeUrls',
              'MenuButtons--publish--renderCheckbox-label-resource'
            )}
            {this._renderCheckbox(
              'includeExtension',
              'MenuButtons--publish--renderCheckbox-label-extension'
            )}
            {shouldShowPreferenceOption
              ? this._renderCheckbox(
                  'includePreferenceValues',
                  'MenuButtons--publish--renderCheckbox-label-preference'
                )
              : null}
            {profileContainsPrivateBrowsingInformation
              ? this._renderCheckbox(
                  'includePrivateBrowsingData',
                  'MenuButtons--publish--renderCheckbox-label-private-browsing',
                  <Localized
                    id="MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image"
                    attrs={{ title: true }}
                  >
                    <img
                      className="publishPanelDataChoicesIndicator"
                      src={WarningImage}
                      title="This profile contains private browsing data"
                    />
                  </Localized>
                )
              : null}
          </div>
          {sanitizedProfileEncodingState.phase === 'ERROR' ? (
            <div className="photon-message-bar photon-message-bar-error photon-message-bar-inner-content">
              <div className="photon-message-bar-inner-text">
                <Localized id="MenuButtons--publish--error-while-compressing">
                  Error while compressing, try unchecking some checkboxes to
                  reduce the profile size.
                </Localized>
              </div>
            </div>
          ) : null}
          <div className="publishPanelButtons">
            <DownloadButton
              downloadFileName={downloadFileName}
              sanitizedProfileEncodingState={sanitizedProfileEncodingState}
            />
            <button
              type="submit"
              className="photon-button photon-button-primary publishPanelButton publishPanelButtonsUpload"
              disabled={sanitizedProfileEncodingState.phase === 'ERROR'}
            >
              <span className="publishPanelButtonsSvg publishPanelButtonsSvgUpload" />
              <Localized id="MenuButtons--publish--button-upload">
                Upload
              </Localized>
            </button>
          </div>
        </form>
      </div>
    );
  }

  _renderUploadPanel() {
    const {
      uploadProgress,
      uploadProgressString,
      abortFunction,
      downloadFileName,
      sanitizedProfileEncodingState,
    } = this.props;

    return (
      <div
        className="publishPanelUpload photon-body-10"
        data-testid="PublishPanel-container"
      >
        <div className="publishPanelUploadTop">
          <div className="publishPanelUploadTitle photon-title-20">
            <Localized id="MenuButtons--publish--upload-title">
              Uploading profile…
            </Localized>
          </div>
          <div className="publishPanelUploadPercentage">
            {uploadProgressString}
          </div>
          <div className="publishPanelUploadBar">
            <div
              className="publishPanelUploadBarInner"
              style={{ width: `${uploadProgress * 100}%` }}
            />
          </div>
        </div>
        <div className="publishPanelButtons">
          <DownloadButton
            downloadFileName={downloadFileName}
            sanitizedProfileEncodingState={sanitizedProfileEncodingState}
          />
          <button
            type="button"
            className="photon-button photon-button-default publishPanelButton publishPanelButtonsCancelUpload"
            onClick={abortFunction}
          >
            <Localized id="MenuButtons--publish--cancel-upload">
              Cancel Upload
            </Localized>
          </button>
        </div>
      </div>
    );
  }

  _renderErrorPanel() {
    const { uploadError: error, resetUploadState } = this.props;
    let message: string =
      'There was an unknown error when trying to upload the profile.';
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      // This is most likely an error, but do a runtime check just in case.
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    return (
      <div
        className="publishPanelUpload photon-body-10"
        data-testid="PublishPanel-container"
      >
        <div className="photon-message-bar photon-message-bar-error photon-message-bar-inner-content">
          <div className="photon-message-bar-inner-text">
            <Localized id="MenuButtons--publish--message-something-went-wrong">
              Uh oh, something went wrong when uploading the profile.
            </Localized>
          </div>
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
            onClick={resetUploadState}
          >
            <Localized id="MenuButtons--publish--message-try-again">
              Try again
            </Localized>
          </button>
        </div>
        <div className="publishPanelError">{message}</div>
      </div>
    );
  }

  override render() {
    const { uploadPhase } = this.props;
    switch (uploadPhase) {
      case 'error':
        return this._renderErrorPanel();
      case 'local':
      case 'uploaded':
        return this._renderPublishPanel();
      case 'uploading':
      case 'compressing':
        return this._renderUploadPanel();
      default:
        throw assertExhaustiveCheck(uploadPhase);
    }
  }
}

export const PublishPanel = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    shouldShowPreferenceOption: getHasPreferenceMarkers(state),
    profileContainsPrivateBrowsingInformation:
      getContainsPrivateBrowsingInformation(state),
    checkedSharingOptions: getCheckedSharingOptions(state),
    downloadFileName: getFilenameString(state),
    sanitizedProfileEncodingState: getSanitizedProfileEncodingState(state),
    uploadPhase: getUploadPhase(state),
    uploadProgress: getUploadProgress(state),
    uploadProgressString: getUploadProgressString(state),
    uploadError: getUploadError(state),
    shouldSanitizeByDefault: getShouldSanitizeByDefault(state),
    abortFunction: getAbortFunction(state),
  }),
  mapDispatchToProps: {
    updateSharingOption,
    encodeSanitizedProfile,
    attemptToPublish,
    resetUploadState,
  },
  component: PublishPanelImpl,
});

type DownloadButtonProps = {
  readonly sanitizedProfileEncodingState: SanitizedProfileEncodingState;
  readonly downloadFileName: string;
};

/**
 * The DownloadButton handles unpacking the compressed profile promise.
 */
class DownloadButton extends React.PureComponent<DownloadButtonProps, {}> {
  override render() {
    const { sanitizedProfileEncodingState, downloadFileName } = this.props;
    const className =
      'photon-button publishPanelButton publishPanelButtonsDownload';

    switch (sanitizedProfileEncodingState.phase) {
      case 'DONE': {
        const { profileData } = sanitizedProfileEncodingState;
        return (
          <BlobUrlLink
            blob={profileData}
            download={`${downloadFileName}.gz`}
            className={className}
          >
            <span className="publishPanelButtonsSvg publishPanelButtonsSvgDownload" />
            <Localized id="MenuButtons--publish--download">Download</Localized>{' '}
            <span className="menuButtonsDownloadSize">
              ({prettyBytes(profileData.size)})
            </span>
          </BlobUrlLink>
        );
      }
      case 'ERROR': {
        return (
          <button type="button" className={className} disabled>
            <Localized id="MenuButtons--publish--download">Download</Localized>
          </button>
        );
      }
      case 'INITIAL':
      case 'ENCODING': {
        return (
          <button
            type="button"
            className={classNames(className, 'publishPanelButtonDisabled')}
          >
            <Localized id="MenuButtons--publish--compressing">
              Compressing…
            </Localized>
          </button>
        );
      }
      default:
        throw assertExhaustiveCheck(sanitizedProfileEncodingState);
    }
  }
}
