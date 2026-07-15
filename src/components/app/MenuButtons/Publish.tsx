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
  getDownloadFilename,
  getUploadPhase,
  getUploadProgress,
  getUploadProgressString,
  getUploadError,
  getShouldSanitizeByDefault,
  getSanitizedProfileEncodingStates,
} from 'firefox-profiler/selectors/publish';
import { BlobUrlLink } from 'firefox-profiler/components/shared/BlobUrlLink';
import { ContextMenu } from 'firefox-profiler/components/shared/ContextMenu';
import { MenuItem, showMenu } from '@firefox-devtools/react-contextmenu';
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
  PublishProfileFormat,
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
  _inflightEncodings: Record<
    PublishProfileFormat,
    InflightProfileEncoding | undefined
  > = { jslb: undefined, json: undefined };

  override componentDidMount(): void {
    this._inflightEncodings.jslb = this.props.encodeSanitizedProfile('jslb');
  }

  _refreshEncoding = (format: PublishProfileFormat) => {
    this._inflightEncodings[format] = this.props.encodeSanitizedProfile(
      format,
      this._inflightEncodings[format]
    );
  };

  _onCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sharingOption = e.target.name as keyof CheckedSharingOptions;
    this.props.updateSharingOption(sharingOption, e.target.checked);

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

  _onSubmit = () => {
    this.props.attemptToPublish(this._inflightEncodings.jslb);
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

  _renderDownloadButton() {
    const {
      sanitizedProfileEncodingStates,
      jslbDownloadFileName,
      jsonDownloadFileName,
    } = this.props;
    return (
      <DownloadSplitButton
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
      sanitizedProfileEncodingStates,
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
            {this._renderDownloadButton()}
            <button
              type="submit"
              className="photon-button photon-button-primary publishPanelButton publishPanelButtonsUpload"
              disabled={sanitizedProfileEncodingStates.jslb.phase === 'ERROR'}
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
          {this._renderDownloadButton()}
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
    jslbDownloadFileName: getDownloadFilename(state, 'jslb'),
    jsonDownloadFileName: getDownloadFilename(state, 'json'),
    sanitizedProfileEncodingStates: getSanitizedProfileEncodingStates(state),
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

const DOWNLOAD_FORMAT_MENU_ID = 'PublishDownloadFormatContextMenu';

type DownloadSplitButtonProps = {
  readonly jslbEncodingState: SanitizedProfileEncodingState;
  readonly jsonEncodingState: SanitizedProfileEncodingState;
  readonly jslbDownloadFileName: string;
  readonly jsonDownloadFileName: string;
  readonly onJsonDropdownOpen: () => void;
};

type DownloadSplitButtonState = {
  readonly isMenuVisible: boolean;
  // react-contextmenu hides the menu on mousedown even if it's already
  // visible. We track visibility at mousedown time so that clicking the
  // toggle button while the menu is open results in a net "close" rather
  // than a hide-then-reshow.
  readonly wasMenuVisibleOnMouseDown: boolean;
};

/**
 * Split button: the main body downloads the profile as JSLB, and the arrow
 * on the right opens a dropdown menu with alternate download formats.
 * The dropdown uses the same react-contextmenu-based menu style as the
 * marker chart's filter/copy buttons.
 */
class DownloadSplitButton extends React.PureComponent<
  DownloadSplitButtonProps,
  DownloadSplitButtonState
> {
  override state: DownloadSplitButtonState = {
    isMenuVisible: false,
    wasMenuVisibleOnMouseDown: false,
  };

  _onToggleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (this.state.wasMenuVisibleOnMouseDown) {
      // The menu was already open on mousedown, so react-contextmenu has
      // already hidden it. Don't reopen it.
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    // The menu is right-aligned to the toggle button since it sits near the
    // right edge of the publish panel.
    showMenu({
      data: null,
      id: DOWNLOAD_FORMAT_MENU_ID,
      position: { x: rect.right, y: rect.bottom },
      target: event.target,
    });
  };

  _onToggleMouseDown = () => {
    this.setState((state) => ({
      wasMenuVisibleOnMouseDown: state.isMenuVisible,
    }));
  };

  _onMenuShow = () => {
    this.setState({ isMenuVisible: true });
    this.props.onJsonDropdownOpen();
  };

  _onMenuHide = () => {
    this.setState({ isMenuVisible: false });
  };

  override render() {
    const {
      jslbEncodingState,
      jsonEncodingState,
      jslbDownloadFileName,
      jsonDownloadFileName,
    } = this.props;
    const { isMenuVisible } = this.state;

    return (
      <div className="publishPanelSplitButton">
        <DownloadPrimary
          encodingState={jslbEncodingState}
          downloadFileName={jslbDownloadFileName}
        />
        <button
          type="button"
          className={classNames(
            'photon-button',
            'publishPanelSplitButtonToggleButton',
            {
              'publishPanelSplitButtonToggleButton--open': isMenuVisible,
            }
          )}
          title="Other download formats"
          aria-haspopup="menu"
          aria-expanded={isMenuVisible}
          onClick={this._onToggleClick}
          onMouseDown={this._onToggleMouseDown}
        />
        <DownloadFormatContextMenu
          menuId={DOWNLOAD_FORMAT_MENU_ID}
          onShow={this._onMenuShow}
          onHide={this._onMenuHide}
          jsonEncodingState={jsonEncodingState}
          jsonDownloadFileName={jsonDownloadFileName}
        />
      </div>
    );
  }
}

type DownloadPrimaryProps = {
  readonly encodingState: SanitizedProfileEncodingState;
  readonly downloadFileName: string;
};

/**
 * The primary (left) part of the split button. Downloads the profile as JSLB.
 */
class DownloadPrimary extends React.PureComponent<DownloadPrimaryProps> {
  override render() {
    const { encodingState, downloadFileName } = this.props;
    const className =
      'photon-button publishPanelButton publishPanelSplitButtonMain publishPanelButtonsDownload';

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

type DownloadFormatContextMenuProps = {
  readonly menuId: string;
  readonly onShow: () => void;
  readonly onHide: () => void;
  readonly jsonEncodingState: SanitizedProfileEncodingState;
  readonly jsonDownloadFileName: string;
};

/**
 * Trigger a file download for a Blob without needing a persistent
 * BlobUrlLink anchor. Used from a react-contextmenu MenuItem's onClick,
 * where we can't wrap the item in an <a download>.
 */
function _triggerBlobDownload(blob: Blob, downloadFileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadFileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke asynchronously so Safari has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * The dropdown menu for alternative download formats, rendered as a
 * react-contextmenu (the same menu style used next to the marker chart
 * search field).
 */
class DownloadFormatContextMenu extends React.PureComponent<DownloadFormatContextMenuProps> {
  _onDownloadJson = () => {
    const { jsonEncodingState, jsonDownloadFileName } = this.props;
    if (jsonEncodingState.phase !== 'DONE') {
      return;
    }
    _triggerBlobDownload(
      jsonEncodingState.profileData,
      `${jsonDownloadFileName}.gz`
    );
  };

  _renderJsonMenuItemLabel() {
    const { jsonEncodingState } = this.props;
    switch (jsonEncodingState.phase) {
      case 'DONE':
        return (
          <>
            <Localized id="MenuButtons--publish--download-json">
              Download as JSON
            </Localized>
            {` (${prettyBytes(jsonEncodingState.profileData.size)})`}
          </>
        );
      case 'ERROR':
        return (
          <Localized id="MenuButtons--publish--download-json-error">
            Error preparing JSON download
          </Localized>
        );
      case 'INITIAL':
      case 'ENCODING':
        return (
          <Localized id="MenuButtons--publish--compressing">
            Compressing…
          </Localized>
        );
      default:
        throw assertExhaustiveCheck(jsonEncodingState);
    }
  }

  override render() {
    const { menuId, onShow, onHide, jsonEncodingState } = this.props;
    const jsonReady = jsonEncodingState.phase === 'DONE';

    return (
      <ContextMenu
        id={menuId}
        className="publishPanelDownloadFormatContextMenu"
        onShow={onShow}
        onHide={onHide}
      >
        <MenuItem
          onClick={this._onDownloadJson}
          disabled={!jsonReady}
          preventClose={!jsonReady}
        >
          {this._renderJsonMenuItemLabel()}
        </MenuItem>
      </ContextMenu>
    );
  }
}
