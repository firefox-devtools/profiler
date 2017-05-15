/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import AddonScreenshot from '../../../res/gecko-profiler-screenshot-2016-12-06.png';
import PerfScreenshot from '../../../res/perf-screenshot-2017-05-11.jpg';
import actions from '../actions';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

require('./Home.css');

const ADDON_URL = 'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler.xpi';
const LEGACY_ADDON_URL = 'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler_legacy.xpi';

const InstallButton = ({ name, xpiURL, children, className }: InstallButtonProps) => {
  return <a href={xpiURL} className={className} onClick={e => {
    if (window.InstallTrigger) {
      window.InstallTrigger.install({ [name]: xpiURL });
    }
    e.preventDefault();
  }}>{children}</a>;
};

type InstallButtonProps = {
  name: string,
  xpiURL: string,
  children?: React.Element<*>,
  className?: string,
};

/**
 * Provide a global function for the add-on to to notify this component that it has
 * been installed.
 */
let homeInstance;
window.geckoProfilerAddonInstalled = function () {
  if (homeInstance) {
    // Forces the Home component to re-evaluate window.isGeckoProfilerAddonInstalled.
    homeInstance.addonInstalled();
  }
};

type HomeProps = {
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
      isAddonInstalled: window.isGeckoProfilerAddonInstalled,
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

  _startDragging(event) {
    event.preventDefault();
    this.setState({ isDragging: true });
  }

  _stopDragging(event) {
    event.preventDefault();
    this.setState({ isDragging: false });
  }

  _handleProfileDrop(event) {
    event.preventDefault();
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
      <div className='homeInstructions' key={0}>
        <div className='homeInstructionsLeft'>
          <div style={{textAlign: 'center'}}>
            <img className='homeSectionScreenshot' src={PerfScreenshot} />
          </div>
        </div>
        <div className='homeInstructionsRight'>
          <h2>Getting started</h2>
          <p>
            Install the Gecko Profiler Add-on to start recording a performance profile in
            Firefox, then analyze it and share it with perf.html, or drag a saved profile
            here to load it in perf.html.
          </p>
          <InstallButton name='Gecko Profiler' className='homeSectionInstallButton' xpiURL={ADDON_URL}>
            <span className='homeSectionPlus'>+</span>
            Install add-on
          </InstallButton>
        </div>
      </div>
    );
  }

  _renderRecordInstructions() {
    return (
      <div className='homeInstructions' key={1}>
        <div className='homeInstructionsLeft'>
          <p>
            <img className='homeSectionScreenshot' src={AddonScreenshot} />
          </p>
        </div>
        <div className='homeInstructionsRight'>
          <h2>Recording profiles</h2>
          <p>
            To start profiling, click on the profiling button, or use the keyboard
            shortcuts. The icon is blue when a profile is recording. Hit
            <kbd>Capture Profile</kbd> to load the data into perf.html.
          </p>
          {this._renderShortcuts()}
        </div>
      </div>
    );
  }

  _renderLegacyInstructions() {
    return (
      <div className='homeInstructions' key={2}>
        <div className='homeInstructionsLeft'>
          <div style={{textAlign: 'center'}}>
            <img className='homeSectionScreenshot' src={PerfScreenshot} />
          </div>
        </div>
        <div className='homeInstructionsRight'>
          <h2>Recording profiles</h2>
          <p>
            To start recording a performance profile in Firefox, first install the{' '}
            <InstallButton name='Gecko Profiler' xpiURL={LEGACY_ADDON_URL}>
              Gecko Profiler Add-on
            </InstallButton>.
            Then use the button added to the browser, or use the following shortcuts
            to record a profile. The button's icon is blue when a profile is recording.
            Hit <kbd>Capture Profile</kbd> to load the data into perf.html.
          </p>
          {this._renderShortcuts()}
        </div>
      </div>
    );
  }

  _renderOtherBrowserInstructions() {
    return (
      <div className='homeInstructions' key={0}>
        <div className='homeInstructionsLeft'>
          <div style={{textAlign: 'center'}}>
            <img className='homeSectionScreenshot' src={PerfScreenshot} />
          </div>
        </div>
        <div className='homeInstructionsRight'>
          <h2>How to view and record profiles</h2>
          <p>
            Recording performance profiles requires{' '}
            <a href='https://www.mozilla.org/en-US/firefox/new/'>Firefox</a>, however
            perf.html itself is a a web app, and still works cross-browser for viewing
            existing profiles. Either follow a link to an already shared profile, or drag
            a saved profile onto this screen.
          </p>
        </div>
      </div>
    );
  }

  _renderShortcuts() {
    return (
      <p>
        <div>
          <p>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>
            {' '}Stop and start profiling
          </p>
          <p>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd>
            {' '}Capture and load profile
          </p>
        </div>
      </p>
    );
  }

  render() {
    const { isDragging } = this.state;

    return (
      <div className='home'
          onDragEnter={this._startDragging}
          onDragExit={this._stopDragging}
          onDrop={this._handleProfileDrop}>
        <a href='https://github.com/devtools-html/perf.html' className='homeGithubIcon'></a>
        <section className='homeSection'>
          <h1 className='homeTitle'>
            <span className='homeTitleText'>perf.html</span>
            <span className='homeTitleSubtext'> &mdash; Web app for Firefox performance analysis</span>
          </h1>
          <p>Capture a performance profile. Analyze it. Share it. Make the web faster.</p>
          <ReactCSSTransitionGroup transitionName='homeTransition'
                                   transitionEnterTimeout={300}
                                   transitionLeave={false}
                                   component='div'
                                   className='homeInstructionsTransitionGroup'>
            {this._renderInstructions()}
          </ReactCSSTransitionGroup>
          <div className={classNames('homeDrop', isDragging ? 'dragging' : false)}>
            <div className='homeDropMessage'>Drop a saved profile here</div>
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
  return matched
    ? parseFloat(matched[1]) >= minimumSupportedFirefox
    : false;
}

function _isFirefox(): boolean {
  return Boolean(navigator.userAgent.match(/Firefox\/\d+\.\d+/));
}

export default connect(state => state, actions)(Home);
