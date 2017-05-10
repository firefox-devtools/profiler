/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function provideHostSide(workerFilename, methods) {
  return function HostClass() {
    const constructorArguments = Array.from(arguments);

    const worker = new Worker(workerFilename);
    const callbacks = new Map(); // msgID -> { resolve, reject }
    let nextMessageID = 0;

    worker.onmessage = ({ data }) => {
      const { msgID, type } = data;
      const { resolve, reject } = callbacks.get(msgID);
      callbacks.delete(msgID);
      if (type === 'success') {
        resolve(data.result);
      } else if (type === 'error') {
        reject(data.error);
      }
    };

    function makeMethod(method) {
      return function (...paramArray) {
        const msgID = nextMessageID++;
        worker.postMessage({ msgID, type: 'method', method, paramArray });
        return new Promise((resolve, reject) => {
          callbacks.set(msgID, { resolve, reject });
        });
      };
    }

    for (const method of methods) {
      this[method] = makeMethod(method);
    }

    worker.postMessage({ type: 'constructor', constructorArguments });
  };
}

export function provideWorkerSide(workerGlobal, theClass) {
  let theObject = null;
  workerGlobal.onmessage = ({ data }) => {
    if (data.type === 'constructor') {
      theObject = new theClass(...data.constructorArguments);
    } else if (data.type === 'method') {
      const { msgID, method, paramArray } = data;
      theObject[method](...paramArray).then(result => {
        workerGlobal.postMessage({ msgID, type: 'success', result });
      }, error => {
        workerGlobal.postMessage({ msgID, type: 'error', error: error.toString() });
      });
    }
  };
}
