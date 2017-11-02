/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';

type Props = {
  className: string,
  profilerUrl: string,
};

class Initializing extends PureComponent<Props> {
  render() {
    const { className, profilerUrl } = this.props;

    return (
      <div className={className}>
        <div className={`${className}-text`}>
          <h1>Waiting on Gecko Profiler to provide a profile.</h1>
          <p>
            Make sure Firefox is running the{' '}
            <a href={profilerUrl}> new version of the Gecko Profiler add-on</a>.
            You can control the profiler with the following two shortcuts.
          </p>
          <ul>
            <li>
              <span>Ctrl</span>+<span>Shift</span>+<span>5</span>: Stop /
              Restart profiling
            </li>
            <li>
              <span>Ctrl</span>+<span>Shift</span>+<span>6</span>: Capture the
              profile and open up this interface.
            </li>
          </ul>
        </div>
      </div>
    );
  }
}

Initializing.propTypes = {
  className: PropTypes.string.isRequired,
  profilerUrl: PropTypes.string.isRequired,
};

export default connect(() => ({
  className: 'initializing',
  profilerUrl: 'https://github.com/devtools-html/Gecko-Profiler-Addon',
}))(Initializing);
