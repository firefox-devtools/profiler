/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import {
  updateSharingOption,
  attemptToPublish,
  resetUploadState,
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
  getSanitizedProfileData,
  getUploadPhase,
  getUploadProgress,
  getUploadProgressString,
  getUploadError,
  getShouldSanitizeByDefault,
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
  readonly sanitizedProfileDataPromise: Promise<Uint8Array>;
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
  readonly attemptToPublish: typeof attemptToPublish;
  readonly resetUploadState: typeof resetUploadState;
};

type PublishProps = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type PublishState = {
  compressError: Error | string | null;
  prevCompressedPromise: Promise<Uint8Array> | null;
};

class PublishPanelImpl extends React.PureComponent<PublishProps, PublishState> {
  override state = { compressError: null, prevCompressedPromise: null };

  _onCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sharingOption = e.target.name as keyof CheckedSharingOptions;
    this.props.updateSharingOption(sharingOption, e.target.checked);
  }

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

  static getDerivedStateFromProps(
    props: PublishProps,
    state: PublishState
  ): Partial<PublishState> | null {
    if (state.prevCompressedPromise !== props.sanitizedProfileDataPromise) {
      return {
        // Invalidate the old error info
        prevCompressedPromise: props.sanitizedProfileDataPromise,
        compressError: null,
      };
    }
    return null;
  }

  _onCompressError = (error: Error | string) => {
    this.setState({ compressError: error });
  };

  _renderPublishPanel() {
    const {
      shouldShowPreferenceOption,
      profileContainsPrivateBrowsingInformation,
      sanitizedProfileDataPromise,
      attemptToPublish,
      downloadFileName,
      shouldSanitizeByDefault,
      isRepublish,
    } = this.props;

    return (
      <div data-testid="PublishPanel-container">
        <form
          className="publishPanelContent photon-body-10"
          onSubmit={attemptToPublish}
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
          {this.state.compressError ? (
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
              sanitizedProfileDataPromise={sanitizedProfileDataPromise}
              onCompressError={this._onCompressError}
            />
            <button
              type="submit"
              className="photon-button photon-button-primary publishPanelButton publishPanelButtonsUpload"
              disabled={!!this.state.compressError}
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
      sanitizedProfileDataPromise,
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
            sanitizedProfileDataPromise={sanitizedProfileDataPromise}
            onCompressError={this._onCompressError}
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
    sanitizedProfileDataPromise: getSanitizedProfileData(state),
    uploadPhase: getUploadPhase(state),
    uploadProgress: getUploadProgress(state),
    uploadProgressString: getUploadProgressString(state),
    uploadError: getUploadError(state),
    shouldSanitizeByDefault: getShouldSanitizeByDefault(state),
    abortFunction: getAbortFunction(state),
  }),
  mapDispatchToProps: {
    updateSharingOption,
    attemptToPublish,
    resetUploadState,
  },
  component: PublishPanelImpl,
});

type DownloadButtonProps = {
  readonly sanitizedProfileDataPromise: Promise<Uint8Array>;
  readonly downloadFileName: string;
  readonly onCompressError: (param: Error | string) => void;
};

type DownloadButtonState = {
  sanitizedProfileData: Uint8Array | null;
  prevPromise: Promise<Uint8Array> | null;
  error: Error | string | null;
};

/**
 * The DownloadButton handles unpacking the compressed profile promise.
 */
class DownloadButton extends React.PureComponent<
  DownloadButtonProps,
  DownloadButtonState
> {
  _isMounted: boolean = false;
  override state = {
    sanitizedProfileData: null,
    prevPromise: null,
    error: null,
  };

  static getDerivedStateFromProps(
    props: DownloadButtonProps,
    state: DownloadButtonState
  ): Partial<DownloadButtonState> | null {
    if (state.prevPromise !== props.sanitizedProfileDataPromise) {
      return {
        // Invalidate the old download size.
        sanitizedProfileData: null,
        prevPromise: props.sanitizedProfileDataPromise,
        error: null,
      };
    }
    return null;
  }

  _unwrapPromise() {
    const { sanitizedProfileDataPromise } = this.props;
    sanitizedProfileDataPromise.then(
      (sanitizedProfileData) => {
        if (this._isMounted) {
          this.setState({ sanitizedProfileData, error: null });
        }
      },
      (error) => {
        if (this._isMounted) {
          this.props.onCompressError(error);
          console.error('Error while compressing the profile data', error);
          this.setState({ sanitizedProfileData: null, error });
        }
      }
    );
  }

  override componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  override componentDidUpdate(prevProps: DownloadButtonProps) {
    if (
      prevProps.sanitizedProfileDataPromise !==
      this.props.sanitizedProfileDataPromise
    ) {
      this._unwrapPromise();
    }
  }

  override componentWillUnmount() {
    this._isMounted = false;
  }

  override render() {
    const { downloadFileName } = this.props;
    const { sanitizedProfileData, error } = this.state;
    const className =
      'photon-button publishPanelButton publishPanelButtonsDownload';

    if (sanitizedProfileData) {
      const blob = new Blob([sanitizedProfileData], {
        type: 'application/octet-binary',
      });
      return (
        <BlobUrlLink
          {...{
            blob,
            download: `${downloadFileName}.gz`,
            className,
          }}
        >
          <span className="publishPanelButtonsSvg publishPanelButtonsSvgDownload" />
          <Localized id="MenuButtons--publish--download">Download</Localized>{' '}
          <span className="menuButtonsDownloadSize">
            ({prettyBytes(blob.size)})
          </span>
        </BlobUrlLink>
      );
    }

    if (error) {
      return (
        <button type="button" className={className} disabled>
          <Localized id="MenuButtons--publish--download">Download</Localized>
        </button>
      );
    }

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
}
