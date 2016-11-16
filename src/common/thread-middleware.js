/**
 * Create a middleware that allows for dispatching actions between threads. This
 * inspects each action, hijacks it if it has a certain key, and then uses postMessage
 * to send it to another thread. The actions are expected to have the following form:
 *
 * const action = {
 *   type: "ACTION_NAME",
 *   // either:
 *   toWorker: true,
 *   // or maybe:
 *   toContent: true,
 *   ...data
 * }
 *
 * The toWorker and toContent can be arbitrarily defined keys, defined by the application,
 * but in this case the intent is to only use toWorker and toContent.
 */

const threadDispatcher = (thread, key) => () => next => action => {
  if (action[key]) {
    thread.postMessage(action);
    return undefined;
  }
  return next(action);
};

export default threadDispatcher;
