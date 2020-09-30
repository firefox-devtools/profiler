/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import { AppHeader } from './AppHeader';
import { InnerNavigationLink } from 'firefox-profiler/components/shared/InnerNavigationLink';
import { ListOfPublishedProfiles } from './ListOfPublishedProfiles';

import explicitConnect from '../../utils/connect';
import classNames from 'classnames';
import AddonScreenshot from '../../../res/img/jpg/gecko-profiler-screenshot-2019-02-05.jpg';
import PerfScreenshot from '../../../res/img/jpg/perf-screenshot-2019-02-05.jpg';
import FirefoxPopupScreenshot from '../../../res/img/jpg/firefox-profiler-button-2019-12-09.jpg';
import {
  retrieveProfileFromFile,
  triggerLoadingFromUrl,
} from '../../actions/receive-profile';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {
  queryIsMenuButtonEnabled,
  enableMenuButton,
} from '../../app-logic/web-channel';
import { assertExhaustiveCheck } from '../../utils/flow';

import type {
  ConnectedProps,
  WrapFunctionInDispatch,
} from '../../utils/connect';

require('./Home.css');

const ADDON_URL =
  'https://raw.githubusercontent.com/firefox-devtools/Gecko-Profiler-Addon/master/gecko_profiler.xpi';

import { DragAndDropOverlay } from './DragAndDrop';

type InstallButtonProps = {
  name: string,
  xpiUrl: string,
  children?: React.Node,
  className?: string,
};

class InstallButton extends React.PureComponent<InstallButtonProps> {
  onInstallClick = (e: SyntheticEvent<HTMLAnchorElement>) => {
    if (window.InstallTrigger) {
      const { name, xpiUrl } = this.props;
      window.InstallTrigger.install({ [name]: xpiUrl });
    }
    e.preventDefault();
  };

  render() {
    const { xpiUrl, children, className } = this.props;
    return (
      <a href={xpiUrl} className={className} onClick={this.onInstallClick}>
        {children}
      </a>
    );
  }
}

type ActionButtonsProps = {|
  +retrieveProfileFromFile: WrapFunctionInDispatch<
    typeof retrieveProfileFromFile
  >,
  +triggerLoadingFromUrl: typeof triggerLoadingFromUrl,
|};

type ActionButtonsState = {
  isLoadFromUrlPressed: boolean,
};

type LoadFromUrlProps = {
  triggerLoadingFromUrl: typeof triggerLoadingFromUrl,
};

type LoadFromUrlState = {
  value: string,
};

class ActionButtons extends React.PureComponent<
  ActionButtonsProps,
  ActionButtonsState
> {
  _fileInput: HTMLInputElement | null;

  state = {
    isLoadFromUrlPressed: false,
  };

  _takeInputRef = input => {
    this._fileInput = input;
  };

  _uploadProfileFromFile = () => {
    if (this._fileInput) {
      this.props.retrieveProfileFromFile(this._fileInput.files[0]);
    }
  };

  _loadFromUrlPressed = (event: SyntheticEvent<>) => {
    event.preventDefault();
    this.setState(prevState => {
      return { isLoadFromUrlPressed: !prevState.isLoadFromUrlPressed };
    });
  };

  render() {
    return (
      <div className="homeSectionLoadProfile">
        <div className="homeSectionActionButtons">
          <label className="homeSectionButton">
            <input
              className="homeSectionUploadFromFileInput"
              type="file"
              ref={this._takeInputRef}
              onChange={this._uploadProfileFromFile}
            />
            Load a profile from file
          </label>
          <button
            type="button"
            className={classNames({
              homeSectionButton: true,
            })}
            onClick={this._loadFromUrlPressed}
            // when the button is clicked it expands to the URL input
            aria-expanded={this.state.isLoadFromUrlPressed}
          >
            Load a profile from a URL
          </button>
        </div>
        {this.state.isLoadFromUrlPressed ? (
          <LoadFromUrl {...this.props} />
        ) : null}
      </div>
    );
  }
}

class LoadFromUrl extends React.PureComponent<
  LoadFromUrlProps,
  LoadFromUrlState
> {
  state = {
    value: '',
  };

  handleChange = (event: SyntheticEvent<HTMLInputElement>) => {
    event.preventDefault();
    this.setState({
      value: event.currentTarget.value,
    });
  };

  _upload = (event: SyntheticEvent<>) => {
    event.preventDefault();
    if (this.state.value) {
      this.props.triggerLoadingFromUrl(this.state.value);
    }
  };

  render() {
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
        <input
          type="submit"
          className="homeSectionButton homeSectionLoadFromUrlSubmitButton"
          value="Load"
        />
      </form>
    );
  }
}

function DocsButton() {
  return (
    <a href="/docs/" className="homeSectionButton">
      <span className="homeSectionDocsIcon" />
      Documentation
    </a>
  );
}

function InstructionTransition(props: {}) {
  return (
    <CSSTransition
      {...props}
      classNames="homeTransition"
      timeout={300}
      exit={false}
    />
  );
}

/**
 * Provide a global function for the add-on to to notify this component that it has
 * been installed.
 */
let homeInstance;
window.geckoProfilerAddonInstalled = function() {
  if (homeInstance) {
    // Forces the Home component to re-evaluate window.isGeckoProfilerAddonInstalled.
    homeInstance.addonInstalled();
  }
};

type OwnHomeProps = {|
  +specialMessage?: string,
|};

type DispatchHomeProps = {|
  +retrieveProfileFromFile: typeof retrieveProfileFromFile,
  +triggerLoadingFromUrl: typeof triggerLoadingFromUrl,
|};

type HomeProps = ConnectedProps<OwnHomeProps, {||}, DispatchHomeProps>;

type HomeState = {
  popupAddonInstallPhase: PopupAddonInstallPhase,
};

type PopupAddonInstallPhase =
  // Firefox Beta or Relase
  | 'suggest-install-addon'
  | 'addon-installed'
  // Firefox Nightly:
  | 'popup-enabled'
  | 'suggest-enable-popup'
  // Other browsers:
  | 'other-browser';

class Home extends React.PureComponent<HomeProps, HomeState> {
  constructor(props: HomeProps) {
    super(props);
    // Start by suggesting that we install the add-on.
    let popupAddonInstallPhase = 'other-browser';

    if (_isFirefox()) {
      if (window.isGeckoProfilerAddonInstalled) {
        popupAddonInstallPhase = 'addon-installed';
      } else {
        popupAddonInstallPhase = 'suggest-install-addon';
      }

      // Query the browser to see if the menu button is available.
      queryIsMenuButtonEnabled().then(
        isMenuButtonEnabled => {
          this.setState({
            popupAddonInstallPhase: isMenuButtonEnabled
              ? 'popup-enabled'
              : 'suggest-enable-popup',
          });
        },
        () => {
          // Do nothing if this request returns an error. It probably just means
          // that we're talking to an older version of the browser.
        }
      );
    }

    this.state = {
      popupAddonInstallPhase,
    };

    // Let the Gecko Profiler Add-on let the home-page know when it's been installed.
    homeInstance = this;
  }

  /**
   * This is a publicly accessible method, that the addon can use to signal
   * that it is installed. This component races with the frame script installation,
   * so provide a way for frame script to signal that it was loaded.
   */
  addonInstalled() {
    this.setState(({ popupAddonInstallPhase }) => {
      if (
        popupAddonInstallPhase === 'popup-enabled' ||
        popupAddonInstallPhase === 'suggest-enable-popup'
      ) {
        // The popup is available, ignore the addon.
        return null;
      }
      return { popupAddonInstallPhase: 'addon-installed' };
    });
  }

  _renderInstructions() {
    const { popupAddonInstallPhase } = this.state;
    switch (popupAddonInstallPhase) {
      case 'suggest-install-addon':
        return this._renderInstallAddonInstructions();
      case 'addon-installed':
        return this._renderRecordInstructions(AddonScreenshot);
      case 'popup-enabled':
        return this._renderRecordInstructions(FirefoxPopupScreenshot);
      case 'suggest-enable-popup':
        return this._renderEnablePopupInstructions();
      case 'other-browser':
        return this._renderOtherBrowserInstructions();
      default:
        throw assertExhaustiveCheck(
          popupAddonInstallPhase,
          'Unhandled PopupAddonInstallPhase'
        );
    }
  }

  _enableMenuButton = e => {
    e.preventDefault();
    enableMenuButton().then(
      () => {
        this.setState({ popupAddonInstallPhase: 'popup-enabled' });
      },
      error => {
        // This error doesn't get surfaced in the UI, but it does in console.
        console.error('Unable to enable the profiler popup button.', error);
      }
    );
  };

  _renderEnablePopupInstructions() {
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
            <button
              type="button"
              className="homeSectionButton"
              onClick={this._enableMenuButton}
            >
              <span className="homeSectionPlus">+</span>
              Enable Profiler Menu Button
            </button>
            <DocsButton />
            <p>
              Enable the profiler menu button to start recording a performance
              profile in Firefox, then analyze it and share it with
              profiler.firefox.com.
            </p>
          </div>
          {/* end of grid container */}
        </div>
      </InstructionTransition>
    );
  }

  _renderInstallAddonInstructions() {
    return (
      <InstructionTransition key={0}>
        <div
          className="homeInstructions"
          data-testid="home-install-addon-instructions"
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
            <InstallButton
              name="Gecko Profiler"
              className="homeSectionButton"
              xpiUrl={ADDON_URL}
            >
              <span className="homeSectionPlus">+</span>
              Install add-on
            </InstallButton>
            <DocsButton />
            <p>
              Install the Gecko Profiler Add-on to start recording a performance
              profile in Firefox, then analyze it and share it with
              profiler.firefox.com.
            </p>
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
            <p>
              To start profiling, click on the profiling button, or use the
              keyboard shortcuts. The icon is blue when a profile is recording.
              Hit
              <kbd>Capture Profile</kbd> to load the data into
              profiler.firefox.com.
            </p>
            {this._renderShortcuts()}
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
            <h2>How to view and record profiles</h2>
            <p>
              Recording performance profiles requires{' '}
              <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>.
              However, existing profiles can be viewed in any modern browser.
            </p>
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
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd> Stop and start profiling
        </p>
        <p>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd> Capture and load profile
        </p>
      </div>
    );
  }

  render() {
    const { specialMessage } = this.props;

    return (
      <div className="home">
        <main className="homeSection">
          <AppHeader />
          {specialMessage ? (
            <div className="homeSpecialMessage">{specialMessage}</div>
          ) : null}
          <p>
            Capture a performance profile. Analyze it. Share it. Make the web
            faster.
          </p>
          <TransitionGroup className="homeInstructionsTransitionGroup">
            {this._renderInstructions()}
          </TransitionGroup>
          <section className="homeAdditionalContent">
            {/* Grid container: homeAdditionalContent */}
            <h2 className="homeAdditionalContentTitle protocol-display-xs">
              {/* Title: full width */}
              Load existing profiles
            </h2>
            <section className="homeActions">
              {/* Actions: left column */}
              <p>
                You can <strong>drag and drop</strong> a profile file here to
                load it, or:
              </p>
              <ActionButtons
                // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
                retrieveProfileFromFile={this.props.retrieveProfileFromFile}
                triggerLoadingFromUrl={this.props.triggerLoadingFromUrl}
              />
              <p>
                You can also compare recordings.{' '}
                <InnerNavigationLink dataSource="compare">
                  Open the comparing interface.
                </InnerNavigationLink>
              </p>
            </section>
            <section>
              {/* Recent recordings: right column */}
              <h2 className="homeRecentUploadedRecordingsTitle protocol-display-xxs">
                Recent uploaded recordings
              </h2>
              <ListOfPublishedProfiles limit={3} withActionButtons={false} />
            </section>
            {/* End of grid container */}
          </section>
          <DragAndDropOverlay />
        </main>
      </div>
    );
  }
}

function _isFirefox(): boolean {
  return Boolean(navigator.userAgent.match(/Firefox\/\d+\.\d+/));
}

export default explicitConnect<OwnHomeProps, {||}, DispatchHomeProps>({
  mapDispatchToProps: { retrieveProfileFromFile, triggerLoadingFromUrl },
  component: Home,
});
