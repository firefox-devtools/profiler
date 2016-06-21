import React from 'react';
import { render } from 'react-dom';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import createLogger from 'redux-logger';
import { AppContainer } from 'react-hot-loader';

import rootReducer from './src/reducers';
import Root from './src/containers/Root';

require('./static/style.css');

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore(rootReducer,
  process.env.NODE_ENV === 'development' ? applyMiddleware(thunk, createLogger())
                                         : applyMiddleware(thunk));

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
