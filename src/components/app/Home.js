/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import classNames from 'classnames';
import AddonScreenshot from '../../../res/img/jpg/gecko-profiler-screenshot-2019-02-05.jpg';
import PerfScreenshot from '../../../res/img/jpg/perf-screenshot-2019-02-05.jpg';
import {
  retrieveProfileFromFile,
  triggerLoadingFromUrl,
} from '../../actions/receive-profile';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import type {
  ConnectedProps,
  WrapFunctionInDispatch,
} from '../../utils/connect';

require('./Home.css');

const ADDON_URL =
  'https://raw.githubusercontent.com/firefox-devtools/Gecko-Profiler-Addon/master/gecko_profiler.xpi';
const LEGACY_ADDON_URL =
  'https://raw.githubusercontent.com/firefox-devtools/Gecko-Profiler-Addon/master/gecko_profiler_legacy.xpi';

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
        ) : (
          <p>You can also drag and drop a profile file here to load it.</p>
        )}
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
  isDragging: boolean,
  isAddonInstalled: boolean,
};

class Home extends React.PureComponent<HomeProps, HomeState> {
  _supportsWebExtensionAPI: boolean = _supportsWebExtensionAPI();
  _isFirefox: boolean = _isFirefox();
  state = {
    isDragging: false,
    isAddonInstalled: Boolean(window.isGeckoProfilerAddonInstalled),
  };

  addonInstalled() {
    this.setState({ isAddonInstalled: true });
  }

  componentDidMount() {
    // Prevent dropping files on the document.
    document.addEventListener('drag', _dragPreventDefault, false);
    document.addEventListener('dragover', _dragPreventDefault, false);
    document.addEventListener('drop', _dragPreventDefault, false);
    // Let the Gecko Profiler Add-on let the home-page know when it's been installed.
    homeInstance = this;
  }

  componentWillUnmount() {
    document.removeEventListener('drag', _dragPreventDefault, false);
    document.removeEventListener('dragover', _dragPreventDefault, false);
    document.removeEventListener('drop', _dragPreventDefault, false);
  }

  _startDragging = (event: Event) => {
    event.preventDefault();
    this.setState({ isDragging: true });
  };

  _stopDragging = (event: Event) => {
    event.preventDefault();
    this.setState({ isDragging: false });
  };

  _handleProfileDrop = (event: DragEvent) => {
    event.preventDefault();
    if (!event.dataTransfer) {
      return;
    }

    const { files } = event.dataTransfer;
    if (files.length > 0) {
      this.props.retrieveProfileFromFile(files[0]);
    }
  };

  _renderInstructions() {
    const { isAddonInstalled } = this.state;
    if (isAddonInstalled) {
      return this._renderRecordInstructions();
    }
    if (this._supportsWebExtensionAPI) {
      return this._renderInstallInstructions();
    }
    if (this._isFirefox) {
      return this._renderLegacyInstructions();
    }
    return this._renderOtherBrowserInstructions();
  }

  _renderInstallInstructions() {
    return (
      <InstructionTransition key={0}>
        <div className="homeInstructions">
          <div className="homeInstructionsLeft">
            <div style={{ textAlign: 'center' }}>
              <img
                className="homeSectionScreenshot"
                src={PerfScreenshot}
                alt="screenshot of profiler.firefox.com"
              />
            </div>
          </div>
          <div className="homeInstructionsRight">
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
            <ActionButtons
              // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
              retrieveProfileFromFile={this.props.retrieveProfileFromFile}
              triggerLoadingFromUrl={this.props.triggerLoadingFromUrl}
            />
          </div>
        </div>
      </InstructionTransition>
    );
  }

  _renderRecordInstructions() {
    return (
      <InstructionTransition key={1}>
        <div className="homeInstructions">
          <div className="homeInstructionsLeft">
            <p>
              <img
                className="homeSectionScreenshot"
                src={AddonScreenshot}
                alt="Screenshot of the Gecko Profiler addon settings"
              />
            </p>
          </div>
          <div className="homeInstructionsRight">
            <DocsButton />
            <p>
              To start profiling, click on the profiling button, or use the
              keyboard shortcuts. The icon is blue when a profile is recording.
              Hit
              <kbd>Capture Profile</kbd> to load the data into
              profiler.firefox.com.
            </p>
            {this._renderShortcuts()}
            <ActionButtons
              // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
              retrieveProfileFromFile={this.props.retrieveProfileFromFile}
              triggerLoadingFromUrl={this.props.triggerLoadingFromUrl}
            />
          </div>
        </div>
      </InstructionTransition>
    );
  }

  _renderLegacyInstructions() {
    return (
      <InstructionTransition key={2}>
        <div className="homeInstructions">
          <div className="homeInstructionsLeft">
            <div style={{ textAlign: 'center' }}>
              <img
                className="homeSectionScreenshot"
                src={PerfScreenshot}
                alt="screenshot of profiler.firefox.com"
              />
            </div>
          </div>
          <div className="homeInstructionsRight">
            <DocsButton />
            <p>
              To start recording a performance profile in Firefox, first install
              the{' '}
              <InstallButton name="Gecko Profiler" xpiUrl={LEGACY_ADDON_URL}>
                Gecko Profiler Add-on
              </InstallButton>
              . Then use the button added to the browser, or use the following
              shortcuts to record a profile. The button’s icon is blue when a
              profile is recording. Hit <kbd>Capture Profile</kbd> to load the
              data into profiler.firefox.com.
            </p>
            {this._renderShortcuts()}
            <ActionButtons
              // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
              retrieveProfileFromFile={this.props.retrieveProfileFromFile}
              triggerLoadingFromUrl={this.props.triggerLoadingFromUrl}
            />
          </div>
        </div>
      </InstructionTransition>
    );
  }

  _renderOtherBrowserInstructions() {
    return (
      <InstructionTransition key={0}>
        <div className="homeInstructions" key={0}>
          <div className="homeInstructionsLeft">
            <div style={{ textAlign: 'center' }}>
              <img
                className="homeSectionScreenshot"
                src={PerfScreenshot}
                alt="screenshot of profiler.firefox.com"
              />
            </div>
          </div>
          <div className="homeInstructionsRight">
            <DocsButton />
            <h2>How to view and record profiles</h2>
            <p>
              Recording performance profiles requires{' '}
              <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>.
              However, existing profiles can be viewed in any modern browser.
            </p>
            <ActionButtons
              // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
              retrieveProfileFromFile={this.props.retrieveProfileFromFile}
              triggerLoadingFromUrl={this.props.triggerLoadingFromUrl}
            />
          </div>
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
    const { isDragging } = this.state;
    const { specialMessage } = this.props;
    return (
      <div
        className="home"
        onDragEnter={this._startDragging}
        onDragExit={this._stopDragging}
        onDrop={this._handleProfileDrop}
      >
        <section className="homeSection">
          <header>
            <h1 className="homeTitle">
              <span className="homeTitleSlogan">
                <span className="homeTitleText">Firefox Profiler</span>
                <span className="homeTitleSubtext">
                  {' '}
                  &mdash; Web app for Firefox performance analysis
                </span>
              </span>
              <a
                className="homeTitleGithubIcon"
                href="https://github.com/firefox-devtools/profiler"
                target="_blank"
                rel="noopener noreferrer"
                title="Go to our git repository (this opens in a new window)"
              >
                <svg
                  width="22"
                  height="22"
                  className="octicon octicon-mark-github"
                  viewBox="0 0 16 16"
                  version="1.1"
                  aria-label="github"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                  />
                </svg>
              </a>
            </h1>
            {specialMessage ? (
              <div className="homeSpecialMessage">{specialMessage}</div>
            ) : null}
            <p>
              Capture a performance profile. Analyze it. Share it. Make the web
              faster.
            </p>
          </header>
          <TransitionGroup className="homeInstructionsTransitionGroup">
            {this._renderInstructions()}
          </TransitionGroup>
          <div
            className={classNames('homeDrop', isDragging ? 'dragging' : false)}
          >
            <div className="homeDropMessage">Drop a saved profile here</div>
          </div>
        </section>
      </div>
    );
  }
}

function _dragPreventDefault(event: DragEvent) {
  event.preventDefault();
}

function _supportsWebExtensionAPI(): boolean {
  const matched = navigator.userAgent.match(/Firefox\/(\d+\.\d+)/);
  const minimumSupportedFirefox = 55;
  return matched ? parseFloat(matched[1]) >= minimumSupportedFirefox : false;
}

function _isFirefox(): boolean {
  return Boolean(navigator.userAgent.match(/Firefox\/\d+\.\d+/));
}

export default explicitConnect<OwnHomeProps, {||}, DispatchHomeProps>({
  mapDispatchToProps: { retrieveProfileFromFile, triggerLoadingFromUrl },
  component: Home,
});
