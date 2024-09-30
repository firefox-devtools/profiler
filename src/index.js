/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// Import all global css. Ensure that this is these CSS imports happen before any
// JS imports happen, as this determines the rule order. Global CSS should be easy
// to overwrite with a simple class name.
import '../res/css/focus.css';
import 'photon-colors/photon-colors.css';
import '../res/css/photon/index.css';
import '../res/css/protocol/index.css';
import '../res/css/style.css';
import '../res/css/global.css';
import '../res/css/categories.css';
import '../res/css/network.css';
import 'react-splitter-layout/lib/index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './components/app/Root';
import createStore from './app-logic/create-store';
import {
  addDataToWindowObject,
  logFriendlyPreamble,
  logDevelopmentTips,
} from './utils/window-console';
import { ensureExists } from './utils/flow';

// Mock out Google Analytics for anything that's not production so that we have run-time
// code coverage in development and testing.
// Note that ga isn't included nowadays. We still keep this code because we
// intend to replace ga with Glean in the future, and this will still be useful.
if (process.env.NODE_ENV === 'development') {
  window.ga = (event: string, ...payload: mixed[]) => {
    const style = 'color: #FF6D00; font-weight: bold';
    console.log(`[analytics] %c"${event}"`, style, ...payload);
  };
} else if (process.env.NODE_ENV !== 'production') {
  window.ga = () => {};
}

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore();
const root = createRoot(
  ensureExists(
    document.getElementById('root'),
    'Unable to find the DOM element to attach the React element to.'
  )
);
root.render(<Root store={store} />);

addDataToWindowObject(store.getState, store.dispatch);
if (process.env.NODE_ENV === 'production') {
  // Don't clutter the console in development mode.
  logFriendlyPreamble();
}
if (process.env.NODE_ENV === 'development') {
  logDevelopmentTips();
}
