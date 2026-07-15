/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
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
  getHasJSTracingArgumentValues,
} from 'firefox-profiler/selectors/profile';
import {
  getAbortFunction,
  getCheckedSharingOptions,
  getDownloadFilename,
  getUploadPhase,
  getUploadProgress,
  getUploadProgressString,
  getUploadError,
  getShouldSanitizeByDefault,
  getSanitizedProfileEncodingStates,
} from 'firefox-profiler/selectors/publish';
import { BlobUrlLink } from 'firefox-profiler/components/shared/BlobUrlLink';
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import prettyBytes from 'firefox-profiler/utils/pretty-bytes';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import WarningImage from 'firefox-profiler-res/img/svg/warning.svg';

import type {
  Profile,
  CheckedSharingOptions,
  SharingMode,
  StartEndRange,
  UploadPhase,
  SanitizedProfileEncodingState,
  PublishProfileFormat,
} from 'firefox-profiler/types';

import './Publish.css';
import { Localized } from '@fluent/react';

type OwnProps = {
  readonly mode: SharingMode;
  readonly isRepublish?: boolean;
};

type StateProps = {
  readonly profile: Profile;
  readonly rootRange: StartEndRange;
  readonly shouldShowPreferenceOption: boolean;
  readonly profileContainsPrivateBrowsingInformation: boolean;
  readonly profileHasJSTracingArgumentValues: boolean;
  readonly checkedSharingOptions: CheckedSharingOptions;
  readonly sanitizedProfileEncodingStates: Record<
    PublishProfileFormat,
    SanitizedProfileEncodingState
  >;
  readonly jslbDownloadFileName: string;
  readonly jsonDownloadFileName: string;
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
  override componentDidMount(): void {
    this._refreshEncoding('jslb');
  }

  _refreshEncoding = (format: PublishProfileFormat) => {
    this.props.encodeSanitizedProfile(this.props.mode, format);
  };

  _onCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sharingOption = e.target.name as keyof CheckedSharingOptions;
    this.props.updateSharingOption(
      this.props.mode,
      sharingOption,
      e.target.checked
    );

    this._refreshEncoding('jslb');
    // Only keep the JSON encoding fresh if it has already been requested at
    // least once (i.e. the user has opened the download dropdown).
    if (this.props.sanitizedProfileEncodingStates.json.phase !== 'INITIAL') {
      this._refreshEncoding('json');
    }
  };

  _onJsonDropdownOpen = () => {
    this._refreshEncoding('json');
  };

  _renderCheckbox(
    slug: keyof CheckedSharingOptions,
    labelL10nId: string,
    additionalContent?: React.ReactNode
  ) {
    const { checkedSharingOptions, uploadPhase, mode } = this.props;
    // Only the panel whose upload is in flight needs to freeze its options.
    // The two modes have independent options, so an upload started from Share
    // is no reason to stop someone adjusting what they save to disk.
    const isUploading =
      mode === 'upload' &&
      (uploadPhase === 'uploading' || uploadPhase === 'compressing');
    return (
      <label className="photon-label publishPanelDataChoicesLabel">
        <input
          type="checkbox"
          className="photon-checkbox photon-checkbox-default"
          name={slug}
          onChange={this._onCheckboxChange}
          checked={checkedSharingOptions[slug]}
          disabled={isUploading}
        />
        <span>
          <Localized id={labelL10nId} />
          {additionalContent}
        </span>
      </label>
    );
  }

  _onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Without this, submitting the form navigates to the current URL and
    // reloads the whole app. Today that is masked by attemptToPublish
    // dispatching synchronously, which unmounts the form before the browser
    // gets to the default action -- don't rely on that.
    event.preventDefault();
    if (this.props.mode === 'download') {
      // The download panel has no submit button; there is nothing to publish.
      return;
    }
    this.props.attemptToPublish();
  };

  _renderDownloadButton(primary: boolean) {
    const {
      sanitizedProfileEncodingStates,
      jslbDownloadFileName,
      jsonDownloadFileName,
    } = this.props;
    return (
      <DownloadSplitButton
        primary={primary}
        jslbEncodingState={sanitizedProfileEncodingStates.jslb}
        jsonEncodingState={sanitizedProfileEncodingStates.json}
        jslbDownloadFileName={jslbDownloadFileName}
        jsonDownloadFileName={jsonDownloadFileName}
        onJsonDropdownOpen={this._onJsonDropdownOpen}
      />
    );
  }

  _renderPublishPanel() {
    const {
      shouldShowPreferenceOption,
      profileContainsPrivateBrowsingInformation,
      profileHasJSTracingArgumentValues,
      sanitizedProfileEncodingStates,
      shouldSanitizeByDefault,
      isRepublish,
      mode,
    } = this.props;

    const isDownload = mode === 'download';

    let title;
    if (isDownload) {
      title = (
        <Localized id="MenuButtons--publish--download-performance-profile">
          Download Performance Profile
        </Localized>
      );
    } else if (isRepublish) {
      title = (
        <Localized id="MenuButtons--publish--reshare-performance-profile">
          Re-share Performance Profile
        </Localized>
      );
    } else {
      title = (
        <Localized id="MenuButtons--publish--share-performance-profile">
          Share Performance Profile
        </Localized>
      );
    }

    return (
      <div data-testid="PublishPanel-container">
        <form
          className="publishPanelContent photon-body-10"
          onSubmit={this._onSubmit}
        >
          <h1 className="publishPanelTitle photon-title-30">{title}</h1>
          <p className="publishPanelInfoDescription">
            {isDownload ? (
              <Localized id="MenuButtons--publish--download-info-description">
                Save this profile as a file on your computer.
              </Localized>
            ) : (
              <Localized id="MenuButtons--publish--info-description">
                Upload your profile and make it accessible to anyone with the
                link.
              </Localized>
            )}{' '}
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
            {profileHasJSTracingArgumentValues
              ? this._renderCheckbox(
                  'includeArgumentValues',
                  'MenuButtons--publish--renderCheckbox-label-argument-values',
                  <Localized
                    id="MenuButtons--publish--renderCheckbox-label-argument-values-warning-image"
                    attrs={{ title: true }}
                  >
                    <img
                      className="publishPanelDataChoicesIndicator"
                      src={WarningImage}
                      title="This profile contains function argument values recorded from the page, which may include personal data"
                    />
                  </Localized>
                )
              : null}
          </div>
          {sanitizedProfileEncodingStates.jslb.phase === 'ERROR' ? (
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
            {isDownload ? (
              this._renderDownloadButton(true)
            ) : (
              <button
                type="submit"
                className="photon-button photon-button-primary publishPanelButton publishPanelButtonsUpload"
                disabled={sanitizedProfileEncodingStates.jslb.phase === 'ERROR'}
              >
                <span className="publishPanelButtonsSvg publishPanelButtonsSvgUpload" />
                <Localized id="MenuButtons--publish--button-upload">
                  Upload
                </Localized>{' '}
                {sanitizedProfileEncodingStates.jslb.phase === 'DONE' ? (
                  <span className="menuButtonsDownloadSize">
                    (
                    {prettyBytes(
                      sanitizedProfileEncodingStates.jslb.profileData.size
                    )}
                    )
                  </span>
                ) : null}
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  _renderUploadPanel() {
    const { uploadProgress, uploadProgressString, abortFunction } = this.props;

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
          {this._renderDownloadButton(false)}
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
    const { uploadPhase, mode } = this.props;
    if (mode === 'download') {
      return this._renderPublishPanel();
    }
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
  mapStateToProps: (state, ownProps) => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    shouldShowPreferenceOption: getHasPreferenceMarkers(state),
    profileContainsPrivateBrowsingInformation:
      getContainsPrivateBrowsingInformation(state),
    profileHasJSTracingArgumentValues: getHasJSTracingArgumentValues(state),
    checkedSharingOptions: getCheckedSharingOptions(state, ownProps.mode),
    jslbDownloadFileName: getDownloadFilename(state, 'jslb'),
    jsonDownloadFileName: getDownloadFilename(state, 'json'),
    sanitizedProfileEncodingStates: getSanitizedProfileEncodingStates(
      state,
      ownProps.mode
    ),
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

type DownloadSplitButtonProps = {
  readonly primary: boolean;
  readonly jslbEncodingState: SanitizedProfileEncodingState;
  readonly jsonEncodingState: SanitizedProfileEncodingState;
  readonly jslbDownloadFileName: string;
  readonly jsonDownloadFileName: string;
  readonly onJsonDropdownOpen: () => void;
};

/**
 * Split button: the main body downloads the profile as JSLB, and the arrow
 * on the right opens a dropdown menu with alternate download formats.
 */
class DownloadSplitButton extends React.PureComponent<DownloadSplitButtonProps> {
  override render() {
    const {
      primary,
      jslbEncodingState,
      jsonEncodingState,
      jslbDownloadFileName,
      jsonDownloadFileName,
      onJsonDropdownOpen,
    } = this.props;

    return (
      <div className="publishPanelSplitButton">
        <DownloadPrimary
          primary={primary}
          encodingState={jslbEncodingState}
          downloadFileName={jslbDownloadFileName}
        />
        <ButtonWithPanel
          className="publishPanelSplitButtonToggle"
          buttonClassName="photon-button publishPanelSplitButtonToggleButton"
          panelClassName="publishPanelSplitButtonPanel"
          label=""
          title="Show other download formats"
          onPanelOpen={onJsonDropdownOpen}
          panelContent={
            <DownloadFormatMenu
              jsonEncodingState={jsonEncodingState}
              jsonDownloadFileName={jsonDownloadFileName}
            />
          }
        />
      </div>
    );
  }
}

type DownloadPrimaryProps = {
  readonly encodingState: SanitizedProfileEncodingState;
  readonly downloadFileName: string;
  readonly primary?: boolean;
};

/**
 * The primary (left) part of the split button. Downloads the profile as JSLB.
 */
class DownloadPrimary extends React.PureComponent<DownloadPrimaryProps> {
  override render() {
    const { encodingState, downloadFileName, primary } = this.props;
    const className = classNames(
      'photon-button publishPanelButton publishPanelSplitButtonMain publishPanelButtonsDownload',
      { 'photon-button-primary publishPanelButtonsDownloadPrimary': primary }
    );

    switch (encodingState.phase) {
      case 'DONE': {
        const { profileData } = encodingState;
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
        throw assertExhaustiveCheck(encodingState);
    }
  }
}

type DownloadFormatMenuProps = {
  readonly jsonEncodingState: SanitizedProfileEncodingState;
  readonly jsonDownloadFileName: string;
};

/**
 * Content of the dropdown panel: alternative download formats.
 */
class DownloadFormatMenu extends React.PureComponent<DownloadFormatMenuProps> {
  override render() {
    const { jsonEncodingState, jsonDownloadFileName } = this.props;
    const itemClassName = 'publishPanelSplitButtonMenuItem';

    switch (jsonEncodingState.phase) {
      case 'DONE': {
        const { profileData } = jsonEncodingState;
        return (
          <BlobUrlLink
            blob={profileData}
            download={`${jsonDownloadFileName}.gz`}
            className={itemClassName}
          >
            <Localized id="MenuButtons--publish--download-json">
              Download as JSON
            </Localized>{' '}
            <span className="menuButtonsDownloadSize">
              ({prettyBytes(profileData.size)})
            </span>
          </BlobUrlLink>
        );
      }
      case 'ERROR': {
        return (
          <span
            className={classNames(
              itemClassName,
              'publishPanelSplitButtonMenuItemDisabled'
            )}
          >
            <Localized id="MenuButtons--publish--download-json-error">
              Error preparing JSON download
            </Localized>
          </span>
        );
      }
      case 'INITIAL':
      case 'ENCODING': {
        return (
          <span
            className={classNames(
              itemClassName,
              'publishPanelSplitButtonMenuItemDisabled'
            )}
          >
            <Localized id="MenuButtons--publish--compressing">
              Compressing…
            </Localized>
          </span>
        );
      }
      default:
        throw assertExhaustiveCheck(jsonEncodingState);
    }
  }
}
