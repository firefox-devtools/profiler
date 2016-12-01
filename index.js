import React from 'react';
import Perf from 'react-addons-perf';
import { render } from 'react-dom';
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunk from 'redux-thunk';
import createLogger from 'redux-logger';
import { AppContainer } from 'react-hot-loader';
import { browserHistory } from 'react-router';
import { syncHistoryWithStore, routerReducer, routerMiddleware } from 'react-router-redux';
import reducers from './src/content/reducers';
import Root from './src/content/containers/Root';
import threadDispatcher from './src/common/thread-middleware';
import messages from './src/content/messages';
import handleMessages from './src/common/message-handler';

require('./res/style.css');

if (process.env.NODE_ENV === 'production') {
  require('offline-plugin/runtime').install();
}

import CleopatraWorker from 'worker-loader!./src/worker';
const worker = new CleopatraWorker();

window.geckoProfilerPromise = new Promise(function (resolve) {
  window.connectToGeckoProfiler = resolve;
});

const store = createStore(
  combineReducers(Object.assign({}, reducers, {
    routing: routerReducer,
    worker,
  })),
  applyMiddleware(...[
    routerMiddleware(browserHistory),
    thunk,
    threadDispatcher(worker, 'toWorker'),
    process.env.NODE_ENV.indexOf('development') === 0
      ? createLogger({titleFormatter: action => `content action ${action.type}`})
      : null,
  ].filter(fn => fn)));

handleMessages(worker, store, messages);

const history = syncHistoryWithStore(browserHistory, store);

render(
  <AppContainer>
    <Root store={store} history={history} />
  </AppContainer>,
  document.getElementById('root')
);

window.Perf = Perf;

if (module.hot) {
  module.hot.accept('./src/content/containers/Root', () => {
    const NewRoot = require('./src/content/containers/Root').default;
    render(
      <AppContainer>
        <NewRoot store={store} history={history} />
      </AppContainer>,
      document.getElementById('root')
    );
  });
  module.hot.accept('./src/content/reducers', () => {
    const newReducers = require('./src/content/reducers').default;
    store.replaceReducer(combineReducers(Object.assign({}, newReducers, { routing: routerReducer })));
  });
}
