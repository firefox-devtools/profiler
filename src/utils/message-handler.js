/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export default function createMessageHandler(thread, store, handlers) {
  function call(fn, ...args) {
    store.dispatch(fn(...args));
  }

  thread.onmessage = function messageHandler(event) {
    const message = event.data;
    const handler = handlers[message.type];
    if (!handler) {
      throw new Error(
        `A message of type "${message.type}" was received that did not have a handler`
      );
    }
    handler(message, call);
  };
}
