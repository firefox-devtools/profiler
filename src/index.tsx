/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
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

// React imported for JSX in Root component
import { createRoot } from 'react-dom/client';
import { Root } from './components/app/Root';
import createStore from './app-logic/create-store';
import {
  addDataToWindowObject,
  logFriendlyPreamble,
  logDevelopmentTips,
} from './utils/window-console';
import { ensureExists } from './utils/types';

function initTheme() {
  const theme = window.localStorage.getItem('theme');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-mode');
  }
}
window.useDarkMode = function () {
  window.localStorage.setItem('theme', 'dark');
  document.documentElement.classList.add('dark-mode');
};
window.useLightMode = function () {
  window.localStorage.removeItem('theme');
  document.documentElement.classList.remove('dark-mode');
};
try {
  initTheme();
} catch (e) {
  console.log('initTheme failed', e);
}

// Mock out Google Analytics for anything that's not production so that we have run-time
// code coverage in development and testing.
// Note that ga isn't included nowadays. We still keep this code because we
// intend to replace ga with Glean in the future, and this will still be useful.
if (process.env.NODE_ENV === 'development') {
  window.ga = (event: string, ...payload: unknown[]) => {
    const style = 'color: #FF6D00; font-weight: bold';
    console.log(`[analytics] %c"${event}"`, style, ...payload);
  };
} else if (process.env.NODE_ENV !== 'production') {
  window.ga = () => {};
}

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

// We're using an <svg> element from the page to apply filter from CSS rules
// to be able to dynamically change the color of SVG icons (e.g. to adapt
// to light/dark/high contrast themes).
const svgFiltersElement = document.getElementById('svg-filters');
if (svgFiltersElement) {
  const defineSvgFiltersForColors = () => {
    const colors = [
      '--button-icon-color',
      '--button-icon-hover-color',
      '--button-icon-active-color',
    ];
    for (const cssVariable of colors) {
      let filterEl = document.getElementById(cssVariable);
      if (!filterEl) {
        svgFiltersElement.insertAdjacentHTML(
          'beforeend',
          `<filter id="${cssVariable}" color-interpolation-filters="sRGB">
            <feFlood />
            <feComposite operator="in" in2="SourceAlpha" />
           </filter>`
        );
        filterEl = document.getElementById(cssVariable);
      }

      if (!filterEl) {
        continue;
      }

      const feFloodEl = filterEl.querySelector('feFlood');

      if (!feFloodEl) {
        continue;
      }

      const color = document.documentElement
        ? getComputedStyle(document.documentElement).getPropertyValue(
            cssVariable
          )
        : '';

      feFloodEl.setAttribute('flood-color', color);
    }
  };
  defineSvgFiltersForColors();

  const forcedColorsMql = window.matchMedia('(forced-colors: active)');
  const darkSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
  forcedColorsMql.addEventListener('change', defineSvgFiltersForColors);
  darkSchemeMql.addEventListener('change', defineSvgFiltersForColors);
}

const store = createStore();
const root = createRoot(
  ensureExists(
    document.getElementById('root'),
    'Unable to find the DOM element to attach the React element to.'
  )
);
root.render(<Root store={store} />);

addDataToWindowObject(store.getState, store.dispatch as any);
if (process.env.NODE_ENV === 'production') {
  // Don't clutter the console in development mode.
  logFriendlyPreamble();
}
if (process.env.NODE_ENV === 'development') {
  logDevelopmentTips();
}
