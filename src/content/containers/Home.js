/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import ProfileUploadField from './ProfileUploadField';
import AddonScreenshot from '../../../res/gecko-profiler-screenshot-2016-12-06.png';

require('./Home.css');

const InstallButton = ({ name, xpiURL, children }) => {
  return <a href={xpiURL} onClick={e => {
    if (window.InstallTrigger) {
      window.InstallTrigger.install({ [name]: xpiURL });
    }
    e.preventDefault();
  }}>{children}</a>;
};

InstallButton.propTypes = {
  name: PropTypes.string.isRequired,
  xpiURL: PropTypes.string.isRequired,
  children: PropTypes.node,
};

const Home = ({ className, profilerURL }) => {
  return (
    <div className={className}>
      <section className={`${className}-text`}>
        <h1>perf.html - UI for the Gecko Profiler</h1>
        <p>Welcome to perf.html. You can look at profiles here.</p>
        <p>
          Capture profiles using
          the <InstallButton name='Gecko Profiler' xpiURL={profilerURL}>new
          version of the Gecko Profiler add-on</InstallButton>.
          You can control the profiler with the following two
          shortcuts:
        </p>
        <ul>
          <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>: Stop / Restart profiling</li>
          <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>2</kbd>: Capture the profile and open up this interface.</li>
        </ul>
        <p><img src={AddonScreenshot} style={{ width: '390px', height: '268px' }}/></p>
        <p>
          You can also open a profile that you've saved to a file:
        </p>
        <p>
          <ProfileUploadField />
        </p>
      </section>
    </div>
  );
};

Home.propTypes = {
  className: PropTypes.string.isRequired,
  profilerURL: PropTypes.string.isRequired,
};

function _getProfilerAddonURL() {
  // Serve the SDK-based add-on to a few pre-55 Firefox versions that don't
  // have the profiler WebExtensions API yet.
  if (navigator.userAgent.endsWith('Firefox/52.0') ||
      navigator.userAgent.endsWith('Firefox/53.0') ||
      navigator.userAgent.endsWith('Firefox/54.0')) {
    return 'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler_legacy.xpi';
  }
  return 'https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler.xpi';
}

export default connect(() => ({
  className: 'home',
  profilerURL: _getProfilerAddonURL(),
}))(Home);
