/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import { AppHeader } from './AppHeader';
import { InnerNavigationLink } from 'firefox-profiler/components/shared/InnerNavigationLink';
import { ListOfPublishedProfiles } from './ListOfPublishedProfiles';

import explicitConnect from 'firefox-profiler/utils/connect';
import {
  isDarkMode,
  setLightMode,
  setDarkMode,
} from 'firefox-profiler/utils/dark-mode';
import PerfScreenshot from 'firefox-profiler-res/img/jpg/perf-screenshot-2021-05-06.jpg';
import FirefoxPopupScreenshot from 'firefox-profiler-res/img/jpg/firefox-profiler-button-2021-05-06.jpg';
import {
  retrieveProfileFromFile,
  triggerLoadingFromUrl,
} from 'firefox-profiler/actions/receive-profile';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {
  queryIsMenuButtonEnabled,
  enableMenuButton,
} from 'firefox-profiler/app-logic/web-channel';
import { getBrowserConnection } from 'firefox-profiler/selectors/app';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';
import './Home.css';

import { DragAndDropOverlay } from './DragAndDrop';

type ActionButtonsProps = {
  readonly onLoadProfileFromFileRequested: (file: File) => void;
  readonly onLoadProfileFromUrlRequested: (url: string) => void;
};

type ActionButtonsState = {
  isLoadFromUrlPressed: boolean;
};

type LoadFromUrlProps = {
  readonly onLoadProfileFromUrlRequested: (url: string) => void;
};

type LoadFromUrlState = {
  value: string;
};

class ActionButtons extends React.PureComponent<
  ActionButtonsProps,
  ActionButtonsState
> {
  _fileInput: HTMLInputElement | null = null;

  override state = {
    isLoadFromUrlPressed: false,
  };

  _takeInputRef = (input: HTMLInputElement | null) => {
    this._fileInput = input;
  };

  _uploadProfileFromFile = async () => {
    if (this._fileInput && this._fileInput.files?.[0]) {
      this.props.onLoadProfileFromFileRequested(this._fileInput.files[0]);
    }
  };

  _loadFromFilePressed = () => {
    // Open the file picker.
    if (this._fileInput) {
      this._fileInput.click();
    }
  };

  _loadFromUrlPressed = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    this.setState((prevState) => {
      return { isLoadFromUrlPressed: !prevState.isLoadFromUrlPressed };
    });
  };

  override render() {
    return (
      <div className="homeSectionLoadProfile">
        <div className="homeSectionActionButtons">
          <input
            className="homeSectionUploadFromFileInput"
            type="file"
            ref={this._takeInputRef}
            onChange={this._uploadProfileFromFile}
          />
          <Localized id="Home--upload-from-file-input-button">
            <button
              type="button"
              className="homeSectionButton"
              onClick={this._loadFromFilePressed}
            >
              Load a profile from file
            </button>
          </Localized>
          <Localized id="Home--upload-from-url-button">
            <button
              type="button"
              className="homeSectionButton"
              onClick={this._loadFromUrlPressed}
              // when the button is clicked it expands to the URL input
              aria-expanded={this.state.isLoadFromUrlPressed}
            >
              Load a profile from a URL
            </button>
          </Localized>
        </div>
        {this.state.isLoadFromUrlPressed ? (
          <LoadFromUrl
            onLoadProfileFromUrlRequested={
              this.props.onLoadProfileFromUrlRequested
            }
          />
        ) : null}
      </div>
    );
  }
}

class LoadFromUrl extends React.PureComponent<
  LoadFromUrlProps,
  LoadFromUrlState
> {
  override state = {
    value: '',
  };

  handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    this.setState({
      value: event.currentTarget.value,
    });
  };

  _upload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (this.state.value) {
      this.props.onLoadProfileFromUrlRequested(this.state.value);
    }
  };

  override render() {
    return (
      <form className="homeSectionLoadFromUrl" onSubmit={this._upload}>
        <input
          className="homeSectionLoadFromUrlInput photon-input"
          type="url"
          placeholder="https://"
          value={this.state.value}
          onChange={this.handleChange}
          autoFocus
        />
        <Localized
          id="Home--load-from-url-submit-button"
          attrs={{ value: true }}
        >
          <input
            type="submit"
            className="homeSectionButton homeSectionLoadFromUrlSubmitButton"
            value="Load"
          />
        </Localized>
      </form>
    );
  }
}

function DocsButton() {
  return (
    <a href="/docs/" className="homeSectionButton">
      <span className="homeSectionDocsIcon" />
      <Localized id="Home--documentation-button">Documentation</Localized>
    </a>
  );
}

function InstructionTransition(props: { children: React.ReactNode }) {
  return (
    <CSSTransition
      {...props}
      classNames="homeTransition"
      timeout={300}
      exit={false}
    />
  );
}

type OwnHomeProps = {
  readonly specialMessage?: string;
};

type StateHomeProps = {
  readonly browserConnection: BrowserConnection | null;
};

type DispatchHomeProps = {
  readonly retrieveProfileFromFile: typeof retrieveProfileFromFile;
  readonly triggerLoadingFromUrl: typeof triggerLoadingFromUrl;
};

type HomeProps = ConnectedProps<
  OwnHomeProps,
  StateHomeProps,
  DispatchHomeProps
>;

type HomeState = {
  popupInstallPhase: PopupInstallPhase;
  darkMode: boolean;
};

type PopupInstallPhase =
  // Firefox:
  | 'checking-webchannel'
  | 'webchannel-unavailable'
  | 'popup-enabled'
  | 'suggest-enable-popup'
  // Other browsers:
  | 'suggest-chrome-extension'
  | 'other-browser';

class HomeImpl extends React.PureComponent<HomeProps, HomeState> {
  constructor(props: HomeProps) {
    super(props);
    // Start by suggesting that we install the add-on.
    let popupInstallPhase = 'other-browser';

    if (_isFirefox()) {
      popupInstallPhase = 'checking-webchannel';

      // Query the browser to see if the menu button is available.
      queryIsMenuButtonEnabled().then(
        (isMenuButtonEnabled) => {
          this.setState({
            popupInstallPhase: isMenuButtonEnabled
              ? 'popup-enabled'
              : 'suggest-enable-popup',
          });
        },
        () => {
          this.setState({ popupInstallPhase: 'webchannel-unavailable' });
        }
      );
    } else if (_isChromium()) {
      popupInstallPhase = 'suggest-chrome-extension';
      // TODO: Check if the extension is installed and show the recording
      // instructions. But we need to check if extension is there to do that.
    }

    this.state = {
      popupInstallPhase: popupInstallPhase as PopupInstallPhase,
      darkMode: isDarkMode(),
    };
  }

  _renderInstructions() {
    const { popupInstallPhase } = this.state;
    switch (popupInstallPhase) {
      case 'checking-webchannel':
      case 'suggest-enable-popup':
        return this._renderEnablePopupInstructions(true);
      case 'webchannel-unavailable':
        return this._renderEnablePopupInstructions(false);
      case 'popup-enabled':
        return this._renderRecordInstructions(FirefoxPopupScreenshot);
      case 'suggest-chrome-extension':
        return this._renderChromeInstructions();
      case 'other-browser':
        return this._renderOtherBrowserInstructions();
      default:
        throw assertExhaustiveCheck(
          popupInstallPhase,
          'Unhandled PopupInstallPhase'
        );
    }
  }

  _enableMenuButton = (e: React.MouseEvent) => {
    e.preventDefault();
    enableMenuButton().then(
      () => {
        this.setState({ popupInstallPhase: 'popup-enabled' });
      },
      (error) => {
        // This error doesn't get surfaced in the UI, but it does in console.
        console.error('Unable to enable the profiler popup button.', error);
      }
    );
  };

  _renderEnablePopupInstructions(webChannelAvailable: boolean) {
    return (
      <InstructionTransition key={0}>
        <div
          className="homeInstructions"
          data-testid="home-enable-popup-instructions"
        >
          {/* Grid container: homeInstructions */}
          {/* Left column: img */}
          <img
            className="homeSectionScreenshot"
            src={PerfScreenshot}
            alt="screenshot of profiler.firefox.com"
          />
          {/* Right column: instructions */}
          <div>
            <Localized
              id="Home--enable-button-unavailable"
              attrs={{ title: !webChannelAvailable }}
            >
              <button
                type="button"
                className="homeSectionButton"
                onClick={this._enableMenuButton}
                disabled={!webChannelAvailable}
                title={
                  webChannelAvailable
                    ? undefined
                    : 'This profiler instance was unable to connect to the WebChannel, so it cannot enable the profiler menu button.'
                }
              >
                <span className="homeSectionPlus">+</span>
                <Localized id="Home--menu-button">
                  Enable Profiler Menu Button
                </Localized>
              </button>
            </Localized>
            <DocsButton />
            {webChannelAvailable ? (
              <Localized id="Home--menu-button-instructions">
                <p>
                  Enable the profiler menu button to start recording a
                  performance profile in Firefox, then analyze it and share it
                  with profiler.firefox.com.
                </p>
              </Localized>
            ) : (
              <Localized
                id="Home--web-channel-unavailable"
                elems={{
                  code: <code />,
                }}
              >
                <p>
                  This profiler instance was unable to connect to the
                  WebChannel. This usually means that it’s running on a
                  different host from the one that is specified in the
                  preference{' '}
                  <code>devtools.performance.recording.ui-base-url</code>. If
                  you would like to capture new profiles with this instance, and
                  give it programmatic control of the profiler menu button, you
                  can go to <code>about:config</code>
                  and change the preference.
                </p>
              </Localized>
            )}
            <Localized
              id="Home--profile-firefox-android-instructions"
              elems={{
                a: (
                  <a href="https://profiler.firefox.com/docs/#/./guide-profiling-android-directly-on-device?id=profiling-firefox-for-android-directly-on-device" />
                ),
              }}
            >
              <p>
                You can also profile Firefox for Android. For more information,
                please consult this documentation:{' '}
                <a>Profiling Firefox for Android directly on device</a>.
              </p>
            </Localized>
          </div>
          {/* end of grid container */}
        </div>
      </InstructionTransition>
    );
  }

  _renderChromeInstructions() {
    const chromeExtensionUrl =
      'https://chromewebstore.google.com/detail/firefox-profiler/ljmahpnflmbkgaipnfbpgjipcnahlghn';
    return (
      <InstructionTransition key={0}>
        <div
          className="homeInstructions"
          data-testid="home-enable-popup-instructions"
        >
          {/* Grid container: homeInstructions */}
          {/* Left column: img */}
          <img
            className="homeSectionScreenshot"
            src={PerfScreenshot}
            alt="screenshot of profiler.firefox.com"
          />
          {/* Right column: instructions */}
          <div>
            <a
              className="homeSectionButton"
              href={chromeExtensionUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span className="homeSectionPlus">+</span>
              <Localized id="Home--install-chrome-extension">
                Install the Chrome extension
              </Localized>
            </a>
            <DocsButton />
            <Localized
              id="Home--chrome-extension-instructions"
              elems={{
                a: (
                  <a
                    href={chromeExtensionUrl}
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
              }}
            >
              <p>
                Use the <a>Firefox Profiler extension for Chrome</a> to capture
                performance profiles in Chrome and analyze them in the Firefox
                Profiler. Install the extension from the Chrome Web Store.
              </p>
            </Localized>
            <Localized id="Home--chrome-extension-recording-instructions">
              <p>
                Once installed, use the extension’s toolbar icon or the
                shortcuts to start and stop profiling. You can also export
                profiles and load them here for detailed analysis.
              </p>
            </Localized>
            {this._renderShortcuts()}
          </div>
          {/* end of grid container */}
        </div>
      </InstructionTransition>
    );
  }

  _renderRecordInstructions(screenshotSrc: string) {
    return (
      <InstructionTransition key={1}>
        <div
          className="homeInstructions"
          data-testid="home-record-instructions"
        >
          {/* Grid container: homeInstructions */}
          {/* Left column: img */}
          <img
            className="homeSectionScreenshot"
            src={screenshotSrc}
            alt="Screenshot of the profiler settings from the Firefox menu."
          />
          {/* Right column: instructions */}
          <div>
            <DocsButton />
            <Localized
              id="Home--record-instructions"
              elems={{
                kbd: <kbd />,
              }}
            >
              <p>
                To start profiling, click on the profiling button, or use the
                keyboard shortcuts. The icon is blue when a profile is
                recording. Hit <kbd>Capture</kbd> to load the data into
                profiler.firefox.com.
              </p>
            </Localized>
            {this._renderShortcuts()}
            <Localized
              id="Home--profile-firefox-android-instructions"
              elems={{
                a: (
                  <a href="https://profiler.firefox.com/docs/#/./guide-profiling-android-directly-on-device?id=profiling-firefox-for-android-directly-on-device" />
                ),
              }}
            >
              <p>
                You can also profile Firefox for Android. For more information,
                please consult this documentation:{' '}
                <a>Profiling Firefox for Android directly on device</a>.
              </p>
            </Localized>
          </div>
          {/* end of grid container */}
        </div>
      </InstructionTransition>
    );
  }

  _renderOtherBrowserInstructions() {
    return (
      <InstructionTransition key={0}>
        <div
          className="homeInstructions"
          data-testid="home-other-browser-instructions"
        >
          {/* Grid container: homeInstructions */}
          {/* Left column: img */}
          <img
            className="homeSectionScreenshot"
            src={PerfScreenshot}
            alt="screenshot of profiler.firefox.com"
          />
          {/* Right column: instructions */}
          <div>
            <DocsButton />
            <Localized
              id="Home--instructions-content"
              elems={{
                a: <a href="https://www.mozilla.org/en-US/firefox/new/" />,
              }}
            >
              <p>
                Recording performance profiles requires{' '}
                <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>
                . However, existing profiles can be viewed in any modern
                browser.
              </p>
            </Localized>
            <Localized
              id="Home--profile-firefox-android-instructions"
              elems={{
                a: (
                  <a href="https://profiler.firefox.com/docs/#/./guide-profiling-android-directly-on-device?id=profiling-firefox-for-android-directly-on-device" />
                ),
              }}
            >
              <p>
                You can also profile Firefox for Android. For more information,
                please consult this documentation:{' '}
                <a>Profiling Firefox for Android directly on device</a>.
              </p>
            </Localized>
          </div>
          {/* end of grid container */}
        </div>
      </InstructionTransition>
    );
  }

  _renderShortcuts() {
    return (
      <div>
        <p>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>{' '}
          <Localized id="Home--record-instructions-start-stop">
            Stop and start profiling
          </Localized>
        </p>
        <p>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd>{' '}
          <Localized id="Home--record-instructions-capture-load">
            Capture and load profile
          </Localized>
        </p>
      </div>
    );
  }

  _onLoadProfileFromFileRequested = (file: File) => {
    this.props.retrieveProfileFromFile(file, this.props.browserConnection);
  };

  _onLoadProfileFromUrlRequested = (url: string) => {
    this.props.triggerLoadingFromUrl(url);
  };

  _onDarkModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setDarkMode();
    } else {
      setLightMode();
    }
    this.setState({ darkMode: isDarkMode() });
  };

  override render() {
    const { specialMessage } = this.props;
    const { darkMode } = this.state;

    return (
      <div className="home">
        <main className="homeSection">
          <AppHeader />
          {specialMessage ? (
            <div className="homeSpecialMessage">{specialMessage}</div>
          ) : null}
          <Localized id="Home--profiler-motto">
            <p>
              Capture a performance profile. Analyze it. Share it. Make the web
              faster.
            </p>
          </Localized>
          <TransitionGroup className="homeInstructionsTransitionGroup">
            {this._renderInstructions()}
          </TransitionGroup>
          <section className="homeAdditionalContent">
            {/* Grid container: homeAdditionalContent */}
            <h2 className="homeAdditionalContentTitle protocol-display-xs">
              {/* Title: full width */}
              <Localized id="Home--additional-content-title">
                Load existing profiles
              </Localized>
            </h2>
            <section className="homeActions">
              {/* Actions: left column */}
              <Localized
                id="Home--additional-content-content"
                elems={{ strong: <strong /> }}
              >
                <p>
                  You can <strong>drag and drop</strong> a profile file here to
                  load it, or:
                </p>
              </Localized>
              <ActionButtons
                onLoadProfileFromFileRequested={
                  this._onLoadProfileFromFileRequested
                }
                onLoadProfileFromUrlRequested={
                  this._onLoadProfileFromUrlRequested
                }
              />

              <Localized
                id="Home--load-files-from-other-tools2"
                elems={{
                  perf: (
                    <a href="https://profiler.firefox.com/docs/#/./guide-perf-profiling" />
                  ),
                  simpleperf: (
                    <a href="https://profiler.firefox.com/docs/#/./guide-android-profiling" />
                  ),
                  androidstudio: (
                    <a href="https://developer.android.com/studio/profile/cpu-profiler" />
                  ),
                  dhat: (
                    <a href="https://valgrind.org/docs/manual/dh-manual.html" />
                  ),
                  write: (
                    <a href="https://github.com/firefox-devtools/profiler/blob/main/docs-developer/custom-importer.md" />
                  ),
                  traceevent: (
                    <a href="https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview" />
                  ),
                }}
              >
                <p>
                  The Firefox Profiler can also import profiles from other
                  profilers, such as {'<perf>Linux perf</perf>'},
                  {'<simpleperf>Android SimplePerf</simpleperf>'}, the Chrome
                  performance panel,{' '}
                  {'<androidstudio>Android Studio</androidstudio>'}, or any file
                  using the {'<dhat>dhat format</dhat>'} or{' '}
                  {"<traceevent>Google's Trace Event Format</traceevent>"}.{' '}
                  {'<write>Learn how to write your own importer</write>'}.
                </p>
              </Localized>

              <Localized
                id="Home--compare-recordings-info"
                elems={{
                  a: (
                    <InnerNavigationLink dataSource="compare">
                      Compare
                    </InnerNavigationLink>
                  ),
                }}
              >
                <p>
                  You can also compare recordings.{' '}
                  <InnerNavigationLink dataSource="compare">
                    Open the comparing interface.
                  </InnerNavigationLink>
                </p>
              </Localized>
            </section>
            <section>
              {/* Recent recordings: right column */}
              <h2 className="homeRecentUploadedRecordingsTitle protocol-display-xxs">
                <Localized id="Home--your-recent-uploaded-recordings-title">
                  Your recent uploaded recordings
                </Localized>
              </h2>
              <ListOfPublishedProfiles limit={3} withActionButtons={false} />
            </section>
            {/* End of grid container */}
          </section>
          <DragAndDropOverlay />
          <div className="homeDarkModeBox">
            <label className="photon-label" htmlFor="home-dark-mode">
              <input
                id="home-dark-mode"
                className="photon-checkbox photon-checkbox-default"
                type="checkbox"
                checked={darkMode}
                onChange={this._onDarkModeChange}
              />
              <Localized id="Home--dark-mode-title">
                <span>Dark mode</span>
              </Localized>
            </label>
          </div>
        </main>
      </div>
    );
  }
}

function _isFirefox(): boolean {
  return Boolean(navigator.userAgent.match(/Firefox\/\d+\.\d+/));
}

function _isChromium(): boolean {
  return Boolean(navigator.userAgent.match(/Chrome\/\d+\.\d+/));
}

export const Home = explicitConnect<
  OwnHomeProps,
  StateHomeProps,
  DispatchHomeProps
>({
  mapStateToProps: (state) => ({
    browserConnection: getBrowserConnection(state),
  }),
  mapDispatchToProps: { retrieveProfileFromFile, triggerLoadingFromUrl },
  component: HomeImpl,
});
