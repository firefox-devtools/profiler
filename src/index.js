/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import React from 'react';
import Perf from 'react-addons-perf';
import { render } from 'react-dom';
import Root from './components/app/Root';
import createStore from './create-store';
import 'photon-colors/colors.css';
import '../res/style.css';

// Mock out Google Analytics for anything that's not production so that we have run-time
// code coverage in development and testing.
if (process.env.NODE_ENV === 'development') {
  window.ga = (event, ...payload) => {
    console.log(
      `%cAnalytics:%c"${event}"`,
      'color: #FF6D00; font-weight: bold',
      'color: #FF6D00;',
      ...payload
    );
  };
} else if (process.env.NODE_ENV !== 'production') {
  window.ga = () => {};
}

if (process.env.NODE_ENV === 'production') {
  const runtime = require('offline-plugin/runtime');
  runtime.install({
    onUpdateReady: () => {
      runtime.applyUpdate();
    },
  });
}

window.geckoProfilerPromise = new Promise(function(resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore();

render(<Root store={store} />, document.getElementById('root'));

window.Perf = Perf;
