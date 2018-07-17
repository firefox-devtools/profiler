/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import Worker from 'workerjs';

const workerFiles = {
  // Paths are relative to workerjs' requireworker.js file
  'zee-worker': '../../res/zee-worker.js',
};

const workerInstances = [];

export default class {
  constructor(file: string) {
    const worker = new Worker(workerFiles[file]);
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
