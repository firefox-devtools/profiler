/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import {
  toggleCheckedSharingOptions,
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
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
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

type OwnProps = {|
  +isRepublish?: boolean,
|};

type StateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +shouldShowPreferenceOption: boolean,
  +profileContainsPrivateBrowsingInformation: boolean,
  +checkedSharingOptions: CheckedSharingOptions,
  +sanitizedProfileDataPromise: Promise<Uint8Array>,
  +downloadFileName: string,
  +uploadPhase: UploadPhase,
  +uploadProgress: number,
  +uploadProgressString: string,
  +shouldSanitizeByDefault: boolean,
  +uploadError: mixed,
  +abortFunction: () => mixed,
|};

type DispatchProps = {|
  +toggleCheckedSharingOptions: typeof toggleCheckedSharingOptions,
  +attemptToPublish: typeof attemptToPublish,
  +resetUploadState: typeof resetUploadState,
|};

type PublishProps = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type PublishState = {|
  compressError: Error | string | null,
  prevCompressedPromise: Promise<Uint8Array> | null,
|};

class MenuButtonsPublishImpl extends React.PureComponent<
  PublishProps,
  PublishState,
> {
  state = { compressError: null, prevCompressedPromise: null };
  _toggles: { [$Keys<CheckedSharingOptions>]: () => mixed } = {
    includeHiddenThreads: () =>
      this.props.toggleCheckedSharingOptions('includeHiddenThreads'),
    includeAllTabs: () =>
      this.props.toggleCheckedSharingOptions('includeAllTabs'),
    includeFullTimeRange: () =>
      this.props.toggleCheckedSharingOptions('includeFullTimeRange'),
    includeScreenshots: () =>
      this.props.toggleCheckedSharingOptions('includeScreenshots'),
    includeUrls: () => this.props.toggleCheckedSharingOptions('includeUrls'),
    includeExtension: () =>
      this.props.toggleCheckedSharingOptions('includeExtension'),
    includePreferenceValues: () =>
      this.props.toggleCheckedSharingOptions('includePreferenceValues'),
    includePrivateBrowsingData: () =>
      this.props.toggleCheckedSharingOptions('includePrivateBrowsingData'),
  };

  _renderCheckbox(
    slug: $Keys<CheckedSharingOptions>,
    labelL10nId: string,
    additionalContent?: React.Node
  ) {
    const { checkedSharingOptions } = this.props;
    const toggle = this._toggles[slug];
    return (
      <label className="photon-label menuButtonsPublishDataChoicesLabel">
        <input
          type="checkbox"
          className="photon-checkbox photon-checkbox-default"
          name={slug}
          onChange={toggle}
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
  ): $Shape<PublishState> | null {
    if (state.prevCompressedPromise !== props.sanitizedProfileDataPromise) {
      return {
        // Invalidate the old error info
        prevCompressedPromise: props.sanitizedProfileDataPromise,
        compressError: null,
      };
    }
    return null;
  }

  _onCompressError = (error) => {
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
      <div data-testid="MenuButtonsPublish-container">
        <form
          className="menuButtonsPublishContent photon-body-10"
          onSubmit={attemptToPublish}
        >
          <h1 className="menuButtonsPublishTitle photon-title-40">
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
          <p className="menuButtonsPublishInfoDescription">
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
          <div className="menuButtonsPublishDataChoices">
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
                      className="menuButtonsPublishDataChoicesIndicator"
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
          <div className="menuButtonsPublishButtons">
            <DownloadButton
              downloadFileName={downloadFileName}
              sanitizedProfileDataPromise={sanitizedProfileDataPromise}
              onCompressError={this._onCompressError}
            />
            <button
              type="submit"
              className="photon-button photon-button-primary menuButtonsPublishButton menuButtonsPublishButtonsUpload"
              disabled={this.state.compressError}
            >
              <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgUpload" />
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
        className="menuButtonsPublishUpload photon-body-10"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="menuButtonsPublishUploadTop">
          <div className="menuButtonsPublishUploadTitle photon-title-20">
            <Localized id="MenuButtons--publish--upload-title">
              Uploading profile…
            </Localized>
          </div>
          <div className="menuButtonsPublishUploadPercentage">
            {uploadProgressString}
          </div>
          <div className="menuButtonsPublishUploadBar">
            <div
              className="menuButtonsPublishUploadBarInner"
              style={{ width: `${uploadProgress * 100}%` }}
            />
          </div>
        </div>
        <div className="menuButtonsPublishButtons">
          <DownloadButton
            downloadFileName={downloadFileName}
            sanitizedProfileDataPromise={sanitizedProfileDataPromise}
            onCompressError={this._onCompressError}
          />
          <button
            type="button"
            className="photon-button photon-button-default menuButtonsPublishButton menuButtonsPublishButtonsCancelUpload"
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
        className="menuButtonsPublishUpload photon-body-10"
        data-testid="MenuButtonsPublish-container"
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
        <div className="menuButtonsPublishError">{message}</div>
      </div>
    );
  }

  render() {
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

export const MenuButtonsPublish = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
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
    toggleCheckedSharingOptions,
    attemptToPublish,
    resetUploadState,
  },
  component: MenuButtonsPublishImpl,
});

type DownloadButtonProps = {|
  +sanitizedProfileDataPromise: Promise<Uint8Array>,
  +downloadFileName: string,
  +onCompressError: (Error | string) => mixed,
|};

type DownloadButtonState = {|
  sanitizedProfileData: Uint8Array | null,
  prevPromise: Promise<Uint8Array> | null,
  error: Error | string | null,
|};

/**
 * The DownloadButton handles unpacking the compressed profile promise.
 */
class DownloadButton extends React.PureComponent<
  DownloadButtonProps,
  DownloadButtonState,
> {
  _isMounted: boolean = false;
  state = {
    sanitizedProfileData: null,
    prevPromise: null,
    error: null,
  };

  static getDerivedStateFromProps(
    props: DownloadButtonProps,
    state: DownloadButtonState
  ): $Shape<DownloadButtonState> | null {
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

  componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  componentDidUpdate(prevProps: DownloadButtonProps) {
    if (
      prevProps.sanitizedProfileDataPromise !==
      this.props.sanitizedProfileDataPromise
    ) {
      this._unwrapPromise();
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  render() {
    const { downloadFileName } = this.props;
    const { sanitizedProfileData, error } = this.state;
    const className =
      'photon-button menuButtonsPublishButton menuButtonsPublishButtonsDownload';

    if (sanitizedProfileData) {
      const blob = new Blob([sanitizedProfileData], {
        type: 'application/octet-binary',
      });
      return (
        <BlobUrlLink
          blob={blob}
          download={`${downloadFileName}.gz`}
          className={className}
        >
          <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgDownload" />
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
        className={classNames(className, 'menuButtonsPublishButtonDisabled')}
      >
        <Localized id="MenuButtons--publish--compressing">
          Compressing…
        </Localized>
      </button>
    );
  }
}
