import React from 'react';
import Perf from 'react-addons-perf';
import { render } from 'react-dom';
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunk from 'redux-thunk';
import createLogger from 'redux-logger';
import { AppContainer } from 'react-hot-loader';
import { browserHistory } from 'react-router';
import { syncHistoryWithStore, routerReducer, routerMiddleware } from 'react-router-redux';

import reducers from './src/reducers';
import Root from './src/containers/Root';

require('./static/style.css');

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore(combineReducers(Object.assign({}, reducers, { routing: routerReducer })),
  process.env.NODE_ENV === 'development' ? applyMiddleware(routerMiddleware(browserHistory), thunk, createLogger())
                                         : applyMiddleware(routerMiddleware(browserHistory), thunk));

const history = syncHistoryWithStore(browserHistory, store);

render(
  <AppContainer>
    <Root store={store} history={history} />
  </AppContainer>,
  document.getElementById('root')
);

window.Perf = Perf;

if (module.hot) {
  module.hot.accept('./src/containers/Root', () => {
    const NewRoot = require('./src/containers/Root').default;
    render(
      <AppContainer>
        <NewRoot store={store} history={history} />
      </AppContainer>,
      document.getElementById('root')
    );
  });
  module.hot.accept('./src/reducers', () => {
    const newReducers = require('./src/reducers').default;
    store.replaceReducer(combineReducers(Object.assign({}, newReducers, { routing: routerReducer })));
  });
}
