/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Worker as NodeWorkerClass,
  isMarkedAsUntransferable,
} from 'worker_threads';

function getWorkerScript(file: string): string {
  return `
    const { parentPort } = require('worker_threads');
    const fs = require('fs');
    const vm = require('vm');

    const scriptContent = fs.readFileSync("${file}", 'utf8');

    const sandbox = {
      importScripts: function () {
        throw new Error('The function "importScripts" is not implemented.');
      },
      postMessage: parentPort.postMessage.bind(parentPort),
      onmessage: function () {},
      DecompressionStream,
      CompressionStream,
      Response,
    };

    vm.runInNewContext(scriptContent, sandbox, { filename: "${file}" });

    parentPort.onmessage = sandbox.onmessage.bind(null);
  `;
}

export class NodeWorker {
  _instance: NodeWorkerClass | null;
  onmessage: ((event: MessageEvent) => unknown) | null;

  constructor(file: string) {
    const worker = new NodeWorkerClass(getWorkerScript(file), { eval: true });
    worker.on('message', this.onMessage);
    worker.on('error', this.onError);
    this._instance = worker;
    this.onmessage = null;
    workerInstances.push(worker);
  }

  postMessage(message: unknown, transfer?: any[]) {
    let payload = message;

    // Starting with node v11.12, postMessage sends the payload using the same
    // semantics than Web Workers. This code adds the support for older node
    // versions. We can remove this thin compatibility layer when we stop
    // supporting these node versions.
    const nodeVersion = (process as any).versions.node;
    const [major, minor] = nodeVersion.split('.');

    if (+major < 11 || (+major === 11 && +minor < 12)) {
      payload = { data: message };
    }
    // See https://github.com/nodejs/node/issues/55593
    const actualTransfer = (transfer ?? []).filter(
      (buf) => !isMarkedAsUntransferable(buf)
    );
    this._instance?.postMessage(payload, actualTransfer);
  }

  onMessage = (message: unknown) => {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: message }));
    }
  };

  onError = (error: Error) => {
    console.error(error);
  };

  terminate() {
    if (this._instance) {
      this._instance.terminate();
      this._instance.unref();
      this._instance = null;
    }
  }
}

const workerInstances: NodeWorkerClass[] = [];

// Called after running each test (see setup.js), otherwise Jest won't shut down.
export function __shutdownWorkers() {
  workerInstances.forEach((worker) => {
    worker.terminate();
    worker.unref();
  });
  workerInstances.length = 0;
}
