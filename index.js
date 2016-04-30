import 'react-hot-loader/patch';
import 'babel-polyfill';
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { AppContainer } from 'react-hot-loader';

import rootReducer from './src/reducers';
import Root from './src/containers/Root';
import ReactUpdates from 'react/lib/ReactUpdates';

/*eslint-env browser*/
/**
 * Cribbed from:
 * github.com/facebook/react/blob/master/src/addons/ReactRAFBatchingStrategy.js
 * github.com/petehunt/react-raf-batching/blob/master/ReactRAFBatching.js
 * and adjusted so that tick() is only called if something actually changed.
 */

let requestedAnimationFrame = false;

function tick() {
  requestedAnimationFrame = false;
  ReactUpdates.flushBatchedUpdates();
}

var ReactRAFBatchingStrategy = {
  isBatchingUpdates: true,

  /**
   * Call the provided function in a context within which calls to `setState`
   * and friends are batched such that components aren't updated unnecessarily.
   */
  batchedUpdates: function(callback, a, b, c, d, e, f) {
    callback(a, b, c, d, e, f);
  },

  onEnqueueUpdate: function() {
    if (!requestedAnimationFrame) {
      requestedAnimationFrame = true;
      requestAnimationFrame(tick);
    }
  }
};

ReactUpdates.injection.injectBatchingStrategy(ReactRAFBatchingStrategy);
const originalEnqueueUpdate = ReactUpdates.enqueueUpdate;
ReactUpdates.enqueueUpdate = (a, b, c, d, e, f) => {
  const result = originalEnqueueUpdate.call(ReactUpdates, a, b, c, d, e, f);
  ReactRAFBatchingStrategy.onEnqueueUpdate();
  return result;
};


window.geckoProfilerPromise = new Promise(function (resolve, reject) {
  window.connectToGeckoProfiler = resolve;
});

let store = createStore(rootReducer, {});

render(
  <AppContainer>
    <Root store={store} />
  </AppContainer>,
  document.getElementById('root')
);

if (module.hot) {
  module.hot.accept('./src/containers/Root', () => {
    const NewRoot = require('./src/containers/Root').default;
    render(
      <AppContainer>
        <NewRoot store={store} />
      </AppContainer>,
      document.getElementById('root')
    );
  });
}
