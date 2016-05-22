import React from 'react';
import { render } from 'react-dom';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { AppContainer } from 'react-hot-loader';

import rootReducer from './src/reducers';
import Root from './src/containers/Root';

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

let store = createStore(rootReducer, applyMiddleware(thunk));

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
  module.hot.accept('./src/reducers', () => {
    const newRootReducer = require('./src/reducers').default;
    store.replaceReducer(newRootReducer);
  });
}
