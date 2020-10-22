/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';

const PROFILER_URL = 'https://github.com/firefox-devtools/Gecko-Profiler-Addon';

export function Initializing() {
  return (
    <div className="initializing">
      <div className="initializing-text">
        <h1>Waiting on Gecko Profiler to provide a profile.</h1>
        <p>
          Make sure Firefox is running the{' '}
          <a href={PROFILER_URL}> new version of the Gecko Profiler add-on</a>.
          You can control the profiler with the following two shortcuts.
        </p>
        <ul>
          <li>
            <span>Ctrl</span>+<span>Shift</span>+<span>5</span>: Stop / Restart
            profiling
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
