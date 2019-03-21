/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import classNames from 'classnames';
import actions from '../../../actions';
import { compress } from '../../../utils/gz';
import { uploadBinaryProfileData } from '../../../profile-logic/profile-store';
import ArrowPanel from '../../shared/ArrowPanel';
import ButtonWithPanel from '../../shared/ButtonWithPanel';
import { shortenUrl } from '../../../utils/shorten-url';
import {
  serializeProfile,
  sanitizePII,
} from '../../../profile-logic/process-profile';
import sha1 from '../../../utils/sha1';
import { sendAnalytics } from '../../../utils/analytics';
import url from 'url';

import type { Profile } from '../../../types/profile';
import type { RemoveProfileInformation } from '../../../types/profile-derived';
import type { Action, DataSource } from '../../../types/actions';
import type { ProfileSharingStatus } from '../../../types/state';

require('./ProfileSharing.css');

type Props = {|
  +profile: Profile,
  +dataSource: DataSource,
  +predictUrl: (Action | Action[]) => string,
  +onProfilePublished: typeof actions.profilePublished,
  +profileSharingStatus: ProfileSharingStatus,
  +setProfileSharingStatus: typeof actions.setProfileSharingStatus,
|};

type State = {
  state: string,
  uploadProgress: number,
  error: Error | null,
  fullUrl: string,
  shortUrl: string,
  shareNetworkUrls: boolean,
};

export class MenuButtonsProfileSharing extends React.PureComponent<
  Props,
  State
> {
  _permalinkButton: ButtonWithPanel | null;
  _permalinkTextField: HTMLInputElement | null;
  _takePermalinkButtonRef = (elem: any) => {
    this._permalinkButton = elem;
  };
  _takePermalinkTextFieldRef = (elem: any) => {
    this._permalinkTextField = elem;
  };
  _attemptToSecondaryShare = () => this._attemptToShare(true);

  constructor(props: Props) {
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
  }

  componentWillReceiveProps({ dataSource }: Props) {
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

  _onPermalinkPanelOpen = () => {
    this._shortenUrlAndFocusTextFieldOnCompletion();
  };

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

  _onPermalinkPanelClose = () => {
    if (this._permalinkTextField) {
      this._permalinkTextField.blur();
    }
  };

  _notifyAnalytics() {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile upload',
      eventAction: 'start',
    });
  }

  /**
   * This function starts the profile sharing process.
   * Takes an optional argument that indicates if the share attempt
   * is being made for the second time. We have two share buttons,
   * one for sharing for the first time, and one for sharing
   * after the initial share depending on the previous URL share status.
   * People can decide to remove the URLs from the profile after sharing
   * with URLs or they can decide to add the URLs after sharing without
   * them. We check the current state before attempting to share depending
   * on that flag.
   */
  _attemptToShare = async (isSecondaryShare: boolean = false) => {
    if (
      ((!isSecondaryShare && this.state.state !== 'local') ||
        (isSecondaryShare && this.state.state !== 'public')) &&
      this.state.state !== 'error'
    ) {
      return;
    }
    this._notifyAnalytics();

    const { profile, predictUrl, profileSharingStatus } = this.props;

    try {
      if (!profile) {
        throw new Error('profile is null');
      }

      const piiToBeRemoved: RemoveProfileInformation = {
        shouldRemoveThreads: new Set(),
        shouldRemoveThreadsWithScreenshots: new Set(),
        shouldRemoveNetworkUrls: !this.state.shareNetworkUrls,
        shouldRemoveAllUrls: false,
        shouldFilterToCommittedRange: null,
        shouldRemoveExtensions: false,
      };
      const sanitizedProfile = sanitizePII(profile, piiToBeRemoved);
      const jsonString = serializeProfile(sanitizedProfile);
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

      const typedArray = new TextEncoder().encode(jsonString);

      const [gzipData, hash]: [Uint8Array, string] = await Promise.all([
        compress(typedArray.slice(0)),
        sha1(typedArray),
      ]);

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

        if (this._permalinkButton) {
          this._permalinkButton.openPanel();
        }

        sendAnalytics({
          hitType: 'event',
          eventCategory: 'profile upload',
          eventAction: 'succeeded',
        });
      });

      await Promise.all([
        uploadPromise,
        this._shortenUrlAndFocusTextFieldOnCompletion(),
      ]);
    } catch (error) {
      // To avoid any interaction with running transitions, we delay setting
      // the new state by 300ms.
      setTimeout(() => {
        this.setState({
          state: 'error',
          error,
        });
      }, 300);
      sendAnalytics({
        hitType: 'event',
        eventCategory: 'profile upload',
        eventAction: 'failed',
      });
    }
  };

  _onChangeShareNetworkUrls = (event: SyntheticEvent<HTMLInputElement>) => {
    this.setState({
      shareNetworkUrls: event.currentTarget.checked,
    });
  };

  _onSecondarySharePanelOpen = () => {
    const { profileSharingStatus } = this.props;
    // In the secondary sharing panel, we disable the URL sharing checkbox and
    // force it to the value we haven't used yet.
    // Note that we can't have both sharedWithUrls and sharedWithoutUrls set to
    // true here because we don't show the secondary panel when that's the case.
    this.setState({
      shareNetworkUrls: !profileSharingStatus.sharedWithUrls,
    });
  };

  render() {
    const { state, uploadProgress, error, shortUrl } = this.state;
    const { profile, profileSharingStatus } = this.props;

    // We don't show the secondary button if any of these conditions is true:
    // 1. If we loaded a profile from a file or the public store that got its network URLs removed before.
    //    Note that profiles captured from the add-on have this property set to false.
    // 2. If it's been shared in both modes already; in that case we show no button at all.
    const disableSecondaryShareProfile =
      profile.meta.networkURLsRemoved ||
      (profileSharingStatus.sharedWithUrls &&
        profileSharingStatus.sharedWithoutUrls);

    // Additionally we show it only when the profile is already shared
    // (either loaded from a public store or previously shared), because otherwise
    // we show the primary button (or errors).
    const isSecondaryShareButtonVisible =
      state === 'public' && !disableSecondaryShareProfile;

    const secondaryShareLabel = profileSharingStatus.sharedWithUrls
      ? 'Share without URLs'
      : 'Share with URLs';

    return (
      <TransitionGroup
        className={classNames('menuButtonsCompositeButtonContainer', {
          currentButtonIsShareButton: state === 'local',
          currentButtonIsUploadingButton: state === 'uploading',
          currentButtonIsPermalinkButton: state === 'public',
          currentButtonIsUploadErrorButton: state === 'error',
          currentButtonIsSecondaryShareButton: isSecondaryShareButtonVisible,
        })}
        data-testid="menuButtonsCompositeButtonContainer"
      >
        {/* the buttons are conditionally rendered (depending on the state) */}
        {state === 'local' && (
          <AnimateUpTransition>
            <ProfileSharingButton
              buttonClassName="menuButtonsShareButton"
              shareLabel="Share…"
              okButtonClickEvent={this._attemptToShare}
              shareNetworkUrlCheckboxChecked={this.state.shareNetworkUrls}
              shareNetworkUrlCheckboxOnChange={this._onChangeShareNetworkUrls}
              checkboxDisabled={false}
            />
          </AnimateUpTransition>
        )}

        {state === 'uploading' && (
          <AnimateUpTransition>
            <UploadingStatus progress={uploadProgress} />
          </AnimateUpTransition>
        )}

        {/* The Permalink button is rendered when state === 'uploading' AND state === 'public'.
       The Permalink button itself is hidden when uploading is in progress,
       but the Permalink's ArrowPanel with the URL is always displayed. */}
        {(state === 'uploading' || state === 'public') && (
          <AnimateUpTransition>
            <ButtonWithPanel
              className="menuButtonsPermalinkButton"
              ref={this._takePermalinkButtonRef}
              label="Permalink"
              panel={
                <ArrowPanel
                  className="menuButtonsPermalinkPanel"
                  onOpen={this._onPermalinkPanelOpen}
                  onClose={this._onPermalinkPanelClose}
                >
                  <input
                    type="text"
                    className="menuButtonsPermalinkTextField photon-input"
                    value={shortUrl}
                    readOnly="readOnly"
                    ref={this._takePermalinkTextFieldRef}
                  />
                </ArrowPanel>
              }
            />
          </AnimateUpTransition>
        )}

        {state === 'error' && (
          <AnimateUpTransition>
            <ButtonWithPanel
              className="menuButtonsUploadErrorButton"
              label="Upload Error"
              open
              panel={
                <ArrowPanel
                  className="menuButtonsUploadErrorPanel"
                  title="Upload Error"
                  okButtonText="Try Again"
                  cancelButtonText="Cancel"
                  onOkButtonClick={this._attemptToShare}
                >
                  <p>An error occurred during upload:</p>
                  <pre>{error && error.toString()}</pre>
                </ArrowPanel>
              }
            />
          </AnimateUpTransition>
        )}

        {isSecondaryShareButtonVisible && (
          <AnimateUpTransition>
            <ProfileSharingButton
              buttonClassName="menuButtonsSecondaryShareButton"
              shareLabel={secondaryShareLabel}
              okButtonClickEvent={this._attemptToSecondaryShare}
              panelOpenEvent={this._onSecondarySharePanelOpen}
              shareNetworkUrlCheckboxChecked={this.state.shareNetworkUrls}
              checkboxDisabled={true}
            />
          </AnimateUpTransition>
        )}
      </TransitionGroup>
    );
  }
}

const PrivacyNotice = () => (
  <section className="privacyNotice">
    <p>
      You’re about to upload your profile publicly where anyone will be able to
      access it. To better diagnose performance problems profiles include the
      following information:
    </p>
    <ul>
      <li>The URLs of all painted tabs, and running scripts.</li>
      <li>The metadata of all your add-ons to identify slow add-ons.</li>
      <li>Firefox build and runtime configuration.</li>
    </ul>
    <p>
      To view all the information you can download the full profile to a file
      and open the json structure with a text editor.
    </p>
    <p>
      By default, the URLs of all network requests will be removed while sharing
      the profile but keeping the URLs may help to identify the problems. Please
      select the checkbox below to share the URLs of the network requests:
    </p>
  </section>
);

const UploadingStatus = ({ progress }: { progress: number }) => (
  <div className="menuButtonsUploadingButton">
    <div className="menuButtonsUploadingButtonInner">
      <progress
        className="menuButtonsUploadingButtonProgress"
        value={progress}
      />
      <div className="menuButtonsUploadingButtonLabel">Uploading...</div>
    </div>
  </div>
);

// CSSTransition wrapper component
const AnimateUpTransition = (props: {}) => (
  <CSSTransition
    {...props}
    timeout={200}
    classNames="menuButtonsTransitionUp"
  />
);

type ProfileSharingButtonProps = {|
  +buttonClassName: string,
  +shareLabel: string,
  +okButtonClickEvent: () => mixed,
  +panelOpenEvent?: () => void,
  +shareNetworkUrlCheckboxChecked: boolean,
  +shareNetworkUrlCheckboxOnChange?: (SyntheticEvent<HTMLInputElement>) => void,
  +checkboxDisabled: boolean,
|};

const ProfileSharingButton = ({
  buttonClassName,
  shareLabel,
  okButtonClickEvent,
  panelOpenEvent,
  shareNetworkUrlCheckboxChecked,
  shareNetworkUrlCheckboxOnChange,
  checkboxDisabled,
}: ProfileSharingButtonProps) => (
  <ButtonWithPanel
    className={buttonClassName}
    label={shareLabel}
    panel={
      <ArrowPanel
        className="menuButtonsPrivacyPanel"
        title="Upload Profile – Privacy Notice"
        okButtonText="Share"
        cancelButtonText="Cancel"
        onOkButtonClick={okButtonClickEvent}
        onOpen={panelOpenEvent ? panelOpenEvent : undefined}
      >
        <PrivacyNotice />
        <p className="menuButtonsShareNetworkUrlsContainer">
          <label>
            <input
              type="checkbox"
              className="menuButtonsShareNetworkUrlsCheckbox"
              checked={shareNetworkUrlCheckboxChecked}
              onChange={shareNetworkUrlCheckboxOnChange}
              disabled={checkboxDisabled}
            />
            Share the URLs of all network requests
          </label>
        </p>
      </ArrowPanel>
    }
  />
);
