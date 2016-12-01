import {createStore, applyMiddleware} from 'redux';
import threadDispatcher from '../common/thread-middleware';
import handleMessages from '../common/message-handler';
import messages from './messages';
import reducers from './reducers';
import createLogger from 'redux-logger';
import thunk from 'redux-thunk';

const store = createStore(
  // Reducers:
  reducers,
  // Initial State:
  {},
  // Enhancers:
  applyMiddleware(
    thunk,
    threadDispatcher(self, 'toContent'),
    process.env.NODE_ENV.indexOf('development') === 0
      ? createLogger({ titleFormatter: action => `worker action ${action.type}` })
      : null
  ));

handleMessages(self, store, messages);
