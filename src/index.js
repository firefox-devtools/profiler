import 'babel-polyfill';
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import rootReducer from './reducers';
import App from './containers/App';

window.geckoProfilerPromise = new Promise(function (resolve, reject) {
  window.connectToGeckoProfiler = resolve;
});

let store = createStore(rootReducer, {});

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
);
