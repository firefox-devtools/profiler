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
} from 'firefox-profiler/selectors/profile';
import {
  getAbortFunction,
  getCheckedSharingOptions,
  getFilenameString,
  getDownloadSize,
  getCompressedProfileBlob,
  getUploadPhase,
  getUploadProgress,
  getUploadProgressString,
  getUploadError,
  getShouldSanitizeByDefault,
} from 'firefox-profiler/selectors/publish';
import { BlobUrlLink } from 'firefox-profiler/components/shared/BlobUrlLink';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import type {
  Profile,
  CheckedSharingOptions,
  StartEndRange,
  UploadPhase,
} from 'firefox-profiler/types';

require('./Publish.css');

type OwnProps = {|
  +isRepublish?: boolean,
|};

type StateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +shouldShowPreferenceOption: boolean,
  +checkedSharingOptions: CheckedSharingOptions,
  +downloadSizePromise: Promise<string>,
  +compressedProfileBlobPromise: Promise<Blob>,
  +downloadFileName: string,
  +uploadPhase: UploadPhase,
  +uploadProgress: number,
  +uploadProgressString: string,
  +shouldSanitizeByDefault: boolean,
  +error: mixed,
  +abortFunction: () => mixed,
|};

type DispatchProps = {|
  +toggleCheckedSharingOptions: typeof toggleCheckedSharingOptions,
  +attemptToPublish: typeof attemptToPublish,
  +resetUploadState: typeof resetUploadState,
|};

type PublishProps = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class MenuButtonsPublishImpl extends React.PureComponent<PublishProps> {
  _toggles: { [$Keys<CheckedSharingOptions>]: () => mixed } = {
    includeHiddenThreads: () =>
      this.props.toggleCheckedSharingOptions('includeHiddenThreads'),
    includeFullTimeRange: () =>
      this.props.toggleCheckedSharingOptions('includeFullTimeRange'),
    includeScreenshots: () =>
      this.props.toggleCheckedSharingOptions('includeScreenshots'),
    includeUrls: () => this.props.toggleCheckedSharingOptions('includeUrls'),
    includeExtension: () =>
      this.props.toggleCheckedSharingOptions('includeExtension'),
    includePreferenceValues: () =>
      this.props.toggleCheckedSharingOptions('includePreferenceValues'),
  };

  _renderCheckbox(slug: $Keys<CheckedSharingOptions>, label: string) {
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
        {label}
      </label>
    );
  }

  _renderPublishPanel() {
    const {
      shouldShowPreferenceOption,
      downloadSizePromise,
      attemptToPublish,
      downloadFileName,
      compressedProfileBlobPromise,
      shouldSanitizeByDefault,
      isRepublish,
    } = this.props;

    return (
      <div data-testid="MenuButtonsPublish-container">
        <form className="menuButtonsPublishContent" onSubmit={attemptToPublish}>
          <div className="menuButtonsPublishIcon" />
          <h1 className="menuButtonsPublishTitle">
            {isRepublish
              ? 'Re-publish Performance Profile'
              : 'Share Performance Profile'}
          </h1>
          <p className="menuButtonsPublishInfoDescription">
            Upload your profile and make it accessible to anyone with the link.
            {shouldSanitizeByDefault
              ? ' By default, your personal data is removed.'
              : ' This profile is from Firefox Nightly, so by default all information is included.'}
          </p>
          <h3>Include additional data that may be identifiable</h3>
          <div className="menuButtonsPublishDataChoices">
            {this._renderCheckbox(
              'includeHiddenThreads',
              'Include hidden threads'
            )}
            {this._renderCheckbox(
              'includeFullTimeRange',
              'Include hidden time range'
            )}
            {this._renderCheckbox('includeScreenshots', 'Include screenshots')}
            {this._renderCheckbox(
              'includeUrls',
              'Include resource URLs and paths'
            )}
            {this._renderCheckbox(
              'includeExtension',
              'Include extension information'
            )}
            {shouldShowPreferenceOption
              ? this._renderCheckbox(
                  'includePreferenceValues',
                  'Include preference values'
                )
              : null}
          </div>
          <div className="menuButtonsPublishButtons">
            <DownloadButton
              downloadFileName={downloadFileName}
              compressedProfileBlobPromise={compressedProfileBlobPromise}
              downloadSizePromise={downloadSizePromise}
            />
            <button
              type="submit"
              className="photon-button photon-button-primary menuButtonsPublishButton menuButtonsPublishButtonsUpload"
            >
              <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgUpload" />
              Publish
            </button>
          </div>
        </form>
      </div>
    );
  }

  _closePanelAfterUpload = () => {
    const { resetUploadState } = this.props;
    // Only reset it after the panel animation disappears.
    setTimeout(resetUploadState, 300);

    const { body } = document;
    if (body) {
      // This is a hack to close the arrow panel. See the following issue on
      // moving this to the Redux state.
      //
      // https://github.com/firefox-devtools/profiler/issues/1888
      body.dispatchEvent(new MouseEvent('mousedown'));
    }
  };

  _renderUploadPanel() {
    const {
      uploadProgress,
      uploadProgressString,
      abortFunction,
      downloadFileName,
      compressedProfileBlobPromise,
      downloadSizePromise,
    } = this.props;

    return (
      <div
        className="menuButtonsPublishUpload"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="menuButtonsPublishUploadTop">
          <div className="menuButtonsPublishUploadTitle">
            Publishing profile…
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
            compressedProfileBlobPromise={compressedProfileBlobPromise}
            downloadSizePromise={downloadSizePromise}
          />
          <button
            type="button"
            className="photon-button photon-button-default menuButtonsPublishButton menuButtonsPublishButtonsCancelUpload"
            onClick={abortFunction}
          >
            Cancel Upload
          </button>
        </div>
      </div>
    );
  }

  _renderErrorPanel() {
    const { error, resetUploadState } = this.props;
    let message: string =
      'There was an unknown error when trying to publish the profile.';
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
        className="menuButtonsPublishUpload"
        data-testid="MenuButtonsPublish-container"
      >
        <div className="photon-message-bar photon-message-bar-error">
          Uh oh, something went wrong when publishing the profile.
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
            onClick={resetUploadState}
          >
            Try again
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
  DispatchProps
>({
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    shouldShowPreferenceOption: getHasPreferenceMarkers(state),
    checkedSharingOptions: getCheckedSharingOptions(state),
    downloadSizePromise: getDownloadSize(state),
    downloadFileName: getFilenameString(state),
    compressedProfileBlobPromise: getCompressedProfileBlob(state),
    uploadPhase: getUploadPhase(state),
    uploadProgress: getUploadProgress(state),
    uploadProgressString: getUploadProgressString(state),
    error: getUploadError(state),
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

type DownloadSizeProps = {|
  +downloadSizePromise: Promise<string>,
|};

type DownloadSizeState = {|
  downloadSize: string | null,
|};

/**
 * The DownloadSize handles unpacking the downloadSizePromise.
 */
class DownloadSize extends React.PureComponent<
  DownloadSizeProps,
  DownloadSizeState
> {
  _isMounted: boolean = true;

  state = {
    downloadSize: null,
  };

  _unwrapPromise() {
    const { downloadSizePromise } = this.props;
    downloadSizePromise.then(downloadSize => {
      if (this._isMounted) {
        this.setState({ downloadSize });
      }
    });
  }

  componentDidUpdate(prevProps: DownloadSizeProps) {
    if (prevProps.downloadSizePromise !== this.props.downloadSizePromise) {
      this._unwrapPromise();
    }
  }

  componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  render() {
    const { downloadSize } = this.state;
    if (downloadSize === null) {
      return null;
    }
    return <span className="menuButtonsDownloadSize">({downloadSize})</span>;
  }
}

type DownloadButtonProps = {|
  +compressedProfileBlobPromise: Promise<Blob>,
  +downloadSizePromise: Promise<string>,
  +downloadFileName: string,
|};

type DownloadButtonState = {|
  compressedProfileBlob: Blob | null,
  prevPromise: Promise<Blob> | null,
|};

/**
 * The DownloadButton handles unpacking the compressed profile promise.
 */
class DownloadButton extends React.PureComponent<
  DownloadButtonProps,
  DownloadButtonState
> {
  _isMounted: boolean = false;
  state = {
    compressedProfileBlob: null,
    prevPromise: null,
  };

  static getDerivedStateFromProps(
    props: DownloadButtonProps,
    state: DownloadButtonState
  ): $Shape<DownloadButtonState> | null {
    if (state.prevPromise !== props.compressedProfileBlobPromise) {
      return {
        // Invalidate the old download size.
        compressedProfileBlob: null,
        prevPromise: props.compressedProfileBlobPromise,
      };
    }
    return null;
  }

  _unwrapPromise() {
    const { compressedProfileBlobPromise } = this.props;
    compressedProfileBlobPromise.then(compressedProfileBlob => {
      if (this._isMounted) {
        this.setState({ compressedProfileBlob });
      }
    });
  }

  componentDidMount() {
    this._isMounted = true;
    this._unwrapPromise();
  }

  componentDidUpdate(prevProps: DownloadButtonProps) {
    if (
      prevProps.compressedProfileBlobPromise !==
      this.props.compressedProfileBlobPromise
    ) {
      this._unwrapPromise();
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  render() {
    const { downloadFileName, downloadSizePromise } = this.props;
    const { compressedProfileBlob } = this.state;
    const className =
      'photon-button menuButtonsPublishButton menuButtonsPublishButtonsDownload';

    if (compressedProfileBlob) {
      return (
        <BlobUrlLink
          blob={compressedProfileBlob}
          download={`${downloadFileName}.gz`}
          className={className}
        >
          <span className="menuButtonsPublishButtonsSvg menuButtonsPublishButtonsSvgDownload" />
          Download <DownloadSize downloadSizePromise={downloadSizePromise} />
        </BlobUrlLink>
      );
    }

    return (
      <button
        type="button"
        className={classNames(className, 'menuButtonsPublishButtonDisabled')}
      >
        Compressing…
      </button>
    );
  }
}
