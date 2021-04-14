/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// $FlowExpectError Flow doesn't know about this util
import { Worker } from 'worker_threads';

class NodeWorker {
  _instance: Worker;
  onmessage: MessageEvent => mixed;

  constructor(file: string) {
    const worker = new Worker(__dirname + '/node-worker-contents.js', {
      workerData: file,
    });
    worker.on('message', this.onMessage);
    worker.on('error', this.onError);
    this._instance = worker;
  }

  postMessage(
    message: mixed,
    transfer?: Array<ArrayBuffer | MessagePort | ImageBitmap>
  ) {
    let payload = message;

    // Starting with node v11.12, postMessage sends the payload using the same
    // semantics than Web Workers. This code adds the support for older node
    // versions. We can remove this thin compatibility layer when we stop
    // supporting these node versions.
    const nodeVersion = process.versions.node;
    const [major, minor] = nodeVersion.split('.');

    if (+major < 11 || (+major === 11 && +minor < 12)) {
      payload = { data: message };
    }
    this._instance.postMessage(payload, transfer);
  }

  onMessage = (message: mixed) => {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: message }));
    }
  };

  onError = (error: Error) => {
    console.error(error);
  };

  terminate() {
    this._instance.terminate();
    this._instance.unref();
    this._instance = null;
  }
}

const workerConfigs = {
  'zee-worker': './res/zee-worker.js',
};

const workerInstances = [];

export default class {
  constructor(file: string) {
    const path = workerConfigs[file];
    const worker = new NodeWorker(path);
    workerInstances.push(worker);
    return worker;
  }
}

/**
 * This function allows for stopping the workers, and is only part of the mock.
 */
export function __shutdownWorkers() {
  workerInstances.forEach(worker => worker.terminate());
  workerInstances.length = 0;
}
