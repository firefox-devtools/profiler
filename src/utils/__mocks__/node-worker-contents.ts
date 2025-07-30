/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const vm = require('vm');

if (typeof workerData !== 'string') {
  throw new Error(`Please pass a file name using the 'workerData' property.`);
}

const scriptContent = fs.readFileSync(workerData, 'utf8');

const sandbox = {
  importScripts: function () {
    throw new Error(`The function 'importScripts' is not implemented.`);
  },
  postMessage: parentPort.postMessage.bind(parentPort),
  onmessage: function () {},
};

vm.runInNewContext(scriptContent, sandbox, { filename: workerData });

parentPort.onmessage = sandbox.onmessage.bind(null);
