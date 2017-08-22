/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import AddonScreenshot from '../../../res/gecko-profiler-screenshot-2016-12-06.png';
import PerfScreenshot from '../../../res/perf-screenshot-2017-05-11.jpg';
import { retrieveProfileFromFile } from '../../actions/receive-profile';
import { CSSTransitionGroup } from 'react-transition-group';

require('./Home.css');

const ADDON_URL =
  'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler.xpi';
const LEGACY_ADDON_URL =
  'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler_legacy.xpi';

const InstallButton = ({
  name,
  xpiURL,
  children,
  className,
}: InstallButtonProps) => {
  return (
    <a
      href={xpiURL}
      className={className}
      onClick={e => {
        if (window.InstallTrigger) {
          window.InstallTrigger.install({ [name]: xpiURL });
        }
        e.preventDefault();
      }}
    >
      {children}
    </a>
  );
};

type InstallButtonProps = {
  name: string,
  xpiURL: string,
  children?: React.Element<*>,
  className?: string,
};

type UploadButtonProps = {
  retrieveProfileFromFile: File => void,
};

class UploadButton extends PureComponent {
  props: UploadButtonProps;
  _input: HTMLInputElement;

  constructor(props: UploadButtonProps) {
    super(props);
    (this: any)._upload = this._upload.bind(this);
  }

  render() {
    return (
      <div>
        <input
          type="file"
          ref={input => {
            this._input = input;
          }}
          onChange={this._upload}
        />
      </div>
    );
  }

  _upload() {
    this.props.retrieveProfileFromFile(this._input.files[0]);
  }
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

type HomeProps = {
  specialMessage?: string,
  retrieveProfileFromFile: File => void,
};

class Home extends PureComponent {
  state: {
    isDragging: boolean,
    isAddonInstalled: boolean,
  };
  props: HomeProps;
  _supportsWebExtensionAPI: boolean;
  _isFirefox: boolean;

  constructor(props: HomeProps) {
    super(props);
    (this: any)._startDragging = this._startDragging.bind(this);
    (this: any)._stopDragging = this._stopDragging.bind(this);
    (this: any)._handleProfileDrop = this._handleProfileDrop.bind(this);
    this.state = {
      isDragging: false,
      isAddonInstalled: Boolean(window.isGeckoProfilerAddonInstalled),
    };

    this._supportsWebExtensionAPI = _supportsWebExtensionAPI();
    this._isFirefox = _isFirefox();
  }

  addonInstalled() {
    this.setState({ isAddonInstalled: true });
  }

  componentDidMount() {
    // Prevent dropping files on the document.
    // Help Flow infer the correct type signature for document.addEventListener.
    document.addEventListener(('drag': string), _preventDefault, false);
    document.addEventListener(('dragover': string), _preventDefault, false);
    document.addEventListener(('drop': string), _preventDefault, false);
    // Let the Gecko Profiler Add-on let the home-page know when it's been installed.
    homeInstance = this;
  }

  componentWillUnmount() {
    document.removeEventListener(('drag': string), _preventDefault, false);
    document.removeEventListener(('dragover': string), _preventDefault, false);
    document.removeEventListener(('drop': string), _preventDefault, false);
  }

  _startDragging(event: Event) {
    event.preventDefault();
    this.setState({ isDragging: true });
  }

  _stopDragging(event: Event) {
    event.preventDefault();
    this.setState({ isDragging: false });
  }

  _handleProfileDrop(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer) {
      return;
    }

    const { files } = event.dataTransfer;
    if (files.length > 0) {
      this.props.retrieveProfileFromFile(files[0]);
    }
  }

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
      <div className="homeInstructions" key={0}>
        <div className="homeInstructionsLeft">
          <div style={{ textAlign: 'center' }}>
            <img className="homeSectionScreenshot" src={PerfScreenshot} />
          </div>
        </div>
        <div className="homeInstructionsRight">
          <h2>Getting started</h2>
          <p>
            Install the Gecko Profiler Add-on to start recording a performance
            profile in Firefox, then analyze it and share it with perf.html.
          </p>
          <InstallButton
            name="Gecko Profiler"
            className="homeSectionInstallButton"
            xpiURL={ADDON_URL}
          >
            <span className="homeSectionPlus">+</span>
            Install add-on
          </InstallButton>
          <p>
            You can also analyze a local profile by either dragging and dropping
            it here or selecting it using the button below.
          </p>
          <UploadButton {...this.props} />
        </div>
      </div>
    );
  }

  _renderRecordInstructions() {
    return (
      <div className="homeInstructions" key={1}>
        <div className="homeInstructionsLeft">
          <p>
            <img className="homeSectionScreenshot" src={AddonScreenshot} />
          </p>
        </div>
        <div className="homeInstructionsRight">
          <h2>Recording profiles</h2>
          <p>
            To start profiling, click on the profiling button, or use the
            keyboard shortcuts. The icon is blue when a profile is recording.
            Hit
            <kbd>Capture Profile</kbd> to load the data into perf.html.
          </p>
          {this._renderShortcuts()}
          <p>
            You can also analyze a local profile by either dragging and dropping
            it here or selecting it using the button below.
          </p>
          <UploadButton {...this.props} />
        </div>
      </div>
    );
  }

  _renderLegacyInstructions() {
    return (
      <div className="homeInstructions" key={2}>
        <div className="homeInstructionsLeft">
          <div style={{ textAlign: 'center' }}>
            <img className="homeSectionScreenshot" src={PerfScreenshot} />
          </div>
        </div>
        <div className="homeInstructionsRight">
          <h2>Recording profiles</h2>
          <p>
            To start recording a performance profile in Firefox, first install
            the{' '}
            <InstallButton name="Gecko Profiler" xpiURL={LEGACY_ADDON_URL}>
              Gecko Profiler Add-on
            </InstallButton>. Then use the button added to the browser, or use
            the following shortcuts to record a profile. The button’s icon is
            blue when a profile is recording. Hit <kbd>Capture Profile</kbd> to
            load the data into perf.html.
          </p>
          {this._renderShortcuts()}
          <p>
            You can also analyze a local profile by either dragging and dropping
            it here or selecting it using the button below.
          </p>
          <UploadButton {...this.props} />
        </div>
      </div>
    );
  }

  _renderOtherBrowserInstructions() {
    return (
      <div className="homeInstructions" key={0}>
        <div className="homeInstructionsLeft">
          <div style={{ textAlign: 'center' }}>
            <img className="homeSectionScreenshot" src={PerfScreenshot} />
          </div>
        </div>
        <div className="homeInstructionsRight">
          <h2>How to view and record profiles</h2>
          <p>
            Recording performance profiles requires{' '}
            <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>.
            However, existing profiles can be viewed in any modern browser. To
            view a profile, either follow a link to a public profile, drag a
            saved local profile onto this screen or select it using the button
            below.
          </p>
          <UploadButton {...this.props} />
        </div>
      </div>
    );
  }

  _renderShortcuts() {
    return (
      <p>
        <div>
          <p>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd> Stop and start
            profiling
          </p>
          <p>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd> Capture and load
            profile
          </p>
        </div>
      </p>
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
          <h1 className="homeTitle">
            <span className="homeTitleText">perf.html</span>
            <span className="homeTitleSubtext">
              {' '}&mdash; Web app for Firefox performance analysis
            </span>
            <a
              className="homeTitleGithubIcon"
              href="https://github.com/devtools-html/perf.html"
            >
              <svg
                width="22"
                height="22"
                className="octicon octicon-mark-github"
                viewBox="0 0 16 16"
                version="1.1"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
            </a>
          </h1>
          {specialMessage
            ? <div className="homeSpecialMessage">
                {specialMessage}
              </div>
            : null}
          <p>
            Capture a performance profile. Analyze it. Share it. Make the web
            faster.
          </p>
          <CSSTransitionGroup
            transitionName="homeTransition"
            transitionEnterTimeout={300}
            transitionLeave={false}
            component="div"
            className="homeInstructionsTransitionGroup"
          >
            {this._renderInstructions()}
          </CSSTransitionGroup>
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

function _preventDefault(event) {
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

export default connect(state => state, { retrieveProfileFromFile })(Home);
