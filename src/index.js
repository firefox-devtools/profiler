/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import { render } from 'react-dom';
import Root from './components/app/Root';
import createStore from './create-store';
import 'photon-colors/photon-colors.css';
import '../res/style.css';
import {
  addDataToWindowObject,
  logFriendlyPreamble,
} from './utils/window-console';

// Mock out Google Analytics for anything that's not production so that we have run-time
// code coverage in development and testing.
if (process.env.NODE_ENV === 'development') {
  window.ga = (event, ...payload) => {
    const style = 'color: #FF6D00; font-weight: bold';
    console.log(`[analytics] %c"${event}"`, style, ...payload);
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

addDataToWindowObject(store.getState);
logFriendlyPreamble();
