import React from 'react';
import Perf from 'react-addons-perf';
import { render } from 'react-dom';
import Root from './src/content/containers/Root';
import createStore from './src/content/create-store';
import './res/style.css';

if (process.env.NODE_ENV === 'production') {
  const runtime = require('offline-plugin/runtime');
  runtime.install({
    onUpdateReady: () => {
      runtime.applyUpdate();
    },
  });
}

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore();

render(
  <Root store={store} />,
  document.getElementById('root')
);

window.Perf = Perf;
