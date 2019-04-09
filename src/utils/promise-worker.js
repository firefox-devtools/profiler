/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This worker is imported as WebWorker since it's conflicting with the Worker
// global type.
import WebWorker from './worker-factory';
import { ensureExists } from './flow';

type MessageToHost =
  | {|
      +msgID: number,
      +type: 'error',
      +error: mixed,
    |}
  | {|
      +msgID: number,
      +type: 'success',
      +result: mixed[],
    |};

type MessageToWorker =
  | {|
      +type: 'constructor',
      +constructorArguments: mixed,
    |}
  | {|
      +type: 'method',
      +msgID: number,
      +method: string,
      +paramArray: mixed[],
    |};

export function provideHostSide<T: Object>(workerFilename: string, methods: T) {
  return function HostClass(...constructorArguments: mixed[]) {
    const worker = new WebWorker(workerFilename);
    const callbacks = new Map(); // msgID -> { resolve, reject }
    let nextMessageID = 0;

    worker.onmessage = ({ data }) => {
      const message = ((data: any): MessageToHost);
      const { msgID } = message;
      const { resolve, reject } = ensureExists(
        callbacks.get(msgID),
        'Could not find a callback for a worker'
      );
      callbacks.delete(msgID);

      switch (message.type) {
        case 'success':
          resolve(message.result);
          return;
        case 'error':
          reject(message.error);
          return;
        default:
          throw new Error(`Unhandled message case ${(message: empty)}.`);
      }
    };

    function makeMethod(method) {
      return function(...paramArray) {
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

export function provideWorkerSide(workerGlobal: Worker, theClass: Function) {
  let theObject = {};
  workerGlobal.onmessage = ({ data }) => {
    const message = ((data: any): MessageToWorker);
    if (message.type === 'constructor') {
      theObject = new theClass(...message.constructorArguments);
    } else if (message.type === 'method') {
      const { msgID, method, paramArray } = message;
      theObject[method](...paramArray).then(
        result => {
          workerGlobal.postMessage({ msgID, type: 'success', result });
        },
        error => {
          workerGlobal.postMessage({
            msgID,
            type: 'error',
            error: error.toString(),
          });
        }
      );
    }
  };
}
