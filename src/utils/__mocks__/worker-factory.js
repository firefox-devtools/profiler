/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';

class FakeWorker {
  _sandbox: Object;
  onmessage: MessageEvent => mixed;

  constructor(filename: string) {
    this._sandbox = {
      importScripts: function() {},
      postMessage: this.onMessage,
      onmessage: function() {},
      console,
    };
    const scriptContent = readFileSync(filename, 'utf8');
    runInNewContext(scriptContent, this._sandbox, { filename });
  }

  postMessage(
    message: mixed,
    _transfer?: Array<ArrayBuffer | MessagePort | ImageBitmap>
  ) {
    process.nextTick(() => {
      if (this._sandbox.onmessage) {
        this._sandbox.onmessage.call(null, { data: message });
      }
    });
  }

  onMessage = (message: Object) => {
    process.nextTick(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data: message }));
      }
    });
  };

  terminate() {}
}

const workerConfigs = {
  'zee-worker': './res/zee-worker.js',
};

const workerInstances = [];

export default class {
  constructor(file: string) {
    const path = workerConfigs[file];
    const worker = new FakeWorker(path);
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
